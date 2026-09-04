(() => {
  const cfg = CATALOG_CONFIG;
  const pad = n => String(n).padStart(2, "0");
  const pagePath = n => `${cfg.pageFolder}${cfg.pagePrefix}${pad(n)}${cfg.pageExtension}`;

  let current = 1;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let isDragging = false;
  let pinchDistance = 0;
  let pinchZoomStart = 1;

  const $ = id => document.getElementById(id);
  const cover = $("cover"), viewer = $("viewer"), image = $("pageImage"), frame = $("pageFrame");
  const thumbs = $("thumbnails"), counter = $("pageCounter");

  $("coverTitle").textContent = cfg.title;
  $("coverSubtitle").textContent = cfg.subtitle;
  $("brandTitle").textContent = cfg.title;
  $("coverImage").src = pagePath(cfg.coverPage);
  document.title = cfg.title;

  function urlPage() {
    const p = parseInt(new URLSearchParams(location.search).get("page"), 10);
    return Number.isFinite(p) ? Math.max(1, Math.min(p, cfg.pageCount)) : null;
  }

  function setUrl() {
    const url = new URL(location.href);
    url.searchParams.set("page", current);
    history.replaceState({}, "", url);
  }

  function renderThumbs() {
    if (!cfg.thumbnails) { thumbs.hidden = true; return; }
    thumbs.innerHTML = "";
    for (let i = 1; i <= cfg.pageCount; i++) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "thumb";
      b.setAttribute("aria-label", `Deschide pagina ${i}`);
      const img = document.createElement("img");
      img.src = pagePath(i); img.alt = ""; img.loading = "lazy";
      b.appendChild(img); b.addEventListener("click", () => goTo(i));
      thumbs.appendChild(b);
    }
  }

  function updateThumbs() {
    Array.from(thumbs.children).forEach((el, i) => el.classList.toggle("active", i + 1 === current));
    const active = thumbs.querySelector(".active");
    if (active) active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function applyTransform(animate = true) {
    frame.style.transition = animate ? "transform .28s cubic-bezier(.22,.61,.36,1)" : "none";
    frame.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    $("zoomReset").textContent = `${Math.round(zoom * 100)}%`;
    $("pageViewport").classList.toggle("zoomed", zoom > 1.01);
  }

  function resetZoom(animate = true) {
    zoom = 1; panX = 0; panY = 0;
    applyTransform(animate);
  }

  function setZoom(delta, clientX = null, clientY = null) {
    if (!cfg.zoom) return;

    const oldZoom = zoom;
    const newZoom = Math.max(1, Math.min(3, +(zoom + delta).toFixed(2)));
    if (oldZoom === newZoom) return;

    // Zoom toward the mouse pointer rather than the center of the page.
    // Keep the exact content point under the cursor stationary while scaling.
    if (clientX !== null && clientY !== null) {
      const rect = viewport.getBoundingClientRect();
      const x = clientX - (rect.left + rect.width / 2);
      const y = clientY - (rect.top + rect.height / 2);
      const ratio = newZoom / oldZoom;

      panX = x - (x - panX) * ratio;
      panY = y - (y - panY) * ratio;
    }

    zoom = newZoom;

    if (zoom <= 1) {
      panX = 0;
      panY = 0;
    }

    applyTransform(true);
  }

  function showPage(animate = true) {
    image.src = pagePath(current);
    image.alt = `Pagina ${current} din ${cfg.pageCount}`;
    counter.textContent = `${current} / ${cfg.pageCount}`;
    $("prev").disabled = current <= 1;
    $("next").disabled = current >= cfg.pageCount;
    $("first").disabled = current <= 1;
    $("last").disabled = current >= cfg.pageCount;
    resetZoom(true);
    updateThumbs();
    setUrl();

    if (animate) {
      frame.classList.remove("fade-in");
      void frame.offsetWidth;
      frame.classList.add("fade-in");
    }

    if (current < cfg.pageCount) {
      const pre = new Image();
      pre.src = pagePath(current + 1);
    }
  }

  function goTo(n) {
    n = Math.max(1, Math.min(n, cfg.pageCount));
    if (n === current) return;
    current = n;
    showPage(true);
  }

  function closeViewer() {
    // Return to the actual initial cover without reloading the page.
    // Explicitly clear both visibility states and restore the cover scroll position.
    viewer.hidden = true;
    cover.hidden = false;
    cover.style.display = "";
    viewer.style.display = "";

    current = 1;
    resetZoom(false);

    // Remove the page parameter so the URL points back to the catalog home.
    const url = new URL(location.href);
    url.searchParams.delete("page");
    history.replaceState({}, "", url);

    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  function openViewer() {
    cover.hidden = true;
    viewer.hidden = false;
    const p = urlPage();
    current = p || Math.max(1, Math.min(cfg.initialPage || 1, cfg.pageCount));
    renderThumbs();
    showPage(false);
  }

  $("openCatalog").addEventListener("click", openViewer);
  $("closeCatalog").addEventListener("click", closeViewer);
  $("prev").addEventListener("click", () => goTo(current - 1));
  $("next").addEventListener("click", () => goTo(current + 1));
  $("first").addEventListener("click", () => goTo(1));
  $("last").addEventListener("click", () => goTo(cfg.pageCount));
  $("zoomIn").addEventListener("click", () => setZoom(.15));
  $("zoomOut").addEventListener("click", () => setZoom(-.15));
  $("zoomReset").addEventListener("click", resetZoom);

  $("fullscreen").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        if (viewer.requestFullscreen) await viewer.requestFullscreen();
        else if (viewer.webkitRequestFullscreen) viewer.webkitRequestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (_) {}
  });

  document.addEventListener("keydown", e => {
    if (viewer.hidden) return;
    if (e.key === "ArrowLeft") goTo(current - 1);
    if (e.key === "ArrowRight") goTo(current + 1);
    if (e.key === "Home") goTo(1);
    if (e.key === "End") goTo(cfg.pageCount);
    if (e.key === "+" || e.key === "=") setZoom(.15);
    if (e.key === "-") setZoom(-.15);
    if (e.key === "0") resetZoom();
  });

  // Pointer/touch panning when zoomed. Supports mouse, touch and stylus.
  const viewport = $("pageViewport");

  viewport.addEventListener("pointerdown", e => {
    if (zoom <= 1.01) return;
    isDragging = true;
    viewport.classList.add("dragging");
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    frame.style.transition = "none";
  });

  viewport.addEventListener("pointermove", e => {
    if (!isDragging) return;
    panX = panStartX + e.clientX - pointerStartX;
    panY = panStartY + e.clientY - pointerStartY;
    applyTransform(false);
  });

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove("dragging");
    try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  // Native pinch-to-zoom on touch screens.
  viewport.addEventListener("touchstart", e => {
    if (e.touches.length === 2 && cfg.zoom) {
      pinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchZoomStart = zoom;
    }
  }, {passive: true});

  viewport.addEventListener("touchmove", e => {
    if (e.touches.length !== 2 || !cfg.zoom) return;
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (!pinchDistance) return;
    zoom = Math.max(1, Math.min(3, +(pinchZoomStart * d / pinchDistance).toFixed(2)));
    if (zoom <= 1) { panX = 0; panY = 0; }
    applyTransform(false);
    e.preventDefault();
  }, {passive: false});

  viewport.addEventListener("touchend", e => {
    if (e.touches.length < 2) pinchDistance = 0;
  }, {passive: true});

  // Mouse wheel over the main page = zoom.
  // Never scroll/pan the page with the wheel. Use drag ("hand") after zoom.
  viewport.addEventListener("wheel", e => {
    e.preventDefault();
    setZoom(e.deltaY < 0 ? .12 : -.12, e.clientX, e.clientY);
  }, {passive: false});

  // Horizontal mouse-wheel support for thumbnails.
  thumbs.addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      thumbs.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, {passive: false});


  let swipeStartX = 0, swipeStartY = 0;
  viewport.addEventListener("touchstart", e => {
    if (e.touches.length === 1 && zoom <= 1.01) {
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }
  }, {passive: true});
  viewport.addEventListener("touchend", e => {
    if (zoom > 1.01 || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      goTo(current + (dx < 0 ? 1 : -1));
    }
  }, {passive: true});

  // A shared URL such as ?page=5 must open directly on page 5.
  // The cover is shown only when there is no explicit page in the URL.
  const requestedPage = urlPage();
  if (requestedPage !== null) {
    current = requestedPage;
    openViewer();
  } else if (!cfg.showCover) {
    openViewer();
  }
})();