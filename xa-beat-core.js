/**
 * Core Beat Tracking Module - Platform Agnostic
 * Pure JavaScript implementation without browser dependencies
 */

export class BeatTrackerCore {
  constructor(options = {}) {
    this.defaultSampleRate = options.defaultSampleRate || 44100
    this.logger = options.logger || createDefaultLogger()
  }

  /**
   * Main beat tracking function with dynamic programming
   * @param {Object} options - Beat tracking parameters
   * @param {Float32Array} options.y - Audio time series
   * @param {number} options.sr - Sample rate
   * @param {Float32Array} options.onsetEnvelope - Pre-computed onset envelope
   * @param {number} options.hopLength - Hop length in samples (default: 512)
   * @param {number} options.startBpm - Initial tempo guess (default: 120)
   * @param {number} options.tightness - Beat distribution tightness (default: 100)
   * @param {boolean} options.trim - Trim weak onset beats (default: true)
   * @param {number|Float32Array} options.bpm - Optional tempo override
   * @param {string} options.units - Output units ('frames', 'samples', 'time')
   * @param {boolean} options.sparse - Return sparse or dense array (default: true)
   * @param {boolean} options.quickDetect - Use quick 2-bar detection (default: false)
   * @returns {Object} {tempo: number|Float32Array, beats: Array|Float32Array}
   */
  beatTrack(options = {}) {
    const {
      y = null,
      sr = this.defaultSampleRate,
      onsetEnvelope = null,
      hopLength = 512,
      startBpm = 120.0,
      tightness = 100,
      trim = true,
      bpm = null,
      units = 'time',
      sparse = true,
      quickDetect = false,
    } = options

    const sampleRate = sr
    this.logger.debug(`Sample rate: ${sampleRate} Hz`)

    // Get onset envelope if not provided
    let onset = onsetEnvelope
    if (!onset) {
      if (!y) {
        throw new Error('Either y or onsetEnvelope must be provided')
      }
      onset = this.onsetStrength(y, sampleRate, hopLength)
    }

    // Check for any onsets
    if (!this._hasAnyValue(onset)) {
      this.logger.warn('No onsets detected in audio')
      if (sparse) {
        return { tempo: 0.0, beats: [] }
      } else {
        return {
          tempo: 0.0,
          beats: new Float32Array(onset.length).fill(0),
        }
      }
    }

    // Quick detection mode: analyze just 2 bars from rhythm start
    if (quickDetect && !bpm) {
      const rhythmStart = this._findRhythmStart(onset, hopLength, sampleRate)
      this.logger.info(`Rhythm starts at ${rhythmStart.startTime.toFixed(2)}s`)
      
      // Estimate tempo from a short section first
      const previewFrames = Math.min(onset.length, rhythmStart.startFrame + 256)
      const previewOnset = onset.slice(rhythmStart.startFrame, previewFrames)
      const estimatedTempo = this.tempoEstimation(previewOnset, sampleRate, hopLength, startBpm)
      
      // Calculate 2 bars duration
      const beatsPerBar = 4
      const barsToAnalyze = 2
      const beatsToAnalyze = beatsPerBar * barsToAnalyze
      const beatDuration = 60.0 / estimatedTempo
      const analysisDuration = beatDuration * beatsToAnalyze
      const analysisFrames = Math.ceil((analysisDuration * sampleRate) / hopLength)
      
      // Extract 2-bar section for analysis
      const endFrame = Math.min(onset.length, rhythmStart.startFrame + analysisFrames)
      onset = onset.slice(rhythmStart.startFrame, endFrame)
      
      this.logger.info(`Quick detect: analyzing ${analysisDuration.toFixed(1)}s (${beatsToAnalyze} beats at ${estimatedTempo.toFixed(1)} BPM)`)
    }

    // Estimate BPM if not provided
    let tempo = bpm
    if (tempo === null) {
      tempo = this.tempoEstimation(onset, sampleRate, hopLength, startBpm)
    }

    // Ensure tempo is array-like for vectorization
    const tempoArray = typeof tempo === 'number' ? [tempo] : tempo

    // Run the beat tracker
    const beatsBoolean = this._beatTracker(
        onset,
        tempoArray,
        sampleRate / hopLength,
        tightness,
        trim,
    )

    // Convert boolean array to desired format
    let beats
    if (sparse) {
      beats = []
      for (let i = 0; i < beatsBoolean.length; i++) {
        if (beatsBoolean[i]) beats.push(i)
      }

      // Convert units if needed
      if (units === 'samples') {
        beats = beats.map((b) => Math.round(b * hopLength))
      } else if (units === 'time') {
        beats = beats.map((b) => (b * hopLength) / sampleRate)
      }
    } else {
      beats = beatsBoolean
    }

    this.logger.info(
        `Beat tracking: ${tempo.toFixed ? tempo.toFixed(1) : 'dynamic'} BPM, ${beats.length} beats`,
    )

    return { tempo, beats }
  }

