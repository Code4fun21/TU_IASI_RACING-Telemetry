/**
 * Telemetry calculations, FFT, dropout detection, and MATLAB-style equation evaluator.
 */

// 1. Distance Integration from GPS Speed (km/h -> meters)
export function integrateDistance(timeMs, speedKmh, lapStartTimestamps = []) {
    const n = timeMs.length;
    const sessionDist = new Float64Array(n);
    const lapDist = new Float64Array(n);
    if (n === 0) return { sessionDist, lapDist };

    const sortedLapStarts = [...lapStartTimestamps].sort((a, b) => a - b);
    let lapIdx = 0;
    let currentLapOffset = 0;

    for (let i = 1; i < n; i++) {
        const dtSec = Math.max(0, (timeMs[i] - timeMs[i - 1]) / 1000);
        const vAvgMs = ((speedKmh[i] + speedKmh[i - 1]) * 0.5) / 3.6;
        const dStep = dtSec < 2.0 ? vAvgMs * dtSec : 0; // Guard against logging pauses

        sessionDist[i] = sessionDist[i - 1] + dStep;

        while (lapIdx < sortedLapStarts.length && timeMs[i] >= sortedLapStarts[lapIdx]) {
            currentLapOffset = sessionDist[i];
            lapIdx++;
        }
        lapDist[i] = Math.max(0, sessionDist[i] - currentLapOffset);
    }

    return { sessionDist, lapDist };
}

// 2. Fast Fourier Transform (Radix-2 Cooley-Tukey with Hann window)
export function computeFFT(timeMs, values) {
    const n = values.length;
    if (n < 8) return { freqs: [], magnitudes: [], fs: 0, dominantHz: 0 };

    // Estimate sampling rate fs
    const dts = [];
    const step = Math.max(1, Math.floor(n / 200));
    for (let i = step; i < n; i += step) {
        const dt = (timeMs[i] - timeMs[i - step]) / step;
        if (dt > 0) dts.push(dt);
    }
    dts.sort((a, b) => a - b);
    const medianDtMs = dts.length ? dts[Math.floor(dts.length / 2)] : 20;
    const fs = 1000 / medianDtMs;

    // Power-of-2 size (capped at 16384 for snappy rendering)
    const maxLen = Math.min(n, 16384);
    const fftSize = Math.pow(2, Math.floor(Math.log2(maxLen)));
    if (fftSize < 8) return { freqs: [], magnitudes: [], fs, dominantHz: 0 };

    // Remove DC mean & apply Hann window
    let mean = 0;
    for (let i = 0; i < fftSize; i++) mean += values[i];
    mean /= fftSize;

    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
        re[i] = (values[i] - mean) * hann;
    }

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < fftSize; i++) {
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
        let m = fftSize >> 1;
        while (m >= 1 && j >= m) {
            j -= m;
            m >>= 1;
        }
        j += m;
    }

    // Butterfly stages
    for (let len = 2; len <= fftSize; len <<= 1) {
        const halfLen = len >> 1;
        const theta = (-2 * Math.PI) / len;
        const wStepRe = Math.cos(theta);
        const wStepIm = Math.sin(theta);

        for (let i = 0; i < fftSize; i += len) {
            let wRe = 1;
            let wIm = 0;
            for (let k = 0; k < halfLen; k++) {
                const evenIdx = i + k;
                const oddIdx = evenIdx + halfLen;

                const tRe = wRe * re[oddIdx] - wIm * im[oddIdx];
                const tIm = wRe * im[oddIdx] + wIm * re[oddIdx];

                re[oddIdx] = re[evenIdx] - tRe;
                im[oddIdx] = im[evenIdx] - tIm;
                re[evenIdx] += tRe;
                im[evenIdx] += tIm;

                const nextWRe = wRe * wStepRe - wIm * wStepIm;
                wIm = wRe * wStepIm + wIm * wStepRe;
                wRe = nextWRe;
            }
        }
    }

    const halfBins = fftSize >> 1;
    const freqs = new Float64Array(halfBins);
    const magnitudes = new Float64Array(halfBins);
    let dominantHz = 0;
    let maxMag = -1;

    for (let k = 1; k < halfBins; k++) {
        const freq = (k * fs) / fftSize;
        // Coherent gain compensation (2.0 for Hann window, 2/N for single-sided)
        const mag = (4.0 / fftSize) * Math.hypot(re[k], im[k]);
        freqs[k] = freq;
        magnitudes[k] = mag;
        if (mag > maxMag) {
            maxMag = mag;
            dominantHz = freq;
        }
    }

    return { freqs, magnitudes, fs, dominantHz };
}

