/**
 * Signal processing filters operating on Float64Array buffers.
 */

// 1. Simple Moving Average (SMA)
export function applySMA(input, windowSamples = 5) {
    const n = input.length;
    const out = new Float64Array(n);
    const w = Math.max(1, Math.floor(windowSamples));
    const half = Math.floor(w / 2);

    const prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
        prefix[i + 1] = prefix[i] + input[i];
    }

    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(n - 1, i + (w - 1 - half));
        out[i] = (prefix[end + 1] - prefix[start]) / (end - start + 1);
    }
    return out;
}

// 2. Exponential Moving Average (EMA)
export function applyEMA(input, alpha = 0.2) {
    const n = input.length;
    const out = new Float64Array(n);
    if (n === 0) return out;

    const a = Math.max(0.001, Math.min(1, Number(alpha) || 0.2));
    out[0] = input[0];
    for (let i = 1; i < n; i++) {
        out[i] = a * input[i] + (1 - a) * out[i - 1];
    }
    return out;
}

// 3. Median Filter (for single-sample ignition/EMI spikes)
export function applyMedian(input, windowSize = 5) {
    const n = input.length;
    const out = new Float64Array(n);
    if (n === 0) return out;

    let w = Math.max(1, Math.floor(windowSize));
    if (w % 2 === 0) w += 1;
    const half = Math.floor(w / 2);
    const scratch = new Float64Array(w);

    for (let i = 0; i < n; i++) {
        for (let k = -half; k <= half; k++) {
            const idx = Math.max(0, Math.min(n - 1, i + k));
            scratch[k + half] = input[idx];
        }
        scratch.sort();
        out[i] = scratch[half];
    }
    return out;
}

// 4. Savitzky-Golay Smoothing Filter (least-squares polynomial fit)
function computeSavGolCoeffs(windowSize, polyOrder) {
    let m = Math.max(3, Math.floor(windowSize));
    if (m % 2 === 0) m += 1;
    const p = Math.min(Math.max(1, Math.floor(polyOrder)), m - 2);
    const half = Math.floor(m / 2);
    const cols = p + 1;

    // Build Vandermonde matrix J (m x cols)
    const J = Array.from({ length: m }, (_, i) => {
        const z = i - half;
        return Array.from({ length: cols }, (__, j) => Math.pow(z, j));
    });

    // Compute JT * J (cols x cols)
    const JTJ = Array.from({ length: cols }, () => new Array(cols).fill(0));
    for (let r = 0; r < cols; r++) {
        for (let c = 0; c < cols; c++) {
            let sum = 0;
            for (let k = 0; k < m; k++) sum += J[k][r] * J[k][c];
            JTJ[r][c] = sum;
        }
    }

    // Gauss-Jordan inversion of JTJ
    const aug = JTJ.map((row, i) => [
        ...row,
        ...Array.from({ length: cols }, (_, j) => (i === j ? 1 : 0))
    ]);

    for (let i = 0; i < cols; i++) {
        let maxRow = i;
        for (let r = i + 1; r < cols; r++) {
            if (Math.abs(aug[r][i]) > Math.abs(aug[maxRow][i])) maxRow = r;
        }
        [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
        const pivot = aug[i][i] || 1e-12;
        for (let c = 0; c < 2 * cols; c++) aug[i][c] /= pivot;
        for (let r = 0; r < cols; r++) {
            if (r !== i) {
                const factor = aug[r][i];
                for (let c = 0; c < 2 * cols; c++) aug[r][c] -= factor * aug[i][c];
            }
        }
    }

    const invJTJ = aug.map((row) => row.slice(cols));
    // First row of (JTJ)^-1 * JT gives smoothing weights at z = 0
    const weights = new Float64Array(m);
    for (let k = 0; k < m; k++) {
        let sum = 0;
        for (let c = 0; c < cols; c++) sum += invJTJ[0][c] * J[k][c];
        weights[k] = sum;
    }
    return weights;
}

export function applySavitzkyGolay(input, windowSize = 9, polyOrder = 3) {
    const n = input.length;
    const out = new Float64Array(n);
    if (n === 0) return out;

    const weights = computeSavGolCoeffs(windowSize, polyOrder);
    const half = Math.floor(weights.length / 2);

    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = -half; k <= half; k++) {
            const idx = Math.max(0, Math.min(n - 1, i + k));
            sum += weights[k + half] * input[idx];
        }
        out[i] = sum;
    }
    return out;
}

