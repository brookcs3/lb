/**
 * XA Beat Tracker - Complete Guide and Examples
 * ==============================================
 * 
 * This library provides advanced beat tracking and tempo detection for JavaScript,
 * based on librosa's algorithms with enhancements for real-time use.
 * 
 * MODULES OVERVIEW:
 * -----------------
 * 1. xa-beat-core.js     - Pure JS beat tracking (no browser dependencies)
 * 2. xa-audio-adapter.js - Web Audio API integration for browsers
 * 3. xa-beat-ui.js       - UI components for visualization and playback
 * 4. xa-beat-browser.js  - Browser-ready tracker combining core + Web Audio
 * 5. xa-beat-tracker.js  - Original all-in-one implementation
 * 
 * QUICK START:
 * ------------
 */

// Browser usage with Web Audio
import { BeatTracker } from './xa-beat-browser.js'

// Pure JS usage (Node.js, Web Workers, etc.)
import { BeatTrackerCore } from './xa-beat-core.js'

// UI components for browser
import { BeatTrackingUI } from './xa-beat-ui.js'

/**
 * EXAMPLE 1: Basic Beat Detection in Browser
 * ------------------------------------------
 */
async function basicBeatDetection() {
  // Create tracker instance
  const tracker = new BeatTracker()
  
  // Load audio file
  const response = await fetch('your-audio.mp3')
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await tracker.audioContext.decodeAudioData(arrayBuffer)
  
  // Get audio data as Float32Array
  const audioData = audioBuffer.getChannelData(0)
  
  // Detect beats
  const result = tracker.beatTrack({
    y: audioData,
    sr: audioBuffer.sampleRate,
    units: 'time'  // Get beat times in seconds
  })
  
  console.log(`Tempo: ${result.tempo} BPM`)
  console.log(`Found ${result.beats.length} beats`)
  console.log('Beat times:', result.beats)
}

/**
 * EXAMPLE 2: Quick 2-Bar Detection
 * ---------------------------------
 * Analyzes just 2 bars from where the rhythm starts - much faster!
 */
async function quickTempoDetection() {
  const tracker = new BeatTracker()
  
  // ... load audioData ...
  
  // Quick detection mode
  const result = tracker.beatTrack({
    y: audioData,
    quickDetect: true  // Enables 2-bar analysis
  })
  
  console.log(`Quick tempo: ${result.tempo} BPM`)
}

/**
 * EXAMPLE 3: Using Pure Core (No Browser Dependencies)
 * ----------------------------------------------------
 * Perfect for Node.js, Web Workers, or other environments
 */
import { BeatTrackerCore, quickBPMDetect } from './xa-beat-core.js'

function pureJSExample(audioData, sampleRate) {
  // Create core tracker
  const tracker = new BeatTrackerCore({
    defaultSampleRate: sampleRate || 44100
  })
  
  // Method 1: Full beat tracking
  const result = tracker.beatTrack({
    y: audioData,
    sr: sampleRate
  })
  
  // Method 2: Ultra-fast BPM only
  const bpm = quickBPMDetect(audioData, sampleRate)
  
  return { result, bpm }
}

/**
 * EXAMPLE 4: Playing Audio with Click Track
 * -----------------------------------------
 * Generates metronome clicks synchronized with detected beats
 */
async function playWithClickTrack() {
  const ui = new BeatTrackingUI()
  
  // ... load audioBuffer ...
  
  // Detect beats
  const audioData = audioBuffer.getChannelData(0)
  const result = ui.tracker.beatTrack({
    y: audioData,
    sr: audioBuffer.sampleRate
  })
  
  // Play with click track
  ui.playWithBeats(audioBuffer, result.beats, {
    clickFreq: 880,  // Click frequency in Hz
    offset: 0        // Offset in seconds
  })
}

/**
 * EXAMPLE 5: Drum Hit Detection
 * ------------------------------
 * Detects individual drum hits (kicks, snares, etc.)
 */
async function detectDrumHits() {
  const ui = new BeatTrackingUI()
  
  // ... load audioBuffer ...
  
  // Detect drum hits
  const drumHits = ui.detectDrumHits(audioBuffer, {
    threshold: 0.3,      // Sensitivity (0-1)
    minInterval: 0.05,   // Min time between hits
    kickThreshold: 0.4,  // Threshold for kick detection
    circular: true       // Better for loops
  })
  
  console.log(`Found ${drumHits.kicks.length} kicks`)
  console.log(`Found ${drumHits.hits.length} other hits`)
  
  // Play with different click sounds for kicks vs hits
  ui.playWithDrumClicks(audioBuffer, drumHits, {
    kickFreq: 200,   // Low frequency for kicks
    hitFreq: 1000    // High frequency for hits
  })
}

/**
 * EXAMPLE 6: Dynamic Tempo Tracking
 * ----------------------------------
 * For music with changing tempo
 */
