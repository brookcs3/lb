/**
 * Browser-ready Beat Tracker
 * Integrates core with Web Audio API for browser use
 */

import { BeatTrackerCore, createConsoleLogger } from './xa-beat-core.js'
import { WebAudioAdapter } from './xa-audio-adapter.js'

export class BeatTracker {
  constructor(options = {}) {
    // Create adapter
    this.adapter = new WebAudioAdapter(options)
    
    // Create core tracker with adapter's sample rate
    this.core = new BeatTrackerCore({
      defaultSampleRate: this.adapter.defaultSampleRate,
      logger: options.logger || (options.debug ? createConsoleLogger() : undefined)
    })
    
    // Expose audio context for backward compatibility
    this.audioContext = this.adapter.getAudioContext()
    this.defaultSampleRate = this.adapter.defaultSampleRate
  }

  // Delegate core methods
  beatTrack(options = {}) {
    // Auto-detect sample rate from audio data if not provided
    if (!options.sr && options.y) {
      options.sr = this.adapter.detectSampleRate(options.y)
    }
    return this.core.beatTrack(options)
  }

  tempoEstimation(...args) {
    return this.core.tempoEstimation(...args)
  }

  onsetStrength(...args) {
    return this.core.onsetStrength(...args)
  }

  estimateDynamicTempo(...args) {
    return this.core.estimateDynamicTempo(...args)
  }

  plp(...args) {
    return this.core.plp(...args)
  }

  // Expose internal methods for backward compatibility
  _detectSampleRate(audioData) {
    return this.adapter.detectSampleRate(audioData)
  }

  _findRhythmStart(...args) {
    return this.core._findRhythmStart(...args)
  }

  _computeMagnitudeSpectrum(...args) {
    return this.core._computeMagnitudeSpectrum(...args)
  }

  _fft(...args) {
    return this.core._fft(...args)
  }

  _hasAnyValue(...args) {
    return this.core._hasAnyValue(...args)
  }

  _beatTracker(...args) {
    return this.core._beatTracker(...args)
  }

  _normalizeOnsets(...args) {
    return this.core._normalizeOnsets(...args)
  }

  _beatLocalScore(...args) {
    return this.core._beatLocalScore(...args)
  }

  _beatTrackDP(...args) {
    return this.core._beatTrackDP(...args)
  }

  _lastBeat(...args) {
    return this.core._lastBeat(...args)
  }

  _dpBacktrack(...args) {
    return this.core._dpBacktrack(...args)
  }

  _trimBeats(...args) {
    return this.core._trimBeats(...args)
  }

  _findPeaksWithProminence(...args) {
    return this.core._findPeaksWithProminence(...args)
  }

  _localMax(...args) {
    return this.core._localMax(...args)
  }

  fourierTempogram(...args) {
    return this.core.fourierTempogram(...args)
  }

  _fourierTempoFrequencies(...args) {
    return this.core._fourierTempoFrequencies(...args)
  }

  _istft(...args) {
    return this.core._istft(...args)
  }

  _ifft(...args) {
    return this.core._ifft(...args)
  }

  _normalize(...args) {
    return this.core._normalize(...args)
  }
}

// Export convenience functions that match the original API
export { beat_track, tempo, quickBeatTrack, quickBPMDetect } from './xa-beat-core.js'