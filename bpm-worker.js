import { parentPort } from 'worker_threads';
import { BeatTracker, quickBeatTrack } from './xa-beat-tracker.js';

parentPort.on('message', ({ onset, sr }) => {
  const orig = BeatTracker.prototype.onsetStrength;
  BeatTracker.prototype.onsetStrength = function(y) { return y; };
  const result = quickBeatTrack(onset, sr);
  BeatTracker.prototype.onsetStrength = orig;
  parentPort.postMessage(result);
});
