// ==========================================
// 1. CONFIGURATION TYPES
// ==========================================

interface SignalConfig {
  name: string;
  offset: number;
  size: number;
  // Standard Math
  multiply?: number;
  divide?: number;
  add?: number;
  isSigned?: boolean;
  // Custom Logic (Optional)
  method?: "Method1" | "Method2" | "DecimalGPS"; 
}

// ==========================================
// 2. CUSTOM ALGORITHMS (Implement your Math Here!)
// ==========================================

const CUSTOM_ALGORITHMS = {
  /**
   * Method 1: Used for Suspension/Damper pots?
   * Example: Maybe converts 0-5V (0-4096) to mm of travel?
   */
  Method1: (rawValue: number) => {
    // TODO: REPLACE THIS WITH YOUR FORMULA
    // Example: return (rawValue * 0.5) - 100;
    return rawValue; 
  },

  /**
   * Method 2: Used for GPS Latitude/Longitude (3 bytes)
   * A 3-byte integer usually needs scaling to become degrees.
   */
  Method2: (rawValue: number) => {
    // TODO: CHECK YOUR DOCS. 
    // Example: 3 bytes = 24 bits. Maybe divide by 10,000 or 60,000?
    // This is a placeholder guess:
    return rawValue / 100000.0;
  },

  /**
   * Decimal Conversion: Used for GPS Speed
   */
  DecimalGPS: (rawValue: number) => {
    // Example: Raw 105 -> 10.5 km/h
    return rawValue / 10.0; 
  }
};

// ==========================================
// 3. THE DATABASE (Updated with Methods)
// ==========================================

const CAN_DATABASE: Record<string, SignalConfig[]> = {
  // Standard IDs (Linear Math)
  "05F0": [{ name: "rpm", offset: 6, size: 2, multiply: 1, divide: 1 }],
  "05F2": [
    { name: "manifoldAirPressure", offset: 2, size: 2, divide: 10 },
    { name: "manifoldAirTemp",     offset: 4, size: 2, divide: 10 },
    { name: "coolantTemp",         offset: 6, size: 2, divide: 10 }
  ],
  "05F3": [
    { name: "throttlePosition", offset: 0, size: 2, divide: 10 },
    { name: "batteryVoltage",   offset: 2, size: 2, divide: 10 }
  ],
  "05F4": [{ name: "airDensityCorrection", offset: 6, size: 2, divide: 10 }],
  "05F5": [
    { name: "warmupCorrection",     offset: 0, size: 2, divide: 10 },
    { name: "tpsBasedAcceleration", offset: 2, size: 2, divide: 10 },
    { name: "tpsBasedFuelCut",      offset: 4, size: 2, divide: 10 }
  ],
  "05F6": [
    { name: "totalFuelCorrection", offset: 0, size: 2, divide: 10 },
    { name: "veBank1",             offset: 2, size: 2, divide: 10 },
    { name: "veBank2",             offset: 4, size: 2, divide: 10 }
  ],
  "05F7": [
    { name: "coldAdvance",   offset: 0, size: 2, divide: 10 },
    { name: "tpsRateChange", offset: 2, size: 2, divide: 10 },
    { name: "rpmRateChange", offset: 6, size: 2, multiply: 10 }
  ],
  "061B": [
    { name: "syncLossCounter",    offset: 0, size: 1 },
    { name: "syncLossReason",     offset: 1, size: 1 }
  ],
  "0624": [{ name: "fuelFlow", offset: 4, size: 2 }],

  // --- COMPLEX IDS (Using Custom Methods) ---
  
  // ID 115 (0x0073) - Steering, Brake, Gear
  "0073": [ 
    { name: "steering",      offset: 0, size: 2, method: "Method1" }, // Row 26
    { name: "brakePressure", offset: 2, size: 2, method: "Method1" }, // Row 27
    { name: "gear",          offset: 6, size: 1 }                     // Row 28 (Standard)
  ],

  // ID 116 (0x0074) - GPS
  "0074": [
    { name: "GPS_Latitude",  offset: 0, size: 3, method: "Method2" },    // Row 29
    { name: "GPS_Longitude", offset: 3, size: 3, method: "Method2" },    // Row 30
    { name: "GPS_Speed",     offset: 6, size: 1, method: "Method2" }  // Row 31
  ],

  // ID 112 (0x0070) - Dampers
  "0070": [
    { name: "damperLR", offset: 0, size: 2, method: "Method1" }, // Row 32
    { name: "damperRR", offset: 2, size: 2, method: "Method1" }, // Row 33
    { name: "damperLF", offset: 4, size: 2, method: "Method1" }, // Row 34
    { name: "damperRF", offset: 6, size: 2, method: "Method1" }  // Row 35
  ]
};

// ==========================================
// 4. THE DECODER ENGINE
// ==========================================

export const Decoder = {
  parse: (rawString: string) => {
    try {
      const parts = rawString.split(',');
      if (parts.length < 3) return null;

      const timestamp = Number(parts[0]);
      let canId = parts[1].trim().replace(/^0x/i, '').toUpperCase();
      
      // Ensure ID is padded to match keys (e.g. "70" -> "0070" or "05F0")
      // Adjust padding logic based on your specific ID length standard
      if (canId.length < 4) canId = canId.padStart(4, "0");

      const payloadHex = parts[2].trim();
      const signals = CAN_DATABASE[canId];
      if (!signals) return null;

      const buffer = hexToDataView(payloadHex);
      const decodedValues: Record<string, number> = {};

      for (const sig of signals) {
        // 1. Read Raw Bytes
        const rawVal = readBytes(buffer, sig.offset, sig.size, sig.isSigned);
        
        // 2. Apply Custom Method OR Standard Math
        if (sig.method && CUSTOM_ALGORITHMS[sig.method]) {
            decodedValues[sig.name] = CUSTOM_ALGORITHMS[sig.method](rawVal);
        } else {
            // Standard Linear: (Raw * Mult / Div) + Add
            const mult = sig.multiply ?? 1;
            const div = sig.divide ?? 1;
            const add = sig.add ?? 0;
            const finalVal = (rawVal * mult / div) + add;
            decodedValues[sig.name] = Number(finalVal.toFixed(3));
        }
      }

      return { timestamp, canId, ...decodedValues };

    } catch (e) {
      console.error("Decode Error:", e);
      return null;
    }
  }
};

// --- HELPER FUNCTIONS ---

function hexToDataView(hex: string): DataView {
  hex = hex.replace(/\s+/g, '');
  // Safety: ensure even length
  if (hex.length % 2 !== 0) hex = "0" + hex;
  
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    // OLD: parseInt(hex.substr(i * 2, 2), 16);
    // NEW: Use slice(start, end)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new DataView(bytes.buffer);
}

function readBytes(view: DataView, offset: number, size: number, isSigned: boolean = false): number {
  if (offset + size > view.byteLength) return 0;

  try {
    switch (size) {
      case 1: return isSigned ? view.getInt8(offset) : view.getUint8(offset);
      case 2: return isSigned ? view.getInt16(offset, false) : view.getUint16(offset, false);
      case 3: // 24-bit Integer (Custom)
        // Read 3 bytes. We assume Big Endian: Byte0 << 16 | Byte1 << 8 | Byte2
        const b0 = view.getUint8(offset);
        const b1 = view.getUint8(offset + 1);
        const b2 = view.getUint8(offset + 2);
        return (b0 << 16) | (b1 << 8) | b2;
      case 4: return isSigned ? view.getInt32(offset, false) : view.getUint32(offset, false);
      default: return 0;
    }
  } catch (e) {
    return 0;
  }
}