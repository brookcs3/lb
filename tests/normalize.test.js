import { BeatTracker } from '../xa-beat-tracker.js';

const normalize = BeatTracker.prototype._normalize;

test('normalize handles small arrays', () => {
  const arr = [0, 2, 4];
  const result = normalize(arr);
  expect(result).toEqual([0, 0.5, 1]);
});

test('normalize handles large arrays', () => {
  const large = new Float32Array(100000);
  for (let i = 0; i < large.length; i++) {
    large[i] = i * 2;
  }
  const result = normalize(large);
  expect(result[0]).toBe(0);
  expect(result[result.length - 1]).toBe(1);
});
