import { BeatTracker } from '../xa-beat-tracker.js';

function createOnsetEnvelope() {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
}

test('beatTrack throws for non-positive BPM', () => {
  const tracker = new BeatTracker();
  const onset = createOnsetEnvelope();
  expect(() => {
    tracker.beatTrack({
      onsetEnvelope: onset,
      sr: 22050,
      hopLength: 512,
      bpm: -120,
      units: 'frames',
    });
  }).toThrow('BPM must be strictly positive');
});

test('plp rejects invalid tempo range', () => {
  const tracker = new BeatTracker();
  const onset = createOnsetEnvelope();
  expect(() => {
    tracker.plp({ onsetEnvelope: onset, tempoMin: 120, tempoMax: 100 });
  }).toThrow('tempoMax=100 must be larger than tempoMin=120');
});

test('tempoEstimation clamps to range', () => {
  const tracker = new BeatTracker();
  const onset = createOnsetEnvelope();
  const bpm = tracker.tempoEstimation(onset, 22050, 512, 200, 80, 120);
  expect(bpm).toBeLessThanOrEqual(120);
  expect(bpm).toBeGreaterThanOrEqual(80);
});
