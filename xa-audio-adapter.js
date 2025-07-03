/**
 * Web Audio API Adapter for Beat Tracker
 * Handles browser-specific audio functionality
 */

export class WebAudioAdapter {
  constructor(options = {}) {
    this.audioContext = null
    this.defaultSampleRate = options.defaultSampleRate || 44100
    this._initializeAudioContext()
  }

  _initializeAudioContext() {
    try {
      // Try to create AudioContext with standard sample rate
      this.audioContext = new (window.AudioContext ||
          window.webkitAudioContext)({ sampleRate: 48000 })
      this.defaultSampleRate = this.audioContext.sampleRate
      console.log(`🎧 AudioContext created with sample rate: ${this.audioContext.sampleRate} Hz`)
    } catch (e) {
      // Fallback without sample rate option for older browsers
      try {
        this.audioContext = new (window.AudioContext ||
            window.webkitAudioContext)()
        this.defaultSampleRate = this.audioContext.sampleRate
        console.log(`🎧 AudioContext created with sample rate: ${this.audioContext.sampleRate} Hz (fallback)`)
      } catch (e2) {
        console.warn('Web Audio API not available, using default sample rate:', this.defaultSampleRate)
      }
    }
  }

  /**
   * Detect sample rate from audio data or context
   * @param {Float32Array|AudioBuffer} audioData - Audio data
   * @returns {number} Sample rate
   */
  detectSampleRate(audioData) {
    // If audioData is an AudioBuffer, use its sample rate
    if (audioData && audioData.sampleRate) {
      return audioData.sampleRate
    }
    
    // Use AudioContext sample rate if available
    if (this.audioContext && this.audioContext.sampleRate) {
      return this.audioContext.sampleRate
    }
    
    // Fallback to default
    return this.defaultSampleRate
  }

  /**
   * Get the audio context
   * @returns {AudioContext|null}
   */
  getAudioContext() {
    return this.audioContext
  }

  /**
   * Create audio buffer from data
   * @param {number} channels - Number of channels
   * @param {number} length - Buffer length in samples
   * @param {number} sampleRate - Sample rate
   * @returns {AudioBuffer|null}
   */
  createBuffer(channels, length, sampleRate) {
    if (!this.audioContext) return null
    return this.audioContext.createBuffer(channels, length, sampleRate)
  }

  /**
   * Create buffer source
   * @returns {AudioBufferSourceNode|null}
   */
  createBufferSource() {
    if (!this.audioContext) return null
    return this.audioContext.createBufferSource()
  }

  /**
   * Get current time
   * @returns {number}
   */
  getCurrentTime() {
    return this.audioContext ? this.audioContext.currentTime : 0
  }

  /**
   * Get destination node
   * @returns {AudioDestinationNode|null}
   */
  getDestination() {
    return this.audioContext ? this.audioContext.destination : null
  }

  /**
   * Load audio file and decode it
   * @param {ArrayBuffer} arrayBuffer - Audio file data
   * @returns {Promise<AudioBuffer>}
   */
  async decodeAudioData(arrayBuffer) {
    if (!this.audioContext) {
      throw new Error('AudioContext not available')
    }
    return await this.audioContext.decodeAudioData(arrayBuffer)
  }

  /**
   * Extract channel data from AudioBuffer
   * @param {AudioBuffer} audioBuffer - Audio buffer
   * @param {number} channel - Channel index (default: 0)
   * @returns {Float32Array}
   */
  getChannelData(audioBuffer, channel = 0) {
    if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') {
      throw new Error('Invalid AudioBuffer')
    }
    return audioBuffer.getChannelData(channel)
  }

  /**
   * Convert AudioBuffer to mono Float32Array
   * @param {AudioBuffer} audioBuffer - Audio buffer
   * @returns {Float32Array}
   */
  audioBufferToArray(audioBuffer) {
    if (!audioBuffer) {
      throw new Error('AudioBuffer is required')
    }

    const numberOfChannels = audioBuffer.numberOfChannels
    const length = audioBuffer.length
    const result = new Float32Array(length)

    // Mix down to mono if multi-channel
    if (numberOfChannels === 1) {
      return audioBuffer.getChannelData(0)
    } else {
      // Mix all channels to mono
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel)
        for (let i = 0; i < length; i++) {
          result[i] += channelData[i] / numberOfChannels
        }
      }
      return result
    }
  }

  /**
   * Check if Web Audio API is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.audioContext !== null
  }

  /**
   * Resume audio context if suspended
   * @returns {Promise<void>}
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  /**
   * Close audio context
   * @returns {Promise<void>}
   */
  async close() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
    }
  }
}

/**
 * Factory function to create Web Audio adapter with feature detection
 * @param {Object} options - Adapter options
 * @returns {WebAudioAdapter|null}
 */
export function createWebAudioAdapter(options = {}) {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return null
  }

  // Check if Web Audio API is available
  if (!window.AudioContext && !window.webkitAudioContext) {
    console.warn('Web Audio API not supported in this browser')
    return null
  }

  return new WebAudioAdapter(options)
}