// --- IIR Biquad & Zero-Phase Helpers ---
function runBiquad(input, b, a) {
    const n = input.length;
    const out = new Float64Array(n);
    if (n === 0) return out;

    let x1 = input[0], x2 = input[0];
    let y1 = input[0], y2 = input[0];

    for (let i = 0; i < n; i++) {
        const x0 = input[i];
        const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
        out[i] = y0;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
    }
    return out;
}

function zeroPhaseSection(input, b, a) {
    const n = input.length;
    if (n < 10) return runBiquad(input, b, a);

    const pad = Math.min(25, Math.floor(n / 2));
    const padded = new Float64Array(n + 2 * pad);
    for (let i = 0; i < pad; i++) padded[i] = input[0];
    padded.set(input, pad);
    for (let i = 0; i < pad; i++) padded[pad + n + i] = input[n - 1];

    const fwd = runBiquad(padded, b, a);
    fwd.reverse();
    const bwd = runBiquad(fwd, b, a);
    bwd.reverse();

    return bwd.slice(pad, pad + n);
}

function makeLowPassBiquad(fs, fc, Q) {
    const safeFc = Math.max(0.05, Math.min(fc, (fs / 2) * 0.92));
    const w0 = (2 * Math.PI * safeFc) / fs;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;

    return {
        b: [(1 - cosW) / (2 * a0), (1 - cosW) / a0, (1 - cosW) / (2 * a0)],
        a: [1, (-2 * cosW) / a0, (1 - alpha) / a0]
    };
}

function makeFirstOrderSection(fs, fc, isHighPass = false) {
    const safeFc = Math.max(0.05, Math.min(fc, (fs / 2) * 0.92));
    const k = Math.tan((Math.PI * safeFc) / fs);
    const norm = 1 / (1 + k);
    if (!isHighPass) {
        return {
            b: [k * norm, k * norm, 0],
            a: [1, (k - 1) * norm, 0]
        };
    }
    return {
        b: [norm, -norm, 0],
        a: [1, (k - 1) * norm, 0]
    };
}

// 5. Low-Pass Butterworth Filter (Orders 1 to 4)
export function applyButterworthLowPass(input, fs = 50, fc = 5, order = 2) {
    let signal = Float64Array.from(input);
    const ord = Math.max(1, Math.min(4, Math.round(order)));

    const sections = [];
    if (ord === 1) {
        sections.push(makeFirstOrderSection(fs, fc, false));
    } else if (ord === 2) {
        sections.push(makeLowPassBiquad(fs, fc, Math.SQRT1_2));
    } else if (ord === 3) {
        sections.push(makeFirstOrderSection(fs, fc, false));
        sections.push(makeLowPassBiquad(fs, fc, 1.0));
    } else if (ord === 4) {
        sections.push(makeLowPassBiquad(fs, fc, 1 / (2 * Math.cos(Math.PI / 8))));
        sections.push(makeLowPassBiquad(fs, fc, 1 / (2 * Math.cos((3 * Math.PI) / 8))));
    }

    for (const sec of sections) {
        signal = zeroPhaseSection(signal, sec.b, sec.a);
    }
    return signal;
}

// 6. High-Pass Butterworth Filter (Orders 1 to 4)
export function applyButterworthHighPass(input, fs = 50, fc = 1.0, order = 2) {
    let signal = Float64Array.from(input);
    const ord = Math.max(1, Math.min(4, Math.round(order)));
    const safeFc = Math.max(0.05, Math.min(fc, (fs / 2) * 0.92));

    const makeHPBiquad = (Q) => {
        const w0 = (2 * Math.PI * safeFc) / fs;
        const cosW = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * Q);
        const a0 = 1 + alpha;
        return {
            b: [(1 + cosW) / (2 * a0), -(1 + cosW) / a0, (1 + cosW) / (2 * a0)],
            a: [1, (-2 * cosW) / a0, (1 - alpha) / a0]
        };
    };

    const sections = [];
    if (ord === 1) {
        sections.push(makeFirstOrderSection(fs, fc, true));
    } else if (ord === 2) {
        sections.push(makeHPBiquad(Math.SQRT1_2));
    } else if (ord === 3) {
        sections.push(makeFirstOrderSection(fs, fc, true));
        sections.push(makeHPBiquad(1.0));
    } else if (ord === 4) {
        sections.push(makeHPBiquad(1 / (2 * Math.cos(Math.PI / 8))));
        sections.push(makeHPBiquad(1 / (2 * Math.cos((3 * Math.PI) / 8))));
    }

    for (const sec of sections) {
        signal = zeroPhaseSection(signal, sec.b, sec.a);
    }
    return signal;
}

