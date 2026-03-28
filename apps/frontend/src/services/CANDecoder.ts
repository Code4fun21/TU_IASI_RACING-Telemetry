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
        
        // Wait until car is stopped to collect 50 samples
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
            console.log(`Decoder: Static Tilt Calibrated. Pitch: ${this.pitch.toFixed(3)}, Roll: ${this.roll.toFixed(3)}`);
        }
    }

    rotate(x: number, y: number, z: number): [number, number, number] {
        // Output inverted raw data until calibration finishes
        if (!this.isCalibrated) return [x * -1, y * -1, z]; 

        const cosP = Math.cos(this.pitch); const sinP = Math.sin(this.pitch);
        const cosR = Math.cos(this.roll);  const sinR = Math.sin(this.roll);

        let x_leveled = x * cosP - z * sinP;
        let z_temp    = x * sinP + z * cosP;
        let y_leveled = y * cosR - z_temp * sinR;
        let z_final   = y * sinR + z_temp * cosR;

        // Invert X and Y just like the Dashboard
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
// 3. CONFIGURATION & DATABASE
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
    filter?: boolean; // Set this to true in DB to enable Kalman
}

const CAN_DATABASE: Record<string, SignalConfig[]> = {
    // SENSORS
    "0115": [
        { name: "damperLR",      offset: 0, size: 2, method: "Method1", filter: true },
        { name: "damperRR",      offset: 2, size: 2, method: "Method1", filter: true },
        { name: "gear",          offset: 4, size: 1 }, 
        { name: "brakePressure", offset: 5, size: 2, method: "Method1", filter: true },
        { name: "bspd",          offset: 7, size: 1 }
    ],
    "0116": [
        { name: "damperLF",      offset: 0, size: 2, method: "Method1", filter: true },
        { name: "damperRF",      offset: 2, size: 2, method: "Method1", filter: true },
        { name: "steering",      offset: 4, size: 2, method: "Method1", filter: true }
    ],
    "0117": [
        { name: "GPS_Latitude",  offset: 0, size: 3, method: "Method2_Lat" }, 
        { name: "GPS_Longitude", offset: 3, size: 3, method: "Method2_Lon" },
        { name: "GPS_Speed",     offset: 6, size: 1, multiply: 1 } 
    ],
   "0118": [
    { name: "accelerationX", offset: 0, size: 2, method: "Method_IMU_Acc", isSigned: true },
    { name: "accelerationY", offset: 2, size: 2, method: "Method_IMU_Acc", isSigned: true },
    { name: "accelerationZ", offset: 4, size: 2, method: "Method_IMU_Acc", isSigned: true }
],
"0119": [
    { name: "gyroX", offset: 0, size: 2, method: "Method_IMU_Gyro", isSigned: true },
    { name: "gyroY", offset: 2, size: 2, method: "Method_IMU_Gyro", isSigned: true },
    { name: "gyroZ", offset: 4, size: 2, method: "Method_IMU_Gyro", isSigned: true }
],

    // MEGASQUIRT
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
// 4. THE DECODER CLASS
// ==========================================

export class CANDecoder {
    // Dynamic Filter Storage
    filtersLPF: Record<string, LowPassFilter> = {};
    filtersKalman: Record<string, KalmanFilter2D> = {};

    calibrator = new StaticCalibrator();
    lastAccel = [0, 0, 0];
    lastGyro = [0, 0, 0];
    lastImuTime = 0;

    ACCEL_SENS: number;
    GYRO_SENS: number;
    
    // GPS State
    mainCoords: [number, number]; 
    prevPos: GPSPoint | null = null;
    currPos: GPSPoint | null = null;

    // IMU Bias
    imuBiasSamples: number;
    imuBuffer: Record<string, number[]>;
    imuBias: Record<string, number>;
    
    // Lap Tracking
    gateCheckers: Record<string, GPS_Intersection> = {};
    currentLap: Record<string, number | boolean | number> = {};
    lapsHistory: any[] = [];
    trackLen: number = 0;
    gateIdx: number = 0;
    justS0: boolean = false;
    lapCount: number = 0;

    constructor() {
        this.ACCEL_SENS = 16384.0; 
        this.GYRO_SENS  = 131.0;   
        this.mainCoords = [0, 0];

        this.imuBiasSamples = 25; 
        this.imuBuffer = {
            accelerationX: [], accelerationY: [], accelerationZ: [],
            gyroX: [], gyroY: [], gyroZ: []
        };
        this.imuBias = {};
        
        // No manual filter initialization needed here anymore.
        // They are created on-the-fly in applyKalman().
    }

    async setBaseCoordinates(trackData: any) {
        if (!trackData) {
            console.warn("No trackData provided to setBaseCoordinates");
            return;
        }

        // 1. Handle Pre-parsed Gates (Array/Object from Dashboard)
        if (trackData.gates && typeof trackData.gates === 'object') {
            this.initializeGates(trackData.gates);
        } 
        // 2. Handle Gates URL String (Fallback)
        else if (typeof trackData.gates === 'string') {
            try {
                const data = await api.fetchJsonFile(trackData.gates);
                this.initializeGates(data);
            } catch (err) {
                console.warn("Failed to download Gates file:", err);
            }
        }
    }

    // Helper to actually build the gate objects
    initializeGates(data: any) {
        if (!Array.isArray(data) || data.length === 0) {
            console.warn("Gates data is empty or invalid.");
            return;
        }

        const lat = Math.floor(Number(data[0].lat1)); 
        const lon = Math.floor(Number(data[0].lon1));

        this.mainCoords = [lat, lon];
        this.gateCheckers = {}; // Clear old gates

        data.forEach((g: any) => {
            if (g.lat1 == null || g.lon1 == null || g.lat2 == null || g.lon2 == null) return;

            const gL = new GPSPoint(Number(g.lat1), Number(g.lon1), 0, 0);
            const gR = new GPSPoint(Number(g.lat2), Number(g.lon2), 0, 0);
            
            const gateName = g.name || `Gate_${Math.random().toString(36).substr(2, 5)}`;
            this.gateCheckers[gateName] = new GPS_Intersection(gL, gR);
        });

        console.log(`Decoder Initialized: Base [${lat}, ${lon}], Gates: ${Object.keys(this.gateCheckers).length}`);
    }

    parse(rawString: string) {
        try {
            const parts = rawString.split(',');
            if (parts.length < 3) return null;

            const timestamp = Number(parts[0]);
            let canId = parts[1].trim().replace(/^0x/i, '').toUpperCase();
            if (canId.length < 4) canId = canId.padStart(4, "0");

            const payloadHex = parts[2].trim();
            const signals = CAN_DATABASE[canId];

            if (!signals) return null;

            const buffer = this.hexToDataView(payloadHex);
            const decodedValues: Record<string, number> = {};

            for (const sig of signals) {
                const rawVal = this.readBytes(buffer, sig.offset, sig.size, sig.isSigned);
                let finalVal = rawVal;

                if (sig.method) {
                    switch (sig.method) {
                        case "Convert_Temp":
                            const tempInF = rawVal / (sig.divide || 1); 
                            finalVal = (tempInF - 32) * 5 / 9;
                            break;
                        case "Method1": 
                            const low = rawVal & 0xFF;
                            const high = (rawVal >> 8) & 0xFF;
                            finalVal = low + (high * 100);
                            break;
                        case "Method2_Lat":
                            finalVal = this.convertMethod2(rawVal, 0);
                            break;
                        case "Method2_Lon":
                            finalVal = this.convertMethod2(rawVal, 1);
                            break;
                        case "Method_IMU_Acc":
                            let baseAcc = (rawVal / this.ACCEL_SENS); 
                            baseAcc = this.handleImuBias(sig.name, baseAcc);
                            decodedValues[sig.name + "_RAW"] = Number(baseAcc);
                            break;

                        case "Method_IMU_Gyro":
                            let baseGyro = (rawVal / this.GYRO_SENS) * (Math.PI / 180.0);
                            baseGyro = this.handleImuBias(sig.name, baseGyro);
                            decodedValues[sig.name + "_RAW"] = Number(baseGyro);
                            break;
                    }
                } else {
                    const mult = sig.multiply ?? 1;
                    const div = sig.divide ?? 1;
                    const add = sig.add ?? 0;
                    finalVal = (rawVal * mult / div) + add;
                    
                    // GENERIC FILTER CHECK
                    if (sig.filter === true) {
                        finalVal = this.applyKalman(sig.name, finalVal, timestamp);
                    }
                }

                decodedValues[sig.name] = Number(finalVal.toFixed(6));
            }

            if (canId === "0118") {
                this.lastAccel = [
                    decodedValues["accelerationX_RAW"] !== undefined ? decodedValues["accelerationX_RAW"] : this.lastAccel[0],
                    decodedValues["accelerationY_RAW"] !== undefined ? decodedValues["accelerationY_RAW"] : this.lastAccel[1],
                    decodedValues["accelerationZ_RAW"] !== undefined ? decodedValues["accelerationZ_RAW"] : this.lastAccel[2]
                ];

                const currentSpeed = this.currPos ? this.currPos.speed : 0;
                
                // 1. Update Calibration (Only runs when speed < 1.0)
                this.calibrator.update(this.lastAccel[0], this.lastAccel[1], currentSpeed);

                // 2. Rotate the Raw Data
                const [rx, ry, rz] = this.calibrator.rotate(this.lastAccel[0], this.lastAccel[1], this.lastAccel[2]);

                // 3. Apply Kalman Filter to the Leveled Data
                decodedValues["accelerationX_rotated"] = Number(this.applyKalman("accX_leveled", rx, timestamp).toFixed(6));
                decodedValues["accelerationY_rotated"] = Number(this.applyKalman("accY_leveled", ry, timestamp).toFixed(6));
                decodedValues["accelerationZ_rotated"] = Number(this.applyKalman("accZ_leveled", rz, timestamp).toFixed(6));

            } else if (canId === "0119") {
                this.lastGyro = [
                    decodedValues["gyroX_RAW"] !== undefined ? decodedValues["gyroX_RAW"] : this.lastGyro[0],
                    decodedValues["gyroY_RAW"] !== undefined ? decodedValues["gyroY_RAW"] : this.lastGyro[1],
                    decodedValues["gyroZ_RAW"] !== undefined ? decodedValues["gyroZ_RAW"] : this.lastGyro[2]
                ];

                // 1. Rotate the Gyro Data (Uses the same pitch/roll from the Accel calibration)
                const [rx, ry, rz] = this.calibrator.rotate(this.lastGyro[0], this.lastGyro[1], this.lastGyro[2]);

                // 2. Apply Kalman Filter to the Leveled Gyro Data
                decodedValues["gyroX_rotated"] = Number(this.applyKalman("gyroX_leveled", rx, timestamp).toFixed(6));
                decodedValues["gyroY_rotated"] = Number(this.applyKalman("gyroY_leveled", ry, timestamp).toFixed(6));
                decodedValues["gyroZ_rotated"] = Number(this.applyKalman("gyroZ_leveled", rz, timestamp).toFixed(6));
            }

            // --- GPS POSITION & LAP TRACKING ---
            if (decodedValues["GPS_Latitude"] && decodedValues["GPS_Longitude"]) {
                const lat = decodedValues["GPS_Latitude"];
                const lon = decodedValues["GPS_Longitude"];
                const speed = decodedValues["GPS_Speed"] || 0;
                
                this.currPos = new GPSPoint(lat, lon, timestamp, speed);
                
                if (this.prevPos) {
                    this.checkCross(timestamp, this.currPos);
                }
                
                this.prevPos = this.currPos;
            }
            decodedValues["Distance"] = this.trackLen;



            return { timestamp, canId, ...decodedValues, Distance: this.trackLen };

        } catch (e) {
            return null;
        }
    }

    // --- ALGORITHMS ---

    convertMethod2(rawValue: number, index: number): number {
        if (rawValue === 0) return 0;
        const strVal = rawValue.toString();
        const divisor = Math.pow(10, strVal.length);
        const decimalPart = rawValue / divisor;
        return this.mainCoords[index] + decimalPart;
    }

    handleImuBias(name: string, val: number): number {
        // 1. If bias is already calculated, use it
        if (this.imuBias[name] !== undefined) {
            return val - this.imuBias[name];
        }

        // 2. SAFETY CHECK: Only calibrate if car is stopped!
        // We use the last known speed. If speed is missing/null, assume stopped (0).
        const speed = this.currPos ? this.currPos.speed : 0;
        
        if (speed > 5.0) {
            // Car is moving, DO NOT collect samples. Return raw value.
            return val; 
        }

        // 3. Collect samples (only when stopped)
        if (!this.imuBuffer[name]) this.imuBuffer[name] = [];
        
        if (this.imuBuffer[name].length < this.imuBiasSamples) {
            this.imuBuffer[name].push(val);
            return val; 
        } else if (this.imuBuffer[name].length === this.imuBiasSamples) {
        const sum = this.imuBuffer[name].reduce((a, b) => a + b, 0);
        this.imuBias[name] = sum / this.imuBiasSamples;
        
        // FIX: Subtract 1.0 from Y, because Y is pointing at the ground
        if (name.includes("accelerationZ")) {
            this.imuBias[name] -= 1.0; 
        }
        
        return val - this.imuBias[name];
    }
        return val;
    }
    // --- NEW: LAZY LOADING APPLY KALMAN ---
    applyKalman(name: string, val: number, timestamp: number): number {
        // If filter doesn't exist, create it on-the-fly
        if (!this.filtersKalman[name]) {
            console.log(`Decoder: Initializing new Kalman Filter for '${name}'`);

            // Default Tuning
            // IMU data usually needs high process noise (1e-3) and moderate sensor noise (1e-1)
            let Q: [[number, number], [number, number]] = [[1e-3, 0], [0, 1e-2]];
            let R = 0.5; // Generic default
            
            // Auto-detect IMU signals for specific tuning
            if (name.toLowerCase().includes("acc") || name.toLowerCase().includes("gyro")) {
                R = 0.1; // More trust in sensor for IMU
            }

            this.filtersKalman[name] = new KalmanFilter2D(Q, R);
        }

        return this.filtersKalman[name].filter(val, timestamp);
    }

    applyLPF(name: string, val: number): number {
        if (!this.filtersLPF[name]) {
            this.filtersLPF[name] = new LowPassFilter(0.15); // Alpha 0.15 = Smooth charts
        }
        return this.filtersLPF[name].filter(val);
    } 


    // --- LAP LOGIC ---
checkCross(time: number, curr: GPSPoint) {
    if (!this.prevPos) return;
    const prev = this.prevPos;
    const dist = this.haversine(prev.lat, prev.lon, curr.lat, curr.lon);

    // 1. Check Turn Gates FIRST 
    // This ensures Turn data is in the object BEFORE S0 archives the lap.
    Object.keys(this.gateCheckers).forEach(gateName => {
        if (gateName.startsWith("T")) {
            // Only check if we haven't already crossed this specific turn gate this lap
            if (!this.currentLap[gateName]) {
                const turnGate = this.gateCheckers[gateName];
                turnGate.update_points(prev, curr);

                if (turnGate.get_intersection_time()) {
                    const tTurn = turnGate.get_time();
                    if (tTurn) {
                        this.currentLap[gateName] = tTurn;
                        console.log(`Crossed Turn Gate: ${gateName} at ${tTurn}`);
                    }
                }
            }
        }
    });

    // 2. Check S0 (Start/Finish Line)
    if (this.gateCheckers["S0"]) {
        const s0 = this.gateCheckers["S0"];
        s0.update_points(prev, curr);
        
        if (s0.get_intersection_time()) {
            const t0 = s0.get_time();
            
            // Lap Complete Logic
            if (this.currentLap["S2"] && t0 && t0 > Number(this.currentLap["S2"])) {
                this.currentLap["S3"] = t0; 
                this.currentLap["complete"] = true;
                this.currentLap["dist"] = this.trackLen;
                this.currentLap["ts"] = t0; 
                this.currentLap["lap"] = this.lapCount; 

                // All turns caught in Step 1 are now safely pushed into history
                this.lapsHistory.push({ ...this.currentLap });
                console.log(`Lap ${this.lapCount} Complete:`, this.currentLap);
                
                this.lapCount++;
                this.currentLap = { "S0": t0 }; // Reset for next lap
                this.trackLen = 0;
                this.gateIdx = 1;
                this.justS0 = true;
            } 
            // Session Start Logic
            else if (t0 && !this.currentLap["S0"]) {
                this.lapCount = 1;
                this.currentLap = { "S0": t0 };
                this.trackLen = 0;
                this.gateIdx = 1;
                this.justS0 = true;
                console.log("Session Started at S0");
            }
        }
    }

    // 3. Check Sectors (S1, S2)
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
                    console.log(`Crossed ${targetGate}`);
                    this.gateIdx++;
                }
            }
        }
    }

    // 4. Accumulate Distance and Update State
    // Consolidated the logic to prevent double distance accumulation
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

    // --- HELPERS ---

    hexToDataView(hex: string): DataView {
        hex = hex.replace(/\s+/g, '');
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