  /**
   * Find the start of rhythmic content in audio
   * @param {Float32Array} onsetEnvelope - Onset strength envelope
   * @param {number} hopLength - Hop length in samples
   * @param {number} sr - Sample rate
   * @returns {Object} {startFrame: number, startTime: number}
   */
  _findRhythmStart(onsetEnvelope, hopLength, sr) {
    const windowSize = 20
    const threshold = 0.1
    
    const maxOnset = Math.max(...onsetEnvelope)
    const onsetThreshold = maxOnset * threshold
    
    for (let i = windowSize; i < onsetEnvelope.length - windowSize; i++) {
      let sum = 0
      for (let j = 0; j < windowSize; j++) {
        sum += onsetEnvelope[i - j]
      }
      const avg = sum / windowSize
      
      if (avg > onsetThreshold) {
        let regularityScore = 0
        for (let k = 0; k < windowSize / 2; k++) {
          if (onsetEnvelope[i + k] > onsetThreshold * 0.5) {
            regularityScore++
          }
        }
        
        if (regularityScore > windowSize / 4) {
          return {
            startFrame: Math.max(0, i - windowSize),
            startTime: (Math.max(0, i - windowSize) * hopLength) / sr
          }
        }
      }
    }
    
    return { startFrame: 0, startTime: 0 }
  }

  /**
   * Enhanced tempo estimation using autocorrelation and peak analysis
   * @param {Float32Array} onsetEnvelope - Onset strength
   * @param {number} sr - Sample rate
   * @param {number} hopLength - Hop length
   * @param {number} startBpm - Initial guess
   * @returns {number} Estimated tempo in BPM
   */
  tempoEstimation(onsetEnvelope, sr = null, hopLength = 512, startBpm = 120) {
    const sampleRate = sr || this.defaultSampleRate
    const minBpm = 30
    const maxBpm = 300

    // Convert BPM range to lag range
    const minLag = Math.floor((60 * sampleRate) / (maxBpm * hopLength))
    const maxLag = Math.ceil((60 * sampleRate) / (minBpm * hopLength))

    // Compute autocorrelation
    const autocorr = new Float32Array(maxLag - minLag + 1)

    for (let lagIdx = 0; lagIdx < autocorr.length; lagIdx++) {
      const lag = minLag + lagIdx
      let corr = 0
      let norm = 0

      for (let i = 0; i < onsetEnvelope.length - lag; i++) {
        corr += onsetEnvelope[i] * onsetEnvelope[i + lag]
        norm += onsetEnvelope[i] * onsetEnvelope[i]
      }

      autocorr[lagIdx] = norm > 0 ? corr / norm : 0
    }

    // Find peaks with prominence
    const peaks = this._findPeaksWithProminence(autocorr)

    if (peaks.length === 0) {
      return startBpm
    }

    // Convert best peak to BPM
    const bestPeak = peaks[0]
    const bestLag = minLag + bestPeak.index
    const estimatedBpm = (60 * sampleRate) / (bestLag * hopLength)

    // Apply prior bias towards common dance music tempos
    const commonTempos = [120, 128, 140, 174, 100, 85]
    let adjustedBpm = estimatedBpm

    for (const common of commonTempos) {
      if (Math.abs(estimatedBpm - common) < 5) {
        adjustedBpm = common
        break
      }
    }

    return Math.max(minBpm, Math.min(maxBpm, adjustedBpm))
  }

