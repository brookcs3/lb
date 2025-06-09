import assert from 'assert';
import { BeatTracker } from '../xa-beat-tracker.js';

const normalize = BeatTracker.prototype._normalize;

function testSmallArray() {
  const arr = [0, 2, 4];
  const result = normalize(arr);
  assert.deepStrictEqual(result, [0, 0.5, 1]);
}

function testLargeArray() {
  const large = new Float32Array(100000);
  for (let i = 0; i < large.length; i++) {
    large[i] = i * 2;
  }
  const result = normalize(large);
  assert.strictEqual(result[0], 0);
  assert.strictEqual(result[result.length - 1], 1);
}

testSmallArray();
testLargeArray();

console.log('All tests passed');
