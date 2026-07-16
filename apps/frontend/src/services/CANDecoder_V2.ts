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

        let dt = timestamp - this.lastTime;
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

// const MAIN_COORDS = [46, 23]; 

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
    "0501": [
        { name: "accelerationX", offset: 0, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100 },
        { name: "accelerationY", offset: 2, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100 },
        { name: "accelerationZ", offset: 4, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100 }
    ],

    // GEAR (uint8)
    "0700": [
        { name: "gear",          offset: 0, size: 1 }
    ],

    // REAR_ANALOG (uint16, Big Endian)
    "0701": [
        { name: "damperLR",      offset: 0, size: 2, filter: true }, // RL
        { name: "damperRR",      offset: 2, size: 2, filter: true }, // RR
        { name: "brakePressure", offset: 4, size: 2, filter: true }  // BRK
    ],

    // GPS_POS (float32, Little Endian directly from memcpy)
    "0800": [
        { name: "GPS_Latitude",  offset: 0, size: 4, method: "Float32_LE" }, 
        { name: "GPS_Longitude", offset: 4, size: 4, method: "Float32_LE" }
    ],

    // GPS_SPD (float32, Multiply by 1.852)
    "0801": [
        { name: "GPS_Speed",     offset: 0, size: 4, method: "Float32_LE", multiply: 1.852 } 
    ],

    // MEGASQUIRT (Retained exactly as requested)
    "05F0": [{ name: "rpm", offset: 6, size: 2 }],
    "05F2": [
        { name: "manifoldAirPressure", offset: 2, size: 2, divide: 10 },
        { name: "manifoldAirTemp",     offset: 4, size: 2, divide: 10 },
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
        { name: "veValueTable/bank1",  offset: 2, size: 2, divide: 10 },
        { name: "veValueTable/bank2",  offset: 4, size: 2, divide: 10 }
    ],
    "05F7": [
        { name: "coldAdvance",         offset: 0, size: 2, divide: 10   },
        { name: "rateOfchangeOfTPS",   offset: 2, size: 2, divide: 10, filter: true   },
        { name: "rateOfChangeOfRPM",   offset: 6, size: 2, multiply: 10, filter: true }
    ],
    "061B": [
        { name: "sync-lossCounter",        offset: 0, size: 1 },
        { name: "sync-lossReasonCode",     offset: 1, size: 1 }
    ],
    "0624": [{ name: "averageFuelFlow", offset: 4, size: 2 }],
};

// ==========================================
// 4. THE DECODER V2 CLASS
// ==========================================

export class CANDecoderV2 {
    data: Record<string, any> = {
        "gear": "N", 
        "GPS_Speed": 0.0, 
        "GPS_Latitude": 0.0, 
        "GPS_Longitude": 0.0,
        "accelerationX": 0.0, "accelerationY": 0.0, "accelerationZ": 0.0,
        "gyroX": 0.0, "gyroY": 0.0, "gyroZ": 0.0,
        "LAP_MS": 0,
        "damperLF": 0, "damperRF": 0, "steering": 0,
        "damperLR": 0, "damperRR": 0, "brakePressure": 0,
        "rpm": 0, "manifoldAirPressure": 0, "manifoldAirTemp": 0, "coolantTemp": 0,
        "throttlePosition": 0, "batteryVoltage": 0, "airDensityCorrection": 0,
        "warmupCorrection": 0, "tpsBasedAcceleration": 0, "tpsBasedFuelCut": 0,
        "totalfuelCorrection": 0, "veValueTableBank1": 0, "veValueTableBank2": 0,
        "coldAdvance": 0, "rateOfchangeOfTPS": 0, "rateOfChangeOfRPM": 0,
        "syncLossCounter": 0, "syncLossReasonCode": 0, "averageFuelFlow": 0
    };

    health: Record<string, any> = {
        "FRONT": { drops: 0, failures: 0, queue_free: 0, flags: 0, heartbeat: 0, last_seen: 0 },
        "REAR": { drops: 0, failures: 0, queue_free: 0, flags: 0, heartbeat: 0, last_seen: 0 }
    };

