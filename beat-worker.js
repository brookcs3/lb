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
    const result = tracker.beatTrack({
      y: audioData,
      sr: sampleRate,
      hopLength: 512,
      units: 'time',
      sparse: true
    });
    
    self.postMessage({
      success: true,
      tempo: result.tempo,
      beats: result.beats
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
  }
};