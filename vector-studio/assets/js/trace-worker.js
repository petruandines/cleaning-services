let ready = false;

self.onmessage = (event) => {
  try {
    if (!ready) {
      importScripts('https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js');
      if (!self.ImageTracer) throw new Error('ImageTracer nu s-a putut încărca în worker.');
      ready = true;
    }
    const { width, height, buffer, options } = event.data || {};
    const imageData = { width, height, data: new Uint8ClampedArray(buffer) };
    const svgString = self.ImageTracer.imagedataToSVG(imageData, options || {});
    self.postMessage({ ok: true, svgString });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || String(error) });
  }
};