    import { BeatTracker, quickBeatTrack, BeatTrackingUI, dynamicBeatTrack, beat_track, tempo } from './xa-beat-tracker.js';

    // DOM elements
    const fileInput = document.getElementById("fileInput");
    const playBtn = document.getElementById("playBtn");
    const stopBtn = document.getElementById("stopBtn");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const quickAnalyzeBtn = document.getElementById("quickAnalyzeBtn");
    const beatTrackBtn = document.getElementById("beatTrackBtn");
    const tempoBtn = document.getElementById("tempoBtn");
    const plpBtn = document.getElementById("plpBtn");
    const clickBtn = document.getElementById("clickBtn");
    const bpmDisplay = document.getElementById("bpm");
    const resultBanner = document.getElementById("resultBanner");
    const bpmValue = document.getElementById("bpmValue");
    const confValue = document.getElementById("confValue");
    const logOutput = document.getElementById("logOutput");
    const waveformCanvas = document.getElementById("waveformCanvas");
    const playhead = document.getElementById("playhead");
    const collapseAllBtn = document.getElementById("collapseAllBtn");
    const expandAllBtn = document.getElementById("expandAllBtn");
    const logToggle = document.getElementById("logToggle");
    const waveformToggle = document.getElementById("waveformToggle");

    // Hide result banner until analysis is complete
    resultBanner.style.display = 'none';

    const showPlp = () => {
      plpBtn.removeAttribute('hidden');
    };

    if (new URLSearchParams(window.location.search).get('advanced')) {
      showPlp();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') {
        showPlp();
      }
    });

    // State variables
    let audioContext, sourceNode, audioBuffer, beatTimes, startTime;
    let animationFrame, bpmInterval;
    let globalTempo = 120; // Store the initial analysis tempo
    let audioBufferRing = []; // Ring buffer for live audio analysis
    let liveAnalysisNode = null; // ScriptProcessor for real-time audio capture
    let clickBuffer = null; // Store the generated click track
    let clickSourceNode = null; // Click track audio source
    let clickEnabled = false; // Toggle for click track
    let clickPulseInterval = null; // Interval for button pulsing
    const tracker = new BeatTracker();
    const ui = new BeatTrackingUI();

    // Regenerate the click track whenever beat times are updated
    function updateClickBuffer() {
      if (audioBuffer && beatTimes && beatTimes.length > 0) {
        clickBuffer = ui.generateClickTrack(beatTimes, audioBuffer.duration);
      }
    }

    // Utility: Log messages with timestamp
    function logMessage(message) {
      const timestamp = new Date().toLocaleTimeString();
      logOutput.textContent += `[${timestamp}] ${message}\n`;
      logOutput.scrollTop = logOutput.scrollHeight;
      console.log(`[${timestamp}] ${message}`);
    }

    // Utility: Clear log output
    function clearLog() {
      logOutput.textContent = "";
    }

    function showResultBanner(bpm, confidence) {
      bpmValue.textContent = bpm.toFixed(1);
      confValue.textContent = `(${(confidence * 100).toFixed(1)}% confidence)`;
      resultBanner.style.display = 'block';
    }

    // Catch unexpected promise rejections to keep the UI responsive
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      logMessage('❌ Unexpected error: ' + (event.reason && event.reason.message ? event.reason.message : event.reason));
      analyzeBtn.disabled = false;
      quickAnalyzeBtn.disabled = false;
      beatTrackBtn.disabled = false;
      tempoBtn.disabled = false;
      plpBtn.disabled = false;
      playBtn.disabled = false;
    });

    // Handle file input change
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        clearLog();
        logMessage("Loading audio file...");
        audioContext = new AudioContext();
        ui.audioContext = audioContext; // ensure click track uses same context
        ui.tracker.audioContext = audioContext;
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        bpmDisplay.textContent = "BPM: --";
        logMessage("✅ Audio file loaded successfully");
        logMessage(`Duration: ${audioBuffer.duration.toFixed(1)}s, Sample Rate: ${audioBuffer.sampleRate}Hz`);
        playBtn.disabled = false;
        analyzeBtn.disabled = false;
        quickAnalyzeBtn.disabled = false;
        beatTrackBtn.disabled = false;
        tempoBtn.disabled = false;
        plpBtn.disabled = false;
        collapseAllBtn.disabled = false;
        expandAllBtn.disabled = false;
        // reset so selecting the same file again fires change
        fileInput.value = "";
      } catch (error) {
        console.error("File loading error:", error);
        bpmDisplay.textContent = "BPM: Error";
        logMessage("❌ Failed to load file: " + error.message);
      }
    });

    // Play button click handler
    playBtn.onclick = async () => {
      if (!audioBuffer || !audioContext) {
        logMessage("❌ No audio loaded");
        return;
      }

      try {
        if (sourceNode) sourceNode.stop();
        if (audioContext.state === 'suspended') await audioContext.resume();
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.loop = true;
        sourceNode.connect(audioContext.destination);
        
        // Set up live audio analysis
        setupLiveAnalysis();
        
        // Ensure click track is current
        updateClickBuffer();

        // Start click track if enabled
        if (clickEnabled && clickBuffer) {
          clickSourceNode = audioContext.createBufferSource();
          clickSourceNode.buffer = clickBuffer;
          clickSourceNode.loop = true;
          clickSourceNode.connect(audioContext.destination);
        }
        
        startTime = audioContext.currentTime;
        sourceNode.start();
        if (clickSourceNode) {
          clickSourceNode.start();
          logMessage("▶️ Audio playback started with click track");
          startClickPulse(); // Start button pulsing
        } else {
          logMessage("▶️ Audio playback started");
        }
        playBtn.disabled = true;
        stopBtn.disabled = false;
        drawWaveform();
        startLiveBpmTracking();
      } catch (error) {
        console.error("Playback error:", error);
        logMessage("❌ Playback failed: " + error.message);
      }
    };

    // Stop button click handler
    stopBtn.onclick = () => {
      if (sourceNode) {
        sourceNode.stop();
        sourceNode = null;
      }
      if (clickSourceNode) {
        clickSourceNode.stop();
        clickSourceNode = null;
      }
      if (liveAnalysisNode) {
        liveAnalysisNode.disconnect();
        liveAnalysisNode = null;
      }
      logMessage("⏹️ Audio playback stopped");
      playBtn.disabled = false;
      stopBtn.disabled = true;
      stopAnimating();
      stopLiveBpmTracking();
      stopClickPulse();
    };

    // Analyze button click handler
    analyzeBtn.onclick = async () => {
      if (!audioBuffer) return;

      try {
        analyzeBtn.disabled = true;
        quickAnalyzeBtn.disabled = true;
        beatTrackBtn.disabled = true;
        tempoBtn.disabled = true;
        plpBtn.disabled = true;
        playBtn.disabled = true;
        const y = audioBuffer.getChannelData(0);
        const sr = audioBuffer.sampleRate;
        const isLargeFile = y.length > sr * 30;
        const windowSize = isLargeFile ? 8.0 : 4.0;
        const hopSize = isLargeFile ? 2.0 : 1.0;
        bpmDisplay.textContent = "BPM: Analyzing...";
        resultBanner.style.display = 'none';
        clearLog();
        logMessage("🔍 Starting BPM analysis");
        logMessage(`Audio: ${y.length.toLocaleString()} samples (${(y.length/sr).toFixed(1)}s)`);
        logMessage(`Window: ${windowSize}s, Hop: ${hopSize}s`);
        if (isLargeFile) logMessage("⚡ Large file detected - using optimized analysis");

        const startTime = performance.now();
        const result = await analyzeWithProgress(y, sr, windowSize, hopSize);
        const analysisTime = (performance.now() - startTime) / 1000;

        if (result.success) {
          const { times, tempo, globalTempo: resultGlobalTempo, confidence, candidates, tempogram, onsetEnvelope } = result;
          logMessage(`✅ Analysis completed in ${analysisTime.toFixed(1)}s`);
          globalTempo = parseFloat(resultGlobalTempo.toFixed(1)); // Store for live tracking
          logMessage(`🎯 GLOBAL TEMPO: ${globalTempo} BPM (${(confidence * 100).toFixed(1)}% confidence)`);

          logMessage(`🏆 Final global tempo candidates (raw autocorrelation only):`);
          for (let i = 0; i < Math.min(candidates.length, 5); i++) {
            const candidate = candidates[i];
            const isWinner = Math.abs(candidate.bpm - globalTempo) < 0.1 ? "👑" : "";
            logMessage(` ${i+1}. ${candidate.bpm.toFixed(1)} BPM (score: ${candidate.score.toFixed(4)}) ${isWinner}`);
          }

          logMessage(`📈 FOURIER TEMPOGRAM ANALYSIS:`);
          logMessage(` Time-frequency resolution: ${tempogram.frames} frames × ${tempogram.frequencies.length} frequencies`);
          logMessage(` Total spectral energy: ${tempogram.totalEnergy.toFixed(3)}`);
          logMessage(` Energy distribution:`);

          if (tempogram.peakTempos.length > 0) {
            logMessage(`🎼 TEMPOGRAM PEAK TEMPOS (spectral analysis):`);
            for (let i = 0; i < Math.min(tempogram.peakTempos.length, 8); i++) {
              const peak = tempogram.peakTempos[i];
              const globalMatch = Math.abs(peak.bpm - globalTempo) < 5 ? "🎯" : "";
              logMessage(` ${i+1}. ${peak.bpm.toFixed(1)} BPM (energy: ${peak.energy.toFixed(4)}, frames: ${peak.frameCount}/${tempogram.frames} frames, ${(peak.prominence*100).toFixed(1)}%) ${globalMatch}`);
            }

            const tempogramTop = tempogram.peakTempos[0];
            const agreementError = Math.abs(tempogramTop.bpm - globalTempo);
            logMessage(`🔍 Method agreement: Global=${globalTempo.toFixed(1)} vs Tempogram=${tempogramTop.bpm.toFixed(1)} BPM (±${agreementError.toFixed(1)})`);

            if (agreementError < 5) logMessage(`✅ EXCELLENT: Both methods agree within ±5 BPM`);
            else if (agreementError < 15) logMessage(`⚠️ MODERATE: Methods agree within ±15 BPM`);
            else logMessage(`❌ DISAGREEMENT: Methods differ by >15 BPM - complex tempo`);
          } else {
            logMessage(` ❓ No clear peaks found in tempogram - complex/weak tempo`);
          }

          const deviations = tempo.map(t => Math.abs(t - globalTempo));
          const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
          const maxDeviation = Math.max(...deviations);
          logMessage(`📊 TEMPO STABILITY ANALYSIS:`);
          logMessage(` Average deviation: ±${avgDeviation.toFixed(1)} BPM`);
          logMessage(` Maximum deviation: ±${maxDeviation.toFixed(1)} BPM`);
          logMessage(` Stability windows: ${tempo.filter(t => Math.abs(t - globalTempo) < 5).length}/${tempo.length} stable (±5 BPM)`);

          logMessage(`📈 WINDOW-BY-WINDOW SUMMARY:`);
          const stableCount = tempo.filter(t => Math.abs(t - globalTempo) < 5).length;
          const moderateCount = tempo.filter(t => Math.abs(t - globalTempo) >= 5 && Math.abs(t - globalTempo) < 15).length;
          const unstableCount = tempo.filter(t => Math.abs(t - globalTempo) >= 15).length;
          logMessage(` ✅ Stable (±5 BPM): ${stableCount} windows`);
          logMessage(`   ⚠️ Moderate (5-15 BPM): ${moderateCount} windows`);
          logMessage(`   ❌ Unstable (>15 BPM): ${unstableCount} windows`);

          logMessage(`🎵 Performing dynamic beat tracking...`);
          const dynamicResult = dynamicBeatTrack(y, sr, windowSize, hopSize);
          beatTimes = dynamicResult.beats;
          logMessage(`🥁 Beat tracking completed: ${beatTimes.length} beats detected (dynamic tempo)`);

          logMessage(`🎵 Generating click track for verification...`);
          updateClickBuffer();
          logMessage(`✅ Click track generated successfully`);
          clickBtn.disabled = false; // Enable click track button

          // Better status labeling
          let displayStatus;
          const tempogramConfirmed = tempogram.peakTempos.length > 0 && Math.abs(tempogram.peakTempos[0].bpm - globalTempo) < 10;
          
          if (confidence > 0.4) {
            displayStatus = "DETECTED";
          } else if (confidence > 0.2) {
            displayStatus = "LIKELY";
          } else {
            displayStatus = "ESTIMATE";
          }
          
          // Add confirmation if multiple methods agree
          if (tempogramConfirmed) {
            displayStatus += " ✓";
          }
          
          bpmDisplay.textContent = `BPM: ${globalTempo} (${displayStatus})`;
          showResultBanner(globalTempo, confidence);

          logMessage(`🎉 FINAL RESULT:`);
          if (confidence > 0.7 && tempogramConfirmed) {
            logMessage(` 🎯 HIGH CONFIDENCE: Both methods confirm ${globalTempo.toFixed(1)} BPM`);
          } else if (confidence > 0.4) {
            logMessage(`   ⚠️ MODERATE CONFIDENCE: Track is likely ${globalTempo.toFixed(1)} BPM`);
          } else {
            logMessage(` ❓ LOW CONFIDENCE: Complex/ambiguous tempo, best guess ${globalTempo.toFixed(1)} BPM`);
          }
          const stabilityStatus = avgDeviation < 5 ? "STABLE" : avgDeviation < 15 ? "MODERATE" : "VARIABLE";
          logMessage(`   📊 Overall stability: ${stabilityStatus} (±${avgDeviation.toFixed(1)} BPM average)`);

          if (tempogram.peakTempos.length > 1) {
            logMessage(`   🎼 Multiple tempo candidates detected - possible tempo changes or polyrhythm`);
          }
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error("Analysis error:", error);
        bpmDisplay.textContent = "BPM: Error";
        logMessage("❌ Analysis failed: " + error.message);

      } finally {
        analyzeBtn.disabled = false;
        quickAnalyzeBtn.disabled = false;
        beatTrackBtn.disabled = false;
        tempoBtn.disabled = false;
        plpBtn.disabled = false;
        playBtn.disabled = false;
      }
    };

    // Quick Analyze button click handler
    quickAnalyzeBtn.onclick = () => {
      if (!audioBuffer) return;
      try {
        quickAnalyzeBtn.disabled = true;
        analyzeBtn.disabled = true;
        beatTrackBtn.disabled = true;
        tempoBtn.disabled = true;
        plpBtn.disabled = true;
        playBtn.disabled = true;
        bpmDisplay.textContent = "BPM: Quick...";
        resultBanner.style.display = 'none';
        clearLog();
        logMessage("⚡ Quick BPM analysis");
        const y = audioBuffer.getChannelData(0);
        const sr = audioBuffer.sampleRate;
        const result = quickBeatTrack(y, sr);
        if (result.beats.length > 0) {
          beatTimes = result.beats;
          globalTempo = parseFloat(result.bpm.toFixed(1));
          bpmDisplay.textContent = `BPM: ${globalTempo} (QUICK)`;
          showResultBanner(globalTempo, 1);
          updateClickBuffer();
          clickBtn.disabled = false;
          logMessage(`✅ Quick BPM: ${globalTempo} BPM`);
          logMessage(`Detected ${beatTimes.length} beats`);
        } else {
          bpmDisplay.textContent = "BPM: --";
          logMessage("❌ Quick analysis failed");
        }
      } catch (error) {
        console.error("Quick analysis error:", error);
        bpmDisplay.textContent = "BPM: Error";
        logMessage("❌ Quick analysis failed: " + error.message);
      } finally {
        quickAnalyzeBtn.disabled = false;
        analyzeBtn.disabled = false;
        beatTrackBtn.disabled = false;
        tempoBtn.disabled = false;
        plpBtn.disabled = false;
        playBtn.disabled = false;
      }
    };

    // beat_track helper button
    beatTrackBtn.onclick = () => {
      if (!audioBuffer) return;
      try {
        beatTrackBtn.disabled = true;
        analyzeBtn.disabled = true;
        plpBtn.disabled = true;
        playBtn.disabled = true;
        bpmDisplay.textContent = "BPM: beat_track...";
        resultBanner.style.display = 'none';
        clearLog();
        logMessage("🔧 beat_track() helper");
        const y = audioBuffer.getChannelData(0);
        const sr = audioBuffer.sampleRate;
        const result = beat_track(y, sr, { units: 'time', sparse: true });
        beatTimes = result.beats;
        globalTempo = parseFloat(result.tempo.toFixed(1));
        bpmDisplay.textContent = `BPM: ${globalTempo} (beat_track)`;
        showResultBanner(globalTempo, 1);
        clickBuffer = ui.generateClickTrack(beatTimes, audioBuffer.duration);
        clickBtn.disabled = false;
        logMessage(`✅ beat_track tempo: ${globalTempo} BPM`);
        logMessage(`Detected ${beatTimes.length} beats`);
      } catch (error) {
        console.error('beat_track error:', error);
        bpmDisplay.textContent = 'BPM: Error';
        logMessage('❌ beat_track failed: ' + error.message);
      } finally {
        beatTrackBtn.disabled = false;
        analyzeBtn.disabled = false;
        plpBtn.disabled = false;
        playBtn.disabled = false;
      }
    };

    // tempo helper button
    tempoBtn.onclick = () => {
      if (!audioBuffer) return;
      try {
        tempoBtn.disabled = true;
        analyzeBtn.disabled = true;
        plpBtn.disabled = true;
        playBtn.disabled = true;
        bpmDisplay.textContent = "BPM: tempo...";
        resultBanner.style.display = 'none';
        clearLog();
        logMessage("🔧 tempo() helper");
        const y = audioBuffer.getChannelData(0);
        const sr = audioBuffer.sampleRate;
        const onset = tracker.onsetStrength(y, sr);
        const bpm = tempo(onset, sr);
        globalTempo = parseFloat(bpm.toFixed(1));
        beatTimes = [];
        bpmDisplay.textContent = `BPM: ${globalTempo} (tempo)`;
        showResultBanner(globalTempo, 1);
        logMessage(`✅ tempo: ${globalTempo} BPM`);
      } catch (error) {
        console.error('tempo error:', error);
        bpmDisplay.textContent = 'BPM: Error';
        logMessage('❌ tempo() failed: ' + error.message);
      } finally {
        tempoBtn.disabled = false;
        analyzeBtn.disabled = false;
        plpBtn.disabled = false;
        playBtn.disabled = false;
      }
    };

    // PLP Analyze button
    plpBtn.onclick = () => {
      if (!audioBuffer) return;
      try {
        plpBtn.disabled = true;
        analyzeBtn.disabled = true;
        quickAnalyzeBtn.disabled = true;
        beatTrackBtn.disabled = true;
        tempoBtn.disabled = true;
        playBtn.disabled = true;
        bpmDisplay.textContent = "BPM: PLP...";
        resultBanner.style.display = 'none';
        clearLog();
        logMessage("🔧 PLP analysis");
        const y = audioBuffer.getChannelData(0);
        const sr = audioBuffer.sampleRate;
        const pulse = tracker.plp({ y, sr });
        const bpm = tracker.tempoEstimation(pulse, sr);
        globalTempo = parseFloat(bpm.toFixed(1));
        bpmDisplay.textContent = `BPM: ${globalTempo} (PLP)`;
        showResultBanner(globalTempo, 1);
        logMessage(`✅ PLP BPM: ${globalTempo} BPM`);
        logMessage(`Pulse curve length: ${pulse.length}`);
      } catch (error) {
        console.error('PLP error:', error);
        bpmDisplay.textContent = 'BPM: Error';
        logMessage('❌ PLP failed: ' + error.message);
      } finally {
        plpBtn.disabled = false;
        analyzeBtn.disabled = false;
        quickAnalyzeBtn.disabled = false;
        beatTrackBtn.disabled = false;
        tempoBtn.disabled = false;
        playBtn.disabled = false;
      }
    };

    // Click track toggle handler
    clickBtn.onclick = () => {
      clickEnabled = !clickEnabled;
      clickBtn.textContent = clickEnabled ? "🔊 Click Track" : "🔇 Click Track";
      
      if (sourceNode && audioContext) {
        // If playing, restart playback with/without click
        restartPlaybackWithClick();
      }
      
      logMessage(`🎵 Click track ${clickEnabled ? 'enabled' : 'disabled'}`);
    };



    // Restart playback with or without click track
    function restartPlaybackWithClick() {
      if (!sourceNode || !audioContext) return;
      
      const currentTime = audioContext.currentTime - startTime;
      
      // Stop current playback
      if (sourceNode) sourceNode.stop();
      if (clickSourceNode) clickSourceNode.stop();
      
      // Restart immediately
      try {
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.loop = true;
        sourceNode.connect(audioContext.destination);
        
        // Refresh click track to match latest beats
        updateClickBuffer();

        // Start click track if enabled
        clickSourceNode = null;
        if (clickEnabled && clickBuffer) {
          clickSourceNode = audioContext.createBufferSource();
          clickSourceNode.buffer = clickBuffer;
          clickSourceNode.loop = true;
          clickSourceNode.connect(audioContext.destination);
        }
        
        startTime = audioContext.currentTime - currentTime; // Maintain position
        sourceNode.start();
        if (clickSourceNode) {
          clickSourceNode.start();
          startClickPulse(); // Restart pulsing
        } else {
          stopClickPulse(); // Stop pulsing if disabled
        }
        
        logMessage(`🔄 Playback restarted ${clickEnabled ? 'with' : 'without'} click track`);
      } catch (error) {
        console.error("Restart playback error:", error);
        stopBtn.onclick(); // Fall back to stop
      }
    }

    // Set up real-time audio analysis for live BPM tracking
    function setupLiveAnalysis() {
      if (!audioContext) return;
      
      // Create an analyser node for real-time audio capture
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.3;
      
      // Connect source to analyser (for monitoring)
      sourceNode.connect(analyser);
      
      // Initialize ring buffer for 2-second audio windows
      audioBufferRing = [];
      const bufferSize = Math.floor(2.0 * audioContext.sampleRate); // 2 seconds
      
      logMessage("🎤 Live audio analysis setup complete");
    }

    // Enhanced live BPM tracking with real-time analysis
    function startLiveBpmTracking() {
      if (!globalTempo || globalTempo <= 0) {
        logMessage("❌ No global tempo available for live tracking - run analysis first");
        logMessage(`Debug: globalTempo = ${globalTempo}`);
        return;
      }
      
      let lastAnalysisTime = 0;
      const analysisInterval = 1.5; // Analyze every 1.5 seconds
      const windowSize = 2.0; // Use 2-second windows
      
      bpmInterval = setInterval(async () => {
        const currentTime = audioContext.currentTime - startTime;
        const playbackTime = currentTime % audioBuffer.duration;
        
        // Only do heavy analysis every analysisInterval seconds
        if (currentTime - lastAnalysisTime >= analysisInterval) {
          try {
            const liveBpm = await analyzeLiveWindow(playbackTime, windowSize);
            if (liveBpm && liveBpm > 0) {
              const deviation = Math.abs(liveBpm - globalTempo);
              let liveStatus;
              
              if (deviation < 3) {
                liveStatus = "LIVE ✅";
              } else if (deviation < 8) {
                liveStatus = "LIVE ~";
              } else {
                liveStatus = "LIVE ?";
              }
              
              const deviationStr = deviation > 0.5 ? ` (${liveBpm > globalTempo ? '+' : ''}${(liveBpm - globalTempo).toFixed(1)})` : '';
              
              bpmDisplay.textContent = `BPM: ${liveBpm.toFixed(1)} (${liveStatus})`;
              logMessage(`🎵 Live: ${liveBpm.toFixed(1)} BPM${deviationStr} at ${playbackTime.toFixed(1)}s`);
            } else {
              // Fallback to interpolation if analysis fails
              const interpolatedBpm = calculateInterpolatedBpm(playbackTime);
              bpmDisplay.textContent = `BPM: ${interpolatedBpm} (TRACKING)`;
            }
            lastAnalysisTime = currentTime;
          } catch (error) {
            console.warn("Live BPM analysis failed:", error);
            const interpolatedBpm = calculateInterpolatedBpm(playbackTime);
            bpmDisplay.textContent = `BPM: ${interpolatedBpm} (TRACKING)`;
          }
        } else {
          // Show interpolated BPM between analyses
          const interpolatedBpm = calculateInterpolatedBpm(playbackTime);
          bpmDisplay.textContent = `BPM: ${interpolatedBpm} (TRACKING)`;
        }
      }, 500); // Update display every 500ms
      
      logMessage("🎯 Enhanced live BPM tracking started (DAW-style)");
    }

    // Analyze a live window of audio for tempo
    async function analyzeLiveWindow(currentTime, windowSize) {
      if (!audioBuffer) return null;
      
      const sr = audioBuffer.sampleRate;
      const windowSamples = Math.floor(windowSize * sr);
      const startSample = Math.floor(currentTime * sr);
      
      // Extract audio window (handle looping)
      const audioWindow = new Float32Array(windowSamples);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < windowSamples; i++) {
        const sampleIndex = (startSample + i) % channelData.length;
        audioWindow[i] = channelData[sampleIndex];
      }
      
      // Quick onset detection
      const onsetEnvelope = await computeQuickOnsetStrength(audioWindow, sr);
      
      // Constrained tempo estimation around global tempo
      const tolerance = 20; // Allow ±20 BPM deviation
      const minBpm = Math.max(60, globalTempo - tolerance);
      const maxBpm = Math.min(200, globalTempo + tolerance);
      
      return await estimateConstrainedTempoLive(onsetEnvelope, sr, globalTempo, minBpm, maxBpm);
    }

    // Quick onset strength for live analysis (optimized)
    async function computeQuickOnsetStrength(y, sr) {
      const frameLength = 1024; // Smaller for speed
      const hopLength = 256;
      const frames = Math.floor((y.length - frameLength) / hopLength) + 1;
      const onset = new Float32Array(frames);
      
      let prevSpectrum = null;
      
      for (let i = 0; i < frames; i++) {
        const start = i * hopLength;
        const frame = new Float32Array(frameLength);
        
        // Simple windowing
        for (let j = 0; j < frameLength && start + j < y.length; j++) {
          frame[j] = y[start + j] * 0.5 * (1 - Math.cos(2 * Math.PI * j / frameLength));
        }
        
        // Quick spectral magnitude (decimated)
        const spectrum = computeQuickSpectrum(frame);
        
        if (prevSpectrum) {
          let flux = 0;
          for (let k = 0; k < spectrum.length; k++) {
            flux += Math.max(0, spectrum[k] - prevSpectrum[k]);
          }
          onset[i] = flux;
        }
        
        prevSpectrum = spectrum;
      }
      
      return onset;
    }

    // Fast spectrum computation (reduced resolution)
    function computeQuickSpectrum(frame) {
      const spectrum = new Float32Array(frame.length / 8); // Reduced resolution
      
      for (let k = 0; k < spectrum.length; k++) {
        let real = 0, imag = 0;
        const step = 2; // Skip samples for speed
        
        for (let n = 0; n < frame.length; n += step) {
          const angle = (-2 * Math.PI * k * n) / frame.length;
          real += frame[n] * Math.cos(angle);
          imag += frame[n] * Math.sin(angle);
        }
        
        spectrum[k] = Math.sqrt(real * real + imag * imag);
      }
      
      return spectrum;
    }

    // Constrained tempo estimation for live analysis
    async function estimateConstrainedTempoLive(onsetEnvelope, sr, globalBpm, minBpm, maxBpm) {
      const hopLength = 256;
      const minLag = Math.floor((60 * sr) / (maxBpm * hopLength));
      const maxLag = Math.floor((60 * sr) / (minBpm * hopLength));
      
      let bestBpm = globalBpm;
      let maxCorr = 0;
      
      // Quick autocorrelation in constrained range
      for (let lag = minLag; lag < Math.min(maxLag, onsetEnvelope.length / 2); lag += 2) { // Skip every other for speed
        let corr = 0, norm = 0;
        
        for (let i = 0; i < onsetEnvelope.length - lag; i += 2) { // Decimated
          corr += onsetEnvelope[i] * onsetEnvelope[i + lag];
          norm += onsetEnvelope[i] * onsetEnvelope[i];
        }
        
        const normalizedCorr = norm > 0 ? corr / norm : 0;
        const candidateBpm = (60 * sr) / (lag * hopLength);
        
        if (normalizedCorr > maxCorr && candidateBpm >= minBpm && candidateBpm <= maxBpm) {
          maxCorr = normalizedCorr;
          bestBpm = candidateBpm;
        }
      }
      
      // Weight towards global tempo (stability bias)
      const deviation = Math.abs(bestBpm - globalBpm);
      if (deviation > 10 && maxCorr < 0.3) {
        // If correlation is weak and deviation is large, stick closer to global
        bestBpm = globalBpm + (bestBpm - globalBpm) * 0.3;
      }
      
      return bestBpm;
    }

    // Fallback interpolation between beats
    function calculateInterpolatedBpm(currentTime) {
      if (!beatTimes || beatTimes.length < 2) return globalTempo || "--";
      
      const playbackTime = currentTime % audioBuffer.duration;
      let prevBeat = null, nextBeat = null;
      
      for (let i = 0; i < beatTimes.length; i++) {
        if (beatTimes[i] <= playbackTime) prevBeat = beatTimes[i];
        if (beatTimes[i] > playbackTime) {
          nextBeat = beatTimes[i];
          break;
        }
      }
      
      if (!prevBeat && nextBeat) prevBeat = beatTimes[beatTimes.length - 1];
      if (!nextBeat && prevBeat) nextBeat = beatTimes[0];
      if (!prevBeat || !nextBeat) return globalTempo || "--";
      
      const interval = nextBeat > prevBeat ? nextBeat - prevBeat : audioBuffer.duration - prevBeat + nextBeat;
      return (60 / interval).toFixed(1);
    }

    // Stop live BPM tracking
    function stopLiveBpmTracking() {
      if (bpmInterval) {
        clearInterval(bpmInterval);
        bpmInterval = null;
        bpmDisplay.textContent = "BPM: --";
        logMessage("⏹️ Live BPM tracking stopped");
      }
    }

    // Start click track button pulsing
    function startClickPulse() {
      if (!globalTempo || !clickEnabled) return;
      
      stopClickPulse(); // Clear any existing pulse
      
      const beatInterval = (60 / globalTempo) * 1000; // Convert BPM to milliseconds
      logMessage(`🌟 Starting button pulse at ${globalTempo} BPM (${beatInterval.toFixed(0)}ms intervals)`);
      
      clickPulseInterval = setInterval(() => {
        if (clickEnabled && clickBtn) {
          // Add glow class
          clickBtn.classList.add('pulse-glow');
          
          // Remove glow after 150ms
          setTimeout(() => {
            clickBtn.classList.remove('pulse-glow');
          }, 150);
        }
      }, beatInterval);
    }

    // Stop click track button pulsing
    function stopClickPulse() {
      if (clickPulseInterval) {
        clearInterval(clickPulseInterval);
        clickPulseInterval = null;
        clickBtn.classList.remove('pulse-glow');
        logMessage("⭐ Button pulse stopped");
      }
    }

    async function analyzeWithProgress(y, sr, windowSize, hopSize) {
      try {
        logMessage(`🎵 Step 1: Computing onset strength for entire track...`);
        logMessage(`📊 Track info: ${y.length.toLocaleString()} samples, ${(y.length/sr).toFixed(1)}s duration`);
        const globalOnsetEnvelope = await computeOnsetStrength(y, sr);
        logMessage(`✅ Onset envelope computed: ${globalOnsetEnvelope.length} frames`);
        logMessage(`📈 Onset stats: max=${Math.max(...globalOnsetEnvelope).toFixed(3)}, avg=${(globalOnsetEnvelope.reduce((a,b)=>a+b,0)/globalOnsetEnvelope.length).toFixed(3)}`);
        logMessage(`🎵 Step 2: Finding global tempo candidates...`);
        const globalTempo = await estimateGlobalTempo(globalOnsetEnvelope, sr);
        logMessage(`🎯 Global tempo: ${globalTempo.bpm.toFixed(1)} BPM (confidence: ${(globalTempo.confidence * 100).toFixed(1)}%)`);
        logMessage(`🔍 Best correlation score: ${globalTempo.score.toFixed(4)}`);
        logMessage(`📊 Top tempo candidates:`);
        for (let i = 0; i < Math.min(globalTempo.candidates.length, 5); i++) {
          const candidate = globalTempo.candidates[i];
          logMessage(` ${i+1}. ${candidate.bpm.toFixed(1)} BPM (score: ${candidate.score.toFixed(4)})`);
        }

        logMessage(`🎵 Step 3: Computing Fourier tempogram for detailed tempo analysis...`);
        const tempogramResult = await computeFourierTempogram(globalOnsetEnvelope, sr);
        logMessage(`📈 Tempogram computed: ${tempogramResult.frames} time frames, ${tempogramResult.frequencies.length} tempo frequencies`);
        logMessage(`🎯 Tempogram tempo range: ${tempogramResult.tempoRange.min.toFixed(1)}-${tempogramResult.tempoRange.max.toFixed(1)} BPM`);
        logMessage(`📊 Peak tempo energies in tempogram:`);
        for (let i = 0; i < Math.min(tempogramResult.peakTempos.length, 5); i++) {
          const peak = tempogramResult.peakTempos[i];
          logMessage(` ${i+1}. ${peak.bpm.toFixed(1)} BPM (energy: ${peak.energy.toFixed(4)}, frames: ${peak.frameCount})`);
        }

        logMessage(`🎵 Step 4: Analyzing tempo stability over time...`);
        const windowSamples = Math.floor(windowSize * sr);
        const hopSamples = Math.floor(hopSize * sr);
        const numWindows = Math.floor((y.length - windowSamples) / hopSamples);
        logMessage(`⚙️ Window analysis: ${numWindows} windows, ${windowSize}s each, ${hopSize}s hops`);

        const dynamicTempo = [];
        const times = [];

        for (let i = 0; i < numWindows; i++) {
          const start = i * hopSamples;
          const window = y.slice(start, start + windowSamples);
          const localResult = await estimateConstrainedTempo(window, sr, globalTempo.bpm, i);
          dynamicTempo.push(localResult.bpm);
          times.push(start / sr);
          const deviation = Math.abs(localResult.bpm - globalTempo.bpm);
          const status = deviation < 3 ? "✅" : deviation < 8 ? "⚠️" : "❌";
          const deviationStr = deviation > 0.1 ? ` (${deviation > 0 ? '+' : ''}${(localResult.bpm - globalTempo.bpm).toFixed(1)})` : '';
          logMessage(`[${i.toString().padStart(2,'0')}] t=${times[i].toFixed(1)}s → ${localResult.bpm.toFixed(1)} BPM${deviationStr} ${status} (corr: ${localResult.correlation.toFixed(3)})`);
          const progress = ((i / numWindows) * 100).toFixed(0);
          bpmDisplay.textContent = `BPM: ${globalTempo.bpm.toFixed(1)} (${progress}% analyzed)`;
          if (i % 2 === 0) await new Promise(resolve => setTimeout(resolve, 10));
        }

        return {
          success: true,
          times,
          tempo: dynamicTempo,
          globalTempo: globalTempo.bpm,
          confidence: globalTempo.confidence,
          candidates: globalTempo.candidates,
          tempogram: tempogramResult,
          onsetEnvelope: globalOnsetEnvelope // Include for reuse
        };
        } catch (error) {
          console.error('analyzeWithProgress error:', error);
          return { success: false, error: error.message };
        }
      }

    async function computeOnsetStrength(y, sr) {
      const frameLength = 2048;
      const hopLength = 512;
      const frames = Math.floor((y.length - frameLength) / hopLength) + 1;
      const onset = new Float32Array(frames);
      logMessage(`🔧 Onset computation: ${frames} frames, ${frameLength} frame size, ${hopLength} hop`);
      let prevSpectrum = null;
      let maxFlux = 0;

      for (let i = 0; i < frames; i++) {
        const start = i * hopLength;
        const frame = new Float32Array(frameLength);
        for (let j = 0; j < frameLength && start + j < y.length; j++) {
          const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)));
          frame[j] = y[start + j] * windowValue;
        }
        const spectrum = computeSimpleSpectrum(frame);
        if (prevSpectrum) {
          let flux = 0;
          for (let k = 0; k < Math.min(spectrum.length, prevSpectrum.length); k++) {
            flux += Math.max(0, spectrum[k] - prevSpectrum[k]);
          }
          onset[i] = flux;
          maxFlux = Math.max(maxFlux, flux);
        } else {
          onset[i] = 0;
        }
        prevSpectrum = spectrum;
        if (i % 200 === 0) {
          const progress = ((i / frames) * 100).toFixed(0);
          logMessage(` Computing onsets... ${progress}% (frame ${i}/${frames}, flux: ${onset[i].toFixed(3)})`);
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      logMessage(`📊 Onset envelope: max flux = ${maxFlux.toFixed(3)}`);
      return onset;
    }

    async function estimateGlobalTempo(onsetEnvelope, sr) {
      const hopLength = 512;
      const tempoConstraints = { min: 70, max: 180, common: [80, 90, 100, 110, 120, 128, 140, 150, 160, 170] };
      const minLag = Math.floor((60 * sr) / (tempoConstraints.max * hopLength));
      const maxLag = Math.floor((60 * sr) / (tempoConstraints.min * hopLength));
      logMessage(`🔍 Searching tempo range: ${tempoConstraints.min}-${tempoConstraints.max} BPM`);
      logMessage(`📊 Autocorrelation: ${minLag} to ${maxLag} lag frames (${maxLag-minLag+1} calculations)`);
      logMessage(`⚡ Using RAW autocorrelation scores only - no arbitrary musical boosts`);
      const autocorr = new Float32Array(maxLag - minLag + 1);
      const candidates = [];

      for (let lagIdx = 0; lagIdx < autocorr.length; lagIdx++) {
        const lag = minLag + lagIdx;
        let corr = 0, norm = 0;
        for (let i = 0; i < onsetEnvelope.length - lag; i++) {
          corr += onsetEnvelope[i] * onsetEnvelope[i + lag];
          norm += onsetEnvelope[i] * onsetEnvelope[i];
        }
        autocorr[lagIdx] = norm > 0 ? corr / norm : 0;
        const bpm = (60 * sr) / (lag * hopLength);
        candidates.push({ bpm, score: autocorr[lagIdx], lag });
        if (lagIdx % 20 === 0) {
          const progress = ((lagIdx / autocorr.length) * 100).toFixed(0);
          logMessage(` Autocorr ${progress}%: lag=${lag} → ${bpm.toFixed(1)} BPM (corr: ${autocorr[lagIdx].toFixed(4)})`);
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      logMessage(`🎯 Finding tempo peaks with musical constraints...`);
      candidates.sort((a, b) => b.score - a.score);
      logMessage(`📈 Raw autocorrelation peaks:`);
      for (let i = 0; i < Math.min(10, candidates.length); i++) {
        logMessage(` ${i+1}. ${candidates[i].bpm.toFixed(1)} BPM (score: ${candidates[i].score.toFixed(4)})`);
      }

      let bestBpm = 120, bestScore = 0;
      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].score > bestScore) {
          bestScore = candidates[i].score;
          bestBpm = candidates[i].bpm;
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      logMessage(`🎵 Final ranking by RAW autocorrelation only (no boosts):`);
      for (let i = 0; i < Math.min(5, candidates.length); i++) {
        const isWinner = Math.abs(candidates[i].bpm - bestBpm) < 0.1 ? " 👑" : "";
        logMessage(` ${i+1}. ${candidates[i].bpm.toFixed(1)} BPM (raw score: ${candidates[i].score.toFixed(4)})${isWinner}`);
      }

      const avgCorr = autocorr.reduce((a, b) => a + b, 0) / autocorr.length;
      // More lenient confidence calculation for music with clear tempo
      const confidence = Math.min(1.0, Math.max(0, (bestScore - avgCorr) / (0.3 + avgCorr * 0.5)));
      logMessage(`📊 Confidence calculation: best=${bestScore.toFixed(4)}, avg=${avgCorr.toFixed(4)} → ${(confidence*100).toFixed(1)}%`);

      return {
        bpm: Math.max(tempoConstraints.min, Math.min(tempoConstraints.max, bestBpm)),
        confidence,
        score: bestScore,
        candidates: candidates.slice(0, 10)
      };
    }

    async function computeFourierTempogram(onsetEnvelope, sr) {
      const hopLength = 512;
      const winLength = 384;
      const hopFrames = Math.floor(winLength / 4);
      logMessage(`🔧 Tempogram setup: winLength=${winLength}, hopFrames=${hopFrames}`);
      const frames = Math.floor((onsetEnvelope.length - winLength) / hopFrames) + 1;
      const tempogram = [];
      const window = new Float32Array(winLength);
      for (let i = 0; i < winLength; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winLength - 1));
      logMessage(`📊 Computing ${frames} tempogram frames...`);

      for (let i = 0; i < frames; i++) {
        const start = i * hopFrames;
        const frame = new Float32Array(winLength);
        for (let j = 0; j < winLength && start + j < onsetEnvelope.length; j++) frame[j] = onsetEnvelope[start + j] * window[j];
        const fftFrame = computeSimpleFFT(frame);
        tempogram.push(fftFrame);
        if (i % Math.max(1, Math.floor(frames / 10)) === 0) {
          const progress = ((i / frames) * 100).toFixed(0);
          const frameEnergy = frame.reduce((sum, x) => sum + x*x, 0);
          logMessage(` Tempogram ${progress}%: frame ${i}/${frames} (energy: ${frameEnergy.toFixed(3)})`);
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      const tempoFreqs = computeTempoFrequencies(sr, hopLength, winLength);
      logMessage(`🎼 Tempo frequency range: ${tempoFreqs[1].toFixed(1)}-${tempoFreqs[tempoFreqs.length-1].toFixed(1)} BPM`);
      const tempogramAnalysis = analyzeTempogram(tempogram, tempoFreqs);
      logMessage(`📈 Tempogram analysis complete:`);
      logMessage(` Dominant frequencies found: ${tempogramAnalysis.peakTempos.length}`);
      logMessage(` Total energy: ${tempogramAnalysis.totalEnergy.toFixed(3)}`);
      logMessage(` Peak energy ratio: ${(tempogramAnalysis.peakEnergyRatio * 100).toFixed(1)}%`);

      return {
        frames,
        tempogram,
        frequencies: tempoFreqs,
        tempoRange: { min: tempoFreqs[1], max: tempoFreqs[tempoFreqs.length - 1] },
        peakTempos: tempogramAnalysis.peakTempos,
        totalEnergy: tempogramAnalysis.totalEnergy,
        energyDistribution: tempogramAnalysis.energyDistribution
      };
    }

    function computeTempoFrequencies(sr, hopLength, winLength) {
      const n = Math.floor(winLength / 2) + 1;
      const frequencies = new Float32Array(n);
      for (let i = 0; i < n; i++) frequencies[i] = ((i * sr) / (winLength * hopLength)) * 60.0;
      return frequencies;
    }

    function computeSimpleFFT(signal) {
      const N = signal.length;
      const result = [];
      for (let k = 0; k < N; k++) {
        let real = 0, imag = 0;
        for (let n = 0; n < N; n += 1) {
          const angle = (-2 * Math.PI * k * n) / N;
          real += signal[n] * Math.cos(angle);
          imag += signal[n] * Math.sin(angle);
        }
        result.push({ real, imag });
      }
      return result;
    }

    function analyzeTempogram(tempogram, tempoFreqs) {
      const numFrames = tempogram.length;
      const numFreqs = tempogram[0].length;
      const magnitudes = [];
      let totalEnergy = 0;

      for (let i = 0; i < numFrames; i++) {
        const frameMagnitudes = [];
        for (let j = 0; j < numFreqs; j++) {
          const mag = Math.sqrt(tempogram[i][j].real * tempogram[i][j].real + tempogram[i][j].imag * tempogram[i][j].imag);
          frameMagnitudes.push(mag);
          totalEnergy += mag;
        }
        magnitudes.push(frameMagnitudes);
      }

      const avgEnergyPerTempo = new Float32Array(numFreqs);
      for (let j = 0; j < numFreqs; j++) {
        let sum = 0;
        for (let i = 0; i < numFrames; i++) sum += magnitudes[i][j];
        avgEnergyPerTempo[j] = sum / numFrames;
      }

      const tempoPeaks = [];
      for (let j = 1; j < numFreqs - 1; j++) {
        const tempo = tempoFreqs[j];
        if (tempo >= 60 && tempo <= 200) {
          const energy = avgEnergyPerTempo[j];
          const isLocalMax = energy > avgEnergyPerTempo[j-1] && energy > avgEnergyPerTempo[j+1];
          if (isLocalMax && energy > 0.01 * Math.max(...avgEnergyPerTempo)) {
            let frameCount = 0;
            for (let i = 0; i < numFrames; i++) if (magnitudes[i][j] > 0.5 * energy) frameCount++;
            tempoPeaks.push({ bpm: tempo, energy, bin: j, frameCount, prominence: energy / Math.max(...avgEnergyPerTempo) });
          }
        }
      }

      tempoPeaks.sort((a, b) => b.energy - a.energy);
      const peakEnergy = tempoPeaks.reduce((sum, peak) => sum + peak.energy, 0);
      const peakEnergyRatio = totalEnergy > 0 ? peakEnergy / totalEnergy : 0;
      return {
        peakTempos: tempoPeaks,
        totalEnergy,
        peakEnergyRatio,
        energyDistribution: { totalEnergy, peakEnergy, peakRatio: peakEnergyRatio, numPeaks: tempoPeaks.length },
        magnitudes
      };
    }

    async function estimateConstrainedTempo(audioWindow, sampleRate, globalBpm, windowIndex) {
      const tolerance = 50;
      const minBpm = Math.max(60, globalBpm - tolerance);
      const maxBpm = Math.min(200, globalBpm + tolerance);
      logMessage(` [${windowIndex}] WIDE constraint: ${minBpm.toFixed(1)}-${maxBpm.toFixed(1)} BPM (±${tolerance} around global ${globalBpm.toFixed(1)})`);

      const frameSize = 1024;
      const hopSize = 256;
      const onsets = [];
      let totalEnergy = 0;
      for (let i = 0; i < audioWindow.length - frameSize; i += hopSize) {
        let energy = 0;
        for (let j = i; j < i + frameSize && j < audioWindow.length; j++) energy += audioWindow[j] * audioWindow[j];
        const energySqrt = Math.sqrt(energy);
        onsets.push(energySqrt);
        totalEnergy += energySqrt;
      }
      const avgEnergy = totalEnergy / onsets.length;
      logMessage(` [${windowIndex}] Onset energy: ${onsets.length} frames, avg=${avgEnergy.toFixed(3)}, max=${Math.max(...onsets).toFixed(3)}`);

      const lagMin = Math.floor(60 * sampleRate / (maxBpm * hopSize));
      const lagMax = Math.floor(60 * sampleRate / (minBpm * hopSize));
      logMessage(` [${windowIndex}] Checking lags ${lagMin}-${lagMax} for ALL tempo candidates...`);

      let bestBpm = globalBpm, maxCorr = 0;
      const correlations = [];
      for (let lag = lagMin; lag < Math.min(lagMax, onsets.length / 2); lag++) {
        let corr = 0, normalization = 0;
        for (let i = 0; i < onsets.length - lag; i++) {
          corr += onsets[i] * onsets[i + lag];
          normalization += onsets[i] * onsets[i];
        }
        const normalizedCorr = normalization > 0 ? corr / normalization : 0;
        const candidateBpm = 60 * sampleRate / (lag * hopSize);
        correlations.push({ bpm: candidateBpm, correlation: normalizedCorr, lag });
        if (normalizedCorr > maxCorr && candidateBpm >= minBpm && candidateBpm <= maxBpm) {
          maxCorr = normalizedCorr;
          bestBpm = candidateBpm;
        }
      }

      correlations.sort((a, b) => b.correlation - a.correlation);
      logMessage(` [${windowIndex}] Top correlations in window (all candidates):`);
      for (let i = 0; i < Math.min(5, correlations.length); i++) {
        const c = correlations[i];
        const globalMatch = Math.abs(c.bpm - globalBpm) < 10 ? "🎯" : "";
        const selected = Math.abs(c.bpm - bestBpm) < 0.1 ? "👑" : "";
        logMessage(` ${c.bpm.toFixed(1)} BPM: ${c.correlation.toFixed(4)} ${globalMatch}${selected}`);
      }
      logMessage(` [${windowIndex}] Selected: ${bestBpm.toFixed(1)} BPM (correlation: ${maxCorr.toFixed(4)})`);

      return { bpm: bestBpm, correlation: maxCorr, candidates: correlations.slice(0, 5) };
    }

    function computeSimpleSpectrum(frame) {
      const spectrum = new Float32Array(frame.length / 2);
      for (let k = 0; k < spectrum.length; k++) {
        let real = 0, imag = 0;
        for (let n = 0; n < frame.length; n += 4) {
          const angle = (-2 * Math.PI * k * n) / frame.length;
          real += frame[n] * Math.cos(angle);
          imag += frame[n] * Math.sin(angle);
        }
        spectrum[k] = Math.sqrt(real * real + imag * imag);
      }
      return spectrum;
    }

    function drawWaveform() {
      if (!audioBuffer) return;
      const canvas = waveformCanvas;
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      const channelData = audioBuffer.getChannelData(0);
      let minValue = Infinity;
      let maxValue = -Infinity;
      for (let i = 0; i < channelData.length; i++) {
        const v = channelData[i];
        if (v < minValue) minValue = v;
        if (v > maxValue) maxValue = v;
      }
      const normalizedData = channelData.map(value => (value - minValue) / (maxValue - minValue));
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      for (let i = 0; i < width; i++) {
        const x = (i / width) * channelData.length;
        const y = height - ((normalizedData[Math.floor(x)] + 1) / 2 * height);
        ctx.lineTo(i, y);
      }
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2;
      ctx.stroke();
      animatePlayhead();
    }

    function animatePlayhead() {
      if (!sourceNode || !audioBuffer) return;
      const currentTime = audioContext.currentTime - startTime;
      const playheadPosition = (currentTime % audioBuffer.duration) / audioBuffer.duration * waveformCanvas.width;
      playhead.style.left = `${playheadPosition}px`;
      animationFrame = requestAnimationFrame(animatePlayhead);
    }

    function stopAnimating() {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    }

    function toggleSection(sectionId, toggleBtn) {
      const section = document.getElementById(sectionId);
      const isCollapsed = section.style.display === 'none';
      section.style.display = isCollapsed ? 'block' : 'none';
      toggleBtn.textContent = isCollapsed ? '▼ Collapse' : '▶ Expand';
    }

    collapseAllBtn.onclick = () => {
      document.getElementById('logOutput').style.display = 'none';
      document.getElementById('waveformContainer').style.display = 'none';
      logToggle.textContent = '▶ Expand';
      waveformToggle.textContent = '▶ Expand';
      logMessage('⏬ All sections collapsed');
    };

    expandAllBtn.onclick = () => {
      document.getElementById('logOutput').style.display = 'block';
      document.getElementById('waveformContainer').style.display = 'block';
      logToggle.textContent = '▼ Collapse';
      waveformToggle.textContent = '▼ Collapse';
      logMessage('⏫ All sections expanded');
    };

    logToggle.onclick = () => toggleSection('logOutput', logToggle);
    waveformToggle.onclick = () => toggleSection('waveformContainer', waveformToggle);

    playBtn.disabled = true;
    stopBtn.disabled = true;
    analyzeBtn.disabled = true;
    quickAnalyzeBtn.disabled = true;
    beatTrackBtn.disabled = true;
    tempoBtn.disabled = true;
    plpBtn.disabled = true;
    clickBtn.disabled = true;
    collapseAllBtn.disabled = true;
    expandAllBtn.disabled = true;
