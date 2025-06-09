import { quickBeatTrack } from './xa-beat-tracker.js';

self.onmessage = async (e) => {
  const { arrayBuffer } = e.data || {};
  if (!arrayBuffer) {
    self.postMessage({ error: 'No ArrayBuffer provided' });
    return;
  }

  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = buffer.getChannelData(0);
    const { bpm, beats } = quickBeatTrack(channelData, buffer.sampleRate);
    self.postMessage({ bpm, beats });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
