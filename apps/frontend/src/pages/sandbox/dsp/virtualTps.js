const findChannelByCandidates = (channels, candidates) => {
    if (!channels) return null;
    const keys = Object.keys(channels);
    for (const pattern of candidates) {
        const kalmanMatch = keys.find((k) => pattern.test(k) && /kalman|_kf$/i.test(k));
        if (kalmanMatch && channels[kalmanMatch]?.length) {
            return { key: kalmanMatch, values: channels[kalmanMatch], isFiltered: true };
        }
    }
    for (const pattern of candidates) {
        const directMatch = keys.find((k) => pattern.test(k));
        if (directMatch && channels[directMatch]?.length) {
            return {
                key: directMatch,
                values: channels[directMatch],
                isFiltered: /kalman|butter|filt|smooth|_kf$/i.test(directMatch)
            };
        }
    }
    return null;
};

const kalmanSmooth1D = (values, q = 0.008, r = 0.06) => {
    const n = values.length;
    const out = new Float64Array(n);
    if (n === 0) return out;
    let x = Number.isFinite(values[0]) ? values[0] : 0;
    let p = 1.0;
    out[0] = x;
    for (let i = 1; i < n; i++) {
        const z = values[i];
        p += q;
        if (Number.isFinite(z)) {
            const k = p / (p + r);
            x = x + k * (z - x);
            p = (1 - k) * p;
        }
        out[i] = x;
    }
    return out;
};

const interpolateSteppedSpeedMs = (speedKmh, timeMs) => {
    const n = speedKmh.length;
    const speedMs = new Float64Array(n);
    if (n === 0) return speedMs;

    const changeIndices = [0];
    for (let i = 1; i < n; i++) {
        if (Number.isFinite(speedKmh[i]) && speedKmh[i] !== speedKmh[i - 1]) {
            changeIndices.push(i);
        }
    }
    if (changeIndices[changeIndices.length - 1] !== n - 1) {
        changeIndices.push(n - 1);
    }

    if (changeIndices.length < 3 || changeIndices.length > n * 0.85) {
        for (let i = 0; i < n; i++) {
            const v = Number.isFinite(speedKmh[i]) ? speedKmh[i] : 0;
            speedMs[i] = Math.max(0, v / 3.6);
        }
        return speedMs;
    }

    for (let c = 0; c < changeIndices.length - 1; c++) {
        const i0 = changeIndices[c];
        const i1 = changeIndices[c + 1];
        const v0 = Number.isFinite(speedKmh[i0]) ? speedKmh[i0] : 0;
        const v1 = Number.isFinite(speedKmh[i1]) ? speedKmh[i1] : v0;
        const t0 = timeMs?.[i0] ?? i0;
        const t1 = timeMs?.[i1] ?? i1;
        const dt = t1 - t0;

        for (let i = i0; i <= i1; i++) {
            const alpha = dt > 0 ? ((timeMs?.[i] ?? i) - t0) / dt : (i - i0) / Math.max(1, i1 - i0);
            const interpKmh = v0 + Math.max(0, Math.min(1, alpha)) * (v1 - v0);
            speedMs[i] = Math.max(0, interpKmh / 3.6);
        }
    }

    return speedMs;
};

const percentile = (arr, q) => {
    if (!arr.length) return NaN;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
};

const median = (arr) => percentile(arr, 0.5);

const fitLinearSpeedCurve = (points, defaultIntercept, defaultSlope, minVal, maxVal) => {
    if (points.length < 5) {
        return (v) => Math.max(minVal, Math.min(maxVal, defaultIntercept + defaultSlope * v));
    }

    let s1 = 0;
    let sx = 0;
    let sxx = 0;
    let sy = 0;
    let sxy = 0;

    for (let i = 0; i < points.length; i++) {
        const x = points[i].v;
        const y = points[i].a;
        s1 += 1;
        sx += x;
        sxx += x * x;
        sy += y;
        sxy += x * y;
    }

    const denom = s1 * sxx - sx * sx;
    if (Math.abs(denom) < 1e-9) {
        return (v) => Math.max(minVal, Math.min(maxVal, defaultIntercept + defaultSlope * v));
    }

    let b = (s1 * sxy - sx * sy) / denom;
    let a = (sy - b * sx) / s1;

    if (b > -0.003 || b < -0.035) {
        b = defaultSlope;
        a = sy / s1 - b * (sx / s1);
    }

    a = Math.max(minVal + 0.08, Math.min(maxVal + 0.25, a));

    return (v) => Math.max(minVal, Math.min(maxVal, a + b * v));
};

