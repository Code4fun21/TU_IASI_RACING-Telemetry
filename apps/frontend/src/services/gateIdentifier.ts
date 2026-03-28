import * as turf from '@turf/turf';

interface Zone {
    startIndex: number;
    endIndex: number;
    points: number[][];
    distance: number;
    totalRotation: number;
    label: string;
}

export const processTrackGeometry = (geoData: any) => {
    const outerCoords = geoData.features[0].geometry.coordinates;
    const innerCoords = geoData.features[1].geometry.coordinates;

    const centerline = calculateCenterline(outerCoords, innerCoords);
    const harrisScores = calculateHarrisScores(centerline, 10);
    
    const rawZones = detectRawZones(harrisScores, 0.4, 15);
    const splitZones = splitCompoundZones(rawZones, harrisScores);
    const mergedZones = mergeZones(splitZones, 20);
    
    return finalizeZones(mergedZones, centerline);
};

const calculateCenterline = (outer: number[][], inner: number[][]) => {
    return outer.map((p, i) => {
        const p2 = inner[Math.min(i, inner.length - 1)];
        return [(p[0] + p2[0]) / 2, (p[1] + p2[1]) / 2];
    });
};

const calculateHarrisScores = (points: number[][], l: number) => {
    return points.map((_, i, arr) => {
        const start = Math.max(0, i - l);
        const end = Math.min(arr.length, i + l);
        const subset = arr.slice(start, end);
        if (subset.length < 3) return 0;

        const ref = subset[Math.floor(subset.length / 2)];
        const latRatio = 111320; 
        const lonRatio = 40075000 * Math.cos(ref[1] * Math.PI / 180) / 360;

        const meterPoints = subset.map(p => [
            (p[0] - ref[0]) * lonRatio,
            (p[1] - ref[1]) * latRatio
        ]);

        const mX = meterPoints.reduce((a, b) => a + b[0], 0) / meterPoints.length;
        const mY = meterPoints.reduce((a, b) => a + b[1], 0) / meterPoints.length;

        let sXX = 0, sYY = 0, sXY = 0;
        for (const p of meterPoints) {
            const dx = p[0] - mX;
            const dy = p[1] - mY;
            sXX += dx * dx;
            sYY += dy * dy;
            sXY += dx * dy;
        }

        const det = sXX * sYY - sXY * sXY;
        const trace = sXX + sYY;
        return trace === 0 ? 0 : det / (trace + 1e-6);
    });
};

const detectRawZones = (scores: number[], tau: number, l: number) => {
    const zones: { start: number, end: number, maxScore: number }[] = [];
    let current: { start: number, end: number, maxScore: number } | null = null;

    for (let i = 0; i < scores.length; i++) {
        if (!current && scores[i] > tau) {
            current = { start: i - 12, end: i, maxScore: scores[i] };
        } else if (current) {
            current.maxScore = Math.max(current.maxScore, scores[i]);
            const start = Math.max(0, i - l);
            const end = Math.min(scores.length, i + l);
            const window = scores.slice(start, end);
            const avg = window.reduce((a, b) => a + b, 0) / window.length;

            if (avg < tau * 0.2) {
                current.end = i - 6;
                zones.push({ ...current });
                current = null;
            }
        }
    }
    return zones;
};

const splitCompoundZones = (zones: any[], scores: number[]) => {
    const results: any[] = [];
    for (const zone of zones) {
        if ((zone.end - zone.start) < 60) {
            results.push(zone);
            continue;
        }

        let splitPoint = -1;
        let minVal = Infinity;
        const searchStart = zone.start + 20;
        const searchEnd = zone.end - 20;

        for (let i = searchStart; i < searchEnd; i++) {
            if (scores[i] < minVal) {
                minVal = scores[i];
                splitPoint = i;
            }
        }

        if (minVal < zone.maxScore * 0.15) {
            results.push({ start: zone.start, end: splitPoint, maxScore: zone.maxScore });
            results.push({ start: splitPoint, end: zone.end, maxScore: zone.maxScore });
        } else {
            results.push(zone);
        }
    }
    return results;
};

