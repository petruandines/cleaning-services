(() => {
  'use strict';

  function trace(imageData, options) {
    return new Promise((resolve, reject) => {
      if (!window.Worker) {
        reject(new Error('Browserul nu suportă Web Workers.'));
        return;
      }
      const worker = new Worker('assets/js/trace-worker.js');
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error('Vectorizarea a durat prea mult. Încearcă o imagine mai mică sau mai puține culori.'));
      }, 90000);

      worker.onmessage = (event) => {
        clearTimeout(timer);
        worker.terminate();
        if (event.data?.ok) resolve(event.data.svgString);
        else reject(new Error(event.data?.error || 'Worker-ul de vectorizare a eșuat.'));
      };
      worker.onerror = (event) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message || 'Worker-ul de vectorizare a eșuat.'));
      };

      const buffer = imageData.data.buffer;
      worker.postMessage({ width: imageData.width, height: imageData.height, buffer, options }, [buffer]);
    });
  }

  window.VectorTraceWorker = { trace };
})();