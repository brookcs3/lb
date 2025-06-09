import { BeatTracker } from '../xa-beat-tracker.js';

function createOnsetEnvelope(bpm, sr, hop, beats) {
  const framesPerBeat = Math.round((sr / hop) * (60 / bpm));
  const length = framesPerBeat * beats;
  const onset = new Float32Array(length).fill(0);

  for (let i = 0; i < length; i += framesPerBeat) {
    for (let j = 0; j < 5; j++) {
      if (i + j < length) onset[i + j] = 1 - j * 0.2;
    }
  }

  return { onset, framesPerBeat };
}

test('plp pulse peaks align with beat frames', () => {
  const tracker = new BeatTracker();
  const sr = 22050;
  const hop = 512;
  const beats = 20;
  const { onset, framesPerBeat } = createOnsetEnvelope(120, sr, hop, beats);
  const pulse = tracker.plp({ onsetEnvelope: onset, sr, hopLength: hop });

  const maxima = tracker._localMax(pulse);
  const peakFrames = [];
  for (let i = 0; i < maxima.length; i++) {
    if (maxima[i]) peakFrames.push(i);
  }

  for (let b = 0; b < 8; b++) {
    const expected = b * framesPerBeat;
    const found = peakFrames.find((p) => Math.abs(p - expected) <= 2);
    expect(found).toBeDefined();
  }
});
