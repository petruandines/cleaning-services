(() => {
  'use strict';

  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

  function distToBg(data, p, bg) {
    const dr = data[p] - bg.r;
    const dg = data[p + 1] - bg.g;
    const db = data[p + 2] - bg.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function bboxOf(s) {
    return s.type === 'rect'
      ? { x: s.x, y: s.y, w: s.width, h: s.height }
      : { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
  }

  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter || 1);
  }

  function dedupe(items) {
    return items
      .sort((a, b) => b.confidence - a.confidence)
      .filter((shape, i, arr) => {
        const box = bboxOf(shape);
        for (let j = 0; j < i; j++) {
          if (shape.type === arr[j].type && iou(box, bboxOf(arr[j])) > 0.82) return false;
        }
        return true;
      })
      .slice(0, 60);
  }

  async function detect(canvas, backgroundColor, onProgress) {
    const maxSide = 650;
    const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));
    const mini = document.createElement('canvas');
    mini.width = w;
    mini.height = h;
    const ctx = mini.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, w, h);

    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    const bg = backgroundColor || { r: 255, g: 255, b: 255 };
    const mask = new Uint8Array(w * h);
    const visited = new Uint8Array(w * h);
    const threshold = 44;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x, p = idx * 4;
        if (data[p + 3] >= 80 && distToBg(data, p, bg) > threshold) mask[idx] = 1;
      }
      if ((y & 63) === 0) {
        onProgress?.(y / Math.max(1, h) * 0.35, 'Separ formele de fundal…');
        await nextFrame();
      }
    }

    const out = [];
    const minPixels = Math.max(18, Math.round(w * h * 0.00010));
    const maxPixels = Math.round(w * h * 0.35);
    const stack = new Int32Array(w * h);
    let componentNo = 0;

    for (let sy = 0; sy < h; sy++) {
      for (let sx = 0; sx < w; sx++) {
        const seed = sy * w + sx;
        if (!mask[seed] || visited[seed]) continue;

        let top = 0;
        stack[top++] = seed;
        visited[seed] = 1;
        let count = 0, minX = sx, maxX = sx, minY = sy, maxY = sy;
        let sumR = 0, sumG = 0, sumB = 0;

        while (top) {
          const idx = stack[--top];
          const y = Math.floor(idx / w), x = idx - y * w;
          count++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          const p = idx * 4;
          sumR += data[p]; sumG += data[p + 1]; sumB += data[p + 2];
          if (count > maxPixels) { top = 0; break; }

          const left = idx - 1, right = idx + 1, up = idx - w, down = idx + w;
          if (x > 0 && mask[left] && !visited[left]) { visited[left] = 1; stack[top++] = left; }
          if (x + 1 < w && mask[right] && !visited[right]) { visited[right] = 1; stack[top++] = right; }
          if (y > 0 && mask[up] && !visited[up]) { visited[up] = 1; stack[top++] = up; }
          if (y + 1 < h && mask[down] && !visited[down]) { visited[down] = 1; stack[top++] = down; }
        }

        if (count < minPixels || count > maxPixels) continue;
        const bw = maxX - minX + 1, bh = maxY - minY + 1;
        if (bw < 4 || bh < 4) continue;
        const boxArea = bw * bh;
        const coverage = count / boxArea;
        const aspect = bw / bh;
        const fill = { r: sumR / count, g: sumG / count, b: sumB / count };
        let shape = null;

        if (coverage > 0.93 && (aspect > 2.2 || aspect < 0.45 || boxArea > w * h * 0.006)) {
          shape = {
            type: 'rect',
            x: minX / scale, y: minY / scale,
            width: bw / scale, height: bh / scale,
            fill, confidence: coverage
          };
        } else if (aspect > 0.88 && aspect < 1.12 && coverage > 0.69 && coverage < 0.86 && boxArea > w * h * 0.0008) {
          const circleScore = 1 - Math.min(1, Math.abs(coverage - Math.PI / 4) / 0.11);
          if (circleScore > 0.55) {
            shape = {
              type: 'circle',
              cx: (minX + bw / 2) / scale,
              cy: (minY + bh / 2) / scale,
              r: ((bw + bh) / 4) / scale,
              fill, confidence: circleScore
            };
          }
        }

        if (shape) out.push(shape);
        componentNo++;
        if ((componentNo & 31) === 0) {
          onProgress?.(0.35 + sy / Math.max(1, h) * 0.65, 'Verific dreptunghiuri și cercuri…');
          await nextFrame();
        }
        if (out.length >= 60) break;
      }
      if (out.length >= 60) break;
    }

    onProgress?.(1, 'Geometrie analizată.');
    return dedupe(out);
  }

  window.VectorGeometryLite = { detect };
})();