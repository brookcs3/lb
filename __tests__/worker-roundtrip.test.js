import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';

function createOnsetEnvelope(bpm, sr, hop, beats) {
  const framesPerBeat = Math.round((sr / hop) * (60 / bpm));
  const length = framesPerBeat * beats;
  const onset = new Float32Array(length).fill(0);
  for (let i = 0; i < length; i += framesPerBeat) {
    onset[i] = 1;
  }
  return { onset };
}

test('worker returns beat tracking result', async () => {
  const sr = 22050;
  const hop = 512;
  const { onset } = createOnsetEnvelope(120, sr, hop, 8);
  const worker = new Worker(new URL('../bpm-worker.js', import.meta.url), { type: 'module' });
  const result = await new Promise((resolve) => {
    worker.once('message', (msg) => resolve(msg));
    worker.postMessage({ onset, sr });
  });
  worker.terminate();
  expect(Math.round(result.bpm)).toBe(120);
  expect(result.beats.length).toBe(8);
});