// 3. Numerical Derivative (e.g., Damper position cm/mm -> velocity mm/s)
export function computeDerivative(timeMs, values, scaleFactor = 10) {
    const n = values.length;
    const out = new Float64Array(n);
    if (n < 2) return out;

    for (let i = 0; i < n; i++) {
        if (i === 0) {
            const dt = (timeMs[1] - timeMs[0]) / 1000;
            out[i] = dt > 0 ? ((values[1] - values[0]) / dt) * scaleFactor : 0;
        } else if (i === n - 1) {
            const dt = (timeMs[n - 1] - timeMs[n - 2]) / 1000;
            out[i] = dt > 0 ? ((values[n - 1] - values[n - 2]) / dt) * scaleFactor : 0;
        } else {
            const dt = (timeMs[i + 1] - timeMs[i - 1]) / 1000;
            out[i] = dt > 0 ? ((values[i + 1] - values[i - 1]) / dt) * scaleFactor : 0;
        }
    }
    return out;
}

// 4. Combined G-Force Vector Magnitude
export function computeCombinedG(latG, longG) {
    const n = Math.min(latG.length, longG.length);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = Math.hypot(latG[i], longG[i]);
    }
    return out;
}

// 5. Front & Rear Brake Bias Percentage
export function computeBrakeBias(frontBar, rearBar, minThresholdBar = 1.5) {
    const n = Math.min(frontBar.length, rearBar.length);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const f = Math.max(0, frontBar[i]);
        const r = Math.max(0, rearBar[i]);
        const total = f + r;
        out[i] = total >= minThresholdBar ? (f / total) * 100 : 0;
    }
    return out;
}

// 6. Stationary Zero / Tare Offset Calibration
export function applyTareCalibration(values, speedKmh = null, timeMs = null, customWindow = null) {
    const n = values.length;
    const out = new Float64Array(n);
    if (n === 0) return { values: out, offset: 0, sampleCount: 0 };

    let sum = 0;
    let count = 0;

    if (customWindow && timeMs) {
        for (let i = 0; i < n; i++) {
            if (timeMs[i] >= customWindow.start && timeMs[i] <= customWindow.end) {
                sum += values[i];
                count++;
            }
        }
    } else if (speedKmh) {
        for (let i = 0; i < n; i++) {
            if (speedKmh[i] < 0.5) {
                sum += values[i];
                count++;
            }
        }
    }

    if (count === 0) {
        const fallbackCount = Math.min(50, n);
        for (let i = 0; i < fallbackCount; i++) sum += values[i];
        count = fallbackCount;
    }

    const offset = sum / count;
    for (let i = 0; i < n; i++) out[i] = values[i] - offset;

    return { values: out, offset, sampleCount: count };
}

// 7. Residual Noise (Raw - Filtered)
export function computeResidual(rawValues, filteredValues) {
    const n = Math.min(rawValues.length, filteredValues.length);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = rawValues[i] - filteredValues[i];
    }
    return out;
}

// 8. Region Statistics inside a highlighted window
export function computeRegionStats(timeMs, distM, values, startX, endX, xAxisMode = "time") {
    const axis = xAxisMode === "distance" && distM ? distM : timeMs;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sqSum = 0;
    let count = 0;
    let firstIdx = -1;
    let lastIdx = -1;

    for (let i = 0; i < values.length; i++) {
        const x = axis[i];
        if (x >= minX && x <= maxX && Number.isFinite(values[i])) {
            if (firstIdx === -1) firstIdx = i;
            lastIdx = i;
            const v = values[i];
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
            sqSum += v * v;
            count++;
        }
    }

    if (count === 0) return null;

    return {
        count,
        min,
        max,
        avg: sum / count,
        rms: Math.sqrt(sqSum / count),
        deltaTimeSec: (timeMs[lastIdx] - timeMs[firstIdx]) / 1000,
        deltaDistM: distM ? distM[lastIdx] - distM[firstIdx] : 0
    };
}

// 9. Sensor Dropout & Stale-Data Detector
export function detectSensorAnomalies(timeMs, values, staleSamplesThreshold = 25) {
    const n = timeMs.length;
    if (n < 5) return [];

    const dts = [];
    for (let i = 1; i < Math.min(n, 500); i++) {
        const dt = timeMs[i] - timeMs[i - 1];
        if (dt > 0) dts.push(dt);
    }
    dts.sort((a, b) => a - b);
    const normalDt = dts.length ? dts[Math.floor(dts.length / 2)] : 20;
    const gapLimit = Math.max(250, normalDt * 4);

    const anomalies = [];
    let staleStart = -1;

    for (let i = 1; i < n; i++) {
        const dt = timeMs[i] - timeMs[i - 1];
        if (dt > gapLimit) {
            anomalies.push({
                type: "dropout",
                startTime: timeMs[i - 1],
                endTime: timeMs[i],
                durationMs: Math.round(dt),
                label: `CAN Gap (${Math.round(dt)}ms)`
            });
        }

        if (values[i] === values[i - 1] && values[i] !== 0) {
            if (staleStart === -1) staleStart = i - 1;
        } else {
            if (staleStart !== -1 && i - staleStart >= staleSamplesThreshold) {
                anomalies.push({
                    type: "stale",
                    startTime: timeMs[staleStart],
                    endTime: timeMs[i - 1],
                    durationMs: Math.round(timeMs[i - 1] - timeMs[staleStart]),
                    label: `Stale Sensor (${i - staleStart} identical frames)`
                });
            }
            staleStart = -1;
        }
    }

    return anomalies;
}

