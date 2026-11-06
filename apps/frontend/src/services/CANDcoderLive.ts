import { api } from "../services/api";

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

const CAN_DATABASE: Record<string, SignalConfig[]> = {
    "0500": [
        { name: "damperLF",      offset: 0, size: 2},
        { name: "damperRF",      offset: 2, size: 2},
        { name: "steering",      offset: 4, size: 2}
    ],
    
    "0501": [
        { name: "accelerationX", offset: 0, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100 },
        { name: "accelerationY", offset: 2, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100 },
        { name: "accelerationZ", offset: 4, size: 2, method: "Method_IMU_Acc", isSigned: true, divide: 100 }
    ],

    "0502": [
        { name: "gyroX",         offset: 0, size: 2, isSigned: true, divide: 100 },
        { name: "gyroY",         offset: 2, size: 2, isSigned: true, divide: 100 },
        { name: "gyroZ",         offset: 4, size: 2, isSigned: true, divide: 100 }
    ],

    "0700": [
        { name: "gear",          offset: 0, size: 1, method: "Method_Gear" }
    ],

    "0701": [
        { name: "damperLR",      offset: 0, size: 2},
        { name: "damperRR",      offset: 2, size: 2},
        { name: "brakePressure", offset: 4, size: 2}
    ],

    "0750": [
        { name: "GPS_Latitude",  offset: 0, size: 4, method: "Float32_LE" }, 
        { name: "GPS_Longitude", offset: 4, size: 4, method: "Float32_LE" }
    ],

    "0751": [
        { name: "GPS_Speed",     offset: 0, size: 4, method: "Float32_LE" } 
    ],

    "0777": [
        { name: "LAP_MS",        offset: 0, size: 4 } 
    ],

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
        { name: "rateOfchangeOfTPS",   offset: 2, size: 2, divide: 10 },
        { name: "rateOfChangeOfRPM",   offset: 6, size: 2, multiply: 10}
    ],
    "061B": [
        { name: "syncLossCounter",     offset: 0, size: 1 },
        { name: "syncLossReasonCode",  offset: 1, size: 1 }
    ],
    "0624": [{ name: "averageFuelFlow", offset: 4, size: 2 }],
};

export class CANDecoderLive {
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

    // 🚀 THE FIX: State Cache to bridge frequency gaps
    latestState: Record<string, any> = {}; 

    constructor() {
        this.mainCoords = [0, 0];
    }

    async setBaseCoordinates(trackData: any) {
        if (!trackData) return;
        if (trackData.gates && typeof trackData.gates === 'object') {
            this.initializeGates(trackData.gates);
        } else if (typeof trackData.gates === 'string') {
            try {
                const data = await api.fetchJsonFile(trackData.gates);
                this.initializeGates(data);
            } catch (err) {}
        }
    }

