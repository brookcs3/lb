/**
 * Advanced Beat Tracking Module for JavaScript
 * Implements dynamic programming beat tracking and predominant local pulse detection
 * Based on librosa's beat tracking algorithms with tempo change support
 */

/**
 * Professional Beat Tracker Class
 * Handles both static and dynamic tempo scenarios with high accuracy
 */
export class BeatTracker {
  constructor() {
    this.audioContext = null
    try {
      this.audioContext = new (window.AudioContext ||
          window.webkitAudioContext)()
    } catch (e) {
      console.warn('Web Audio API not available')
    }
  }

  /**
   * Main beat tracking function with dynamic programming
   * @param {{y, sr: number}} options - Beat tracking parameters
   * @param {Float32Array} options.y - Audio time series
   * @param {number} options.sr - Sample rate (default: 22050)
   * @param {Float32Array} options.onsetEnvelope - Pre-computed onset envelope
   * @param {number} options.hopLength - Hop length in samples (default: 512)
   * @param {number} options.startBpm - Initial tempo guess (default: 120)
   * @param {number} options.tightness - Beat distribution tightness (default: 100)
   * @param {boolean} options.trim - Trim weak onset beats (default: true)
   * @param {number|Float32Array} options.bpm - Optional tempo override
   * @param {string} options.units - Output units ('frames', 'samples', 'time')
   * @param {boolean} options.sparse - Return sparse or dense array (default: true)
   * @returns {Object} {tempo: number|Float32Array, beats: Array|Float32Array}
   */
  beatTrack(options = {}) {
    const {
      y = null,
      sr = 22050,
      onsetEnvelope = null,
      hopLength = 512,
      startBpm = 120.0,
      tightness = 100,
      trim = true,
      bpm = null,
      units = 'time',
      sparse = true,
    } = options

    // Get onset envelope if not provided
    let onset = onsetEnvelope
    if (!onset) {
      if (!y) {
        throw new Error('Either y or onsetEnvelope must be provided')
      }
      onset = this.onsetStrength(y, sr, hopLength)
    }

    // Check for any onsets
    if (!this.hasAnyValue(onset)) {
      console.warn('No onsets detected in audio')
      if (sparse) {
        return { tempo: 0.0, beats: [] }
      } else {
        return {
          tempo: 0.0,
          beats: new Float32Array(onset.length).fill(0),
        }
      }
    }

    // Estimate BPM if not provided
    let tempo = bpm
    if (tempo === null) {
      tempo = this.tempoEstimation(onset, sr, hopLength, startBpm)
    }

    // Ensure tempo is array-like for vectorization
    const tempoArray = typeof tempo === 'number' ? [tempo] : tempo

    // Run the beat tracker
    const beatsBoolean = this.beatTracker(
        onset,
        tempoArray,
        sr / hopLength,
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
        beats = beats.map((b) => (b * hopLength) / sr)
      }
    } else {
      beats = beatsBoolean
    }

    console.log(
        `🥁 Beat tracking: ${tempo.toFixed ? tempo.toFixed(1) : 'dynamic'} BPM, ${beats.length} beats`,
    )