// 10. Custom MATLAB-Style Equation & Difference-Equation Evaluator
// Supports:
//   - Difference equations: "y[n] = 0.85 * y[n-1] + 0.15 * x[n]"
//   - Coefficient arrays:   "b = [0.2, 0.2, 0.2, 0.2, 0.2]; a = [1];"
//   - Channel math:         "sqrt(Acceleration_on_X_axis^2 + Acceleration_on_Y_axis^2)"
export function evaluateMatlabExpression(expression, sourceArray, allChannelsMap = {}) {
    const cleanExpr = String(expression || "").trim();
    if (!cleanExpr) throw new Error("Expression is empty.");

    const n = sourceArray ? sourceArray.length : Object.values(allChannelsMap)[0]?.length || 0;
    if (n === 0) throw new Error("No telemetry samples loaded.");

    // Mode A: b = [...]; a = [...]; IIR/FIR filter definition
    const bMatch = cleanExpr.match(/b\s*=\s*\[([^\]]+)\]/i);
    if (bMatch) {
        if (!sourceArray) throw new Error("Select a base signal x for b/a filter evaluation.");
        const b = bMatch[1].split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
        const aMatch = cleanExpr.match(/a\s*=\s*\[([^\]]+)\]/i);
        const a = aMatch
            ? aMatch[1].split(",").map((s) => Number(s.trim())).filter(Number.isFinite)
            : [1];

        if (b.length === 0) throw new Error("Invalid numerator 'b' coefficients.");
        const a0 = a[0] || 1;
        const out = new Float64Array(n);

        for (let i = 0; i < n; i++) {
            let acc = 0;
            for (let k = 0; k < b.length; k++) {
                const idx = Math.max(0, i - k);
                acc += (b[k] / a0) * sourceArray[idx];
            }
            for (let k = 1; k < a.length; k++) {
                if (i - k >= 0) {
                    acc -= (a[k] / a0) * out[i - k];
                }
            }
            out[i] = acc;
        }
        return out;
    }

    // Strip optional "y[n] =" or "y =" left-hand assignment
    const rhs = cleanExpr.replace(/^y(\[n\])?\s*=\s*/i, "");

    // Convert MATLAB power (^) to JS (**) and x[n-k] / y[n-k] indexing
    let jsBody = rhs
        .replace(/\^/g, "**")
        .replace(/\bx\[n\]/g, "xVal(i)")
        .replace(/\bx\[n\s*-\s*(\d+)\]/g, (_, k) => `xVal(i - ${k})`)
        .replace(/\bx\[n\s*\+\s*(\d+)\]/g, (_, k) => `xVal(i + ${k})`)
        .replace(/\by\[n\s*-\s*(\d+)\]/g, (_, k) => `yVal(i - ${k})`);

    // Replace channel names present in allChannelsMap with ch("Name", i)
    const sortedKeys = Object.keys(allChannelsMap).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "g");
        jsBody = jsBody.replace(regex, `ch("${key}", i)`);
    }

    const out = new Float64Array(n);
    const xVal = (idx) => {
        if (!sourceArray) return 0;
        const clamped = Math.max(0, Math.min(n - 1, idx));
        return sourceArray[clamped];
    };
    const yVal = (idx) => (idx >= 0 && idx < n ? out[idx] : sourceArray ? sourceArray[0] : 0);
    const ch = (name, idx) => {
        const arr = allChannelsMap[name];
        return arr && idx >= 0 && idx < arr.length ? arr[idx] : 0;
    };

    // Build sandboxed math evaluator
    // eslint-disable-next-line no-new-func
    const fn = new Function(
        "i", "xVal", "yVal", "ch",
        "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
        "sqrt", "abs", "log", "exp", "pow", "min", "max", "pi",
        `return (${jsBody});`
    );

    for (let i = 0; i < n; i++) {
        const val = fn(
            i, xVal, yVal, ch,
            Math.sin, Math.cos, Math.tan, Math.asin, Math.acos, Math.atan, Math.atan2,
            Math.sqrt, Math.abs, Math.log, Math.exp, Math.pow, Math.min, Math.max, Math.PI
        );
        out[i] = Number.isFinite(val) ? val : 0;
    }

    return out;
}