  /**
   * Improved onset strength computation
   * @param {Float32Array} y - Audio signal
   * @param {number} sr - Sample rate
   * @param {number} hopLength - Hop length
   * @returns {Float32Array} Onset strength envelope
   */
  onsetStrength(y, _sr = null, hopLength = 512) {
    const frameLength = 2048
    const frames = Math.floor((y.length - frameLength) / hopLength) + 1
    const onset = new Float32Array(frames)

    // Use spectral flux for better onset detection
    let prevSpectrum = null

    for (let i = 0; i < frames; i++) {
      const start = i * hopLength

      // Get frame and apply window
      const frame = new Float32Array(frameLength)
      for (let j = 0; j < frameLength && start + j < y.length; j++) {
        const windowValue =
            0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)))
        frame[j] = y[start + j] * windowValue
      }

      // Compute magnitude spectrum
      const spectrum = this._computeMagnitudeSpectrum(frame)

      if (prevSpectrum) {
        // Spectral flux: sum of positive differences
        let flux = 0
        for (let k = 0; k < spectrum.length; k++) {
          flux += Math.max(0, spectrum[k] - prevSpectrum[k])
        }
        onset[i] = flux
      } else {
        onset[i] = 0
      }

      prevSpectrum = spectrum
    }

    return onset
  }

  /**
   * Core beat tracking algorithm using dynamic programming
   * @private
   */
  _beatTracker(onsetEnvelope, bpm, frameRate, tightness, trim) {
    if (bpm.some((b) => b <= 0)) {
      throw new Error('BPM must be strictly positive')
    }

    if (tightness <= 0) {
      throw new Error('Tightness must be strictly positive')
    }

    // Convert BPM to frames per beat
    const framesPerBeat = bpm.map((b) => Math.round((frameRate * 60.0) / b))

    // Normalize onsets
    const normalizedOnsets = this._normalizeOnsets(onsetEnvelope)

    // Compute local score
    const localScore = this._beatLocalScore(normalizedOnsets, framesPerBeat)

    // Run dynamic programming
    const { backlink, cumScore } = this._beatTrackDP(
        localScore,
        framesPerBeat,
        tightness,
    )

    // Reconstruct beat path
    const beats = new Array(onsetEnvelope.length).fill(false)
    const tail = this._lastBeat(cumScore)
    this._dpBacktrack(backlink, tail, beats)

    // Trim beats if requested
    if (trim) {
      return this._trimBeats(localScore, beats)
    }

    return beats
  }

  /**
   * Utility methods
   */
  _computeMagnitudeSpectrum(frame) {
    const fft = this._fft(frame)
    return fft.map((bin) =>
        Math.sqrt(bin.real * bin.real + bin.imag * bin.imag),
    )
  }

  _findPeaksWithProminence(signal, minProminence = 0.1) {
    const peaks = []
    const maxVal = Math.max(...signal)

    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
        const prominence = signal[i] - Math.min(signal[i - 1], signal[i + 1])
        if (prominence >= minProminence * maxVal) {
          peaks.push({ index: i, value: signal[i], prominence })
        }
      }
    }

    return peaks.sort((a, b) => b.prominence - a.prominence)
  }

  _normalizeOnsets(onsets) {
    const mean = onsets.reduce((a, b) => a + b, 0) / onsets.length
    const variance =
        onsets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        (onsets.length - 1)
    const std = Math.sqrt(variance)

    return onsets.map((o) => o / (std + 1e-10))
  }

  _beatLocalScore(onsetEnvelope, framesPerBeat) {
    const N = onsetEnvelope.length
    const localScore = new Float32Array(N)

    if (framesPerBeat.length === 1) {
      // Static tempo
      const fpb = framesPerBeat[0]
      const windowSize = Math.round(fpb)

      // Gaussian window for beat expectation
      const window = []
      for (let i = -windowSize; i <= windowSize; i++) {
        window.push(Math.exp(-0.5 * Math.pow((i * 32.0) / fpb, 2)))
      }

      // Convolve with onset envelope
      for (let i = 0; i < N; i++) {
        localScore[i] = 0
        for (let j = 0; j < window.length; j++) {
          const idx = i - windowSize + j
          if (idx >= 0 && idx < N) {
            localScore[i] += window[j] * onsetEnvelope[idx]
          }
        }
      }
    } else {
      // Time-varying tempo
      for (let i = 0; i < N; i++) {
        const fpb = framesPerBeat[Math.min(i, framesPerBeat.length - 1)]
        const windowSize = Math.round(fpb)

        localScore[i] = 0
        for (let j = -windowSize; j <= windowSize; j++) {
          const idx = i + j
          if (idx >= 0 && idx < N) {
            const weight = Math.exp(-0.5 * Math.pow((j * 32.0) / fpb, 2))
            localScore[i] += weight * onsetEnvelope[idx]
          }
        }
      }
    }

    return localScore
  }

  _beatTrackDP(localScore, framesPerBeat, tightness) {
    const N = localScore.length
    const backlink = new Int32Array(N)
    const cumScore = new Float32Array(N)

    // Initialize
    const scoreThresh = 0.01 * Math.max(...localScore)
    backlink[0] = -1
    cumScore[0] = localScore[0]

    let firstBeat = true
    const tv = framesPerBeat.length > 1 ? 1 : 0

    // Forward pass
    for (let i = 1; i < N; i++) {
      let bestScore = -Infinity
      let beatLocation = -1

      const fpb = framesPerBeat[tv * Math.min(i, framesPerBeat.length - 1)]
      const searchStart = Math.max(0, i - Math.round(2.5 * fpb))
      const searchEnd = Math.max(0, i - Math.round(0.5 * fpb))

      for (let loc = searchStart; loc <= searchEnd; loc++) {
        if (loc >= i) break

        const interval = i - loc
        const logInterval = Math.log(Math.max(1, interval))
        const logFpb = Math.log(Math.max(1, fpb))
        const score =
            cumScore[loc] - tightness * Math.pow(logInterval - logFpb, 2)

        if (score > bestScore) {
          bestScore = score
          beatLocation = loc
        }
      }

      if (beatLocation >= 0) {
        cumScore[i] = localScore[i] + bestScore
      } else {
        cumScore[i] = localScore[i]
      }

      if (firstBeat && localScore[i] < scoreThresh) {
        backlink[i] = -1
      } else {
        backlink[i] = beatLocation
        firstBeat = false
      }
    }

    return { backlink, cumScore }
  }

  _lastBeat(cumScore) {
    const localMax = this._localMax(cumScore)
    const validScores = []

    for (let i = 0; i < cumScore.length; i++) {
      if (localMax[i]) {
        validScores.push(cumScore[i])
      }
    }

    if (validScores.length === 0) return cumScore.length - 1

    // Compute median of local maxima
    validScores.sort((a, b) => a - b)
    const median = validScores[Math.floor(validScores.length / 2)]
    const threshold = 0.5 * median

    // Find last beat above threshold
    for (let i = cumScore.length - 1; i >= 0; i--) {
      if (localMax[i] && cumScore[i] >= threshold) {
        return i
      }
    }

    return cumScore.length - 1
  }

  _dpBacktrack(backlinks, tail, beats) {
    let n = tail
    while (n >= 0) {
      beats[n] = true
      n = backlinks[n]
    }
  }

  _trimBeats(localScore, beats) {
    const trimmed = [...beats]

    // Get beat indices
    const beatIndices = []
    for (let i = 0; i < beats.length; i++) {
      if (beats[i]) beatIndices.push(i)
    }

    if (beatIndices.length === 0) return trimmed

    // Compute threshold based on beat strength
    const beatScores = beatIndices.map((i) => localScore[i])
    const rms = Math.sqrt(
        beatScores.reduce((a, b) => a + b * b, 0) / beatScores.length,
    )
    const threshold = 0.5 * rms

    // Suppress weak beats at start
    for (let i = 0; i < beats.length; i++) {
      if (beats[i] && localScore[i] <= threshold) {
        trimmed[i] = false
      } else if (beats[i]) {
        break
      }
    }

    // Suppress weak beats at end
    for (let i = beats.length - 1; i >= 0; i--) {
      if (beats[i] && localScore[i] <= threshold) {
        trimmed[i] = false
      } else if (beats[i]) {
        break
      }
    }

    return trimmed
  }

  _localMax(x) {
    const maxima = new Array(x.length).fill(false)

    for (let i = 1; i < x.length - 1; i++) {
      if (x[i] > x[i - 1] && x[i] > x[i + 1]) {
        maxima[i] = true
      }
    }

    // Handle edges
    if (x.length > 0) {
      if (x.length === 1 || x[0] > x[1]) maxima[0] = true
      if (x.length === 1 || x[x.length - 1] > x[x.length - 2]) {
        maxima[x.length - 1] = true
      }
    }

    return maxima
  }

  _fft(signal) {
    // Simplified FFT - should be replaced with a proper library
    const N = signal.length
    const result = []

    for (let k = 0; k < N; k++) {
      let real = 0
      let imag = 0

      for (let n = 0; n < N; n++) {
        const angle = (-2 * Math.PI * k * n) / N
        real += signal[n] * Math.cos(angle)
        imag += signal[n] * Math.sin(angle)
      }

      result.push({ real, imag })
    }

    return result
  }

  _hasAnyValue(arr) {
    return arr.some((v) => v !== 0)
  }
}