const fitQuadraticDragCurve = (points, defaultIntercept, defaultSlope, minVal, maxVal) => {
    if (points.length < 6) {
        return (v) => Math.max(minVal, Math.min(maxVal, defaultIntercept + defaultSlope * v * v));
    }

    let s1 = 0;
    let sx = 0;
    let sxx = 0;
    let sy = 0;
    let sxy = 0;

    for (let i = 0; i < points.length; i++) {
        const x = points[i].v * points[i].v;
        const y = points[i].a;
        s1 += 1;
        sx += x;
        sxx += x * x;
        sy += y;
        sxy += x * y;
    }

    const denom = s1 * sxx - sx * sx;
    if (Math.abs(denom) < 1e-9) {
        return (v) => Math.max(minVal, Math.min(maxVal, defaultIntercept + defaultSlope * v * v));
    }

    let b = (s1 * sxy - sx * sy) / denom;
    let a = (sy - b * sx) / s1;

    if (b > 0) b = defaultSlope;
    a = Math.max(minVal, Math.min(maxVal, a));

    return (v) => Math.max(minVal, Math.min(maxVal, a + b * v * v));
};

const calibrateCorneringDragGain = (speedMs, accelY, accelX) => {
    if (!accelX) return 0.05;
    const ratios = [];
    const n = speedMs.length;
    const straightBins = new Map();

    for (let i = 0; i < n; i++) {
        const ax = Math.abs(accelX[i]);
        const ay = accelY[i];
        const v = speedMs[i];
        if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(v) || v < 5.0) continue;
        if (ax < 0.35 && ay > 0.05) {
            const bin = Math.round(v / 2) * 2;
            if (!straightBins.has(bin)) straightBins.set(bin, []);
            straightBins.get(bin).push(ay);
        }
    }

    const binRef = new Map();
    straightBins.forEach((vals, bin) => {
        if (vals.length >= 4) {
            binRef.set(bin, percentile(vals, 0.95));
        }
    });

    for (let i = 0; i < n; i++) {
        const ax = accelX[i];
        const ay = accelY[i];
        const v = speedMs[i];
        if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(v)) continue;
        if (Math.abs(ax) >= 1.1 && ay > 0.02 && v > 5.0) {
            const bin = Math.round(v / 2) * 2;
            const refAy = binRef.get(bin);
            if (refAy !== undefined) {
                const deficit = refAy - ay;
                if (deficit > 0.02 && deficit < 0.3) {
                    ratios.push(deficit / (ax * ax));
                }
            }
        }
    }

    if (ratios.length < 8) return 0.05;
    const est = percentile(ratios, 0.4);
    return Math.max(0.04, Math.min(0.06, est));
};

const buildMaxAccelEvaluator = (speedMs, accelYComp, brakeActive, gear) => {
    const n = speedMs.length;
    const hasGear = Boolean(gear && gear.length === n);
    const gearBuckets = new Map();

    const vLow = 40 / 3.6;
    const vHigh = 95 / 3.6;
    const defaultSlope = (0.3 - 0.5) / (vHigh - vLow);
    const defaultIntercept = 0.5 - defaultSlope * vLow;

    const addSample = (gKey, v, a) => {
        if (!gearBuckets.has(gKey)) gearBuckets.set(gKey, new Map());
        const speedBins = gearBuckets.get(gKey);
        const bin = Math.round(v / 2) * 2;
        if (!speedBins.has(bin)) speedBins.set(bin, []);
        speedBins.get(bin).push(a);
    };

    for (let i = 0; i < n; i++) {
        const v = speedMs[i];
        const ay = accelYComp[i];
        if (!Number.isFinite(v) || !Number.isFinite(ay)) continue;
        if (v < 2.5 || ay <= 0.03 || brakeActive[i]) continue;

        addSample("ALL", v, ay);
        if (hasGear && Number.isFinite(gear[i]) && gear[i] >= 1 && gear[i] <= 8) {
            addSample(Math.round(gear[i]), v, ay);
        }
    }

    const buildCurveFromBins = (speedBins) => {
        const envelopePts = [];
        if (speedBins) {
            speedBins.forEach((vals, binV) => {
                if (vals.length >= 4) {
                    envelopePts.push({ v: binV, a: percentile(vals, 0.98) });
                }
            });
        }
        return fitLinearSpeedCurve(envelopePts, defaultIntercept, defaultSlope, 0.24, 0.65);
    };

    const globalCurve = buildCurveFromBins(gearBuckets.get("ALL"));
    const perGearCurves = new Map();

    if (hasGear) {
        gearBuckets.forEach((bins, gKey) => {
            if (gKey === "ALL") return;
            let totalSamples = 0;
            bins.forEach((vals) => {
                totalSamples += vals.length;
            });
            if (totalSamples >= 25) {
                perGearCurves.set(gKey, buildCurveFromBins(bins));
            }
        });
    }

    return (v, gVal) => {
        if (hasGear && Number.isFinite(gVal)) {
            const gCurve = perGearCurves.get(Math.round(gVal));
            if (gCurve) return gCurve(v);
        }
        return globalCurve(v);
    };
};

