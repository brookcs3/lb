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
