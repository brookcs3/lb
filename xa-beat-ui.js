/**
 * Beat Tracking UI Module
 * Browser-specific UI components for beat tracking visualization and audio playback
 */

import { BeatTrackerCore } from './xa-beat-core.js'
import { WebAudioAdapter } from './xa-audio-adapter.js'

export class BeatTrackingUI {
  constructor(options = {}) {
    this.adapter = options.adapter || new WebAudioAdapter()
    this.tracker = new BeatTrackerCore({
      defaultSampleRate: this.adapter.defaultSampleRate,
      logger: options.logger
    })
  }

  /**
   * Get the audio context from adapter
   */
  get audioContext() {
    return this.adapter.getAudioContext()
  }

  /**
   * Detect drum hits (kicks, snares, etc) using onset detection
   * @param {AudioBuffer} audioBuffer - Audio buffer to analyze
   * @param {Object} options - Detection options
   * @returns {Object} Object with kicks and hits arrays
   */
  detectDrumHits(audioBuffer, options = {}) {
    const {
      threshold = 0.3,
      minInterval = 0.05,
      kickThreshold = 0.4,
      circular = true
    } = options
    
    console.log(`🥁 Detecting drum hits with threshold ${threshold}${circular ? ' (circular mode)' : ''}`)
    
    const audioData = this.adapter.getChannelData(audioBuffer, 0)
    const sampleRate = audioBuffer.sampleRate
    const frameLength = 2048
    const hopLength = 512
    
    // Compute onset strength
    const onsetStrength = circular 
      ? this._computeCircularOnsetStrength(audioData, sampleRate, hopLength, frameLength)
      : this.tracker.onsetStrength(audioData, sampleRate, hopLength)
    
    // Find peaks in onset strength
    const kicks = []
    const hits = []
    const maxStrength = Math.max(...onsetStrength)
    const adaptiveThreshold = maxStrength * threshold
    
    let lastPeakTime = -minInterval
    
    for (let i = 1; i < onsetStrength.length - 1; i++) {
      const currentTime = (i * hopLength) / sampleRate
      
      // Check if it's a local peak above threshold
      if (onsetStrength[i] > adaptiveThreshold &&
          onsetStrength[i] > onsetStrength[i - 1] &&
          onsetStrength[i] > onsetStrength[i + 1] &&
          currentTime - lastPeakTime >= minInterval) {
        
        const frameStart = i * hopLength
        const frameEnd = Math.min(frameStart + frameLength, audioData.length)
        const frame = audioData.slice(frameStart, frameEnd)
        
        // Analyze frequency content
        const freqAnalysis = this._analyzeFrequencyContent(frame)
        
        // Classify as kick or other hit based on frequency content
        if (freqAnalysis.lowFreqRatio > kickThreshold) {
          kicks.push(currentTime)
          console.log(`🦵 Kick at ${currentTime.toFixed(3)}s (low freq: ${(freqAnalysis.lowFreqRatio*100).toFixed(1)}%)`)
        } else {
          hits.push(currentTime)
          console.log(`🥁 Hit at ${currentTime.toFixed(3)}s (low freq: ${(freqAnalysis.lowFreqRatio*100).toFixed(1)}%)`)
        }
        
        lastPeakTime = currentTime
      }
    }
    
    console.log(`🥁 Found ${kicks.length} kicks and ${hits.length} other hits`)
    
    return { kicks, hits }
  }
  
