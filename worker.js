self.onmessage = async (e) => {
  const { id, command, y, sr, onsetEnvelope } = e.data;
  try {
    let result;
    if (command === 'computeOnsetStrength') {
      result = await computeOnsetStrength(new Float32Array(y), sr);
      postMessage({ type: 'result', id, command, result }, [result.buffer]);
    } else if (command === 'estimateGlobalTempo') {
      result = await estimateGlobalTempo(new Float32Array(onsetEnvelope), sr);
      postMessage({ type: 'result', id, command, result });
    } else if (command === 'computeFourierTempogram') {
      result = await computeFourierTempogram(new Float32Array(onsetEnvelope), sr);
      postMessage({ type: 'result', id, command, result });
    }
  } catch (err) {
    postMessage({ type: 'error', id, command, message: err.message });
  }
};

function log(message) {
  postMessage({ type: 'progress', message });
}

async function computeOnsetStrength(y, sr) {
  const frameLength = 2048;
  const hopLength = 512;
  const frames = Math.floor((y.length - frameLength) / hopLength) + 1;
  const onset = new Float32Array(frames);
  log(`🔧 Onset computation: ${frames} frames, ${frameLength} frame size, ${hopLength} hop`);
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
      log(` Computing onsets... ${progress}% (frame ${i}/${frames}, flux: ${onset[i].toFixed(3)})`);
      await new Promise((r) => setTimeout(r, 1));
    }
  }
  log(`📊 Onset envelope: max flux = ${maxFlux.toFixed(3)}`);
  return onset;
}

async function estimateGlobalTempo(onsetEnvelope, sr) {
  const hopLength = 512;
  const tempoConstraints = { min: 70, max: 180, common: [80, 90, 100, 110, 120, 128, 140, 150, 160, 170] };
  const minLag = Math.floor((60 * sr) / (tempoConstraints.max * hopLength));
  const maxLag = Math.floor((60 * sr) / (tempoConstraints.min * hopLength));
  log(`🔍 Searching tempo range: ${tempoConstraints.min}-${tempoConstraints.max} BPM`);
  log(`📊 Autocorrelation: ${minLag} to ${maxLag} lag frames (${maxLag - minLag + 1} calculations)`);
  log(`⚡ Using RAW autocorrelation scores only - no arbitrary musical boosts`);
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
      log(` Autocorr ${progress}%: lag=${lag} → ${bpm.toFixed(1)} BPM (corr: ${autocorr[lagIdx].toFixed(4)})`);
      await new Promise((r) => setTimeout(r, 1));
    }
  }
  log(`🎯 Finding tempo peaks with musical constraints...`);
  candidates.sort((a, b) => b.score - a.score);
  log(`📈 Raw autocorrelation peaks:`);
  for (let i = 0; i < Math.min(10, candidates.length); i++) {
    log(` ${i + 1}. ${candidates[i].bpm.toFixed(1)} BPM (score: ${candidates[i].score.toFixed(4)})`);
  }
  let bestBpm = 120, bestScore = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].score > bestScore) {
      bestScore = candidates[i].score;
      bestBpm = candidates[i].bpm;
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  log(`🎵 Final ranking by RAW autocorrelation only (no boosts):`);
  for (let i = 0; i < Math.min(5, candidates.length); i++) {
    const isWinner = Math.abs(candidates[i].bpm - bestBpm) < 0.1 ? " 👑" : "";
    log(` ${i + 1}. ${candidates[i].bpm.toFixed(1)} BPM (raw score: ${candidates[i].score.toFixed(4)})${isWinner}`);
  }
  const avgCorr = autocorr.reduce((a, b) => a + b, 0) / autocorr.length;
  const confidence = Math.min(1.0, Math.max(0, (bestScore - avgCorr) / (0.3 + avgCorr * 0.5)));
  log(`📊 Confidence calculation: best=${bestScore.toFixed(4)}, avg=${avgCorr.toFixed(4)} → ${(confidence * 100).toFixed(1)}%`);
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
  log(`🔧 Tempogram setup: winLength=${winLength}, hopFrames=${hopFrames}`);
  const frames = Math.floor((onsetEnvelope.length - winLength) / hopFrames) + 1;
  const tempogram = [];
  const window = new Float32Array(winLength);
  for (let i = 0; i < winLength; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winLength - 1));
  log(`📊 Computing ${frames} tempogram frames...`);
  for (let i = 0; i < frames; i++) {
    const start = i * hopFrames;
    const frame = new Float32Array(winLength);
    for (let j = 0; j < winLength && start + j < onsetEnvelope.length; j++) frame[j] = onsetEnvelope[start + j] * window[j];
    const fftFrame = computeSimpleFFT(frame);
    tempogram.push(fftFrame);
    if (i % Math.max(1, Math.floor(frames / 10)) === 0) {
      const progress = ((i / frames) * 100).toFixed(0);
      const frameEnergy = frame.reduce((sum, x) => sum + x * x, 0);
      log(` Tempogram ${progress}%: frame ${i}/${frames} (energy: ${frameEnergy.toFixed(3)})`);
      await new Promise((r) => setTimeout(r, 1));
    }
  }
  const tempoFreqs = computeTempoFrequencies(sr, hopLength, winLength);
  log(`🎼 Tempo frequency range: ${tempoFreqs[1].toFixed(1)}-${tempoFreqs[tempoFreqs.length - 1].toFixed(1)} BPM`);
  const tempogramAnalysis = analyzeTempogram(tempogram, tempoFreqs);
  log(`📈 Tempogram analysis complete:`);
  log(` Dominant frequencies found: ${tempogramAnalysis.peakTempos.length}`);
  log(` Total energy: ${tempogramAnalysis.totalEnergy.toFixed(3)}`);
  log(` Peak energy ratio: ${(tempogramAnalysis.peakEnergyRatio * 100).toFixed(1)}%`);
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
      const isLocalMax = energy > avgEnergyPerTempo[j - 1] && energy > avgEnergyPerTempo[j + 1];
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