    initializeGates(data: any) {
        if (!Array.isArray(data) || data.length === 0) return;
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
            
            const canIdStr = parts[1].trim();
            const cleanIdStr = canIdStr.replace(/^0x/i, '').replace(/[^0-9A-Fa-f]/g, '');
            const canIdInt = parseInt(cleanIdStr, 16); 
            
            const payloadHex = parts[2].trim().replace(/[^0-9A-Fa-f]/g, '');
            const buffer = this.hexToDataView(payloadHex);
            const decodedValues: Record<string, any> = {};

           if (canIdInt === 0x0500) { 
                const adcLF = buffer.byteLength >= 2 ? buffer.getUint16(0, false) : 0;
                const adcRF = buffer.byteLength >= 4 ? buffer.getUint16(2, false) : 0;
                const adcStr = buffer.byteLength >= 6 ? buffer.getUint16(4, false) : 0;

                decodedValues["damperLF_RAW"] = adcLF;
                decodedValues["damperRF_RAW"] = adcRF;
                
                if (buffer.byteLength >= 6) {
                    decodedValues["steering"] = adcStr;
                }

                decodedValues["damperLF"] = Number((
                    (-7.430249176415e-15) * Math.pow(adcLF, 4) + 
                    (7.651688555578e-11) * Math.pow(adcLF, 3) + 
                    (-2.495514301462e-07) * Math.pow(adcLF, 2) + 
                    (-1.529198785943e-03) * adcLF + 
                    7.301809527430
                ).toFixed(6));

                decodedValues["damperRF"] = Number((
                    (-7.430249176415e-15) * Math.pow(adcRF, 4) + 
                    (7.651688555578e-11) * Math.pow(adcRF, 3) + 
                    (-2.495514301462e-07) * Math.pow(adcRF, 2) + 
                    (-1.529198785943e-03) * adcRF + 
                    7.301809527430
                ).toFixed(6));

                Object.assign(this.latestState, decodedValues);
                return { timestamp, canId: cleanIdStr, ...this.latestState };
            }

            else if (canIdInt === 0x0701) { 
                const adcLR = buffer.byteLength >= 2 ? buffer.getUint16(0, false) : 0;
                const adcRR = buffer.byteLength >= 4 ? buffer.getUint16(2, false) : 0;
                const adcBrk = buffer.byteLength >= 6 ? buffer.getUint16(4, false) : 0;

                decodedValues["damperLR_RAW"] = adcLR;
                decodedValues["damperRR_RAW"] = adcRR;
                decodedValues["brakePressure_RAW"] = adcBrk;

                decodedValues["damperLR"] = Number((
                    (-7.430249176415e-15) * Math.pow(adcLR, 4) + 
                    (7.651688555578e-11) * Math.pow(adcLR, 3) + 
                    (-2.495514301462e-07) * Math.pow(adcLR, 2) + 
                    (-1.529198785943e-03) * adcLR + 
                    7.301809527430
                ).toFixed(6));

                decodedValues["damperRR"] = Number((
                    (-7.430249176415e-15) * Math.pow(adcRR, 4) + 
                    (7.651688555578e-11) * Math.pow(adcRR, 3) + 
                    (-2.495514301462e-07) * Math.pow(adcRR, 2) + 
                    (-1.529198785943e-03) * adcRR + 
                    7.301809527430
                ).toFixed(6));

                if (buffer.byteLength >= 6) {
                    const ADC_REST = 250; 
                    const ADC_MAX = 2000; 
                    const m = 100.0 / (ADC_MAX - ADC_REST);
                    const c = -m * ADC_REST;
                    
                    let brakePercent = (m * adcBrk) + c;
                    brakePercent = Math.max(0, Math.min(100, brakePercent)); 
                    decodedValues["brakePressure"] = Number(brakePercent.toFixed(2));
                } else {
                    decodedValues["brakePressure"] = 0;
                }

                Object.assign(this.latestState, decodedValues);
                return { timestamp, canId: cleanIdStr, ...this.latestState };
            }

            // 🚀 FAST PATH FOR HIGH FREQUENCY DATA
            else if (canIdInt === 0x0501) { // ACCEL
                decodedValues["accelerationX"] = (buffer.byteLength >= 2 ? buffer.getInt16(0, false) : 0) / 100.0;
                decodedValues["accelerationY"] = (buffer.byteLength >= 4 ? buffer.getInt16(2, false) : 0) / 100.0;
                decodedValues["accelerationZ"] = (buffer.byteLength >= 6 ? buffer.getInt16(4, false) : 0) / 100.0;
                decodedValues["accelerationX_RAW"] = decodedValues["accelerationX"];
                decodedValues["accelerationY_RAW"] = decodedValues["accelerationY"];
                decodedValues["accelerationZ_RAW"] = decodedValues["accelerationZ"];
            }
            else if (canIdInt === 0x0502) { // GYRO
                decodedValues["gyroX"] = (buffer.byteLength >= 2 ? buffer.getInt16(0, false) : 0) / 100.0;
                decodedValues["gyroY"] = (buffer.byteLength >= 4 ? buffer.getInt16(2, false) : 0) / 100.0;
                decodedValues["gyroZ"] = (buffer.byteLength >= 6 ? buffer.getInt16(4, false) : 0) / 100.0;
            }
            else if (canIdInt === 0x0700) { // GEAR
                const gear = buffer.byteLength >= 1 ? buffer.getUint8(0) : 0;
                decodedValues["gear"] = gear === 0 ? "N" : gear.toString();
            }
            else if (canIdInt === 0x0800) { // GPS POS
                const lat = buffer.byteLength >= 4 ? buffer.getFloat32(0, true) : 0;
                const lon = buffer.byteLength >= 8 ? buffer.getFloat32(4, true) : 0;
                decodedValues["GPS_Latitude"] = lat;
                decodedValues["GPS_Longitude"] = lon;
                
                const speed = this.currPos ? this.currPos.speed : 0;
                this.currPos = new GPSPoint(lat, lon, timestamp, speed);
                if (this.prevPos) this.checkCross(timestamp, this.currPos);
                
                this.prevPos = this.currPos;
            }
            else if (canIdInt === 0x0801) { // GPS SPD
                const spd = buffer.byteLength >= 4 ? buffer.getFloat32(0, true) : 0;
                decodedValues["GPS_Speed"] = spd;
                if (this.currPos) this.currPos.speed = spd;
            }
            else if (canIdInt === 0x0900) { // LAP
                decodedValues["LAP_MS"] = buffer.byteLength >= 4 ? buffer.getUint32(0, false) : 0;
            }
            else {
                // FALLBACK TO DYNAMIC DATABASE PARSER
                const formattedId = cleanIdStr.padStart(4, "0").toUpperCase();
                const signals = CAN_DATABASE[formattedId];
                if (signals) {
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
                                    finalVal = rawVal / (sig.divide || 100.0); 
                                    decodedValues[sig.name + "_RAW"] = Number(finalVal);
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
                }
            }

            // 🚀 THE MAGIC TRICK: Inject all latest known values into every packet
            Object.assign(this.latestState, decodedValues);
            this.latestState.Distance = this.trackLen;

            return { timestamp, canId: cleanIdStr, ...this.latestState };

        } catch (e) {
            return null;
        }
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
        const cleanHex = hex.replace(/[^0-9A-Fa-f]/g, '');
        const hexLen = cleanHex.length;
        const bytes = new Uint8Array(hexLen / 2);
        for (let i = 0, j = 0; i < hexLen; i += 2, j++) {
            bytes[j] = parseInt(cleanHex.substring(i, i + 2), 16);
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