const mergeZones = (zones: any[], bridge: number) => {
    if (zones.length === 0) return [];
    const merged = [{ ...zones[0] }];
    for (let i = 1; i < zones.length; i++) {
        const last = merged[merged.length - 1];
        if (zones[i].start - last.end < bridge) {
            last.end = zones[i].end;
        } else {
            merged.push({ ...zones[i] });
        }
    }
    return merged;
};

const finalizeZones = (zones: any[], centerline: number[][]): Zone[] => {
    return zones.map(z => {
        const slice = centerline.slice(Math.max(0, z.start), z.end);
        const deltas: number[] = [];
        let rotation = 0;

        for (let i = 0; i < slice.length - 2; i++) {
            const a = slice[i];
            const b = slice[i + 1];
            const c = slice[i + 2];
            const ang1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
            const ang2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
            let diff = ang2 - ang1;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;
            
            deltas.push(diff);
            rotation += Math.abs(diff);
        }

        const type = classifyTurnType(deltas);

        return {
            startIndex: z.start,
            endIndex: z.end,
            points: slice,
            distance: slice.length * 0.5,
            totalRotation: rotation,
            label: type
        };
    }).filter(z => z.distance >= 5 && z.totalRotation > 0.4);
};

const classifyTurnType = (deltas: number[]) => {
    let flips = 0;
    let lastSignificantSign = 0;
    const threshold = 0.015; // Increased sensitivity floor

    for (const d of deltas) {
        // Only consider a point if it's "hard" steering
        if (Math.abs(d) > threshold) {
            const currentSign = Math.sign(d);
            
            // If we changed direction significantly
            if (lastSignificantSign !== 0 && currentSign !== lastSignificantSign) {
                flips++;
            }
            lastSignificantSign = currentSign;
        }
    }

    if (flips >= 3) return "SLALOM";
    if (flips === 2) return "CHICANE";
    return "CORNER";
};


export const getSectorIndices = (outer: number[][], inner: number[][], zones: Zone[]): number[] => {
    const centerline = outer.map((p, i) => {
        const p2 = inner[Math.min(i, inner.length - 1)];
        return [(p[0] + p2[0]) / 2, (p[1] + p2[1]) / 2];
    });

    let totalDist = 0;
    const cumulativeDist = [0];
    for (let i = 0; i < centerline.length - 1; i++) {
        const d = Math.sqrt(
            Math.pow(centerline[i + 1][0] - centerline[i][0], 2) + 
            Math.pow(centerline[i + 1][1] - centerline[i][1], 2)
        );
        totalDist += d;
        cumulativeDist.push(totalDist);
    }

    const findOptimalIndex = (targetDist: number) => {
        let idx = cumulativeDist.findIndex(d => d >= targetDist);
        if (idx === -1) idx = centerline.length - 1;

        // Increased buffer to ensure visual separation (approx 10 meters)
        const safetyBuffer = 20; 

        const isNearCorner = (index: number) => 
            zones.some(z => index >= (z.startIndex - safetyBuffer) && index <= (z.endIndex + safetyBuffer));

        if (isNearCorner(idx)) {
            let step = 1;
            const maxSearch = Math.floor(centerline.length / 4); 
            while (step < maxSearch) {
                // Try looking forward then backward for a clean straight
                if (idx + step < centerline.length && !isNearCorner(idx + step)) return idx + step;
                if (idx - step >= 0 && !isNearCorner(idx - step)) return idx - step;
                step++;
            }
        }
        return idx;
    };

    // S0 is usually start/finish. If T9 (last turn) overlaps index 0, 
    // we can also apply the search to S0 to shift it to a clean spot.
    const s0 = findOptimalIndex(0); 
    const s1 = findOptimalIndex(totalDist * 0.33);
    const s2 = findOptimalIndex(totalDist * 0.66);

    return [s0, s1, s2];
};