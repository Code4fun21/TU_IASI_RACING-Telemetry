import { api } from "../services/api";

// ==========================================
// 1. MATH & KALMAN UTILITIES
// ==========================================

class KalmanFilter2D {
    x: [number, number]; 
    P: [[number, number], [number, number]];
    Q: [[number, number], [number, number]];
    R: number;
    readonly I: [[number, number], [number, number]] = [[1, 0], [0, 1]];
    readonly H: [number, number] = [0, 1];
    first: boolean = true;
    lastTime: number = 0;

    constructor(processQ: [[number, number], [number, number]] | null = null, measureR: number = 1e-1) {
        this.Q = processQ || [[1e-3, 0], [0, 1e-2]];
        this.R = measureR;
        this.x = [0, 0];
        this.P = [[1, 0], [0, 1]];
    }

filter(measurement: number, timestamp: number): number {
        if (this.first) {
            this.x = [0, measurement];
            this.lastTime = timestamp;
            this.first = false;
            return measurement;
        }

        // FIX: Convert ms to seconds so the covariance matrices don't explode
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

class LowPassFilter {
    currentValue: number | null = null;
    alpha: number;

    constructor(alpha: number = 0.15) { 
        this.alpha = alpha; 
    }

    filter(measurement: number): number {
        if (this.currentValue === null) {
            this.currentValue = measurement;
            return measurement;
        }
        this.currentValue = this.currentValue + this.alpha * (measurement - this.currentValue);
        return this.currentValue;
    }
}

class StaticCalibrator {
    pitch: number = 0;
    roll: number = 0;
    isCalibrated: boolean = false;
    bufferX: number[] = [];
    bufferY: number[] = [];

    update(x: number, y: number, speed: number) {
        if (this.isCalibrated) return;
        
        if (speed > 1.0) {
            this.bufferX = [];
            this.bufferY = [];
            return;
        }

        this.bufferX.push(x);
        this.bufferY.push(y);

        if (this.bufferX.length >= 50) {
            const meanX = this.bufferX.reduce((a, b) => a + b, 0) / 50;
            const meanY = this.bufferY.reduce((a, b) => a + b, 0) / 50;
            this.pitch = Math.asin(Math.max(-1, Math.min(1, meanX)));
            this.roll = Math.asin(Math.max(-1, Math.min(1, meanY)));
            this.isCalibrated = true;
            console.log(`Decoder V2: Static Tilt Calibrated. Pitch: ${this.pitch.toFixed(3)}, Roll: ${this.roll.toFixed(3)}`);
        }
    }

    rotate(x: number, y: number, z: number): [number, number, number] {
        if (!this.isCalibrated) return [x * -1, y * -1, z]; 

        const cosP = Math.cos(this.pitch); const sinP = Math.sin(this.pitch);
        const cosR = Math.cos(this.roll);  const sinR = Math.sin(this.roll);

        let x_leveled = x * cosP - z * sinP;
        let z_temp    = x * sinP + z * cosP;
        let y_leveled = y * cosR - z_temp * sinR;
        let z_final   = y * sinR + z_temp * cosR;

        return [x_leveled * -1, y_leveled * -1, z_final];
    }
}
// ==========================================
// 2. LAP TIMING ALGORITHMS
// ==========================================

class GPSPoint {
    lat: number;
    lon: number;
    timestamp: number;
    speed: number;

    constructor(lat: number, lon: number, timestamp: number, speed: number) {
        this.lat = lat;
        this.lon = lon;
        this.timestamp = timestamp;
        this.speed = speed;
    }
}

class GPS_Intersection {
    gateL: GPSPoint;
    gateR: GPSPoint;
    prev: GPSPoint | null = null;
    curr: GPSPoint | null = null;
    currTime: number | null = null;

    constructor(gL: GPSPoint, gR: GPSPoint) {
        this.gateL = gL;
        this.gateR = gR;
    }

    update_points(prev: GPSPoint, curr: GPSPoint) {
        this.prev = prev;
        this.curr = curr;
    }

    get_time() {
        return this.currTime;
    }

    get_intersection_time(): boolean {
        if (!this.prev || !this.curr) return false;

        if (!this.do_intersect(this.prev, this.curr)) return false;

        const x1 = this.prev.lon; const y1 = this.prev.lat;
        const x2 = this.curr.lon; const y2 = this.curr.lat;
        const x3 = this.gateL.lon; const y3 = this.gateL.lat;
        const x4 = this.gateR.lon; const y4 = this.gateR.lat;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        const eps = 1e-12;
        if (Math.abs(denom) < eps || !isFinite(denom)) return false;

        const interLon = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;
        const interLat = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;

        if (!isFinite(interLon) || !isFinite(interLat)) return false;

        const totalDist = Math.hypot(x2 - x1, y2 - y1);
        if (totalDist < eps) return false;

        const distToInter = Math.hypot(interLon - x1, interLat - y1);
        const frac = Math.max(0.0, Math.min(1.0, distToInter / totalDist));

        this.currTime = this.prev.timestamp + frac * (this.curr.timestamp - this.prev.timestamp);
        return true;
    }

    do_intersect(p1: GPSPoint, q1: GPSPoint): boolean {
        const o1 = this.orientation(p1, q1, this.gateL);
        const o2 = this.orientation(p1, q1, this.gateR);
        const o3 = this.orientation(this.gateL, this.gateR, p1);
        const o4 = this.orientation(this.gateL, this.gateR, q1);

        if (o1 !== o2 && o3 !== o4) return true;
        if (o1 === 0 && this.on_segment(p1, this.gateL, q1)) return true;
        if (o2 === 0 && this.on_segment(p1, this.gateR, q1)) return true;
        if (o3 === 0 && this.on_segment(this.gateL, p1, this.gateR)) return true;
        if (o4 === 0 && this.on_segment(this.gateL, q1, this.gateR)) return true;

        return false;
    }

    orientation(p: GPSPoint, q: GPSPoint, r: GPSPoint): number {
        const val = (q.lon - p.lon) * (r.lat - q.lat) - (q.lat - p.lat) * (r.lon - q.lon);
        const eps = 1e-12;
        if (Math.abs(val) < eps) return 0;
        return val > 0 ? 1 : 2;
    }

    on_segment(p: GPSPoint, q: GPSPoint, r: GPSPoint): boolean {
        return (
            q.lon <= Math.max(p.lon, r.lon) && q.lon >= Math.min(p.lon, r.lon) &&
            q.lat <= Math.max(p.lat, r.lat) && q.lat >= Math.min(p.lat, r.lat)
        );
    }
}

// ==========================================
// 3. CONFIGURATION & DATABASE V2
// ==========================================

const MAIN_COORDS = [46, 23]; 

interface SignalConfig {
    name: string;
    offset: number;
    size: number;
    multiply?: number;
    divide?: number;
    add?: number;
    isSigned?: boolean;
    method?: string; 
    filter?: boolean; 
}

// --- V2 DATABASE (Mapped precisely to your Spreadsheet) ---
const CAN_DATABASE: Record<string, SignalConfig[]> = {
    // FRONT_ANALOG (uint16, Big Endian)
    "0500": [
        { name: "damperLF",      offset: 0, size: 2, filter: true }, // D1
        { name: "damperRF",      offset: 2, size: 2, filter: true }, // D2
        { name: "steering",      offset: 4, size: 2, filter: true }  // STR
    ],
    
    // ACCEL (int16, Big Endian, formula: / 100.0)
    // ACCEL (int16, Big Endian, formula: / 100.0 to keep m/s^2)
    "0501": [
        { name: "accelerationX", offset: 0, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100, filter: true },
        { name: "accelerationY", offset: 2, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100, filter: true },
        { name: "accelerationZ", offset: 4, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100, filter: true }
    ],

    // GYRO (int16, Big Endian, formula: / 100.0)
    "0502": [
        { name: "gyroX",         offset: 0, size: 2, isSigned: true, divide: 100 },
        { name: "gyroY",         offset: 2, size: 2, isSigned: true, divide: 100 },
        { name: "gyroZ",         offset: 4, size: 2, isSigned: true, divide: 100 }
    ],

    // GEAR (uint8)
    "0700": [
        { name: "gear",          offset: 0, size: 1, method: "Method_Gear" }
    ],

    // REAR_ANALOG (uint16, Big Endian)
    "0701": [
        { name: "damperLR",      offset: 0, size: 2, filter: true }, // RL
        { name: "damperRR",      offset: 2, size: 2, filter: true }, // RR
        { name: "brakePressure", offset: 4, size: 2, filter: true }  // BRK
    ],

    // GPS_POS (float32, Little Endian directly from memcpy)
    "0750": [
        { name: "GPS_Latitude",  offset: 0, size: 4, method: "Float32_LE" }, 
        { name: "GPS_Longitude", offset: 4, size: 4, method: "Float32_LE" }
    ],

    // GPS_SPD (float32, Multiply by 1.852)
    "0751": [
        { name: "GPS_Speed",     offset: 0, size: 4, method: "Float32_LE", multiply: 1 } 
    ],

    // LAP TIME (uint32)
    "0777": [
        { name: "LAP_MS",        offset: 0, size: 4 } 
    ],

    // MEGASQUIRT
    "05F0": [{ name: "rpm", offset: 6, size: 2 }],
    "05F2": [
        { name: "manifoldAirPressure", offset: 2, size: 2, divide: 10 },
        { name: "manifoldAirTemp",     offset: 4, size: 2, divide: 10, method:"Convert_Temp" },
        { name: "coolantTemp",         offset: 6, size: 2, divide: 10, method:"Convert_Temp" }
    ],
    "05F3": [
        { name: "throttlePosition", offset: 0, size: 2, divide: 10 },
        { name: "batteryVoltage",   offset: 2, size: 2, divide: 10 }
    ],
    "05F4": [{ name: "airDensityCorrection", offset: 6, size: 2, divide:10 }],
    "05F5": [
        { name: "warmupCorrection",     offset: 0, size: 2, divide: 10 },
        { name: "tpsBasedAcceleration", offset: 2, size: 2, divide: 10 },
        { name: "tpsBasedFuelCut",      offset: 4, size: 2, divide: 10 }
    ],
    "05F6": [
        { name: "totalfuelCorrection", offset: 0, size: 2, divide: 10 },
        { name: "veValueTableBank1",   offset: 2, size: 2, divide: 10 },
        { name: "veValueTableBank2",   offset: 4, size: 2, divide: 10 }
    ],
    "05F7": [
        { name: "coldAdvance",         offset: 0, size: 2, divide: 10   },
        { name: "rateOfchangeOfTPS",   offset: 2, size: 2, divide: 10, filter: true   },
        { name: "rateOfChangeOfRPM",   offset: 6, size: 2, multiply: 10, filter: true }
    ],
    "061B": [
        { name: "syncLossCounter",     offset: 0, size: 1 },
        { name: "syncLossReasonCode",  offset: 1, size: 1 }
    ],
    "0624": [{ name: "averageFuelFlow", offset: 4, size: 2 }],
};

export class CANDecoderV2 {
    filtersLPF: Record<string, LowPassFilter> = {};
    filtersKalman: Record<string, KalmanFilter2D> = {};
    mainCoords: [number, number]; 
    prevPos: GPSPoint | null = null;
    currPos: GPSPoint | null = null;
    
    gateCheckers: Record<string, GPS_Intersection> = {};
    currentLap: Record<string, number | boolean | number> = {};
    lapsHistory: any[] = [];
    trackLen: number = 0;
    gateIdx: number = 0;
    justS0: boolean = false;
    lapCount: number = 0;

    constructor() {
        this.mainCoords = [0, 0];
    }

    async setBaseCoordinates(trackData: any) {
        if (!trackData) {
            return;
        }

        if (trackData.gates && typeof trackData.gates === 'object') {
            this.initializeGates(trackData.gates);
        } 
        else if (typeof trackData.gates === 'string') {
            try {
                const data = await api.fetchJsonFile(trackData.gates);
                this.initializeGates(data);
            } catch (err) {
            }
        }
    }

    initializeGates(data: any) {
        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        const lat = Math.floor(Number(data[0].lat1)); 
        const lon = Math.floor(Number(data[0].lon1));

        this.mainCoords = [lat, lon];
        this.gateCheckers = {};

        data.forEach((g: any) => {
            if (g.lat1 == null || g.lon1 == null || g.lat2 == null || g.lon2 == null) return;

            const gL = new GPSPoint(Number(g.lat1), Number(g.lon1), 0, 0);
            const gR = new GPSPoint(Number(g.lat2), Number(g.lon2), 0, 0);
            
            const gateName = g.name || `Gate_${Math.random().toString(36).substr(2, 5)}`;
            this.gateCheckers[gateName] = new GPS_Intersection(gL, gR);
        });
    }

    parse(rawString: string) {
        try {
            const parts = rawString.split(',');
            if (parts.length < 3) return null;

            const timestamp = Number(parts[0]) + 1785056125000;
           
            
            
            let canId = parts[1].trim().replace(/^0x/i, '').toUpperCase();
            if (canId.length < 4) canId = canId.padStart(4, "0");

            const payloadHex = parts[2].trim();
            const signals = CAN_DATABASE[canId];

            if (!signals) return null;

            const buffer = this.hexToDataView(payloadHex);
            const decodedValues: Record<string, any> = {};

            for (const sig of signals) {
                let finalVal = 0;
                let rawVal = 0;

                if (sig.method === "Float32_LE") {
                    finalVal = buffer.getFloat32(sig.offset, true); 
                    rawVal = finalVal;
                } else {
                    rawVal = this.readBytes(buffer, sig.offset, sig.size, sig.isSigned);
                    finalVal = rawVal;
                }

                if (sig.method && sig.method !== "Float32_LE") {
                    switch (sig.method) {
                        case "Convert_Temp":
                            const tempInF = rawVal / (sig.divide || 1); 
                            finalVal = (tempInF - 32) * 5 / 9;
                            decodedValues[sig.name] = Number(finalVal.toFixed(6));
                            continue;

                        case "Method_Gear":
                            decodedValues[sig.name] = rawVal === 0 ? "N" : rawVal.toString();
                            continue;

                        case "Method_IMU_Acc":
                            // 1. Calculate the base unfiltered value
                            const rawUnfiltered = rawVal / (sig.divide || 100.0); 
                            
                            // 2. Map the unfiltered signal to the _RAW variable
                            decodedValues[sig.name + "_RAW"] = Number(rawUnfiltered.toFixed(6));
                            
                            finalVal = rawUnfiltered;
                            
                            // 3. Apply Kalman Filter
                            if (sig.filter) {
                                finalVal = this.applyKalman(sig.name, finalVal, timestamp);
                            }
                            
                            // 4. Map the filtered signal to the standard variable
                            decodedValues[sig.name] = Number(finalVal.toFixed(6));
                            continue;
                    }
                } 
                
                if (sig.method !== "Method_Gear" && sig.method !== "Convert_Temp") {
                    const mult = sig.multiply ?? 1;
                    const div = sig.divide ?? 1;
                    const add = sig.add ?? 0;
                    finalVal = (finalVal * mult / div) + add;
                    
                    decodedValues[sig.name] = Number(finalVal.toFixed(6));
                }
            }

            if (decodedValues["GPS_Latitude"] && decodedValues["GPS_Longitude"]) {
                const lat = decodedValues["GPS_Latitude"];
                const lon = decodedValues["GPS_Longitude"];
                const speed = decodedValues["GPS_Speed"] !== undefined ? decodedValues["GPS_Speed"] : (this.currPos ? this.currPos.speed : 0);
                
                this.currPos = new GPSPoint(lat, lon, timestamp, speed);
                
                if (this.prevPos) {
                    this.checkCross(timestamp, this.currPos);
                }
                
                this.prevPos = this.currPos;
            } else if (decodedValues["GPS_Speed"] !== undefined && this.currPos) {
                this.currPos.speed = decodedValues["GPS_Speed"];
            }

            decodedValues["Distance"] = this.trackLen;

            return { timestamp, canId, ...decodedValues };

        } catch (e) {
            return null;
        }
    }

    applyKalman(name: string, val: number, timestamp: number): number {
        if (!this.filtersKalman[name]) {
            let Q: [[number, number], [number, number]] = [[1e-3, 0], [0, 1e-2]];
            let R = 0.5; 
            
            if (name.toLowerCase().includes("acc") || name.toLowerCase().includes("gyro")) {
                R = 10; 
            }

            this.filtersKalman[name] = new KalmanFilter2D(Q, R);
        }

        return this.filtersKalman[name].filter(val, timestamp);
    }

    applyLPF(name: string, val: number): number {
        if (!this.filtersLPF[name]) {
            this.filtersLPF[name] = new LowPassFilter(0.15); 
        }
        return this.filtersLPF[name].filter(val);
    }


    checkCross(time: number, curr: GPSPoint) {
        if (!this.prevPos) return;
        const prev = this.prevPos;
        const dist = this.haversine(prev.lat, prev.lon, curr.lat, curr.lon);

        Object.keys(this.gateCheckers).forEach(gateName => {
            if (gateName.startsWith("T")) {
                if (!this.currentLap[gateName]) {
                    const turnGate = this.gateCheckers[gateName];
                    turnGate.update_points(prev, curr);

                    if (turnGate.get_intersection_time()) {
                        const tTurn = turnGate.get_time();
                        if (tTurn) {
                            this.currentLap[gateName] = tTurn;
                        }
                    }
                }
            }
        });

        if (this.gateCheckers["S0"]) {
            const s0 = this.gateCheckers["S0"];
            s0.update_points(prev, curr);
            
            if (s0.get_intersection_time()) {
                const t0 = s0.get_time();
                
                if (this.currentLap["S2"] && t0 && t0 > Number(this.currentLap["S2"])) {
                    this.currentLap["S3"] = t0; 
                    this.currentLap["complete"] = true;
                    this.currentLap["dist"] = this.trackLen;
                    this.currentLap["ts"] = t0; 
                    this.currentLap["lap"] = this.lapCount; 

                    this.lapsHistory.push({ ...this.currentLap });
                    
                    this.lapCount++;
                    this.currentLap = { "S0": t0 }; 
                    this.trackLen = 0;
                    this.gateIdx = 1;
                    this.justS0 = true;
                } 
                else if (t0 && !this.currentLap["S0"]) {
                    this.lapCount = 1;
                    this.currentLap = { "S0": t0 };
                    this.trackLen = 0;
                    this.gateIdx = 1;
                    this.justS0 = true;
                }
            }
        }

        const seq = ["S0", "S1", "S2"];
        if (this.gateIdx > 0 && this.gateIdx < seq.length) {
            const targetGate = seq[this.gateIdx];
            if (this.gateCheckers[targetGate]) {
                const g = this.gateCheckers[targetGate];
                g.update_points(prev, curr);
                
                if (g.get_intersection_time()) {
                    const t = g.get_time();
                    if (t) {
                        this.currentLap[targetGate] = t;
                        this.gateIdx++;
                    }
                }
            }
        }

        if (this.gateIdx > 0 && !this.justS0) {
            this.trackLen += dist;
        }
        this.justS0 = false;
        this.prevPos = curr; 
    }
    
    getGatesData() {
        return {
            timestamps: this.lapsHistory.map(l => l.ts || 0),
            lap_data: this.lapsHistory
        };
    }

    haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371000;
        const toRad = (d: number) => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    hexToDataView(hex: string): DataView {
        hex = hex.replace(/\s+/g, '');
        
        if (/[^0-9A-Fa-f]/.test(hex)) {
            throw new Error("Invalid hex characters in payload");
        }
        
        if (hex.length % 2 !== 0) hex = "0" + hex;
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return new DataView(bytes.buffer);
    }

    readBytes(view: DataView, offset: number, size: number, isSigned: boolean = false): number {
        if (offset + size > view.byteLength) return 0;
        try {
            switch (size) {
                case 1: return isSigned ? view.getInt8(offset) : view.getUint8(offset);
                case 2: return isSigned ? view.getInt16(offset, false) : view.getUint16(offset, false); 
                case 4: return isSigned ? view.getInt32(offset, false) : view.getUint32(offset, false);
                case 3: 
                    const b0 = view.getUint8(offset);
                    const b1 = view.getUint8(offset + 1);
                    const b2 = view.getUint8(offset + 2);
                    return (b0 << 16) | (b1 << 8) | b2;
                default: return 0;
            }
        } catch (e) {
            return 0;
        }
    }
}