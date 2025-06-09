import { BeatTracker } from '../xa-beat-tracker.js';

function createOnsetEnvelope(bpm, sr, hop, beats) {
  const framesPerBeat = Math.round((sr / hop) * (60 / bpm));
  const length = framesPerBeat * beats;
  const onset = new Float32Array(length).fill(0);
  for (let i = 0; i < length; i += framesPerBeat) {
    onset[i] = 1;
  }
  return { onset, framesPerBeat };
}

function findPeaks(data) {
  const peaks = [];
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > data[i - 1] && data[i] >= data[i + 1]) {
      peaks.push(i);
    }
  }
  return peaks;
}

 test('plp pulse peaks align with expected beat frames', () => {
  const tracker = new BeatTracker();
  const sr = 22050;
  const hop = 512;
  const beats = 20;
  const { onset, framesPerBeat } = createOnsetEnvelope(120, sr, hop, beats);
  const pulse = tracker.plp({ onsetEnvelope: onset, sr, hopLength: hop });
  const peaks = findPeaks(Array.from(pulse));
  const tolerance = 2;
  for (let i = 2; i < beats - 2; i++) {
    const expected = i * framesPerBeat;
    const hasPeak = peaks.some((p) => Math.abs(p - expected) <= tolerance);
    expect(hasPeak).toBe(true);
  }
});

test('tempoEstimation returns 120 BPM for synthetic envelope', () => {
  const tracker = new BeatTracker();
  const sr = 22050;
  const hop = 512;
  const { onset } = createOnsetEnvelope(120, sr, hop, 8);
  const tempo = tracker.tempoEstimation(onset, sr, hop, 120);
  expect(Math.round(tempo)).toBe(120);
});