const buildCoastingEvaluator = (speedMs, accelYComp, brakeActive, hasBrakeChannel, timeMs) => {
    const n = speedMs.length;
    const coastPts = [];

    if (hasBrakeChannel) {
        for (let i = 0; i < n; i++) {
            const v = speedMs[i];
            const ay = accelYComp[i];
            if (!Number.isFinite(v) || !Number.isFinite(ay)) continue;
            if (v > 3.0 && !brakeActive[i] && ay >= -0.22 && ay <= 0.01) {
                coastPts.push({ v, a: ay });
            }
        }
    } else {
        for (let i = 1; i < n; i++) {
            if (accelYComp[i] < -0.28 && accelYComp[i - 1] >= -0.28) {
                const tSpike = timeMs?.[i] ?? i * 20;
                for (let j = i - 1; j >= 0; j--) {
                    const dt = tSpike - (timeMs?.[j] ?? j * 20);
                    if (dt > 600) break;
                    if (dt >= 80 && speedMs[j] > 3.0 && accelYComp[j] >= -0.22 && accelYComp[j] <= -0.01) {
                        coastPts.push({ v: speedMs[j], a: accelYComp[j] });
                    }
                }
            }
        }
    }

    return fitQuadraticDragCurve(coastPts, -0.045, -0.00015, -0.2, -0.02);
};

const detectBrakeStates = (brakeInfo, accelY, n) => {
    const brakeActive = new Uint8Array(n);
    if (!brakeInfo || !brakeInfo.values || brakeInfo.values.length < n) {
        return { brakeActive, hasBrakeChannel: false };
    }

    const brake = brakeInfo.values;
    const restingSamples = [];
    const allValid = [];

    for (let i = 0; i < n; i++) {
        const b = brake[i];
        if (!Number.isFinite(b)) continue;
        allValid.push(b);
        if (accelY[i] > 0.04) {
            restingSamples.push(b);
        }
    }

    if (allValid.length < 10) {
        return { brakeActive, hasBrakeChannel: false };
    }

    const baseline =
        restingSamples.length >= 10 ? median(restingSamples) : percentile(allValid, 0.25);
    const p95 = percentile(allValid, 0.95);
    const isRawAdc = /raw|adc/i.test(brakeInfo.key) || baseline > 50 || p95 > 60;

    const threshold = isRawAdc
        ? Math.max(202, baseline + 14)
        : Math.max(1.5, baseline + 1.5);

    for (let i = 0; i < n; i++) {
        if (Number.isFinite(brake[i]) && brake[i] > threshold) {
            brakeActive[i] = 1;
        }
    }

    return { brakeActive, hasBrakeChannel: true };
};

const zeroPhaseSmooth = (values, windowSamples) => {
    const n = values.length;
    if (n === 0 || windowSamples <= 1) return values;
    const half = Math.max(1, Math.floor(windowSamples / 2));
    const temp = new Float64Array(n);
    const out = new Float64Array(n);

    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(n - 1, i + half);
        let sum = 0;
        for (let j = start; j <= end; j++) sum += values[j];
        temp[i] = sum / (end - start + 1);
    }

    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(n - 1, i + half);
        let sum = 0;
        for (let j = start; j <= end; j++) sum += temp[j];
        out[i] = Math.max(0, Math.min(100, sum / (end - start + 1)));
    }

    return out;
};