    parse(rawString: string) {
        try {
            const parts = rawString.split(',');
            if (parts.length < 3) return null;

            const timestamp = Number(parts[0]);
            
            const canIdStr = parts[1].trim().replace(/^0x/i, '');
            const canId = parseInt(canIdStr, 16);
            
            const hexData = parts[2].trim();
            const buffer = this.hexToDataView(hexData);
            const byteLen = buffer.byteLength;

            let updated = false;

            // --- CUSTOM SENSORS ---
            if (canId === 0x500 && byteLen >= 6) {
                this.data["damperLF"] = buffer.getUint16(0, false);
                this.data["damperRF"] = buffer.getUint16(2, false);
                this.data["steering"] = buffer.getUint16(4, false);
                updated = true;
            }
            else if (canId === 0x501 && byteLen >= 6) {
                this.data["accelerationX"] = buffer.getInt16(0, false) / 100.0;
                this.data["accelerationY"] = buffer.getInt16(2, false) / 100.0;
                this.data["accelerationZ"] = buffer.getInt16(4, false) / 100.0;
                updated = true;
            }
            else if (canId === 0x502 && byteLen >= 6) {
                this.data["gyroX"] = buffer.getInt16(0, false) / 100.0;
                this.data["gyroY"] = buffer.getInt16(2, false) / 100.0;
                this.data["gyroZ"] = buffer.getInt16(4, false) / 100.0;
                updated = true;
            }
            
            // --- MEGASQUIRT DATA ---
            else if (canId === 0x5F0 && byteLen >= 8) {
                this.data["rpm"] = buffer.getUint16(6, false); 
                updated = true;
            }
            else if (canId === 0x5F2 && byteLen >= 8) {
                this.data["manifoldAirPressure"] = buffer.getUint16(2, false) / 10.0; 
                
                const matF = buffer.getUint16(4, false) / 10.0; 
                this.data["manifoldAirTemp"] = Number(((matF - 32) * 5 / 9).toFixed(1)); 
                
                const cltF = buffer.getUint16(6, false) / 10.0; 
                this.data["coolantTemp"] = Number(((cltF - 32) * 5 / 9).toFixed(1));
                updated = true;
            }
            else if (canId === 0x5F3 && byteLen >= 4) {
                this.data["throttlePosition"] = buffer.getUint16(0, false) / 10.0; 
                this.data["batteryVoltage"] = buffer.getUint16(2, false) / 10.0; 
                updated = true;
            }
            else if (canId === 0x5F4 && byteLen >= 8) {
                this.data["airDensityCorrection"] = buffer.getUint16(6, false) / 10.0; 
                updated = true;
            }
            else if (canId === 0x5F5 && byteLen >= 6) {
                this.data["warmupCorrection"] = buffer.getUint16(0, false) / 10.0; 
                this.data["tpsBasedAcceleration"] = buffer.getUint16(2, false) / 10.0; 
                this.data["tpsBasedFuelCut"] = buffer.getUint16(4, false) / 10.0; 
                updated = true;
            }
            else if (canId === 0x5F6 && byteLen >= 6) {
                this.data["totalfuelCorrection"] = buffer.getUint16(0, false) / 10.0; 
                this.data["veValueTableBank1"] = buffer.getUint16(2, false) / 10.0; 
                this.data["veValueTableBank2"] = buffer.getUint16(4, false) / 10.0; 
                updated = true;
            }
            else if (canId === 0x5F7 && byteLen >= 8) {
                this.data["coldAdvance"] = buffer.getUint16(0, false) / 10.0; 
                this.data["rateOfchangeOfTPS"] = buffer.getUint16(2, false) / 10.0; 
                this.data["rateOfChangeOfRPM"] = buffer.getUint16(6, false) * 10.0; 
                updated = true;
            }
            else if (canId === 0x61B && byteLen >= 2) {
                this.data["syncLossCounter"] = buffer.getUint8(0); 
                this.data["syncLossReasonCode"] = buffer.getUint8(1); 
                updated = true;
            }
            else if (canId === 0x624 && byteLen >= 6) {
                this.data["averageFuelFlow"] = buffer.getUint16(4, false); 
                updated = true;
            }

            // --- REAR MODULE & GPS ---
            else if (canId === 0x700 && byteLen >= 1) {
                const g = buffer.getUint8(0);
                this.data["gear"] = g === 0 ? "N" : g.toString();
                updated = true;
            }
            else if (canId === 0x701 && byteLen >= 6) {
                this.data["damperLR"] = buffer.getUint16(0, false);
                this.data["damperRR"] = buffer.getUint16(2, false);
                this.data["brakePressure"] = buffer.getUint16(4, false);
                updated = true;
            }
            else if (canId === 0x800 && byteLen >= 8) {
                this.data["GPS_Latitude"] = buffer.getFloat32(0, true);
                this.data["GPS_Longitude"] = buffer.getFloat32(4, true);
                updated = true;
            }
            else if (canId === 0x801 && byteLen >= 4) {
                this.data["GPS_Speed"] = buffer.getFloat32(0, true) * 1.852;
                updated = true;
            }
            else if (canId === 0x777 && byteLen >= 4) {
                this.data["LAP_MS"] = buffer.getUint32(0, false);
                updated = true;
            }
            
            // --- SYSTEM HEALTH ---
            else if (canId === 0x7FF && byteLen >= 8) {
                const node = buffer.getUint8(0);
                const module = node === 1 ? "FRONT" : node === 2 ? "REAR" : null;
                
                if (module) {
                    this.health[module].flags = buffer.getUint8(1);
                    this.health[module].drops = buffer.getUint16(2, false);
                    this.health[module].failures = buffer.getUint16(4, false);
                    this.health[module].queue_free = buffer.getUint8(6);
                    this.health[module].heartbeat = buffer.getUint8(7);
                    this.health[module].last_seen = Date.now();
                    updated = true;
                }
            }

            if (updated) {
                return { 
                    timestamp, 
                    canId: canId.toString(16).toUpperCase().padStart(4, '0'), 
                    ...this.data, 
                    health: this.health 
                };
            }

            return null;

        } catch (e) {
            return null;
        }
    }

    private hexToDataView(hex: string): DataView {
        hex = hex.replace(/\s+/g, '');
        if (hex.length % 2 !== 0) hex = "0" + hex;
        
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        
        return new DataView(bytes.buffer);
    }
}