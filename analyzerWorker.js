importScripts('xa-beat-tracker.js');

self.onmessage = async (e) => {
  const { command, audioData, sampleRate } = e.data;
  if (command === 'analyze') {
    try {
      self.postMessage({ type: 'progress', value: 0 });
      const tracker = new BeatTracker();
      const onset = tracker.onsetStrength(audioData, sampleRate);
      self.postMessage({ type: 'progress', value: 50 });
      const result = tracker.beatTrack({
        onsetEnvelope: onset,
        sr: sampleRate,
        units: 'time',
        sparse: true
      });
      self.postMessage({ type: 'progress', value: 100 });
      self.postMessage({ type: 'result', bpm: result.tempo, beats: result.beats });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }

  }
};