export function computeVirtualTps({ rawChannels, derivedChannels, timeMs, fs }) {
    const merged = { ...(rawChannels || {}), ...(derivedChannels || {}) };

    const accelYInfo = findChannelByCandidates(merged, [
        /^Acceleration_on_Y_axis/i,
        /^Accel_?Y/i,
        /^Longitudinal_Accel/i
    ]);
    const speedInfo = findChannelByCandidates(merged, [
        /^GPS_Speed/i,
        /^Vehicle_Speed/i,
        /^Speed$/i
    ]);

    if (!accelYInfo || !speedInfo) return null;

    const accelXInfo = findChannelByCandidates(merged, [
        /^Acceleration_on_X_axis/i,
        /^Accel_?X/i,
        /^Lateral_Accel/i
    ]);
    const brakeInfo = findChannelByCandidates(merged, [
        /^Brake_Pressure$/i,
        /^Brake_Pos/i,
        /^Brake$/i,
        /^Brake_Pressure_RAW/i,
        /^Brake.*RAW/i,
        /^Brake/i
    ]);
    const gearInfo = findChannelByCandidates(merged, [
        /^Current_Gear/i,
        /^Gear$/i
    ]);

    const n = Math.min(accelYInfo.values.length, speedInfo.values.length);
    if (n === 0) return null;

    const baseAccelY = accelYInfo.isFiltered
        ? Float64Array.from(
              accelYInfo.values.subarray
                  ? accelYInfo.values.subarray(0, n)
                  : accelYInfo.values.slice(0, n)
          )
        : kalmanSmooth1D(accelYInfo.values.slice(0, n));

    const speedMs = interpolateSteppedSpeedMs(speedInfo.values.slice(0, n), timeMs);
    const accelX = accelXInfo
        ? accelXInfo.isFiltered
            ? accelXInfo.values
            : kalmanSmooth1D(accelXInfo.values.slice(0, n))
        : null;
    const gear = gearInfo ? gearInfo.values : null;

    const stationarySamples = [];
    for (let i = 0; i < n; i++) {
        if (speedMs[i] < 0.4 && Number.isFinite(baseAccelY[i])) {
            stationarySamples.push(baseAccelY[i]);
        }
    }
    const zeroOffset = stationarySamples.length >= 5 ? median(stationarySamples) : 0;
    const appliedOffset = Math.abs(zeroOffset) < 0.15 ? zeroOffset : 0;

    let accelMatchSum = 0;
    let accelMatchCount = 0;
    for (let i = 1; i < n; i++) {
        const dt = ((timeMs?.[i] ?? i * 20) - (timeMs?.[i - 1] ?? (i - 1) * 20)) / 1000;
        if (dt > 0 && dt < 0.5) {
            const dvDt = (speedMs[i] - speedMs[i - 1]) / dt;
            if (dvDt > 0.6) {
                accelMatchSum += baseAccelY[i] - appliedOffset;
                accelMatchCount++;
            }
        }
    }
    const polarity = accelMatchCount >= 10 && accelMatchSum < 0 ? -1 : 1;

    const accelY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        accelY[i] = Number.isFinite(baseAccelY[i]) ? (baseAccelY[i] - appliedOffset) * polarity : 0;
    }

    const kLat = calibrateCorneringDragGain(speedMs, accelY, accelX);
    const accelYComp = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const latG = accelX && Number.isFinite(accelX[i]) ? accelX[i] : 0;
        accelYComp[i] = accelY[i] + kLat * latG * latG;
    }

    const { brakeActive, hasBrakeChannel } = detectBrakeStates(brakeInfo, accelY, n);
    const maxAccelAt = buildMaxAccelEvaluator(speedMs, accelYComp, brakeActive, gear);
    const coastAccelAt = buildCoastingEvaluator(
        speedMs,
        accelYComp,
        brakeActive,
        hasBrakeChannel,
        timeMs
    );

    const offBrakeFloor = hasBrakeChannel ? 4.0 : 0.0;
    const rawTps = new Float64Array(n);

    for (let i = 0; i < n; i++) {
        if (hasBrakeChannel && brakeActive[i]) {
            rawTps[i] = 0;
            continue;
        }

        const v = speedMs[i];
        const gVal = gear ? gear[i] : NaN;
        const aCoast = coastAccelAt(v);
        const aMax = Math.max(aCoast + 0.08, maxAccelAt(v, gVal));

        const ratio = ((accelYComp[i] - aCoast) / (aMax - aCoast)) * 100;
        const clamped = Number.isFinite(ratio)
            ? Math.max(offBrakeFloor, Math.min(100, ratio))
            : offBrakeFloor;
        rawTps[i] = clamped;
    }

    const effectiveFs = Number.isFinite(fs) && fs > 0 ? fs : 50;
    const smoothSamples = Math.max(1, Math.round(0.2 * effectiveFs));
    return zeroPhaseSmooth(rawTps, smoothSamples);
}