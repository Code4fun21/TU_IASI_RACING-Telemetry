/**
 * Bundled synthetic telemetry presets and interactive training missions.
 */

export function generatePresetDataset(presetId) {
    const fs = 50; // 50 Hz uniform sample rate
    const dtMs = 1000 / fs;
    const baseTime = 1730000000000;

    // Seeded deterministic pseudo-random helper
    let seed = 42;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return (seed / 4294967296) * 2 - 1;
    };

    if (presetId === "skidpad") {
        // 40-second figure-8 skidpad: stationary baseline -> right circle -> left circle
        const durationSec = 40;
        const n = durationSec * fs;
        const rows = [];

        for (let i = 0; i < n; i++) {
            const tSec = i / fs;
            const ts = baseTime + i * dtMs;
            let latG = 0;
            let longG = 0;
            let speed = 0;
            let rpm = 1200;

            if (tSec >= 4 && tSec < 20) {
                const ramp = Math.min(1, (tSec - 4) / 2.5);
                latG = 1.35 * ramp;
                longG = tSec < 6.5 ? 0.45 : 0.02;
                speed = 54 * ramp;
                rpm = 1200 + 5800 * ramp;
            } else if (tSec >= 20 && tSec < 36) {
                const ramp = Math.min(1, (tSec - 20) / 2.0);
                latG = -1.32 * ramp;
                longG = 0.01;
                speed = 53 * ramp;
                rpm = 6900;
            }

            rows.push({
                timestamp: ts,
                GPS_Speed: Math.max(0, speed + rand() * 0.3),
                RPM: Math.max(1100, rpm + rand() * 45),
                Acceleration_on_X_axis: latG + rand() * 0.04,
                Acceleration_on_Y_axis: longG + rand() * 0.03,
                Acceleration_on_Z_axis: 1.0 + rand() * 0.03,
                Steering_Angle: latG * 55 + rand() * 1.2,
                Throttle_position: speed > 5 ? 62 + rand() * 2 : 0,
                Brake_Pressure: 0
            });
        }
        return { rows, Gates_times: { timestamps: [], lap_data: [] } };
    }

    if (presetId === "high_vibration") {
        // 30-second run with strong 28 Hz engine resonance superimposed on 1.5 Hz cornering
        const durationSec = 30;
        const n = durationSec * fs;
        const rows = [];

        for (let i = 0; i < n; i++) {
            const tSec = i / fs;
            const ts = baseTime + i * dtMs;
            const trueLat = 1.1 * Math.sin(2 * Math.PI * 0.35 * tSec);
            const trueLong = 0.7 * Math.cos(2 * Math.PI * 0.35 * tSec);
            const engineVib = 0.48 * Math.sin(2 * Math.PI * 22 * tSec); // 22 Hz engine harmonic

            rows.push({
                timestamp: ts,
                GPS_Speed: 65 + 22 * Math.sin(2 * Math.PI * 0.35 * tSec),
                RPM: 8400 + 1200 * Math.sin(2 * Math.PI * 0.35 * tSec),
                Acceleration_on_X_axis: trueLat + engineVib + rand() * 0.05,
                Acceleration_on_Y_axis: trueLong + engineVib * 0.7 + rand() * 0.05,
                Acceleration_on_Z_axis: 1.0 + engineVib * 1.1,
                Throttle_position: Math.max(0, Math.min(100, 50 + 50 * Math.cos(2 * Math.PI * 0.35 * tSec))),
                Brake_Pressure: Math.max(0, -35 * Math.cos(2 * Math.PI * 0.35 * tSec))
            });
        }
        return { rows, Gates_times: { timestamps: [], lap_data: [] } };
    }

    if (presetId === "ignition_spikes") {
        // 25-second damper & brake log corrupted by single-sample EMI/ignition spikes
        const durationSec = 25;
        const n = durationSec * fs;
        const rows = [];

        for (let i = 0; i < n; i++) {
            const tSec = i / fs;
            const ts = baseTime + i * dtMs;
            const cleanDamper = 4.5 + 1.8 * Math.sin(2 * Math.PI * 1.2 * tSec);
            const isSpike = i % 37 === 0 || i % 83 === 0;
            const spikeOffset = isSpike ? (rand() > 0 ? 4.2 : -4.2) : 0;

            rows.push({
                timestamp: ts,
                GPS_Speed: 72 + 15 * Math.sin(2 * Math.PI * 0.2 * tSec),
                RPM: 9200,
                Damper_Left_Front: cleanDamper + spikeOffset + rand() * 0.02,
                Damper_Right_Front: cleanDamper - 0.1 + rand() * 0.02,
                Damper_Left_Rear: 5.0 + 1.5 * Math.sin(2 * Math.PI * 1.2 * tSec + 0.3),
                Damper_Right_Rear: 5.0 + 1.5 * Math.sin(2 * Math.PI * 1.2 * tSec + 0.3),
                Brake_Pressure: Math.max(0, 28 * Math.sin(2 * Math.PI * 0.4 * tSec)) + (isSpike ? 25 : 0),
                Acceleration_on_X_axis: 0.9 * Math.sin(2 * Math.PI * 0.4 * tSec),
                Acceleration_on_Y_axis: -0.6 * Math.sin(2 * Math.PI * 0.4 * tSec)
            });
        }
        return { rows, Gates_times: { timestamps: [], lap_data: [] } };
    }

    // Default: "clean_lap" — 2 realistic 35-second circuit laps with S0/S1/S2 gates & brake bias
    const lapSec = 35;
    const totalSec = lapSec * 2;
    const n = totalSec * fs;
    const rows = [];

    for (let i = 0; i < n; i++) {
        const tSec = i / fs;
        const lapPhase = (tSec % lapSec) / lapSec;
        const ts = baseTime + i * dtMs;

        // Straight -> Heavy Braking -> Hairpin -> Sweeper -> Finish
        let speed = 85;
        let longG = 0.6;
        let latG = 0;
        let brakeF = 0;
        let brakeR = 0;
        let throttle = 100;

        if (lapPhase < 0.25) {
            speed = 55 + (lapPhase / 0.25) * 40;
            longG = 0.65;
            throttle = 100;
        } else if (lapPhase < 0.35) {
            const p = (lapPhase - 0.25) / 0.1;
            speed = 95 - p * 55;
            longG = -1.15;
            throttle = 0;
            brakeF = 24 * Math.sin(p * Math.PI);
            brakeR = 14 * Math.sin(p * Math.PI);
        } else if (lapPhase < 0.55) {
            const p = (lapPhase - 0.35) / 0.2;
            speed = 40 + p * 12;
            latG = 1.25 * Math.sin(p * Math.PI);
            longG = 0.1;
            throttle = 45;
        } else if (lapPhase < 0.85) {
            const p = (lapPhase - 0.55) / 0.3;
            speed = 52 + p * 28;
            latG = -1.4 * Math.sin(p * Math.PI);
            longG = 0.35;
            throttle = 85;
        } else {
            const p = (lapPhase - 0.85) / 0.15;
            speed = 80 - p * 25;
            longG = -0.8;
            throttle = 0;
            brakeF = 16 * Math.sin(p * Math.PI);
            brakeR = 9 * Math.sin(p * Math.PI);
        }

        const damperDisp = 4.8 + longG * 0.65 + latG * 0.45 + rand() * 0.015;

        rows.push({
            timestamp: ts,
            GPS_Speed: speed + rand() * 0.2,
            RPM: Math.round(4500 + speed * 75 + rand() * 30),
            Acceleration_on_X_axis: latG + rand() * 0.02,
            Acceleration_on_Y_axis: longG + rand() * 0.02,
            Acceleration_on_Z_axis: 1.0 + rand() * 0.02,
            Throttle_position: throttle,
            Brake_Pressure: brakeF + brakeR,
            Brake_Front: brakeF,
            Brake_Rear: brakeR,
            Gear: speed < 48 ? 2 : speed < 72 ? 3 : 4,
            Damper_Left_Front: damperDisp,
            Damper_Right_Front: 4.8 + longG * 0.65 - latG * 0.45 + rand() * 0.015,
            Damper_Left_Rear: 5.1 - longG * 0.55 + latG * 0.4 + rand() * 0.015,
            Damper_Right_Rear: 5.1 - longG * 0.55 - latG * 0.4 + rand() * 0.015
        });
    }

    const lap1Start = baseTime;
    const lap2Start = baseTime + lapSec * 1000;
    const lap2End = baseTime + totalSec * 1000;

    return {
        rows,
        Gates_times: {
            timestamps: [lap1Start, lap2Start, lap2End],
            lap_data: [
                {
                    S0: lap1Start,
                    S1: lap1Start + 11500,
                    S2: lap1Start + 23000,
                    S3: lap2Start
                },
                {
                    S0: lap2Start,
                    S1: lap2Start + 11400,
                    S2: lap2Start + 22800,
                    S3: lap2End
                }
            ]
        }
    };
}

