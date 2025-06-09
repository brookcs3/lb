import { BeatTracker, quickBeatTrack } from '../xa-beat-tracker.js';

function createOnsetEnvelope(bpm, sr, hop, beats) {
  const framesPerBeat = Math.round((sr / hop) * (60 / bpm));
  const length = framesPerBeat * beats;
  const onset = new Float32Array(length).fill(0);
  for (let i = 0; i < length; i += framesPerBeat) {
    onset[i] = 1;
  }
  return { onset, framesPerBeat };
}

test('tempoEstimation returns approx 120 BPM for regular pulses', () => {
  const tracker = new BeatTracker();
  const sr = 22050;
  const hop = 512;
  const { onset } = createOnsetEnvelope(120, sr, hop, 8);
  const tempo = tracker.tempoEstimation(onset, sr, hop, 120);
  expect(Math.round(tempo)).toBe(120);
});

test('beatTrack identifies beats for a simple onset envelope', () => {
  const tracker = new BeatTracker();
  const sr = 22050;
  const hop = 512;
  const { onset, framesPerBeat } = createOnsetEnvelope(120, sr, hop, 8);
  const result = tracker.beatTrack({
    onsetEnvelope: onset,
    sr,
    hopLength: hop,
    bpm: 120,
    units: 'frames',
    sparse: true,
  });
  expect(result.beats.length).toBe(8);
  expect(result.beats[0]).toBe(0);
  expect(result.beats[1]).toBe(framesPerBeat);
});

test('quickBeatTrack uses detected tempo instead of fallback', () => {
  const sr = 22050;
  const hop = 512;
  const { onset } = createOnsetEnvelope(100, sr, hop, 8);

  // Patch onsetStrength so quickBeatTrack treats the input as an onset envelope
  const orig = BeatTracker.prototype.onsetStrength;
  BeatTracker.prototype.onsetStrength = function(y) { return y; };

  const result = quickBeatTrack(onset, sr);

  // Restore original method
  BeatTracker.prototype.onsetStrength = orig;

  expect(Math.round(result.bpm)).toBe(100);
  expect(result.beats.length).toBe(8);
  expect(result.confidence).toBeGreaterThan(0);
});

test('quickBeatTrack returns 0 BPM when beatTrack fails', () => {
  const result = quickBeatTrack(null, 44100);
  expect(result.bpm).toBe(0);
  expect(result.beats).toEqual([]);
  expect(result.confidence).toBe(0);
});
