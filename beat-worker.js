/**
 * Web Worker script for beat tracking computation
 * This script offloads the intensive beat tracking process from the main thread
 * to prevent UI freezing during audio analysis.
 */

importScripts('./xa-beat-tracker.js');

self.onmessage = function(e) {
  const audioData = e.data.audioData;
  const sampleRate = e.data.sampleRate;
  
  try {
    const tracker = new BeatTracker();
    self.postMessage({ type: 'log', message: 'Starting beat tracking process in worker...' });
    self.postMessage({ type: 'log', message: '1. Setting up beatTrack parameters:' });
    self.postMessage({ type: 'log', message: '   - Audio data (y): loaded' });
    self.postMessage({ type: 'log', message: '   - Sample rate (sr): ' + sampleRate });
    self.postMessage({ type: 'log', message: '   - Hop length: 512' });
    self.postMessage({ type: 'log', message: '   - Units: time' });
    self.postMessage({ type: 'log', message: '   - Sparse: true' });

    self.postMessage({ type: 'log', message: '2. Checking for onset envelope:' });
    self.postMessage({ type: 'log', message: '   - No onset envelope provided, computing from audio data...' });

    self.postMessage({ type: 'log', message: '3. Verifying onsets presence:' });
    self.postMessage({ type: 'log', message: '   - Processing to check if any onsets are detected...' });

    const result = tracker.beatTrack({
      y: audioData,
      sr: sampleRate,
      hopLength: 512,
      units: 'time',
      sparse: true
    });
    
    self.postMessage({ type: 'result', success: true, tempo: result.tempo, beats: result.beats });
    self.postMessage({ type: 'log', message: result.tempo ? 'Beat tracking completed. Tempo detected: ' + result.tempo.toFixed(2) + ' BPM' : 'Beat tracking completed. No tempo detected.' });
  } catch (error) {
    self.postMessage({ type: 'result', success: false, error: { name: error.name, message: error.message } });
    self.postMessage({ type: 'log', message: 'Error occurred during beat tracking: ' + error.message });
  }
};