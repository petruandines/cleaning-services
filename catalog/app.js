const CONFIG = {
  siteTitle: 'Catalog Servicii | Petru & Inés',
  shareText: 'Catalogul serviciilor Petru & Inés - curățenie profesională în București și Ilfov.',
  pdfUrl: './catalog.pdf',
  pdfJsVersion: '4.10.38',
  maxZoom: 5,
  zoomStep: 1.18,
  rangeChunkSize: 128 * 1024,
  desktopCanvasPixels: 16_000_000,
  mobileCanvasPixels: 9_000_000,
  thumbnailWidth: 96,
};

const CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${CONFIG.pdfJsVersion}/`;

let pdfjsLib;
let usingLocalPdfJs = false;
try {
  pdfjsLib = await import('./vendor/pdfjs/pdf.min.mjs');
  usingLocalPdfJs = true;
} catch {
  pdfjsLib = await import(`${CDN_BASE}pdf.min.mjs`);
}

pdfjsLib.GlobalWorkerOptions.workerSrc = usingLocalPdfJs
  ? new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href
  : `${CDN_BASE}pdf.worker.min.mjs`;

const $ = (selector) => document.querySelector(selector);
const els = {
  app: $('#app'),
  stage: $('#stage'),
  topbar: $('#topbar'),
  pageFrame: $('#pageFrame'),
  pageVisual: $('#pageVisual'),
  canvas: $('#pdfCanvas'),
  textLayer: $('#textLayer'),
  annotationLayer: $('#annotationLayer'),
  highlightLayer: $('#highlightLayer'),
  loadingOverlay: $('#loadingOverlay'),
  loadingTitle: $('#loadingTitle'),
  loadingDetail: $('#loadingDetail'),
  errorPanel: $('#errorPanel'),
  errorMessage: $('#errorMessage'),
  retryBtn: $('#retryBtn'),
  thumbToggle: $('#thumbToggle'),
  thumbDrawer: $('#thumbDrawer'),
  thumbStrip: $('#thumbStrip'),
  thumbClose: $('#thumbClose'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  edgePrev: $('#edgePrev'),
  edgeNext: $('#edgeNext'),
  pageInput: $('#pageInput'),
  pageTotal: $('#pageTotal'),
  zoomOutBtn: $('#zoomOutBtn'),
  zoomInBtn: $('#zoomInBtn'),
  zoomResetBtn: $('#zoomResetBtn'),
  zoomValue: $('#zoomValue'),
  searchToggle: $('#searchToggle'),
  searchPanel: $('#searchPanel'),
  searchInput: $('#searchInput'),
  searchClose: $('#searchClose'),
  clearSearch: $('#clearSearch'),
  searchStatus: $('#searchStatus'),
  searchResults: $('#searchResults'),
  shareBtn: $('#shareBtn'),
  downloadBtn: $('#downloadBtn'),
  toast: $('#toast'),
};

const state = {
  pdf: null,
  currentPage: 1,
  currentPageProxy: null,
  totalPages: 0,
  baseWidth: 1,
  baseHeight: 1,
  fitScale: 1,
  zoom: 1,
  panX: 0,
  panY: 0,
  renderTask: null,
  textLayerTask: null,
  textLayerRenderer: null,
  renderToken: 0,
  renderTimer: null,
  thumbsOpen: false,
  searchOpen: false,
  activeSearchTerm: '',
  textCache: new Map(),
  thumbnailRendered: new Set(),
  thumbnailRendering: new Set(),
  thumbObserver: null,
  toastTimer: null,
  controlsTimer: null,
  pointers: new Map(),
  gesture: null,
  isPanning: false,
  pageRenderReady: false,
  initialPageRequested: 1,
};

const isCoarsePointer = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
const isSmallScreen = () => innerWidth <= 820;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getRequestedPage() {
  const value = Number.parseInt(new URL(location.href).searchParams.get('page') || '1', 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function setLoading(title, detail = '') {
  els.loadingTitle.textContent = title;
  els.loadingDetail.textContent = detail;
  els.loadingOverlay.classList.remove('is-hidden');
}

function hideLoading() {
  els.loadingOverlay.classList.add('is-hidden');
  els.app.setAttribute('aria-busy', 'false');
}

function showError(error) {
  els.errorPanel.hidden = false;
  els.errorMessage.innerHTML = `Verifică dacă <code>catalog.pdf</code> este lângă <code>index.html</code>.<br><br><small>${escapeHtml(error?.message || String(error))}</small>`;
  hideLoading();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message, duration = 1800) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  state.toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), duration);
}

function updateUrl(page, mode = 'push') {
  const url = new URL(location.href);
  url.searchParams.set('page', String(page));
  const payload = { page };
  if (mode === 'replace') history.replaceState(payload, '', url);
  else if (mode === 'push') history.pushState(payload, '', url);
}

function updateControls() {
  els.pageInput.value = String(state.currentPage);
  els.pageTotal.textContent = state.totalPages ? String(state.totalPages) : '–';
  const atStart = state.currentPage <= 1;
  const atEnd = state.currentPage >= state.totalPages;
  for (const btn of [els.prevBtn, els.edgePrev]) btn.disabled = atStart;
  for (const btn of [els.nextBtn, els.edgeNext]) btn.disabled = atEnd;

  els.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  els.zoomOutBtn.disabled = state.zoom <= 1.001;
  els.zoomInBtn.disabled = state.zoom >= CONFIG.maxZoom - 0.001;
  els.stage.classList.toggle('is-pannable', state.zoom > 1.01);

  document.querySelectorAll('.thumb-card').forEach((card) => {
    card.classList.toggle('is-active', Number(card.dataset.page) === state.currentPage);
  });
}

function scheduleControlsAutoHide() {
  clearTimeout(state.controlsTimer);
  if (!isCoarsePointer() || state.searchOpen || state.thumbsOpen) {
    els.app.classList.remove('controls-hidden');
    return;
  }
  els.app.classList.remove('controls-hidden');
  state.controlsTimer = setTimeout(() => {
    if (!state.searchOpen && !state.thumbsOpen) els.app.classList.add('controls-hidden');
  }, 2600);
}

function toggleControlsOnTap() {
  if (!isCoarsePointer() || state.searchOpen || state.thumbsOpen) return;
  els.app.classList.toggle('controls-hidden');
  if (!els.app.classList.contains('controls-hidden')) scheduleControlsAutoHide();
}

function getCssPageSize(zoom = state.zoom) {
  return {
    width: state.baseWidth * state.fitScale * zoom,
    height: state.baseHeight * state.fitScale * zoom,
  };
}

function getVisibleStageBounds() {
  const stageRect = els.stage.getBoundingClientRect();
  let left = 0;
  let top = 0;
  let right = Math.max(1, stageRect.width);
  let bottom = Math.max(1, stageRect.height);

  // Rezervăm spațiul toolbar-ului NUMAI dacă o pagină potrivită natural pe
  // ecran ar intra sub el. Pe telefoanele portrait, unde pagina este de obicei
  // limitată de lățime și are deja aer deasupra, nu introducem margini noi.
  const toolbarRect = els.topbar.getBoundingClientRect();
  const toolbarBottom = toolbarRect.bottom - stageRect.top;
  const gap = isSmallScreen() ? 4 : 8;
  const naturalFit = Math.min(
    stageRect.width / Math.max(1, state.baseWidth),
    stageRect.height / Math.max(1, state.baseHeight),
  );
  const naturalPageTop = (stageRect.height - state.baseHeight * naturalFit) / 2;
  const collidesWithToolbar = naturalPageTop < toolbarBottom + gap;

  if (collidesWithToolbar) {
    const edgeGap = isSmallScreen() ? 0 : 8;
    top = clamp(toolbarBottom + gap, 0, Math.max(0, stageRect.height - 1));
    left = edgeGap;
    right = Math.max(left + 1, stageRect.width - edgeGap);
    bottom = Math.max(top + 1, stageRect.height - edgeGap);
  }

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerX: left + Math.max(1, right - left) / 2,
    centerY: top + Math.max(1, bottom - top) / 2,
  };
}

function recalcFitScale() {
  if (!state.currentPageProxy) return;
  const bounds = getVisibleStageBounds();
  const pad = isSmallScreen() ? 0 : 4;
  state.fitScale = Math.max(0.01, Math.min(
    Math.max(1, bounds.width - pad * 2) / state.baseWidth,
    Math.max(1, bounds.height - pad * 2) / state.baseHeight,
  ));
}

function clampPan() {
  const { width, height } = getCssPageSize();
  const bounds = getVisibleStageBounds();
  const overscroll = isSmallScreen() ? 32 : 56;

  const maxX = width > bounds.width ? (width - bounds.width) / 2 + overscroll : 0;
  const maxY = height > bounds.height ? (height - bounds.height) / 2 + overscroll : 0;
  state.panX = clamp(state.panX, -maxX, maxX);
  state.panY = clamp(state.panY, -maxY, maxY);
}

function applyGeometry() {
  const { width, height } = getCssPageSize();
  const bounds = getVisibleStageBounds();
  clampPan();

  els.pageFrame.style.left = `${bounds.centerX}px`;
  els.pageFrame.style.top = `${bounds.centerY}px`;
  els.pageFrame.style.width = `${width}px`;
  els.pageFrame.style.height = `${height}px`;
  els.pageFrame.style.transform = `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px)`;

  els.canvas.style.width = `${width}px`;
  els.canvas.style.height = `${height}px`;
  els.annotationLayer.style.width = `${width}px`;
  els.annotationLayer.style.height = `${height}px`;
  els.highlightLayer.style.width = `${width}px`;
  els.highlightLayer.style.height = `${height}px`;

  // TextLayer folosește această variabilă intern pentru poziționare. Actualizarea
  // ei în timpul zoom-ului păstrează selecția aliniată fără a afișa alt font.
  els.textLayer.style.setProperty('--scale-factor', String(state.fitScale * state.zoom));
  els.textLayer.style.width = `${width}px`;
  els.textLayer.style.height = `${height}px`;

  updateControls();
}

function setZoomAt(clientX, clientY, requestedZoom, schedule = true) {
  if (!state.currentPageProxy) return;
  const oldZoom = state.zoom;
  const nextZoom = clamp(requestedZoom, 1, CONFIG.maxZoom);
  if (Math.abs(nextZoom - oldZoom) < 0.0005) return;

  const oldSize = getCssPageSize(oldZoom);
  const rect = els.pageFrame.getBoundingClientRect();
  const localX = rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5;
  const localY = rect.height ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5;

  state.zoom = nextZoom;
  const newSize = getCssPageSize(nextZoom);
  state.panX += (oldSize.width - newSize.width) * (localX - 0.5);
  state.panY += (oldSize.height - newSize.height) * (localY - 0.5);
  applyGeometry();
  if (schedule) scheduleHighQualityRender();
}

function zoomFromCenter(factor) {
  const rect = els.stage.getBoundingClientRect();
  const bounds = getVisibleStageBounds();
  setZoomAt(rect.left + bounds.centerX, rect.top + bounds.centerY, state.zoom * factor);
}

function resetZoom() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  applyGeometry();
  scheduleHighQualityRender(0);
  scheduleControlsAutoHide();
}

function getOutputScale(cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const maxPixels = isSmallScreen() ? CONFIG.mobileCanvasPixels : CONFIG.desktopCanvasPixels;
  const maxScale = Math.sqrt(maxPixels / Math.max(1, cssWidth * cssHeight));
  return clamp(Math.min(dpr, 2, maxScale), 0.45, 2);
}

async function renderCurrentPage({ transitionDirection = 0 } = {}) {
  const page = state.currentPageProxy;
  if (!page) return;

  const token = ++state.renderToken;
  if (state.renderTask) {
    try { state.renderTask.cancel(); } catch {}
    state.renderTask = null;
  }
  if (state.textLayerTask) {
    try { state.textLayerTask.cancel(); } catch {}
    state.textLayerTask = null;
  }
  state.textLayerRenderer = null;

  const cssScale = state.fitScale * state.zoom;
  const cssViewport = page.getViewport({ scale: cssScale });
  const outputScale = getOutputScale(cssViewport.width, cssViewport.height);
  const renderViewport = page.getViewport({ scale: cssScale * outputScale });

  const newCanvas = document.createElement('canvas');
  newCanvas.className = 'pdf-canvas';
  newCanvas.setAttribute('aria-label', `Pagina ${state.currentPage} din ${state.totalPages}`);
  newCanvas.width = Math.max(1, Math.floor(renderViewport.width));
  newCanvas.height = Math.max(1, Math.floor(renderViewport.height));
  newCanvas.style.width = `${cssViewport.width}px`;
  newCanvas.style.height = `${cssViewport.height}px`;

  const ctx = newCanvas.getContext('2d', { alpha: false, desynchronized: true });
  state.renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });

  try {
    await state.renderTask.promise;
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') return;
    throw error;
  } finally {
    if (token === state.renderToken) state.renderTask = null;
  }

  if (token !== state.renderToken || page !== state.currentPageProxy) return;

  els.canvas.replaceWith(newCanvas);
  els.canvas = newCanvas;
  await Promise.all([
    renderSelectableText(page, cssViewport, token),
    renderAnnotations(page, cssViewport, token),
  ]);
  els.highlightLayer.replaceChildren();

  if (transitionDirection !== 0) {
    els.pageVisual.classList.remove('page-enter-next', 'page-enter-prev');
    void els.pageVisual.offsetWidth;
    els.pageVisual.classList.add(transitionDirection > 0 ? 'page-enter-next' : 'page-enter-prev');
    setTimeout(() => els.pageVisual.classList.remove('page-enter-next', 'page-enter-prev'), 240);
  }

  state.pageRenderReady = true;
}

function scheduleHighQualityRender(delay = 110) {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(() => {
    renderCurrentPage().catch((error) => console.error('Render error:', error));
  }, delay);
}

async function renderSelectableText(page, viewport, token) {
  els.textLayer.replaceChildren();
  els.textLayer.style.setProperty('--scale-factor', String(viewport.scale));
  els.textLayer.style.width = `${viewport.width}px`;
  els.textLayer.style.height = `${viewport.height}px`;

  try {
    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    if (token !== state.renderToken || page !== state.currentPageProxy) return;

    // TextLayer este randat de PDF.js, dar CSS-ul îl păstrează complet transparent.
    // Canvas-ul rămâne singurul strat vizual, deci fonturile/grafica PDF nu se schimbă.
    const renderer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: els.textLayer,
      viewport,
    });
    state.textLayerRenderer = renderer;
    state.textLayerTask = renderer;
    await renderer.render();

    if (token !== state.renderToken || page !== state.currentPageProxy) return;
    state.textLayerTask = null;
    applySearchHighlightsToTextLayer(renderer);
  } catch (error) {
    if (error?.name === 'AbortException' || error?.name === 'RenderingCancelledException') return;
    // Viewerul trebuie să rămână funcțional chiar și pentru PDF-uri cu text layer atipic.
    console.warn('Text layer could not be rendered:', error);
    els.textLayer.replaceChildren();
  }
}

function applySearchHighlightsToTextLayer(renderer = state.textLayerRenderer) {
  if (!renderer) return;
  const query = normalizeText(state.activeSearchTerm).trim();
  const tokens = query.split(/\s+/).filter((part) => part.length >= 2).slice(0, 12);
  const divs = renderer.textDivs || [];
  const strings = renderer.textContentItemsStr || [];

  for (const div of divs) div.classList.remove('search-hit');
  if (!tokens.length) return;

  for (let i = 0; i < Math.min(divs.length, strings.length); i++) {
    const normalized = normalizeText(strings[i] || '');
    if (tokens.some((tokenText) => normalized.includes(tokenText))) {
      divs[i].classList.add('search-hit');
    }
  }
}

async function renderAnnotations(page, viewport, token) {
  const annotations = await page.getAnnotations({ intent: 'display' });
  if (token !== state.renderToken || page !== state.currentPageProxy) return;
  els.annotationLayer.replaceChildren();

  for (const annotation of annotations) {
    if (annotation.subtype !== 'Link' || !annotation.rect) continue;
    const rect = viewport.convertToViewportRectangle(annotation.rect);
    const left = Math.min(rect[0], rect[2]);
    const top = Math.min(rect[1], rect[3]);
    const width = Math.abs(rect[2] - rect[0]);
    const height = Math.abs(rect[3] - rect[1]);
    if (width < 1 || height < 1) continue;

    const link = document.createElement('a');
    link.className = 'annotation-link';
    link.style.left = `${left}px`;
    link.style.top = `${top}px`;
    link.style.width = `${width}px`;
    link.style.height = `${height}px`;
    link.setAttribute('aria-label', annotation.titleObj?.str || annotation.contentsObj?.str || 'Link din document');

    const url = annotation.url || annotation.unsafeUrl;
    if (url) {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else if (annotation.dest) {
      link.href = '#';
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await goToDestination(annotation.dest);
      });
    } else {
      continue;
    }
    els.annotationLayer.append(link);
  }
}

async function goToDestination(dest) {
  if (!state.pdf) return;
  try {
    const resolved = typeof dest === 'string' ? await state.pdf.getDestination(dest) : dest;
    if (!Array.isArray(resolved) || !resolved.length) return;
    const ref = resolved[0];
    let pageIndex;
    if (typeof ref === 'number') pageIndex = ref;
    else pageIndex = await state.pdf.getPageIndex(ref);
    await navigateToPage(pageIndex + 1, { historyMode: 'push' });
  } catch (error) {
    console.warn('PDF destination could not be opened:', error);
  }
}

async function renderHighlights(page, viewport, token) {
  els.highlightLayer.replaceChildren();
  const query = normalizeText(state.activeSearchTerm).trim();
  if (!query) return;

  const textContent = await page.getTextContent({ normalizeWhitespace: true });
  if (token !== state.renderToken || page !== state.currentPageProxy) return;
  const tokens = query.split(/\s+/).filter((part) => part.length >= 2).slice(0, 8);
  if (!tokens.length) return;

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str) continue;
    const itemNorm = normalizeText(item.str);
    if (!tokens.some((tokenText) => itemNorm.includes(tokenText))) continue;

    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.max(3, Math.hypot(tx[2], tx[3]));
    const angle = Math.atan2(tx[1], tx[0]);
    const width = Math.max(4, item.width * viewport.scale);

    const mark = document.createElement('span');
    mark.className = 'search-highlight';
    mark.style.left = `${tx[4]}px`;
    mark.style.top = `${tx[5] - fontHeight}px`;
    mark.style.width = `${width}px`;
    mark.style.height = `${fontHeight * 1.08}px`;
    mark.style.transformOrigin = '0 0';
    if (Math.abs(angle) > 0.001) mark.style.transform = `rotate(${angle}rad)`;
    els.highlightLayer.append(mark);
  }
}

async function navigateToPage(requestedPage, { historyMode = 'push', transitionDirection } = {}) {
  if (!state.pdf) return;
  const pageNum = clamp(Math.round(Number(requestedPage) || 1), 1, state.totalPages);
  const previous = state.currentPage;
  const direction = transitionDirection ?? Math.sign(pageNum - previous);

  state.currentPage = pageNum;
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  state.pageRenderReady = false;
  updateControls();

  const page = await state.pdf.getPage(pageNum);
  if (pageNum !== state.currentPage) return;
  state.currentPageProxy = page;

  const baseViewport = page.getViewport({ scale: 1 });
  state.baseWidth = baseViewport.width;
  state.baseHeight = baseViewport.height;
  recalcFitScale();
  applyGeometry();
  await renderCurrentPage({ transitionDirection: direction });

  if (historyMode !== 'none') updateUrl(pageNum, historyMode);
  updateControls();
  scrollActiveThumbIntoView();
  prefetchNeighbors(pageNum);
  scheduleControlsAutoHide();
}

function prefetchNeighbors(pageNum) {
  for (const candidate of [pageNum - 1, pageNum + 1]) {
    if (candidate >= 1 && candidate <= state.totalPages) {
      state.pdf.getPage(candidate).catch(() => {});
    }
  }
}

function buildThumbnailStrip() {
  els.thumbStrip.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= state.totalPages; i++) {
    const button = document.createElement('button');
    button.className = 'thumb-card';
    button.type = 'button';
    button.dataset.page = String(i);
    button.setAttribute('aria-label', `Deschide pagina ${i}`);
    button.innerHTML = `
      <span class="thumb-canvas-wrap"><canvas class="thumb-canvas" aria-hidden="true"></canvas></span>
      <span class="thumb-number">${i}</span>
    `;
    button.addEventListener('click', () => navigateToPage(i, { historyMode: 'push' }));
    fragment.append(button);
  }
  els.thumbStrip.append(fragment);

  state.thumbObserver?.disconnect();
  state.thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) renderThumbnail(Number(entry.target.dataset.page));
    }
  }, { root: els.thumbStrip, rootMargin: '0px 260px', threshold: 0.01 });

  document.querySelectorAll('.thumb-card').forEach((card) => state.thumbObserver.observe(card));
  updateControls();
}

async function renderThumbnail(pageNum) {
  if (!state.pdf || state.thumbnailRendered.has(pageNum) || state.thumbnailRendering.has(pageNum)) return;
  state.thumbnailRendering.add(pageNum);
  try {
    const page = await state.pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const cssWidth = isSmallScreen() ? 72 : CONFIG.thumbnailWidth;
    const scale = cssWidth / base.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const renderViewport = page.getViewport({ scale: scale * dpr });
    const card = document.querySelector(`.thumb-card[data-page="${pageNum}"]`);
    const canvas = card?.querySelector('.thumb-canvas');
    if (!canvas) return;
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
    state.thumbnailRendered.add(pageNum);
  } catch (error) {
    console.warn(`Thumbnail ${pageNum} failed:`, error);
  } finally {
    state.thumbnailRendering.delete(pageNum);
  }
}

function scrollActiveThumbIntoView() {
  if (!state.thumbsOpen) return;
  const card = document.querySelector(`.thumb-card[data-page="${state.currentPage}"]`);
  card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  renderThumbnail(state.currentPage);
}

function setThumbsOpen(open) {
  state.thumbsOpen = Boolean(open);
  els.app.classList.toggle('thumbs-open', state.thumbsOpen);
  els.thumbToggle.setAttribute('aria-pressed', String(state.thumbsOpen));
  if (state.thumbsOpen) {
    els.app.classList.remove('controls-hidden');
    scrollActiveThumbIntoView();
  } else {
    scheduleControlsAutoHide();
  }
}

function setSearchOpen(open) {
  state.searchOpen = Boolean(open);
  els.searchPanel.hidden = !state.searchOpen;
  els.searchToggle.setAttribute('aria-pressed', String(state.searchOpen));
  if (state.searchOpen) {
    els.app.classList.remove('controls-hidden');
    requestAnimationFrame(() => els.searchInput.focus({ preventScroll: true }));
  } else {
    scheduleControlsAutoHide();
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO')
    .replace(/\s+/g, ' ');
}

function normalizeWithMap(value) {
  const raw = String(value ?? '');
  let norm = '';
  const map = [];
  for (let i = 0; i < raw.length; i++) {
    const chunk = raw[i]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('ro-RO');
    for (const char of chunk) {
      norm += char;
      map.push(i);
    }
  }
  return { raw, norm: norm.replace(/\s+/g, ' '), map };
}

async function getPageSearchData(pageNum) {
  if (state.textCache.has(pageNum)) return state.textCache.get(pageNum);
  const page = await state.pdf.getPage(pageNum);
  const textContent = await page.getTextContent({ normalizeWhitespace: true });
  const raw = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim();
  const data = normalizeWithMap(raw);
  data.items = textContent.items;
  state.textCache.set(pageNum, data);
  return data;
}

let searchSequence = 0;
async function runSearch() {
  const sequence = ++searchSequence;
  const rawQuery = els.searchInput.value.trim();
  const query = normalizeText(rawQuery).trim();
  els.searchResults.replaceChildren();

  if (!query) {
    state.activeSearchTerm = '';
    els.searchStatus.textContent = 'Scrie un cuvânt sau o expresie.';
    scheduleHighQualityRender(0);
    return;
  }

  state.activeSearchTerm = rawQuery;
  els.searchStatus.textContent = 'Caut în document…';
  const results = [];
  let scanned = 0;
  const concurrency = 3;
  let cursor = 1;

  async function worker() {
    while (cursor <= state.totalPages) {
      const pageNum = cursor++;
      if (sequence !== searchSequence) return;
      const data = await getPageSearchData(pageNum);
      if (sequence !== searchSequence) return;

      const positions = [];
      let from = 0;
      while (positions.length < 50) {
        const index = data.norm.indexOf(query, from);
        if (index < 0) break;
        positions.push(index);
        from = index + Math.max(1, query.length);
      }

      if (positions.length) {
        const idx = positions[0];
        const rawStart = data.map[Math.min(idx, Math.max(0, data.map.length - 1))] ?? 0;
        const snippetStart = Math.max(0, rawStart - 65);
        const snippetEnd = Math.min(data.raw.length, rawStart + Math.max(rawQuery.length, 18) + 95);
        const snippet = `${snippetStart > 0 ? '…' : ''}${data.raw.slice(snippetStart, snippetEnd)}${snippetEnd < data.raw.length ? '…' : ''}`;
        results.push({ pageNum, count: positions.length, snippet });
      }
      scanned++;
      if (sequence === searchSequence) {
        els.searchStatus.textContent = `Caut… ${scanned}/${state.totalPages} pagini`;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, state.totalPages) }, worker));
  if (sequence !== searchSequence) return;
  results.sort((a, b) => a.pageNum - b.pageNum);

  const totalMatches = results.reduce((sum, item) => sum + item.count, 0);
  els.searchStatus.textContent = results.length
    ? `${totalMatches} apariții pe ${results.length} pagini`
    : 'Niciun rezultat.';

  if (!results.length) {
    els.searchResults.innerHTML = '<div class="search-empty">Nu am găsit termenul în textul PDF-ului.</div>';
  } else {
    const fragment = document.createDocumentFragment();
    for (const result of results) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.setAttribute('role', 'listitem');
      button.innerHTML = `
        <span class="search-result-page">p. ${result.pageNum}</span>
        <span class="search-result-copy">
          <span class="search-result-count">${result.count} ${result.count === 1 ? 'apariție' : 'apariții'}</span>
          <span class="search-result-snippet">${escapeHtml(result.snippet)}</span>
        </span>`;
      button.addEventListener('click', async () => {
        state.activeSearchTerm = rawQuery;
        await navigateToPage(result.pageNum, { historyMode: 'push' });
        if (isSmallScreen()) setSearchOpen(false);
      });
      fragment.append(button);
    }
    els.searchResults.append(fragment);
  }

  scheduleHighQualityRender(0);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
const debouncedSearch = debounce(runSearch, 220);

function onPointerDown(event) {
  if (event.target.closest('button, a, input, .search-panel, .thumb-drawer')) return;

  // Dacă gestul începe chiar pe text, lăsăm browserul să facă selecția nativă.
  // Pan/swipe rămân disponibile când gestul începe în orice zonă fără text.
  if (event.target.closest('#textLayer span:not(.markedContent)')) return;

  els.stage.setPointerCapture?.(event.pointerId);
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (state.pointers.size === 1) {
    state.gesture = {
      mode: state.zoom > 1.01 ? 'pan' : 'swipe',
      startX: event.clientX,
      startY: event.clientY,
      startPanX: state.panX,
      startPanY: state.panY,
      startTime: performance.now(),
      moved: false,
    };
    if (state.gesture.mode === 'pan') {
      state.isPanning = true;
      els.stage.classList.add('is-panning');
    }
  } else if (state.pointers.size === 2) {
    const [a, b] = [...state.pointers.values()];
    state.gesture = {
      mode: 'pinch',
      startDistance: Math.hypot(a.x - b.x, a.y - b.y),
      startZoom: state.zoom,
      moved: true,
    };
    state.isPanning = false;
    els.stage.classList.remove('is-panning');
  }
}

function onPointerMove(event) {
  if (!state.pointers.has(event.pointerId)) return;
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!state.gesture) return;

  if (state.pointers.size >= 2) {
    const [a, b] = [...state.pointers.values()];
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const targetZoom = state.gesture.startZoom * (distance / Math.max(1, state.gesture.startDistance));
    setZoomAt(centerX, centerY, targetZoom, false);
    state.gesture.moved = true;
    event.preventDefault();
    return;
  }

  if (state.gesture.mode === 'pan' && state.zoom > 1.01) {
    const dx = event.clientX - state.gesture.startX;
    const dy = event.clientY - state.gesture.startY;
    if (Math.hypot(dx, dy) > 2) state.gesture.moved = true;
    state.panX = state.gesture.startPanX + dx;
    state.panY = state.gesture.startPanY + dy;
    applyGeometry();
    event.preventDefault();
  } else if (state.gesture.mode === 'swipe') {
    const dx = event.clientX - state.gesture.startX;
    const dy = event.clientY - state.gesture.startY;
    if (Math.hypot(dx, dy) > 8) state.gesture.moved = true;
  }
}

function onPointerUp(event) {
  const hadPointer = state.pointers.has(event.pointerId);
  if (!hadPointer) return;
  state.pointers.delete(event.pointerId);

  if (state.gesture?.mode === 'pinch') {
    if (state.pointers.size < 2) scheduleHighQualityRender();
    if (state.pointers.size === 1) {
      const remaining = [...state.pointers.values()][0];
      state.gesture = {
        mode: state.zoom > 1.01 ? 'pan' : 'swipe',
        startX: remaining.x,
        startY: remaining.y,
        startPanX: state.panX,
        startPanY: state.panY,
        startTime: performance.now(),
        moved: true,
      };
    } else {
      state.gesture = null;
    }
    return;
  }

  const gesture = state.gesture;
  state.gesture = null;
  state.isPanning = false;
  els.stage.classList.remove('is-panning');

  if (!gesture) return;
  if (gesture.mode === 'swipe' && state.zoom <= 1.01) {
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const elapsed = performance.now() - gesture.startTime;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25 && elapsed < 900) {
      if (dx < 0) navigateToPage(state.currentPage + 1, { historyMode: 'push' });
      else navigateToPage(state.currentPage - 1, { historyMode: 'push' });
      return;
    }
  }

  if (!gesture.moved && event.pointerType !== 'mouse') toggleControlsOnTap();
}

function wireEvents() {
  els.prevBtn.addEventListener('click', () => navigateToPage(state.currentPage - 1, { historyMode: 'push' }));
  els.nextBtn.addEventListener('click', () => navigateToPage(state.currentPage + 1, { historyMode: 'push' }));
  els.edgePrev.addEventListener('click', () => navigateToPage(state.currentPage - 1, { historyMode: 'push' }));
  els.edgeNext.addEventListener('click', () => navigateToPage(state.currentPage + 1, { historyMode: 'push' }));

  els.pageInput.addEventListener('focus', () => els.pageInput.select());
  els.pageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigateToPage(Number.parseInt(els.pageInput.value, 10), { historyMode: 'push' });
      els.pageInput.blur();
    }
    if (event.key === 'Escape') {
      els.pageInput.value = String(state.currentPage);
      els.pageInput.blur();
    }
  });
  els.pageInput.addEventListener('blur', () => { els.pageInput.value = String(state.currentPage); });

  els.zoomInBtn.addEventListener('click', () => zoomFromCenter(CONFIG.zoomStep));
  els.zoomOutBtn.addEventListener('click', () => zoomFromCenter(1 / CONFIG.zoomStep));
  els.zoomResetBtn.addEventListener('click', resetZoom);

  els.stage.addEventListener('wheel', (event) => {
    if (!state.pdf) return;
    event.preventDefault();
    const intensity = event.deltaMode === 1 ? 0.04 : 0.0018;
    const factor = clamp(Math.exp(-event.deltaY * intensity), 0.82, 1.22);
    setZoomAt(event.clientX, event.clientY, state.zoom * factor);
    scheduleControlsAutoHide();
  }, { passive: false });

  els.stage.addEventListener('pointerdown', onPointerDown);
  els.stage.addEventListener('pointermove', onPointerMove, { passive: false });
  els.stage.addEventListener('pointerup', onPointerUp);
  els.stage.addEventListener('pointercancel', onPointerUp);

  els.thumbToggle.addEventListener('click', () => setThumbsOpen(!state.thumbsOpen));
  els.thumbClose.addEventListener('click', () => setThumbsOpen(false));
  els.searchToggle.addEventListener('click', () => setSearchOpen(!state.searchOpen));
  els.searchClose.addEventListener('click', () => setSearchOpen(false));
  els.clearSearch.addEventListener('click', () => {
    els.searchInput.value = '';
    state.activeSearchTerm = '';
    els.searchResults.replaceChildren();
    els.searchStatus.textContent = 'Scrie un cuvânt sau o expresie.';
    scheduleHighQualityRender(0);
    els.searchInput.focus();
  });
  els.searchInput.addEventListener('input', debouncedSearch);
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSearchOpen(false);
  });

  els.shareBtn.addEventListener('click', async () => {
    const url = new URL(location.href);
    url.searchParams.set('page', String(state.currentPage));
    const shareData = {
      title: CONFIG.siteTitle,
      text: `${CONFIG.shareText} Pagina ${state.currentPage}.`,
      url: url.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url.href);
        showToast('Linkul paginii a fost copiat.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url.href);
          showToast('Linkul paginii a fost copiat.');
        } catch {
          showToast('Nu am putut copia linkul.');
        }
      }
    }
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (typing) return;

    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      navigateToPage(state.currentPage + 1, { historyMode: 'push' });
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      navigateToPage(state.currentPage - 1, { historyMode: 'push' });
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomFromCenter(CONFIG.zoomStep);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomFromCenter(1 / CONFIG.zoomStep);
    } else if (event.key === '0') {
      event.preventDefault();
      resetZoom();
    } else if (event.key === 'Escape') {
      setSearchOpen(false);
      setThumbsOpen(false);
      resetZoom();
    }
  });

  window.addEventListener('popstate', () => {
    const requested = clamp(getRequestedPage(), 1, state.totalPages || 1);
    if (state.pdf && requested !== state.currentPage) {
      navigateToPage(requested, { historyMode: 'none' });
    }
  });

  const onResize = debounce(() => {
    if (!state.currentPageProxy) return;
    recalcFitScale();
    applyGeometry();
    scheduleHighQualityRender(60);
  }, 90);
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  els.retryBtn.addEventListener('click', () => location.reload());
}

async function loadDocument() {
  try {
    state.initialPageRequested = getRequestedPage();
    setLoading('Se încarcă documentul…', 'Conexiunea poate fi lentă; încărcăm doar ce este necesar.');

    const loadingTask = pdfjsLib.getDocument({
      url: CONFIG.pdfUrl,
      rangeChunkSize: CONFIG.rangeChunkSize,
      disableRange: false,
      disableStream: false,
      disableAutoFetch: false,
      cMapUrl: `${CDN_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${CDN_BASE}standard_fonts/`,
      wasmUrl: `${CDN_BASE}wasm/`,
    });

    loadingTask.onProgress = ({ loaded, total }) => {
      if (total > 0) {
        const percent = Math.min(100, Math.round((loaded / total) * 100));
        els.loadingDetail.textContent = `Se încarcă PDF-ul… ${percent}%`;
      } else if (loaded > 0) {
        els.loadingDetail.textContent = `Descărcat: ${(loaded / 1024 / 1024).toFixed(1)} MB`;
      }
    };

    state.pdf = await loadingTask.promise;
    state.totalPages = state.pdf.numPages;
    els.pageTotal.textContent = String(state.totalPages);
    els.downloadBtn.href = CONFIG.pdfUrl;

    // Păstrăm titlul comercial al aplicației, indiferent de metadatele interne ale PDF-ului.
    document.title = CONFIG.siteTitle;

    buildThumbnailStrip();
    const initialPage = clamp(state.initialPageRequested, 1, state.totalPages);
    await navigateToPage(initialPage, { historyMode: 'replace', transitionDirection: 0 });
    hideLoading();

    const rememberedThumbs = localStorage.getItem('catalog.thumbsOpen');
    if (rememberedThumbs === '1') setThumbsOpen(true);
    else setThumbsOpen(false);
  } catch (error) {
    console.error(error);
    showError(error);
  }
}

els.thumbToggle.addEventListener('click', () => {
  queueMicrotask(() => localStorage.setItem('catalog.thumbsOpen', state.thumbsOpen ? '1' : '0'));
});
els.thumbClose.addEventListener('click', () => localStorage.setItem('catalog.thumbsOpen', '0'));

wireEvents();
loadDocument();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker:', error));
  });
}