    return { tempo, beats }
  }

  /**
   * Dynamic tempo estimation with sliding window
   * @param {Float32Array} y - Audio signal
   * @param {number} sr - Sample rate
   * @param {number} windowSize - Analysis window size in seconds
   * @param {number} hopSize - Hop size in seconds
   * @returns {Object} {times: Array, tempo: Array}
   */
  estimateDynamicTempo(y, sr = 22050, windowSize = 8.0, hopSize = 1.0) {
    const windowSamples = Math.floor(windowSize * sr)
    const hopSamples = Math.floor(hopSize * sr)
    const dynamicTempo = []
    const times = []

    for (let start = 0; start < y.length - windowSamples; start += hopSamples) {
      const window = y.slice(start, start + windowSamples)
      const onset = this.onsetStrength(window, sr)
      const tempo = this.tempoEstimation(onset, sr)

      dynamicTempo.push(tempo)
      times.push(start / sr)
    }

    return { times, tempo: dynamicTempo }
  }

  /**
   * Predominant Local Pulse (PLP) estimation
   * @param {Object} options - PLP parameters
   * @returns {Float32Array} Pulse curve indicating beat strength over time
   */
  plp(options = {}) {
    const {
      y = null,
      sr = 22050,
      onsetEnvelope = null,
      hopLength = 512,
      winLength = 384,
      tempoMin = 30,
      tempoMax = 300,
      prior = null,
    } = options

    // Get onset envelope
    let onset = onsetEnvelope
    if (!onset) {
      if (!y) {
        throw new Error('Either y or onsetEnvelope must be provided')
      }
      onset = this.onsetStrength(y, sr, hopLength)
    }

    // Validate tempo range
    if (tempoMin !== null && tempoMax !== null && tempoMax <= tempoMin) {
      throw new Error(
          `tempoMax=${tempoMax} must be larger than tempoMin=${tempoMin}`,
      )
    }

    // Compute Fourier tempogram
    const ftgram = this.fourierTempogram(onset, sr, hopLength, winLength)

    // Get tempo frequencies
    const tempoFrequencies = this.fourierTempoFrequencies(
        sr,
        hopLength,
        winLength,
    )

    // Apply tempo constraints
    for (let i = 0; i < ftgram.length; i++) {
      for (let j = 0; j < ftgram[i].length; j++) {
        const freq = tempoFrequencies[j]
        if (
            (tempoMin !== null && freq < tempoMin) ||
            (tempoMax !== null && freq > tempoMax)
        ) {
          ftgram[i][j] = { real: 0, imag: 0 }
        }
      }
    }

    // Find peak values and normalize
    const ftmag = ftgram.map((frame) =>
        frame.map((bin) =>
            Math.log1p(1e6 * Math.sqrt(bin.real * bin.real + bin.imag * bin.imag)),
        ),
    )

    // Apply prior if provided
    if (prior) {
      for (let i = 0; i < ftmag.length; i++) {
        for (let j = 0; j < ftmag[i].length; j++) {
          ftmag[i][j] += prior(tempoFrequencies[j])
        }
      }
    }

    // Keep only values at peak
    for (let i = 0; i < ftgram.length; i++) {
      const peakValue = Math.max(...ftmag[i])
      for (let j = 0; j < ftgram[i].length; j++) {
        if (ftmag[i][j] < peakValue) {
          ftgram[i][j] = { real: 0, imag: 0 }
        }
      }
    }

    // Normalize to keep phase information
    for (let i = 0; i < ftgram.length; i++) {
      const maxMag = Math.max(
          ...ftgram[i].map((bin) =>
              Math.sqrt(bin.real * bin.real + bin.imag * bin.imag),
          ),
      )
      for (let j = 0; j < ftgram[i].length; j++) {
        // Calculate magnitude but don't need to store it
        Math.sqrt(
            ftgram[i][j].real * ftgram[i][j].real +
            ftgram[i][j].imag * ftgram[i][j].imag,
        )
        const normFactor = Math.sqrt(1e-10 + maxMag)
        if (normFactor > 0) {
          ftgram[i][j].real /= normFactor
          ftgram[i][j].imag /= normFactor
        }
      }
    }

    // Invert Fourier tempogram
    const pulse = this.istft(ftgram, 1, winLength, onset.length)

    // Keep only positive values
    for (let i = 0; i < pulse.length; i++) {
      pulse[i] = Math.max(0, pulse[i])
    }

    // Normalize
    return this.normalize(pulse)
  }

  /**
   * Improved onset strength computation
   * @param {Float32Array} y - Audio signal
   * @param {number} sr - Sample rate
   * @param {number} hopLength - Hop length
   * @returns {Float32Array} Onset strength envelope
   */
  onsetStrength(y, sr = 22050, hopLength = 512) {
    const frameLength = 2048
    const frames = Math.floor((y.length - frameLength) / hopLength) + 1
    const onset = new Float32Array(frames)

    // Use spectral flux for better onset detection
    let prevSpectrum = null

    for (let i = 0; i < frames; i++) {
      const start = i * hopLength
      // end variable is calculated but not used - keeping for clarity
      const end = Math.min(start + frameLength, y.length)

      // Get frame and apply window
      const frame = new Float32Array(frameLength)
      for (let j = 0; j < frameLength && start + j < y.length; j++) {
        const windowValue =
            0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)))
        frame[j] = y[start + j] * windowValue
      }

      // Compute magnitude spectrum
      const spectrum = this.computeMagnitudeSpectrum(frame)

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
   * Enhanced tempo estimation using autocorrelation and peak analysis
   * @param {Float32Array} onsetEnvelope - Onset strength
   * @param {number} sr - Sample rate
   * @param {number} hopLength - Hop length
   * @param {number} startBpm - Initial guess
   * @returns {number} Estimated tempo in BPM
   */
  tempoEstimation(onsetEnvelope, sr = 22050, hopLength = 512, startBpm = 120) {
    const minBpm = 30
    const maxBpm = 300

    // Convert BPM range to lag range
    const minLag = Math.floor((60 * sr) / (maxBpm * hopLength))
    const maxLag = Math.ceil((60 * sr) / (minBpm * hopLength))

    // Compute autocorrelation with better windowing
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
    const peaks = this.findPeaksWithProminence(autocorr)

    if (peaks.length === 0) {
      return startBpm // Fallback to initial guess
    }

    // Convert best peak to BPM
    const bestPeak = peaks[0]
    const bestLag = minLag + bestPeak.index
    const estimatedBpm = (60 * sr) / (bestLag * hopLength)

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
   * Fourier tempogram computation for advanced tempo analysis
   * @private
   */
  fourierTempogram(onset, sr, hopLength, winLength) {
    const hopFrames = Math.floor(winLength / 4)
    const frames = Math.floor((onset.length - winLength) / hopFrames) + 1
    const tempogram = []

    // Window function (Hann)
    const window = new Float32Array(winLength)
    for (let i = 0; i < winLength; i++) {
      window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winLength - 1))
    }

    // Compute tempogram frames
    for (let i = 0; i < frames; i++) {
      const start = i * hopFrames
      const frame = new Float32Array(winLength)

      // Apply window
      for (let j = 0; j < winLength && start + j < onset.length; j++) {
        frame[j] = onset[start + j] * window[j]
      }

      // FFT
      const fftFrame = this.fft(frame)
      tempogram.push(fftFrame)
    }

    return tempogram
  }

  /**
   * Core beat tracking algorithm using dynamic programming
   * @private
   */
  beatTracker(onsetEnvelope, bpm, frameRate, tightness, trim) {
    if (bpm.some((b) => b <= 0)) {
      throw new Error('BPM must be strictly positive')
    }

    if (tightness <= 0) {
      throw new Error('Tightness must be strictly positive')
    }

    // Convert BPM to frames per beat
    const framesPerBeat = bpm.map((b) => Math.round((frameRate * 60.0) / b))

    // Normalize onsets
    const normalizedOnsets = this.normalizeOnsets(onsetEnvelope)

    // Compute local score
    const localScore = this.beatLocalScore(normalizedOnsets, framesPerBeat)

    // Run dynamic programming
    const { backlink, cumScore } = this.beatTrackDP(
        localScore,
        framesPerBeat,
        tightness,
    )

    // Reconstruct beat path
    const beats = new Array(onsetEnvelope.length).fill(false)
    const tail = this.lastBeat(cumScore)
    this.dpBacktrack(backlink, tail, beats)

    // Trim beats if requested
    if (trim) {
      return this.trimBeats(localScore, beats)
    }

    return beats
  }

  /**
   * Normalize onset envelope by standard deviation
   * @private
   */
  normalizeOnsets(onsets) {
    const mean = onsets.reduce((a, b) => a + b, 0) / onsets.length
    const variance =
        onsets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        (onsets.length - 1)
    const std = Math.sqrt(variance)

    return onsets.map((o) => o / (std + 1e-10))
  }

  /**
   * Compute local score for beat tracking using Gaussian kernel
   * @private
   */
  beatLocalScore(onsetEnvelope, framesPerBeat) {
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

  /**
   * Dynamic programming for optimal beat sequence
   * @private
   */
  beatTrackDP(localScore, framesPerBeat, tightness) {
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

  /**
   * Find optimal ending beat position
   * @private
   */
  lastBeat(cumScore) {
    const localMax = this.localMax(cumScore)
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

  /**
   * Backtrack through DP solution to find beat sequence
   * @private
   */
  dpBacktrack(backlinks, tail, beats) {
    let n = tail
    while (n >= 0) {
      beats[n] = true
      n = backlinks[n]
    }
  }

  /**
   * Remove spurious beats at beginning and end
   * @private
   */
  trimBeats(localScore, beats) {
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
        break // Stop at first strong beat
      }
    }

    // Suppress weak beats at end
    for (let i = beats.length - 1; i >= 0; i--) {
      if (beats[i] && localScore[i] <= threshold) {
        trimmed[i] = false
      } else if (beats[i]) {
        break // Stop at last strong beat
      }
    }

    return trimmed
  }

  /**
   * Utility methods
   */
  computeMagnitudeSpectrum(frame) {
    const fft = this.fft(frame)
    return fft.map((bin) =>
        Math.sqrt(bin.real * bin.real + bin.imag * bin.imag),
    )
  }

  findPeaksWithProminence(signal, minProminence = 0.1) {
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

  localMax(x) {
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

  fft(signal) {
    // Simplified FFT - replace with proper library like FFTJS for production
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

  istft(stft, hopLength, nFft, length) {
    const result = new Float32Array(length)
    const window = new Float32Array(nFft)

    // Hann window
    for (let i = 0; i < nFft; i++) {
      window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (nFft - 1))
    }

    // Overlap-add synthesis
    for (let i = 0; i < stft.length; i++) {
      const frame = this.ifft(stft[i])
      const start = i * hopLength

      for (let j = 0; j < frame.length && start + j < length; j++) {
        result[start + j] += frame[j] * window[j % nFft]
      }
    }

    return result
  }

  ifft(spectrum) {
    const N = spectrum.length
    const result = new Float32Array(N)

    for (let n = 0; n < N; n++) {
      let value = 0
      for (let k = 0; k < N; k++) {
        const angle = (2 * Math.PI * k * n) / N
        value +=
            spectrum[k].real * Math.cos(angle) -
            spectrum[k].imag * Math.sin(angle)
      }
      result[n] = value / N
    }

    return result
  }

  fourierTempoFrequencies(sr, hopLength, winLength) {
    const n = Math.floor(winLength / 2) + 1
    const frequencies = new Float32Array(n)

    for (let i = 0; i < n; i++) {
      const freq = (i * sr) / winLength
      frequencies[i] = (freq * 60.0) / hopLength // Convert to BPM
    }

    return frequencies
  }

  normalize(x) {
    const max = Math.max(...x)
    const min = Math.min(...x)
    const range = max - min

    if (range === 0) return x

    return x.map((v) => (v - min) / range)
  }

  hasAnyValue(arr) {
    return arr.some((v) => v !== 0)
  }
}

/**
 * Simplified beat tracker for quick analysis
 * @param {Float32Array} audioData - Audio signal
 * @param {number} sampleRate - Sample rate
 * @returns {Object} {bpm: number, beats: Array}
 */
export function quickBeatTrack(audioData, sampleRate = 44100) {
  const tracker = new BeatTracker()

  try {
    const result = tracker.beatTrack({
      y: audioData,
      sr: sampleRate,
      units: 'time',
      sparse: true,
    })

    return {
      bpm: result.tempo,
      beats: result.beats,
      confidence: result.beats.length > 0 ? 0.8 : 0.2,
    }
  } catch (error) {
    console.error('Beat tracking failed:', error)
    return { bpm: 120, beats: [], confidence: 0 }
  }
}
/**
 * Web Audio API integration helpers
 */
export class BeatTrackingUI {
  constructor() {
    this.tracker = new BeatTracker()
    this.audioContext = this.tracker.audioContext
  }

  /**
   * Generate click track from beat times
   * @param {Array} beats - Beat times in seconds
   * @param {number} duration - Total duration
   * @param {number} clickFreq - Click frequency in Hz
   * @returns {AudioBuffer} Click track buffer
   */
  generateClickTrack(beats, duration, clickFreq = 880) {
    if (!this.audioContext) return null

    const sampleRate = this.audioContext.sampleRate
    const samples = Math.floor(duration * sampleRate)
    const clickBuffer = this.audioContext.createBuffer(1, samples, sampleRate)
    const channelData = clickBuffer.getChannelData(0)

    beats.forEach((beatTime) => {
      const startSample = Math.floor(beatTime * sampleRate)
      const clickDuration = 0.1 // 100ms click
      const clickSamples = Math.floor(clickDuration * sampleRate)

      for (let i = 0; i < clickSamples && startSample + i < samples; i++) {
        const t = i / sampleRate
        const envelope = Math.exp(-t * 20) // Decay envelope
        channelData[startSample + i] =
            0.3 * envelope * Math.sin(2 * Math.PI * clickFreq * t)
      }
    })

    return clickBuffer
  }

  /**
   * Play audio with beat clicks
   * @param {AudioBuffer} audioBuffer - Original audio
   * @param {Array} beats - Beat times
   */
  playWithBeats(audioBuffer, beats) {
    if (!this.audioContext) return

    // Play original audio
    const audioSource = this.audioContext.createBufferSource()
    audioSource.buffer = audioBuffer
    audioSource.connect(this.audioContext.destination)

    // Generate and play click track
    const clickBuffer = this.generateClickTrack(beats, audioBuffer.duration)
    if (clickBuffer) {
      const clickSource = this.audioContext.createBufferSource()
      clickSource.buffer = clickBuffer
      clickSource.connect(this.audioContext.destination)

      const startTime = this.audioContext.currentTime
      audioSource.start(startTime)
      clickSource.start(startTime)
    } else {
      audioSource.start()
    }
  }
}

/**
 * Alias matching librosa.beat.beatTrack() – convenience wrapper.
 * Usage:
 *   import { beatTrack } from './librosa-beat-tracker.js';
 *   const { tempo, beats } = beatTrack(y, 44100, { hopLength: 512 });
 *
 * It internally instantiates a BeatTracker and forwards the call.
 */

export function beatTrack(y, sr = 22050, opts = {}) {
  const tracker = new BeatTracker()
  return tracker.beatTrack({ y, sr, ...opts })
}

/**
 * Alias matching librosa.beat.tempo().
 * Computes a single global tempo estimate from an onset envelope.
 */

export function tempo(
    onsetEnvelope,
    sr = 22050,
    hopLength = 512,
    startBpm = 120,
) {
  const tracker = new BeatTracker()
  return tracker.tempoEstimation(onsetEnvelope, sr, hopLength, startBpm)
}