  /**
   * Compute onset strength with circular buffer for seamless loop detection
   * @private
   */
  _computeCircularOnsetStrength(audioData, sampleRate, hopLength, frameLength) {
    const frames = Math.floor((audioData.length - frameLength) / hopLength) + 1
    const onset = new Float32Array(frames)
    
    console.log(`🔄 Computing circular onset strength for ${frames} frames`)
    
    // Pre-compute spectrum for the last few frames
    const preRollFrames = 4
    let prevSpectrums = []
    
    // Compute spectrums for the end of the track
    for (let i = frames - preRollFrames; i < frames; i++) {
      if (i < 0) continue
      const start = i * hopLength
      const frame = new Float32Array(frameLength)
      
      // Apply window
      for (let j = 0; j < frameLength && start + j < audioData.length; j++) {
        const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)))
        frame[j] = audioData[start + j] * windowValue
      }
      
      const spectrum = this.tracker._computeMagnitudeSpectrum(frame)
      prevSpectrums.push(spectrum)
    }
    
    // Use the last spectrum as previous for frame 0
    let prevSpectrum = prevSpectrums.length > 0 ? prevSpectrums[prevSpectrums.length - 1] : null
    
    // Compute onset strength for all frames
    for (let i = 0; i < frames; i++) {
      const start = i * hopLength
      const frame = new Float32Array(frameLength)
      
      // Apply window
      for (let j = 0; j < frameLength && start + j < audioData.length; j++) {
        const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)))
        frame[j] = audioData[start + j] * windowValue
      }
      
      // Compute magnitude spectrum
      const spectrum = this.tracker._computeMagnitudeSpectrum(frame)
      
      if (prevSpectrum) {
        // Spectral flux
        let flux = 0
        for (let k = 0; k < Math.min(spectrum.length, prevSpectrum.length); k++) {
          flux += Math.max(0, spectrum[k] - prevSpectrum[k])
        }
        onset[i] = flux
        
        if (i === 0) {
          console.log(`🔄 Frame 0 flux: ${flux.toFixed(3)} (using end-of-track spectrum as previous)`)
        }
      } else {
        onset[i] = 0
      }
      
      prevSpectrum = spectrum
    }
    
    return onset
  }
  
  /**
   * Analyze frequency content of a frame
   * @private
   */
  _analyzeFrequencyContent(frame) {
    // Simple FFT to analyze frequency content
    const fft = this.tracker._fft(frame)
    
    // Calculate energy in different frequency bands
    const binCount = fft.length
    const lowBandEnd = Math.floor(binCount * 0.1)  // ~200Hz for 48kHz
    const midBandEnd = Math.floor(binCount * 0.3)  // ~600Hz
    
    let lowEnergy = 0
    let midEnergy = 0
    let highEnergy = 0
    
    for (let i = 0; i < binCount; i++) {
      const magnitude = Math.sqrt(fft[i].real * fft[i].real + fft[i].imag * fft[i].imag)
      
      if (i < lowBandEnd) {
        lowEnergy += magnitude
      } else if (i < midBandEnd) {
        midEnergy += magnitude
      } else {
        highEnergy += magnitude
      }
    }
    
    const totalEnergy = lowEnergy + midEnergy + highEnergy
    
    return {
      lowFreqRatio: totalEnergy > 0 ? lowEnergy / totalEnergy : 0,
      midFreqRatio: totalEnergy > 0 ? midEnergy / totalEnergy : 0,
      highFreqRatio: totalEnergy > 0 ? highEnergy / totalEnergy : 0
    }
  }
  
  /**
   * Generate combined click track for kicks and hits with different pitches
   * @param {Object} drumHits - Object with kicks and hits arrays
   * @param {number} duration - Total duration
   * @param {number} kickFreq - Kick click frequency in Hz
   * @param {number} hitFreq - Hit click frequency in Hz
   * @param {number} offset - Beat offset in seconds
   * @returns {AudioBuffer} Combined click track buffer
   */
  generateDrumClickTrack(drumHits, duration, kickFreq = 200, hitFreq = 1000, offset = 0) {
    if (!this.audioContext) return null
    
    const { kicks = [], hits = [] } = drumHits
    
    console.log(`🔊 Generating drum click track: ${kicks.length} kicks (${kickFreq}Hz), ${hits.length} hits (${hitFreq}Hz)`)
    
    const sampleRate = this.audioContext.sampleRate
    const samples = Math.floor(duration * sampleRate)
    const clickBuffer = this.adapter.createBuffer(1, samples, sampleRate)
    const channelData = clickBuffer.getChannelData(0)
    
    // Generate kicks (low frequency, longer duration)
    kicks.forEach((kickTime, index) => {
      const adjustedTime = kickTime + offset
      const startSample = Math.floor(adjustedTime * sampleRate)
      
      if (startSample < 0 || startSample >= samples) return
      
      if (index < 3) {
        console.log(`  🦵 Adding kick ${index} at ${adjustedTime.toFixed(3)}s`)
      }
      
      const clickDuration = 0.15
      const clickSamples = Math.floor(clickDuration * sampleRate)
      
      for (let i = 0; i < clickSamples && startSample + i < samples; i++) {
        const t = i / sampleRate
        const envelope = Math.exp(-20 * t)
        const signal = Math.sin(2 * Math.PI * kickFreq * t)
        channelData[startSample + i] += envelope * signal * 0.9
      }
    })
    
    // Generate hits (higher frequency, shorter duration)
    hits.forEach((hitTime, index) => {
      const adjustedTime = hitTime + offset
      const startSample = Math.floor(adjustedTime * sampleRate)
      
      if (startSample < 0 || startSample >= samples) return
      
      if (index < 3) {
        console.log(`  🥁 Adding hit ${index} at ${adjustedTime.toFixed(3)}s`)
      }
      
      const clickDuration = 0.08
      const clickSamples = Math.floor(clickDuration * sampleRate)
      
      for (let i = 0; i < clickSamples && startSample + i < samples; i++) {
        const t = i / sampleRate
        const envelope = Math.exp(-40 * t)
        const signal = Math.sin(2 * Math.PI * hitFreq * t)
        channelData[startSample + i] += envelope * signal * 0.7
      }
    })
    
    console.log(`✅ Generated combined drum click track`)
    
    return clickBuffer
  }
  
  /**
   * Generate click track from beat times
   * @param {Array} beats - Beat times in seconds
   * @param {number} duration - Total duration
   * @param {number} clickFreq - Click frequency in Hz
   * @param {number} offset - Beat offset in seconds
   * @returns {AudioBuffer} Click track buffer
   */
  generateClickTrack(beats, duration, clickFreq = 660, offset = 0) {
    if (!this.audioContext) return null

    console.log(`🔊 Generating click track: ${beats.length} beats, ${duration.toFixed(2)}s duration, ${clickFreq}Hz`)
    
    const sampleRate = this.audioContext.sampleRate
    const samples = Math.floor(duration * sampleRate)
    const clickBuffer = this.adapter.createBuffer(1, samples, sampleRate)
    const channelData = clickBuffer.getChannelData(0)

    if (!beats || beats.length === 0) {
      console.warn('⚠️ No beats provided for click track generation')
      return clickBuffer
    }

    let clicksAdded = 0
    beats.forEach((beatTime, index) => {
      const adjustedBeatTime = beatTime + offset
      const startSample = Math.floor(adjustedBeatTime * sampleRate)
      
      if (startSample < 0 || startSample >= samples) {
        console.log(`  Skipping beat ${index} at ${adjustedBeatTime.toFixed(3)}s (outside buffer)`)
        return
      }
      
      if (index < 5 || index === beats.length - 1) {
        console.log(`  Adding click ${index} at ${adjustedBeatTime.toFixed(3)}s (sample ${startSample})`)
      }
      
      const clickDuration = 0.25
      const clickSamples = Math.floor(clickDuration * sampleRate)

      let maxAmp = 0
      
      for (let i = 0; i < clickSamples && startSample + i < samples; i++) {
        const t = i / sampleRate
        const envelope = Math.exp(-35 * t)
        const signal = Math.sin(2 * Math.PI * clickFreq * t)
        const amplitude = envelope * signal * 0.8
        channelData[startSample + i] += amplitude
        
        maxAmp = Math.max(maxAmp, Math.abs(amplitude))
      }
      
      if (index < 5) {
        console.log(`    Click ${index} max amplitude: ${maxAmp.toFixed(3)}`)
      }
      
      clicksAdded++
    })
    
    console.log(`✅ Added ${clicksAdded} clicks to buffer`)

    return clickBuffer
  }

  /**
   * Play audio with beat clicks
   * @param {AudioBuffer} audioBuffer - Original audio
   * @param {Array} beats - Beat times
   * @param {Object} options - Playback options
   */
  playWithBeats(audioBuffer, beats, options = {}) {
    if (!this.audioContext) return

    const { clickFreq = 660, offset = 0 } = options

    // Play original audio
    const audioSource = this.adapter.createBufferSource()
    audioSource.buffer = audioBuffer
    audioSource.connect(this.adapter.getDestination())

    // Generate and play click track
    const clickBuffer = this.generateClickTrack(beats, audioBuffer.duration, clickFreq, offset)
    if (clickBuffer) {
      const clickSource = this.adapter.createBufferSource()
      clickSource.buffer = clickBuffer
      clickSource.connect(this.adapter.getDestination())

      const startTime = this.adapter.getCurrentTime()
      audioSource.start(startTime)
      clickSource.start(startTime)
      
      return { audioSource, clickSource }
    } else {
      audioSource.start()
      return { audioSource, clickSource: null }
    }
  }

  /**
   * Play drum click track
   * @param {AudioBuffer} audioBuffer - Original audio
   * @param {Object} drumHits - Drum hit times
   * @param {Object} options - Playback options
   */
  playWithDrumClicks(audioBuffer, drumHits, options = {}) {
    if (!this.audioContext) return

    const { kickFreq = 200, hitFreq = 1000, offset = 0 } = options

    // Play original audio
    const audioSource = this.adapter.createBufferSource()
    audioSource.buffer = audioBuffer
    audioSource.connect(this.adapter.getDestination())

    // Generate and play drum click track
    const clickBuffer = this.generateDrumClickTrack(drumHits, audioBuffer.duration, kickFreq, hitFreq, offset)
    if (clickBuffer) {
      const clickSource = this.adapter.createBufferSource()
      clickSource.buffer = clickBuffer
      clickSource.connect(this.adapter.getDestination())

      const startTime = this.adapter.getCurrentTime()
      audioSource.start(startTime)
      clickSource.start(startTime)
      
      return { audioSource, clickSource }
    } else {
      audioSource.start()
      return { audioSource, clickSource: null }
    }
  }

  /**
   * Resume audio context if suspended
   */
  async resume() {
    await this.adapter.resume()
  }

  /**
   * Close audio context
   */
  async close() {
    await this.adapter.close()
  }
}