// 7. Band-Stop / Notch Filter (Engine RPM vibration rejection)
export function applyNotchFilter(input, fs = 50, centerFreqHz = 25, qFactor = 5) {
    const signal = Float64Array.from(input);
    const safeF0 = Math.max(0.5, Math.min(centerFreqHz, (fs / 2) * 0.92));
    const Q = Math.max(0.5, qFactor);
    const w0 = (2 * Math.PI * safeF0) / fs;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;

    const b = [1 / a0, (-2 * cosW) / a0, 1 / a0];
    const a = [1, (-2 * cosW) / a0, (1 - alpha) / a0];

    return zeroPhaseSection(signal, b, a);
}

export class KalmanFilter2D {
    constructor(processQ = null, measureR = 1e-1) {
        this.Q = processQ || [[1e-3, 0], [0, 1e-2]];
        this.R = measureR;
        this.x = [0, 0];
        this.P = [[1, 0], [0, 1]];
        this.I = [[1, 0], [0, 1]];
        this.H = [0, 1];
        this.first = true;
        this.lastTime = 0;
    }

    filter(measurement, timestamp) {
        if (this.first) {
            this.x = [0, measurement];
            this.lastTime = timestamp;
            this.first = false;
            return measurement;
        }

        // Convert ms to seconds so the covariance matrices don't explode
        let dt = (timestamp - this.lastTime) / 1000.0;
        if (dt < 0) dt = 0;
        this.lastTime = timestamp;

        // Predict
        const newX0 = this.x[0] + dt * this.x[1];
        const newX1 = this.x[1];
        this.x = [newX0, newX1];

        const p00 = this.P[0][0]; const p01 = this.P[0][1];
        const p10 = this.P[1][0]; const p11 = this.P[1][1];

        const t00 = p00 + p01 * dt;
        const t01 = p01;
        const t10 = p10 + p11 * dt;
        const t11 = p11;

        const nextP00 = (t00 + dt * t10) + this.Q[0][0];
        const nextP01 = (t01 + dt * t11) + this.Q[0][1];
        const nextP10 = t10 + this.Q[1][0];
        const nextP11 = t11 + this.Q[1][1];
        this.P = [[nextP00, nextP01], [nextP10, nextP11]];

        // Update
        const y = measurement - this.x[1];
        const S = this.P[1][1] + this.R;
        const K0 = this.P[0][1] / S;
        const K1 = this.P[1][1] / S;

        this.x[0] = this.x[0] + K0 * y;
        this.x[1] = this.x[1] + K1 * y;

        const newP00 = this.P[0][0] - K0 * this.P[1][0];
        const newP01 = this.P[0][1] - K0 * this.P[1][1];
        const newP10 = this.P[1][0] * (1 - 0) - K1 * this.P[1][0];
        const newP11 = this.P[1][1] - K1 * this.P[1][1];

        this.P = [[newP00, newP01], [newP10, newP11]];

        return this.x[1];
    }
}

export function applyKalman2D(input, timeMs, q0 = 1e-2, q1 = 1e-1, r = 0.5) {
    const n = input.length;
    const out = new Float64Array(n);
    if (n === 0) return out;

    const kf = new KalmanFilter2D([[q0, 0], [0, q1]], r);
    for (let i = 0; i < n; i++) {
        const ts = timeMs && i < timeMs.length ? timeMs[i] : i * 20;
        out[i] = kf.filter(input[i], ts);
    }
    return out;
}