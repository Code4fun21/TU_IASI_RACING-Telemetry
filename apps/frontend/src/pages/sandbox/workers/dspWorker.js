import {
    applySMA,
    applyEMA,
    applyMedian,
    applySavitzkyGolay,
    applyButterworthLowPass,
    applyButterworthHighPass,
    applyNotchFilter,
    applyKalman2D
} from "../dsp/filters";

import {
    integrateDistance,
    computeFFT,
    computeDerivative,
    computeCombinedG,
    computeBrakeBias,
    applyTareCalibration,
    computeResidual,
    detectSensorAnomalies,
    evaluateMatlabExpression
} from "../dsp/mathEngine";

self.onmessage = (event) => {
    const { id, task, payload } = event.data;

    try {
        switch (task) {
            case "FILTER": {
                const { filterType, values, timeMs, fs, params } = payload;
                let filtered;

                switch (filterType) {
                    case "SMA":
                        filtered = applySMA(values, params.windowSamples);
                        break;
                    case "EMA":
                        filtered = applyEMA(values, params.alpha);
                        break;
                    case "BUTTERWORTH_LP":
                        filtered = applyButterworthLowPass(values, fs, params.cutoffHz, params.order);
                        break;
                    case "MEDIAN":
                        filtered = applyMedian(values, params.windowSize);
                        break;
                    case "SAVGOL":
                        filtered = applySavitzkyGolay(values, params.windowSize, params.polyOrder);
                        break;
                    case "HIGHPASS":
                        filtered = applyButterworthHighPass(values, fs, params.cutoffHz, params.order);
                        break;
                    case "NOTCH":
                        filtered = applyNotchFilter(values, fs, params.centerFreqHz, params.qFactor);
                        break;
                    case "KALMAN_2D":
                        filtered = applyKalman2D(values, timeMs, params.q0, params.q1, params.r);
                        break;
                    default:
                        filtered = Float64Array.from(values);
                }

                const residual = computeResidual(values, filtered);
                self.postMessage(
                    { id, ok: true, result: { filtered, residual } },
                    [filtered.buffer, residual.buffer]
                );
                break;
            }

            case "FFT": {
                const { timeMs, values } = payload;
                const spectrum = computeFFT(timeMs, values);
                self.postMessage(
                    { id, ok: true, result: spectrum },
                    [spectrum.freqs.buffer, spectrum.magnitudes.buffer]
                );
                break;
            }

            case "DERIVATIVE": {
                const { timeMs, values, scaleFactor } = payload;
                const derived = computeDerivative(timeMs, values, scaleFactor);
                self.postMessage({ id, ok: true, result: derived }, [derived.buffer]);
                break;
            }

            case "COMBINED_G": {
                const { latG, longG } = payload;
                const combined = computeCombinedG(latG, longG);
                self.postMessage({ id, ok: true, result: combined }, [combined.buffer]);
                break;
            }

            case "BRAKE_BIAS": {
                const { frontBar, rearBar, minThresholdBar } = payload;
                const bias = computeBrakeBias(frontBar, rearBar, minThresholdBar);
                self.postMessage({ id, ok: true, result: bias }, [bias.buffer]);
                break;
            }

            case "TARE": {
                const { values, speedKmh, timeMs, customWindow } = payload;
                const res = applyTareCalibration(values, speedKmh, timeMs, customWindow);
                self.postMessage({ id, ok: true, result: res }, [res.values.buffer]);
                break;
            }

            case "DISTANCE": {
                const { timeMs, speedKmh, lapStartTimestamps } = payload;
                const dist = integrateDistance(timeMs, speedKmh, lapStartTimestamps);
                self.postMessage(
                    { id, ok: true, result: dist },
                    [dist.sessionDist.buffer, dist.lapDist.buffer]
                );
                break;
            }

            case "MATLAB": {
                const { expression, sourceArray, allChannelsMap } = payload;
                const out = evaluateMatlabExpression(expression, sourceArray, allChannelsMap);
                self.postMessage({ id, ok: true, result: out }, [out.buffer]);
                break;
            }

            case "ANOMALIES": {
                const { timeMs, values } = payload;
                const anomalies = detectSensorAnomalies(timeMs, values);
                self.postMessage({ id, ok: true, result: anomalies });
                break;
            }

            default:
                throw new Error(`Unknown worker task: ${task}`);
        }
    } catch (err) {
        self.postMessage({ id, ok: false, error: err.message || String(err) });
    }
};