/**
 * Default logger factory
 */
function createDefaultLogger() {
  const noop = () => {}
  
  // Return no-op logger for library use
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop
  }
}

/**
 * Console logger for development
 */
export function createConsoleLogger() {
  return {
    debug: (...args) => console.log('🐛', ...args),
    info: (...args) => console.log('ℹ️', ...args),
    warn: (...args) => console.warn('⚠️', ...args),
    error: (...args) => console.error('❌', ...args)
  }
}

/**
 * Convenience functions matching original API
 */
export function beat_track(y, sr = null, opts = {}) {
  const tracker = new BeatTrackerCore(opts)
  return tracker.beatTrack({ y, sr, ...opts })
}

export function tempo(onsetEnvelope, sr = null, hopLength = 512, startBpm = 120) {
  const tracker = new BeatTrackerCore()
  return tracker.tempoEstimation(onsetEnvelope, sr, hopLength, startBpm)
}

export function quickBeatTrack(audioData, sampleRate = null) {
  const tracker = new BeatTrackerCore()
  return tracker.beatTrack({
    y: audioData,
    sr: sampleRate,
    units: 'time',
    sparse: true,
    quickDetect: true,
  })
}

export function quickBPMDetect(audioData, sampleRate = null) {
  const tracker = new BeatTrackerCore()
  const sr = sampleRate || tracker.defaultSampleRate
  
  const onset = tracker.onsetStrength(audioData, sr, 512)
  const rhythmStart = tracker._findRhythmStart(onset, 512, sr)
  
  const previewFrames = Math.min(onset.length, rhythmStart.startFrame + 256)
  const previewOnset = onset.slice(rhythmStart.startFrame, previewFrames)
  
  return tracker.tempoEstimation(previewOnset, sr, 512, 120)
}