async function trackDynamicTempo() {
  const tracker = new BeatTracker()
  
  // ... load audioData ...
  
  // Get tempo over time
  const dynamicTempo = tracker.estimateDynamicTempo(
    audioData,
    sampleRate,
    8.0,  // Window size in seconds
    1.0   // Hop size in seconds
  )
  
  // Plot tempo changes
  dynamicTempo.times.forEach((time, i) => {
    console.log(`Time ${time.toFixed(1)}s: ${dynamicTempo.tempo[i].toFixed(1)} BPM`)
  })
}

/**
 * EXAMPLE 7: Custom Logger
 * ------------------------
 * Control logging output
 */
import { createConsoleLogger } from './xa-beat-core.js'

// With logging
const debugTracker = new BeatTracker({
  logger: createConsoleLogger()
})

// Silent operation
const silentTracker = new BeatTracker({
  logger: null
})

/**
 * API REFERENCE
 * =============
 */

/**
 * BeatTracker / BeatTrackerCore Methods:
 * --------------------------------------
 * 
 * beatTrack(options)
 *   Main beat tracking function
 *   Options:
 *   - y: Float32Array         - Audio signal
 *   - sr: number             - Sample rate (auto-detected if null)
 *   - hopLength: number      - Hop length in samples (default: 512)
 *   - startBpm: number       - Initial tempo guess (default: 120)
 *   - tightness: number      - Beat regularity (default: 100)
 *   - trim: boolean          - Trim weak beats (default: true)
 *   - units: string          - 'frames', 'samples', or 'time' (default: 'time')
 *   - sparse: boolean        - Return array vs dense (default: true)
 *   - quickDetect: boolean   - Use 2-bar detection (default: false)
 *   
 * tempoEstimation(onsetEnvelope, sr, hopLength, startBpm)
 *   Estimate tempo from onset envelope
 *   
 * onsetStrength(y, sr, hopLength)
 *   Compute onset strength envelope
 *   
 * estimateDynamicTempo(y, sr, windowSize, hopSize)
 *   Track tempo changes over time
 */

/**
 * BeatTrackingUI Methods:
 * -----------------------
 * 
 * detectDrumHits(audioBuffer, options)
 *   Detect individual drum hits
 *   
 * generateClickTrack(beats, duration, clickFreq, offset)
 *   Create metronome click track
 *   
 * generateDrumClickTrack(drumHits, duration, kickFreq, hitFreq, offset)
 *   Create click track with different sounds for kicks/hits
 *   
 * playWithBeats(audioBuffer, beats, options)
 *   Play audio with synchronized clicks
 *   
 * playWithDrumClicks(audioBuffer, drumHits, options)
 *   Play audio with drum replacement clicks
 */

/**
 * CONVENIENCE FUNCTIONS
 * ---------------------
 */

// Quick beat tracking with all defaults
import { quickBeatTrack } from './xa-beat-core.js'
const { bpm, beats } = quickBeatTrack(audioData)

// Ultra-fast BPM detection only
import { quickBPMDetect } from './xa-beat-core.js'
const tempo = quickBPMDetect(audioData)

// Librosa-style API
import { beat_track, tempo } from './xa-beat-core.js'
const result = beat_track(audioData, sampleRate)

/**
 * ADVANCED FEATURES
 * -----------------
 */

// 1. Predominant Local Pulse (PLP) for complex rhythms
const plpResult = tracker.plp({
  y: audioData,
  sr: sampleRate,
  tempoMin: 60,
  tempoMax: 180
})

// 2. Custom onset detection
const customOnset = tracker.onsetStrength(audioData, sampleRate, 1024)
const result = tracker.beatTrack({
  onsetEnvelope: customOnset,
  sr: sampleRate
})

// 3. Fixed tempo beat tracking
const fixedResult = tracker.beatTrack({
  y: audioData,
  sr: sampleRate,
  bpm: 128  // Force specific BPM
})

/**
 * PERFORMANCE TIPS
 * ----------------
 * 
 * 1. Use quickDetect for faster analysis (2-bar window)
 * 2. Pre-compute onset envelope for multiple analyses
 * 3. Use lower hopLength (256) for faster but less accurate results
 * 4. Cache AudioContext sample rate to avoid repeated detection
 * 5. For real-time, process in chunks with estimateDynamicTempo
 * 
 * COMMON ISSUES
 * -------------
 * 
 * 1. "No onsets detected" - Audio might be too quiet or noisy
 *    Solution: Normalize audio or adjust onset detection parameters
 *    
 * 2. Wrong tempo detected - Complex rhythms or half/double time
 *    Solution: Provide startBpm hint or use PLP for complex rhythms
 *    
 * 3. Beats slightly off - Phase alignment issues
 *    Solution: Use offset parameter in click track generation
 *    
 * 4. Too many/few beats - Threshold issues
 *    Solution: Adjust tightness parameter (higher = fewer beats)
 */

// Export all the examples as functions for testing
export {
  basicBeatDetection,
  quickTempoDetection,
  pureJSExample,
  playWithClickTrack,
  detectDrumHits,
  trackDynamicTempo
}