export const BUNDLED_PRESETS = [
    {
        id: "clean_lap",
        name: "Preset: Clean Track Lap (2 Laps)",
        description: "Multi-lap circuit data with braking zones, sweepers, dampers, and front/rear brake pressure."
    },
    {
        id: "skidpad",
        name: "Preset: Skidpad Steady-State Run",
        description: "4s stationary baseline followed by left/right steady-state 1.35G circles for tare and G-G testing."
    },
    {
        id: "high_vibration",
        name: "Preset: High-Vibration Engine Run (22 Hz)",
        description: "Cornering G-force buried under a 22 Hz engine resonance—ideal for FFT and Notch/Butterworth practice."
    },
    {
        id: "ignition_spikes",
        name: "Preset: Ignition / EMI Spike Log",
        description: "Damper position and brake pressure corrupted by single-sample electrical spikes—ideal for Median filtering."
    }
];

export const TRAINING_MISSIONS = [
    {
        id: "mission_1",
        title: "Mission 1: Reject Ignition Spikes with a Median Filter",
        presetId: "ignition_spikes",
        step: "Load the Ignition Spike preset, apply a Median Filter (window size 5) to Damper_Left_Front, and inspect the Residual Noise overlay.",
        check: (channels) => Object.keys(channels).some((k) => k.includes("MEDIAN") && k.includes("Damper_Left_Front"))
    },
    {
        id: "mission_2",
        title: "Mission 2: Hunt & Notch a 22 Hz Engine Vibration",
        presetId: "high_vibration",
        step: "Load the High-Vibration preset, check the FFT Spectrum of Acceleration_on_X_axis to confirm the 22 Hz peak, then apply a Notch Filter at 22 Hz.",
        check: (channels) => Object.keys(channels).some((k) => k.includes("NOTCH") && k.includes("Acceleration_on_X_axis"))
    },
    {
        id: "mission_3",
        title: "Mission 3: Compute Damper Velocity & Combined G",
        presetId: "clean_lap",
        step: "Load the Clean Track Lap preset, compute the numerical derivative of Damper_Left_Front (mm/s), and generate the Combined G-Force vector.",
        check: (channels) =>
            Object.keys(channels).some((k) => k.includes("VEL_")) &&
            Boolean(channels["Combined_G"])
    },
    {
        id: "mission_4",
        title: "Mission 4: Custom MATLAB Difference Equation",
        presetId: "skidpad",
        step: "Write a MATLAB difference equation (e.g. y[n] = 0.9 * y[n-1] + 0.1 * x[n]) in the Equation Lab to smooth Acceleration_on_X_axis.",
        check: (channels) => Object.keys(channels).some((k) => k.startsWith("Math_"))
    }
];