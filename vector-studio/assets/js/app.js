(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  const els = {
    fileInput: $('fileInput'), dropzone: $('dropzone'), fileName: $('fileName'), sourceDimensions: $('sourceDimensions'),
    profileSelect: $('profileSelect'), ocrToggle: $('ocrToggle'), ocrOptions: $('ocrOptions'), ocrLanguage: $('ocrLanguage'),
    ocrMaxHeight: $('ocrMaxHeight'), ocrMaxLabel: $('ocrMaxLabel'), geometryToggle: $('geometryToggle'),
    transparentBgToggle: $('transparentBgToggle'), simplifyRange: $('simplifyRange'), simplifyLabel: $('simplifyLabel'),
    smoothRange: $('smoothRange'), smoothLabel: $('smoothLabel'), speckleRange: $('speckleRange'), speckleLabel: $('speckleLabel'),
    colorCount: $('colorCount'), vectorizeBtn: $('vectorizeBtn'), newProjectBtn: $('newProjectBtn'),
    stageViewport: $('stageViewport'), emptyState: $('emptyState'), canvasScene: $('canvasScene'), sceneTransform: $('sceneTransform'),
    artboard: $('artboard'), originalImage: $('originalImage'), vectorLayer: $('vectorLayer'), compareDivider: $('compareDivider'),
    compareControl: $('compareControl'), compareRange: $('compareRange'), checkerToggle: $('checkerToggle'),
    viewOriginalBtn: $('viewOriginalBtn'), viewCompareBtn: $('viewCompareBtn'), viewVectorBtn: $('viewVectorBtn'),
    zoomOutBtn: $('zoomOutBtn'), zoomInBtn: $('zoomInBtn'), fitBtn: $('fitBtn'), zoomLabel: $('zoomLabel'),
    progressPanel: $('progressPanel'), progressTitle: $('progressTitle'), progressPercent: $('progressPercent'),
    progressBar: $('progressBar'), progressDetail: $('progressDetail'),
    layersList: $('layersList'), showAllLayersBtn: $('showAllLayersBtn'), propertiesSection: $('propertiesSection'), propertiesContent: $('propertiesContent'),
    statPaths: $('statPaths'), statAnchors: $('statAnchors'), statTexts: $('statTexts'), statShapes: $('statShapes'),
    qualityLabel: $('qualityLabel'), qualityFill: $('qualityFill'), exportSvgBtn: $('exportSvgBtn'), copySvgBtn: $('copySvgBtn'), toast: $('toast')
  };

  const state = {
    file: null,
    imageURL: null,
    image: null,
    sourceWidth: 0,
    sourceHeight: 0,
    workWidth: 0,
    workHeight: 0,
    svg: null,
    viewMode: 'compare',
    zoom: 1,
    panX: 0,
    panY: 0,
    selected: null,
    isPanning: false,
    panStart: null,
    dependency: { cv: null },
    ocrWords: [],
    geometryShapes: [],
    backgroundColor: { r: 255, g: 255, b: 255, a: 255 },
    processing: false
  };

  function toast(message, type = 'ok') {
    els.toast.textContent = message;
    els.toast.className = `toast show${type === 'error' ? ' error' : ''}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { els.toast.className = 'toast'; }, 2600);
  }

  function setProgress(percent, title, detail) {
    els.progressPanel.classList.remove('hidden');
    els.progressPercent.textContent = `${Math.round(percent)}%`;
    els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (title) els.progressTitle.textContent = title;
    if (detail) els.progressDetail.textContent = detail;
  }

  function hideProgress(delay = 350) {
    setTimeout(() => els.progressPanel.classList.add('hidden'), delay);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function escapeText(s) { return String(s ?? ''); }

  function rgbToHex({ r, g, b }) {
    const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function parseColor(str) {
    if (!str) return null;
    const s = str.trim();
    if (s.startsWith('#')) {
      if (s.length === 4) return { r: parseInt(s[1] + s[1], 16), g: parseInt(s[2] + s[2], 16), b: parseInt(s[3] + s[3], 16) };
      if (s.length >= 7) return { r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), b: parseInt(s.slice(5,7),16) };
    }
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(',').map(Number);
      return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0 };
    }
    return null;
  }

  function colorDistance(a, b) {
    if (!a || !b) return 999;
    return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
  }

  function setBusy(busy) {
    state.processing = busy;
    els.vectorizeBtn.disabled = busy || !state.image;
    els.fileInput.disabled = busy;
    els.newProjectBtn.disabled = busy;
  }

  function loadImageFromFile(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      toast('Alege un fișier PNG, JPG sau WebP.', 'error');
      return;
    }
    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.file = file;
      state.imageURL = url;
      state.image = img;
      state.sourceWidth = img.naturalWidth;
      state.sourceHeight = img.naturalHeight;
      els.fileName.textContent = file.name;
      els.fileName.classList.remove('hidden');
      els.sourceDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
      els.vectorizeBtn.disabled = false;
      showSource();
      resetVectorOnly();
      toast('Imagine încărcată. Poți porni vectorizarea.');
    };
    img.onerror = () => toast('Imaginea nu a putut fi citită.', 'error');
    img.src = url;
  }

  function showSource() {
    els.emptyState.classList.add('hidden');
    els.canvasScene.classList.remove('hidden');
    els.originalImage.src = state.imageURL;
    const maxPreview = 1400;
    const scale = Math.min(1, maxPreview / Math.max(state.sourceWidth, state.sourceHeight));
    state.workWidth = Math.max(1, Math.round(state.sourceWidth * scale));
    state.workHeight = Math.max(1, Math.round(state.sourceHeight * scale));
    setArtboardSize(state.workWidth, state.workHeight);
    requestAnimationFrame(fitToViewport);
  }

  function setArtboardSize(w, h) {
    state.workWidth = w; state.workHeight = h;
    els.artboard.style.width = `${w}px`;
    els.artboard.style.height = `${h}px`;
  }

  function resetVectorOnly() {
    state.svg = null;
    state.selected = null;
    state.ocrWords = [];
    state.geometryShapes = [];
    els.vectorLayer.innerHTML = '';
    els.layersList.innerHTML = '<div class="layers-empty">Straturile vor apărea după vectorizare.</div>';
    els.propertiesSection.classList.add('hidden');
    els.exportSvgBtn.disabled = true;
    els.copySvgBtn.disabled = true;
    ['statPaths','statAnchors','statTexts','statShapes'].forEach(id => els[id].textContent = '—');
    els.qualityLabel.textContent = '—';
    els.qualityFill.style.width = '0%';
    setViewMode('original');
  }

  function resetProject() {
    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    Object.assign(state, { file:null, imageURL:null, image:null, sourceWidth:0, sourceHeight:0, svg:null, selected:null, ocrWords:[], geometryShapes:[] });
    els.fileInput.value = '';
    els.fileName.classList.add('hidden');
    els.sourceDimensions.textContent = '—';
    els.vectorLayer.innerHTML = '';
    els.canvasScene.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
    els.compareControl.classList.add('hidden');
    els.layersList.innerHTML = '<div class="layers-empty">Straturile vor apărea după vectorizare.</div>';
    els.propertiesSection.classList.add('hidden');
    els.vectorizeBtn.disabled = true;
    els.exportSvgBtn.disabled = true;
    els.copySvgBtn.disabled = true;
    setViewMode('compare');
  }

  function getWorkCanvas() {
    const maxAnalysis = 2200;
    const scale = Math.min(1, maxAnalysis / Math.max(state.sourceWidth, state.sourceHeight));
    const w = Math.max(1, Math.round(state.sourceWidth * scale));
    const h = Math.max(1, Math.round(state.sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const smooth = Number(els.smoothRange.value);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (smooth > 0) ctx.filter = `blur(${(smooth / 100) * 0.55}px)`;
    ctx.drawImage(state.image, 0, 0, w, h);
    ctx.filter = 'none';
    return { canvas, ctx, scale };
  }

  function estimateCornerBackground(ctx, w, h) {
    const coords = [
      [2,2],[w-3,2],[2,h-3],[w-3,h-3],
      [Math.round(w*.02), Math.round(h*.02)], [Math.round(w*.98)-1, Math.round(h*.02)],
      [Math.round(w*.02), Math.round(h*.98)-1], [Math.round(w*.98)-1, Math.round(h*.98)-1]
    ];
    const buckets = new Map();
    for (const [x,y] of coords) {
      const p = ctx.getImageData(clamp(x,0,w-1), clamp(y,0,h-1), 1, 1).data;
      const q = [Math.round(p[0]/16)*16, Math.round(p[1]/16)*16, Math.round(p[2]/16)*16];
      const key = q.join(',');
      buckets.set(key, (buckets.get(key)||0)+1);
    }
    let best = '255,255,255', count = -1;
    for (const [k,v] of buckets) if (v > count) { best=k; count=v; }
    const [r,g,b] = best.split(',').map(Number);
    return { r, g, b, a:255 };
  }

  function localBackgroundColor(ctx, box, w, h) {
    const pad = Math.max(2, Math.round(Math.min(box.x1-box.x0, box.y1-box.y0) * .12));
    const samples = [];
    const x0 = clamp(Math.floor(box.x0-pad),0,w-1), y0=clamp(Math.floor(box.y0-pad),0,h-1);
    const x1 = clamp(Math.ceil(box.x1+pad),0,w-1), y1=clamp(Math.ceil(box.y1+pad),0,h-1);
    const points = 28;
    for (let i=0;i<points;i++) {
      const t=i/(points-1);
      samples.push([Math.round(x0+(x1-x0)*t), y0], [Math.round(x0+(x1-x0)*t), y1], [x0, Math.round(y0+(y1-y0)*t)], [x1, Math.round(y0+(y1-y0)*t)]);
    }
    const buckets = new Map();
    for (const [x,y] of samples) {
      const p=ctx.getImageData(clamp(x,0,w-1),clamp(y,0,h-1),1,1).data;
      const q=[Math.round(p[0]/24)*24,Math.round(p[1]/24)*24,Math.round(p[2]/24)*24];
      const key=q.join(','); buckets.set(key,(buckets.get(key)||0)+1);
    }
    let best=null, count=-1;
    for (const [k,v] of buckets) if(v>count){best=k;count=v;}
    if(!best) return state.backgroundColor;
    const [r,g,b]=best.split(',').map(Number); return {r,g,b,a:255};
  }

  function foregroundColor(ctx, box, bg, w, h) {
    const x0=clamp(Math.floor(box.x0),0,w-1), y0=clamp(Math.floor(box.y0),0,h-1);
    const x1=clamp(Math.ceil(box.x1),0,w), y1=clamp(Math.ceil(box.y1),0,h);
    const bw=Math.max(1,x1-x0), bh=Math.max(1,y1-y0);
    const data=ctx.getImageData(x0,y0,bw,bh).data;
    const buckets=new Map();
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]<100) continue;
      const c={r:data[i],g:data[i+1],b:data[i+2]};
      if(colorDistance(c,bg)<45) continue;
      const q=[Math.round(c.r/24)*24,Math.round(c.g/24)*24,Math.round(c.b/24)*24];
      const key=q.join(','); buckets.set(key,(buckets.get(key)||0)+1);
    }
    let best=null,count=-1;
    for(const [k,v] of buckets) if(v>count){best=k;count=v;}
    if(!best) return colorDistance(bg,{r:255,g:255,b:255})<100 ? {r:20,g:25,b:28}:{r:255,g:255,b:255};
    const [r,g,b]=best.split(',').map(Number); return {r,g,b};
  }

  async function loadOpenCV() {
    if (state.dependency.cv && state.dependency.cv.Mat) return state.dependency.cv;
    if (!document.querySelector('script[data-opencv]')) {
      await new Promise((resolve, reject) => {
        const s=document.createElement('script');
        s.src='https://docs.opencv.org/4.x/opencv.js';
        s.async=true; s.dataset.opencv='1';
        s.onload=resolve; s.onerror=()=>reject(new Error('OpenCV.js nu s-a putut încărca.'));
        document.head.appendChild(s);
      });
    }
    const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      if(window.cv){
        if(typeof window.cv.then==='function') window.cv=await window.cv;
        if(window.cv && window.cv.Mat){ state.dependency.cv=window.cv; return window.cv; }
      }
      await new Promise(r=>setTimeout(r,80));
    }
    throw new Error('OpenCV.js nu a devenit disponibil la timp.');
  }


  function countTraceDrawables(svgRoot) {
    return svgRoot ? svgRoot.querySelectorAll('path, rect, circle, ellipse, polygon').length : 0;
  }

  function retryTracerOptions() {
    const base = tracerOptions();
    base.pathomit = 0;
    base.linefilter = false;
    base.numberofcolors = Math.max(Number(els.colorCount.value), 12);
    base.mincolorratio = 0;
    base.colorquantcycles = Math.max(base.colorquantcycles || 0, 4);
    base.ltres = Math.max(0.75, (base.ltres || 1) * 0.72);
    base.qtres = Math.max(0.75, (base.qtres || 1) * 0.72);
    return base;
  }

  async function runOCR(sourceCanvas, scale) {
    if (!els.ocrToggle.checked) return [];
    // Pentru logo-uri, fidelitatea vizuală este mai importantă decât textul editabil.
    // OCR-ul tinde să schimbe fontul și să "rupă" grafica, deci îl sărim implicit.
    if (els.profileSelect.value === 'logo') return [];
    if (!window.Tesseract) throw new Error('Motorul OCR nu este disponibil. Verifică accesul la CDN.');
    setProgress(10, 'Detectez textul', 'Încarc modelul OCR…');
    let worker;
    try {
      worker = await Tesseract.createWorker(els.ocrLanguage.value, 1, {
        logger: m => {
          if (typeof m.progress === 'number') {
            const p=10+m.progress*28;
            setProgress(p, 'Detectez textul', m.status || 'OCR');
          }
        }
      });
      const ret = await worker.recognize(sourceCanvas, {}, { blocks: true, tsv: true });
      const data = ret.data || {};
      let words = [];
      if (Array.isArray(data.words)) words = data.words;
      if (!words.length && Array.isArray(data.blocks)) {
        words = data.blocks.flatMap(b => (b.paragraphs||[]).flatMap(p => (p.lines||[]).flatMap(l => l.words||[])));
      }
      if (!words.length && typeof data.tsv === 'string') words = parseTSVWords(data.tsv);
      const maxRatio=Number(els.ocrMaxHeight.value)/100;
      const minConfidence=38;
      const maxWidthRatio = els.profileSelect.value === 'poster' ? 0.22 : 0.16;
      return words.map((word, i) => {
        const bbox=word.bbox || {x0:word.left||0,y0:word.top||0,x1:(word.left||0)+(word.width||0),y1:(word.top||0)+(word.height||0)};
        return { id:`ocr-${i}`, text:(word.text||'').trim(), confidence:Number(word.confidence ?? 50), bbox };
      }).filter(w => {
        const hRatio = (w.bbox.y1-w.bbox.y0)/sourceCanvas.height;
        const wRatio = (w.bbox.x1-w.bbox.x0)/sourceCanvas.width;
        return w.text && w.confidence>=minConfidence && hRatio<=maxRatio && wRatio<=maxWidthRatio && (w.bbox.x1-w.bbox.x0)>2 && (w.bbox.y1-w.bbox.y0)>2;
      });
    } finally {
      if(worker) await worker.terminate();
    }
  }

  function parseTSVWords(tsv) {
    const lines=tsv.split(/\r?\n/).filter(Boolean); if(lines.length<2) return [];
    const headers=lines[0].split('\t');
    const idx=(n)=>headers.indexOf(n);
    return lines.slice(1).map(line=>{
      const c=line.split('\t');
      const left=Number(c[idx('left')]||0), top=Number(c[idx('top')]||0), width=Number(c[idx('width')]||0), height=Number(c[idx('height')]||0);
      return { text:c[idx('text')]||'', confidence:Number(c[idx('conf')]||0), bbox:{x0:left,y0:top,x1:left+width,y1:top+height} };
    });
  }

  function maskOCRWords(ctx, words, w, h) {
    for (const word of words) {
      const bg=localBackgroundColor(ctx,word.bbox,w,h);
      const pad=Math.max(1,Math.round((word.bbox.y1-word.bbox.y0)*.08));
      const x=clamp(Math.floor(word.bbox.x0-pad),0,w), y=clamp(Math.floor(word.bbox.y0-pad),0,h);
      const x2=clamp(Math.ceil(word.bbox.x1+pad),0,w), y2=clamp(Math.ceil(word.bbox.y1+pad),0,h);
      ctx.fillStyle=`rgb(${bg.r},${bg.g},${bg.b})`;
      ctx.fillRect(x,y,x2-x,y2-y);
    }
  }

  async function detectGeometry(canvas, ctx) {
    if (!els.geometryToggle.checked) return [];
    setProgress(42, 'Reconstruiesc geometria', 'Încarc detectorul de forme…');
    let cv;
    try { cv=await loadOpenCV(); }
    catch(e){ console.warn(e); toast('Geometry repair indisponibil; continui cu tracing-ul.', 'error'); return []; }

    setProgress(48, 'Reconstruiesc geometria', 'Caut dreptunghiuri și cercuri clare…');
    let src, gray, blur, edges, contours, hierarchy;
    const out=[];
    try {
      src=cv.imread(canvas); gray=new cv.Mat(); blur=new cv.Mat(); edges=new cv.Mat(); contours=new cv.MatVector(); hierarchy=new cv.Mat();
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray,blur,new cv.Size(3,3),0,0,cv.BORDER_DEFAULT);
      cv.Canny(blur,edges,55,145);
      const kernel=cv.Mat.ones(3,3,cv.CV_8U);
      cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,kernel); kernel.delete();
      cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
      const imgArea=canvas.width*canvas.height;
      const minArea=Math.max(100,imgArea*0.00035);
      for(let i=0;i<contours.size();i++){
        const cnt=contours.get(i); const area=Math.abs(cv.contourArea(cnt));
        if(area<minArea || area>imgArea*.92){cnt.delete();continue;}
        const peri=cv.arcLength(cnt,true); const approx=new cv.Mat();
        cv.approxPolyDP(cnt,approx,0.018*peri,true);
        const rect=cv.boundingRect(approx); const bboxArea=rect.width*rect.height;
        const extent=bboxArea?area/bboxArea:0;
        let shape=null;
        if(approx.rows===4 && cv.isContourConvex(approx) && extent>.86 && rect.width>8 && rect.height>8){
          const fill=sampleDominantInside(ctx,rect,canvas.width,canvas.height);
          if(fill.coverage>.72){
            shape={type:'rect',x:rect.x,y:rect.y,width:rect.width,height:rect.height,fill:fill.color,confidence:fill.coverage};
          }
        } else {
          const circularity=peri?4*Math.PI*area/(peri*peri):0;
          if(circularity>.84 && extent>.66 && rect.width>10 && rect.height>10 && Math.abs(rect.width-rect.height)/Math.max(rect.width,rect.height)<.15){
            const fill=sampleDominantInside(ctx,rect,canvas.width,canvas.height);
            if(fill.coverage>.68){
              shape={type:'circle',cx:rect.x+rect.width/2,cy:rect.y+rect.height/2,r:(rect.width+rect.height)/4,fill:fill.color,confidence:fill.coverage};
            }
          }
        }
        if(shape && !isNearBackground(shape.fill)) out.push(shape);
        approx.delete(); cnt.delete();
        if(out.length>90) break;
      }
    } finally {
      [src,gray,blur,edges,hierarchy].forEach(m=>{try{m&&m.delete();}catch{}}); try{contours&&contours.delete();}catch{}
    }
    return dedupeGeometry(out);
  }

  function sampleDominantInside(ctx, rect, w, h) {
    const buckets=new Map(); let total=0;
    const sx=Math.max(3,Math.min(12,Math.floor(rect.width/4))), sy=Math.max(3,Math.min(12,Math.floor(rect.height/4)));
    for(let iy=1;iy<=sy;iy++) for(let ix=1;ix<=sx;ix++){
      const x=clamp(Math.round(rect.x+(rect.width*ix/(sx+1))),0,w-1), y=clamp(Math.round(rect.y+(rect.height*iy/(sy+1))),0,h-1);
      const p=ctx.getImageData(x,y,1,1).data;
      if(p[3]<100) continue;
      const q=[Math.round(p[0]/24)*24,Math.round(p[1]/24)*24,Math.round(p[2]/24)*24];
      const key=q.join(','); buckets.set(key,(buckets.get(key)||0)+1); total++;
    }
    let best='0,0,0',count=0; for(const [k,v] of buckets) if(v>count){best=k;count=v;}
    const [r,g,b]=best.split(',').map(Number);
    return {color:{r,g,b},coverage:total?count/total:0};
  }

  function isNearBackground(c){ return colorDistance(c,state.backgroundColor)<28; }

  function dedupeGeometry(items) {
    const score=(s)=>s.confidence*(s.type==='rect'?1:0.95);
    return items.sort((a,b)=>score(b)-score(a)).filter((s,i,arr)=>{
      const sb=shapeBBox(s);
      for(let j=0;j<i;j++){
        const ob=shapeBBox(arr[j]); if(iou(sb,ob)>.82 && s.type===arr[j].type) return false;
      }
      return true;
    }).slice(0,60);
  }

  function shapeBBox(s){
    return s.type==='rect'?{x:s.x,y:s.y,w:s.width,h:s.height}:{x:s.cx-s.r,y:s.cy-s.r,w:s.r*2,h:s.r*2};
  }
  function iou(a,b){
    const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h);
    const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1); return inter/(a.w*a.h+b.w*b.h-inter||1);
  }

  function tracerOptions() {
    const profile=els.profileSelect.value;
    const simplify=Number(els.simplifyRange.value)/100;
    const speck=Number(els.speckleRange.value)/100;
    const colors=Number(els.colorCount.value);
    const opts={
      ltres: 0.7 + simplify*2.2,
      qtres: 0.7 + simplify*2.0,
      pathomit: Math.round(2 + speck*34),
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: colors,
      mincolorratio: profile==='detail' ? 0 : 0.005,
      colorquantcycles: profile==='detail' ? 4 : 3,
      layering: 0,
      strokewidth: 0,
      linefilter: true,
      scale: 1,
      roundcoords: 2,
      viewbox: true,
      desc: false
    };
    if(profile==='mono'){ opts.numberofcolors=2; opts.ltres=1.3+simplify*2; opts.qtres=1.0+simplify*1.8; opts.pathomit=Math.round(4+speck*24); }
    if(profile==='poster'){ opts.numberofcolors=Math.max(colors,12); opts.ltres=.9+simplify*1.7; opts.qtres=.9+simplify*1.5; }
    if(profile==='detail'){ opts.numberofcolors=Math.max(colors,16); opts.ltres=.45+simplify*.9; opts.qtres=.45+simplify*.9; opts.pathomit=Math.round(1+speck*12); }
    return opts;
  }

  function postProcessSVG(svg, ctx, ocrWords, geometry, scale) {
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('viewBox', `0 0 ${state.workWidth} ${state.workHeight}`);
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Rezultat vectorizat');
    svg.style.width='100%'; svg.style.height='100%';
    svg.setAttribute('shape-rendering','geometricPrecision');

    const children=[...svg.children];
    const baseGroup=document.createElementNS(NS,'g'); baseGroup.id='base-trace'; baseGroup.dataset.layer='base';
    children.forEach(ch=>baseGroup.appendChild(ch));
    svg.appendChild(baseGroup);

    const geometryGroup=document.createElementNS(NS,'g'); geometryGroup.id='geometry-repair'; geometryGroup.dataset.layer='geometry';
    geometry.forEach((shape,i)=>{
      const el=document.createElementNS(NS,shape.type==='rect'?'rect':'circle');
      el.dataset.kind='geometry'; el.dataset.itemId=`geo-${i}`; el.setAttribute('fill',rgbToHex(shape.fill));
      el.setAttribute('stroke',rgbToHex(shape.fill)); el.setAttribute('stroke-width','0.7');
      if(shape.type==='rect'){
        el.setAttribute('x',shape.x);el.setAttribute('y',shape.y);el.setAttribute('width',shape.width);el.setAttribute('height',shape.height);
      } else {el.setAttribute('cx',shape.cx);el.setAttribute('cy',shape.cy);el.setAttribute('r',shape.r);}
      geometryGroup.appendChild(el);
    });
    svg.appendChild(geometryGroup);

    const textGroup=document.createElementNS(NS,'g'); textGroup.id='ocr-text'; textGroup.dataset.layer='text';
    ocrWords.forEach((word,i)=>{
      const b=word.bbox; const bg=localBackgroundColor(ctx,b,state.workWidth,state.workHeight); const fg=foregroundColor(ctx,b,bg,state.workWidth,state.workHeight);
      const x=b.x0, y=b.y0, width=Math.max(1,b.x1-b.x0), height=Math.max(1,b.y1-b.y0);
      const t=document.createElementNS(NS,'text');
      t.dataset.kind='text'; t.dataset.itemId=`text-${i}`; t.textContent=escapeText(word.text);
      t.setAttribute('x',x); t.setAttribute('y',y+height*.82); t.setAttribute('fill',rgbToHex(fg));
      t.setAttribute('font-family','Arial, Helvetica, sans-serif'); t.setAttribute('font-size',Math.max(4,height*.92).toFixed(2));
      t.setAttribute('font-weight','600'); t.setAttribute('textLength',width.toFixed(2)); t.setAttribute('lengthAdjust','spacingAndGlyphs');
      t.setAttribute('data-confidence',Math.round(word.confidence));
      textGroup.appendChild(t);
    });
    svg.appendChild(textGroup);
    return svg;
  }

  function removeBackgroundVector(svg) {
    if(!els.transparentBgToggle.checked) return;
    const bg=state.backgroundColor;
    let candidate=null, candidateArea=0;
    svg.querySelectorAll('#base-trace path, #base-trace rect, #base-trace polygon').forEach(el=>{
      const c=parseColor(el.getAttribute('fill')); if(colorDistance(c,bg)>34) return;
      let bb; try{bb=el.getBBox();}catch{return;}
      const area=bb.width*bb.height;
      if(area>state.workWidth*state.workHeight*.72 && area>candidateArea){candidate=el;candidateArea=area;}
    });
    if(candidate) candidate.remove();
  }

  function removeTinyVectorPaths(svg) {
    const minSlider=Number(els.speckleRange.value)/100;
    if(minSlider<=0) return;
    const traceEls = [...svg.querySelectorAll('#base-trace path, #base-trace rect, #base-trace circle, #base-trace ellipse, #base-trace polygon')];
    if (traceEls.length < 20) return;
    const minArea=state.workWidth*state.workHeight*(0.000002 + minSlider*0.000018);
    traceEls.forEach(p=>{
      try { const b=p.getBBox(); if(b.width*b.height<minArea) p.remove(); } catch {}
    });
  }

  async function vectorize() {
    if(!state.image || state.processing) return;
    if(!window.ImageTracer){ toast('ImageTracer nu s-a încărcat. Verifică internetul/CDN-ul.', 'error'); return; }
    setBusy(true);
    setProgress(1,'Pregătesc imaginea','Citesc rasterul și estimez fundalul…');
    try {
      const {canvas,ctx,scale}=getWorkCanvas();
      setArtboardSize(canvas.width,canvas.height);
      state.backgroundColor=estimateCornerBackground(ctx,canvas.width,canvas.height);
      // Keep an untouched copy for color sampling. The working canvas may be masked
      // during OCR reconstruction before tracing.
      const colorCanvas=document.createElement('canvas');
      colorCanvas.width=canvas.width; colorCanvas.height=canvas.height;
      const colorCtx=colorCanvas.getContext('2d',{willReadFrequently:true});
      colorCtx.drawImage(canvas,0,0);

      let ocr=[];
      if(els.ocrToggle.checked){
        try { ocr=await runOCR(canvas,scale); }
        catch(e){ console.warn(e); toast('OCR-ul a fost sărit: '+e.message,'error'); ocr=[]; }
      }

      state.ocrWords=ocr;
      if(ocr.length){
        setProgress(39,'Curăț textul raster','Înlocuiesc textul mic cu obiecte editabile…');
        maskOCRWords(ctx,ocr,canvas.width,canvas.height);
      }

      const geometry=await detectGeometry(canvas,ctx);
      state.geometryShapes=geometry;

      setProgress(58,'Vectorizez grafica','Trasez contururile și simplific punctele…');
      await new Promise(r=>setTimeout(r,30));
      const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
      let svgString=ImageTracer.imagedataToSVG(imageData,tracerOptions());
      let parsed=new DOMParser().parseFromString(svgString,'image/svg+xml');
      let svg=parsed.documentElement;
      if(svg.nodeName.toLowerCase()!=='svg') throw new Error('Tracerul nu a returnat un SVG valid.');

      let drawableCount = countTraceDrawables(svg);
      if (drawableCount < 8) {
        setProgress(70,'Refac vectorizarea','Prima trecere a ieșit prea slabă; refac fără reconstrucția textului…');
        const retryCanvas=document.createElement('canvas');
        retryCanvas.width=colorCanvas.width; retryCanvas.height=colorCanvas.height;
        const retryCtx=retryCanvas.getContext('2d', { willReadFrequently:true });
        retryCtx.drawImage(colorCanvas,0,0);
        const retryData=retryCtx.getImageData(0,0,retryCanvas.width,retryCanvas.height);
        svgString=ImageTracer.imagedataToSVG(retryData,retryTracerOptions());
        parsed=new DOMParser().parseFromString(svgString,'image/svg+xml');
        svg=parsed.documentElement;
        if(svg.nodeName.toLowerCase()!=='svg') throw new Error('Tracerul nu a returnat un SVG valid.');
        ocr=[];
        state.ocrWords=[];
        drawableCount = countTraceDrawables(svg);
      }

      svg=document.importNode(svg,true);
      postProcessSVG(svg,colorCtx,ocr,geometry,scale);

      els.vectorLayer.innerHTML=''; els.vectorLayer.appendChild(svg); state.svg=svg;
      setProgress(82,'Curăț rezultatul','Elimin fragmentele mici și repar fundalul…');
      await new Promise(r=>requestAnimationFrame(r));
      removeTinyVectorPaths(svg);
      removeBackgroundVector(svg);

      setProgress(92,'Construiesc editorul','Generez layers și statistici…');
      wireSVGSelection();
      renderLayers();
      updateStats();
      els.exportSvgBtn.disabled=false; els.copySvgBtn.disabled=false;
      setViewMode('compare');
      requestAnimationFrame(fitToViewport);
      setProgress(100,'Gata','SVG-ul este editabil și pregătit pentru export.');
      hideProgress(600);
      toast('Vectorizare finalizată. Verifică marginile în modul Compară.');
    } catch(err){
      console.error(err); hideProgress(0); toast(err.message || 'A apărut o eroare la vectorizare.','error');
    } finally { setBusy(false); }
  }

  function wireSVGSelection(){
    if(!state.svg) return;
    state.svg.addEventListener('click',e=>{
      const target=e.target.closest('[data-kind], #base-trace path, #base-trace rect, #base-trace circle, #base-trace polygon');
      if(!target || target===state.svg) return;
      e.stopPropagation(); selectElement(target);
    });
    state.svg.addEventListener('dblclick',e=>{
      const t=e.target.closest('text[data-kind="text"]'); if(!t) return;
      const next=prompt('Text:',t.textContent); if(next!==null){t.textContent=next;renderLayers();updateStats();}
    });
  }

  function selectElement(el){
    if(state.selected) state.selected.removeAttribute('data-selected');
    state.selected=el;
    if(el) el.setAttribute('data-selected','true');
    renderProperties();
    [...els.layersList.querySelectorAll('.layer-item')].forEach(item=>item.classList.toggle('active',item.dataset.itemId && el && item.dataset.itemId===el.dataset.itemId));
  }

  function renderLayers(){
    if(!state.svg){return;}
    const base=state.svg.querySelector('#base-trace'); const geo=[...state.svg.querySelectorAll('#geometry-repair > *')]; const texts=[...state.svg.querySelectorAll('#ocr-text > text')];
    const parts=[];
    parts.push(layerHTML('base','Tracing principal',`${base?base.querySelectorAll('path').length:0} paths`,base?.style.display!=='none',false));
    if(geo.length){ parts.push(`<div class="layer-group-label">GEOMETRY REPAIR</div>`); geo.forEach((el,i)=>parts.push(layerHTML(el.dataset.itemId,`Formă ${i+1}`,el.tagName.toLowerCase(),el.style.display!=='none',true))); }
    if(texts.length){ parts.push(`<div class="layer-group-label">TEXT EDITABIL</div>`); texts.forEach(el=>parts.push(layerHTML(el.dataset.itemId,el.textContent,`OCR ${el.dataset.confidence||''}%`,el.style.display!=='none',true))); }
    els.layersList.innerHTML=parts.join('');
    els.layersList.querySelectorAll('.layer-item').forEach(item=>{
      item.addEventListener('click',e=>{
        if(e.target.matches('.layer-eye,.layer-delete')) return;
        const id=item.dataset.itemId; const el=findLayerElement(id); if(el) selectElement(el);
      });
      const eye=item.querySelector('.layer-eye');
      eye?.addEventListener('change',()=>{
        const el=findLayerElement(item.dataset.itemId); if(el){el.style.display=eye.checked?'':'none';updateStats();}
      });
      const del=item.querySelector('.layer-delete');
      del?.addEventListener('click',()=>{
        const el=findLayerElement(item.dataset.itemId); if(el && item.dataset.itemId!=='base'){if(state.selected===el)selectElement(null);el.remove();renderLayers();updateStats();}
      });
    });
  }

  function layerHTML(id,title,meta,visible,deletable){
    return `<div class="layer-item" data-item-id="${id}"><input class="layer-eye" type="checkbox" ${visible?'checked':''} aria-label="Vizibil"><div class="layer-main"><strong>${htmlEscape(title)}</strong><small>${htmlEscape(meta)}</small></div><div class="layer-actions">${deletable?'<button class="layer-delete" type="button" title="Șterge">×</button>':''}</div></div>`;
  }
  function htmlEscape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function findLayerElement(id){ if(!state.svg)return null; if(id==='base')return state.svg.querySelector('#base-trace'); return state.svg.querySelector(`[data-item-id="${CSS.escape(id)}"]`); }

  function renderProperties(){
    const el=state.selected;
    if(!el){els.propertiesSection.classList.add('hidden');els.propertiesContent.innerHTML='';return;}
    els.propertiesSection.classList.remove('hidden');
    const fill=el.getAttribute('fill')||'#000000'; const opacity=el.getAttribute('opacity')||'1';
    const isText=el.tagName.toLowerCase()==='text';
    let html='<div class="property-grid">';
    if(isText) html+=`<label class="property-field full"><span>Text</span><textarea id="propText">${htmlEscape(el.textContent)}</textarea></label>`;
    html+=`<label class="property-field"><span>Culoare</span><input id="propFill" type="color" value="${normalizeHex(fill)}"></label>`;
    html+=`<label class="property-field"><span>Opacitate</span><input id="propOpacity" type="number" min="0" max="1" step="0.05" value="${opacity}"></label>`;
    if(isText){
      html+=`<label class="property-field full"><span>Font</span><select id="propFont"><option>Arial</option><option>Helvetica</option><option>Inter</option><option>Montserrat</option><option>Roboto</option><option>Georgia</option><option>Times New Roman</option></select></label>`;
      html+=`<label class="property-field"><span>Mărime</span><input id="propFontSize" type="number" min="3" step="0.5" value="${parseFloat(el.getAttribute('font-size')||16).toFixed(1)}"></label>`;
      html+=`<label class="property-field"><span>Greutate</span><select id="propWeight"><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option><option value="800">800</option><option value="900">900</option></select></label>`;
    }
    html+='</div>';
    els.propertiesContent.innerHTML=html;
    const fillInput=$('propFill'); fillInput?.addEventListener('input',()=>{el.setAttribute('fill',fillInput.value); if(el.dataset.kind==='geometry')el.setAttribute('stroke',fillInput.value);});
    const op=$('propOpacity'); op?.addEventListener('input',()=>el.setAttribute('opacity',clamp(Number(op.value),0,1)));
    const txt=$('propText'); txt?.addEventListener('input',()=>{el.textContent=txt.value; renderLayers();});
    const font=$('propFont'); if(font){ const family=(el.getAttribute('font-family')||'Arial').split(',')[0].replace(/["']/g,'').trim(); [...font.options].forEach(o=>{if(o.value.toLowerCase()===family.toLowerCase())font.value=o.value;}); font.addEventListener('change',()=>el.setAttribute('font-family',`${font.value}, sans-serif`)); }
    const fs=$('propFontSize'); fs?.addEventListener('input',()=>el.setAttribute('font-size',Math.max(3,Number(fs.value)||3)));
    const fw=$('propWeight'); if(fw){fw.value=el.getAttribute('font-weight')||'600';fw.addEventListener('change',()=>el.setAttribute('font-weight',fw.value));}
  }

  function normalizeHex(fill){ const c=parseColor(fill); return c?rgbToHex(c):'#000000'; }

  function updateStats(){
    if(!state.svg)return;
    const visible=(el)=>el.style.display!=='none';
    const paths=[...state.svg.querySelectorAll('path')].filter(visible);
    const drawables=[...state.svg.querySelectorAll('path, rect, circle, ellipse, polygon')].filter(visible);
    const texts=[...state.svg.querySelectorAll('text')].filter(visible);
    const shapes=[...state.svg.querySelectorAll('#geometry-repair > rect, #geometry-repair > circle, #geometry-repair > ellipse, #geometry-repair > polygon')].filter(visible);
    let anchors=0; paths.forEach(p=>{const d=p.getAttribute('d')||'';anchors+=(d.match(/[MLCQSTAHV]/gi)||[]).length;});
    els.statPaths.textContent=drawables.length.toLocaleString('ro-RO'); els.statAnchors.textContent=anchors.toLocaleString('ro-RO'); els.statTexts.textContent=texts.length; els.statShapes.textContent=shapes.length;
    const density=paths.length?anchors/paths.length:0; const px=state.workWidth*state.workHeight;
    let score=100-Math.min(55,density*1.5)-Math.min(30,(drawables/Math.max(1,px/10000))*2.2);
    score=clamp(Math.round(score),18,98); const label=score>=82?'Foarte curat':score>=65?'Curat':score>=45?'Mediu':'Complex';
    els.qualityLabel.textContent=label; els.qualityFill.style.width=`${score}%`;
  }

  function cleanExportSVG(){
    if(!state.svg)return null;
    const clone=state.svg.cloneNode(true);
    clone.querySelectorAll('[data-selected]').forEach(e=>e.removeAttribute('data-selected'));
    clone.querySelectorAll('[style*="display: none"]').forEach(e=>e.remove());
    clone.querySelectorAll('[data-kind],[data-item-id],[data-confidence],[data-layer]').forEach(e=>{
      [...e.attributes].filter(a=>a.name.startsWith('data-')).forEach(a=>e.removeAttribute(a.name));
    });
    clone.removeAttribute('style'); clone.setAttribute('width',state.workWidth); clone.setAttribute('height',state.workHeight);
    const serializer=new XMLSerializer();
    return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
  }

  function downloadSVG(){
    const code=cleanExportSVG(); if(!code)return;
    const blob=new Blob([code],{type:'image/svg+xml;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
    const base=(state.file?.name||'vector').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-');
    a.href=url;a.download=`${base}-vector.svg`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('SVG exportat.');
  }

  async function copySVG(){
    const code=cleanExportSVG(); if(!code)return;
    try{await navigator.clipboard.writeText(code);toast('Codul SVG a fost copiat.');}
    catch{const ta=document.createElement('textarea');ta.value=code;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Codul SVG a fost copiat.');}
  }

  function setViewMode(mode){
    state.viewMode=mode;
    [els.viewOriginalBtn,els.viewCompareBtn,els.viewVectorBtn].forEach(b=>b.classList.remove('active'));
    ({original:els.viewOriginalBtn,compare:els.viewCompareBtn,vector:els.viewVectorBtn})[mode].classList.add('active');
    if(!state.image)return;
    if(mode==='original'){
      els.originalImage.style.opacity='1';els.vectorLayer.style.display='none';els.vectorLayer.style.clipPath='none';els.compareDivider.classList.add('hidden');els.compareControl.classList.add('hidden');
    } else if(mode==='vector'){
      els.originalImage.style.opacity='0';els.vectorLayer.style.display='block';els.vectorLayer.style.clipPath='none';els.compareDivider.classList.add('hidden');els.compareControl.classList.add('hidden');
    } else {
      els.originalImage.style.opacity='1';els.vectorLayer.style.display=state.svg?'block':'none';els.compareControl.classList.toggle('hidden',!state.svg); updateCompare();
    }
  }

  function updateCompare(){
    if(state.viewMode!=='compare'||!state.svg)return;
    const v=Number(els.compareRange.value); els.vectorLayer.style.clipPath=`inset(0 ${100-v}% 0 0)`; els.compareDivider.classList.remove('hidden'); els.compareDivider.style.left=`${v}%`;
  }

  function applyTransform(){
    els.sceneTransform.style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.zoom}) translate(-50%,-50%)`;
    els.zoomLabel.textContent=`${Math.round(state.zoom*100)}%`;
  }

  function fitToViewport(){
    if(!state.image)return;
    const r=els.stageViewport.getBoundingClientRect(); const pad=54;
    const zx=Math.max(.04,(r.width-pad*2)/state.workWidth), zy=Math.max(.04,(r.height-pad*2)/state.workHeight);
    state.zoom=Math.min(zx,zy,1.3); state.panX=0;state.panY=0;applyTransform();
  }
  function zoomBy(mult, clientX=null, clientY=null){ state.zoom=clamp(state.zoom*mult,.06,8);applyTransform(); }

  function bindEvents(){
    els.fileInput.addEventListener('change',e=>loadImageFromFile(e.target.files?.[0]));
    ['dragenter','dragover'].forEach(ev=>els.dropzone.addEventListener(ev,e=>{e.preventDefault();els.dropzone.classList.add('dragover');}));
    ['dragleave','drop'].forEach(ev=>els.dropzone.addEventListener(ev,e=>{e.preventDefault();els.dropzone.classList.remove('dragover');}));
    els.dropzone.addEventListener('drop',e=>loadImageFromFile(e.dataTransfer?.files?.[0]));
    els.vectorizeBtn.addEventListener('click',vectorize); els.newProjectBtn.addEventListener('click',resetProject);
    els.ocrToggle.addEventListener('change',()=>els.ocrOptions.classList.toggle('hidden',!els.ocrToggle.checked));
    els.ocrMaxHeight.addEventListener('input',()=>els.ocrMaxLabel.textContent=`${els.ocrMaxHeight.value}%`);
    els.simplifyRange.addEventListener('input',()=>els.simplifyLabel.textContent=els.simplifyRange.value);
    els.smoothRange.addEventListener('input',()=>els.smoothLabel.textContent=els.smoothRange.value);
    els.speckleRange.addEventListener('input',()=>els.speckleLabel.textContent=els.speckleRange.value);
    els.viewOriginalBtn.addEventListener('click',()=>setViewMode('original'));els.viewCompareBtn.addEventListener('click',()=>setViewMode('compare'));els.viewVectorBtn.addEventListener('click',()=>setViewMode('vector'));
    els.compareRange.addEventListener('input',updateCompare); els.checkerToggle.addEventListener('change',()=>els.stageViewport.classList.toggle('checker',els.checkerToggle.checked));
    els.zoomInBtn.addEventListener('click',()=>zoomBy(1.18));els.zoomOutBtn.addEventListener('click',()=>zoomBy(1/1.18));els.fitBtn.addEventListener('click',fitToViewport);
    els.stageViewport.addEventListener('wheel',e=>{ if(!state.image)return; e.preventDefault(); zoomBy(e.deltaY<0?1.1:1/1.1,e.clientX,e.clientY); },{passive:false});
    els.stageViewport.addEventListener('pointerdown',e=>{ if(!state.image || e.button!==0)return; if(e.target.closest('svg [data-kind], svg #base-trace path'))return; state.isPanning=true;state.panStart={x:e.clientX-state.panX,y:e.clientY-state.panY};els.stageViewport.setPointerCapture(e.pointerId);els.stageViewport.style.cursor='grabbing'; });
    els.stageViewport.addEventListener('pointermove',e=>{if(!state.isPanning)return;state.panX=e.clientX-state.panStart.x;state.panY=e.clientY-state.panStart.y;applyTransform();});
    const endPan=()=>{state.isPanning=false;els.stageViewport.style.cursor='default';}; els.stageViewport.addEventListener('pointerup',endPan);els.stageViewport.addEventListener('pointercancel',endPan);
    els.stageViewport.addEventListener('click',e=>{if(e.target===els.stageViewport||e.target===els.artboard||e.target===els.vectorLayer)selectElement(null);});
    els.showAllLayersBtn.addEventListener('click',()=>{if(!state.svg)return;state.svg.querySelectorAll('#base-trace,#geometry-repair > *,#ocr-text > *').forEach(e=>e.style.display='');renderLayers();updateStats();});
    els.exportSvgBtn.addEventListener('click',downloadSVG);els.copySvgBtn.addEventListener('click',copySVG);
    window.addEventListener('resize',()=>{if(state.image)fitToViewport();});
    document.addEventListener('keydown',e=>{
      if((e.key==='Delete'||e.key==='Backspace')&&state.selected&&state.selected.dataset.itemId && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){
        state.selected.remove();selectElement(null);renderLayers();updateStats();
      }
      if((e.ctrlKey||e.metaKey)&&e.key==='0'){e.preventDefault();fitToViewport();}
    });
  }

  bindEvents();
})();
