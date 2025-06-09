let worker;

function startWorker() {
  if (worker) return;
  worker = new Worker('./analyzerWorker.js', { type: 'module' });

  worker.addEventListener('message', (e) => {
    const bpmDisplay = document.getElementById('bpm');
    if (!bpmDisplay) return;
    const { bpm, error } = e.data;
    if (error) {
      console.error('Worker error:', error);
      bpmDisplay.textContent = 'BPM: Error';
    } else if (typeof bpm === 'number') {
      bpmDisplay.textContent = `BPM: ${bpm.toFixed(1)}`;
    }
  });
}

function stopWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

async function handleFile(e) {
  const file = e.target.files[0];
  if (!file || !worker) return;
  try {
    const buffer = await file.arrayBuffer();
    worker.postMessage({ arrayBuffer: buffer }, [buffer]);
  } catch (err) {
    console.error('Failed to send file to worker:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  startWorker();
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.addEventListener('change', handleFile);

  const stopBtn = document.getElementById('stopBtn');
  if (stopBtn) stopBtn.addEventListener('click', stopWorker);

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    stopWorker();
    startWorker();
  });
});

export { startWorker, stopWorker };
