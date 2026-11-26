import * as turf from '@turf/turf';

interface Zone {
    startIndex: number;
    endIndex: number;
    points: number[][];
    distance: number;
    totalRotation: number;
    label: string;
}

const extractCoords = (feature: any): number[][] => {
    let raw = feature?.geometry?.coordinates || [];
    if (feature?.geometry?.type === "Polygon") raw = raw[0] || [];
    if (raw.length > 2 &&
        raw[0][0] === raw[raw.length - 1][0] &&
        raw[0][1] === raw[raw.length - 1][1]) {
        return raw.slice(0, -1);
    }
    return raw;
};

const projectToNearestPoint = (point: number[], polyline: number[][]): number[] => {
    const n = polyline.length;
    if (n === 0) return point;
    if (n === 1) return polyline[0];

    const cosLat = Math.cos(point[1] * Math.PI / 180);
    let bestDistSq = Infinity;
    let bestLon = polyline[0][0];
    let bestLat = polyline[0][1];

    for (let i = 0; i < n; i++) {
        const a = polyline[i];
        const b = polyline[(i + 1) % n];
        const dx = (b[0] - a[0]) * cosLat;
        const dy = b[1] - a[1];
        const lenSq = dx * dx + dy * dy;

        let t = 0;
        if (lenSq > 0) {
            t = (((point[0] - a[0]) * cosLat) * dx + (point[1] - a[1]) * dy) / lenSq;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
        }

        const projLon = a[0] + t * (b[0] - a[0]);
        const projLat = a[1] + t * (b[1] - a[1]);
        const ex = (point[0] - projLon) * cosLat;
        const ey = point[1] - projLat;
        const distSq = ex * ex + ey * ey;

        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestLon = projLon;
            bestLat = projLat;
        }
    }

    return [bestLon, bestLat];
};

const haversineMeters = (a: number[], b: number[]): number => {
    const R = 6371000;
    const toRad = (deg: number) => deg * Math.PI / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLon * sinLon;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const smoothClosedPolyline = (points: number[][], passes: number): number[][] => {
    const n = points.length;
    if (n < 5) return points;
    let current = points.map(p => [p[0], p[1]]);
    for (let pass = 0; pass < passes; pass++) {
        const next: number[][] = [];
        for (let i = 0; i < n; i++) {
            const prev = current[(i - 1 + n) % n];
            const curr = current[i];
            const nxt = current[(i + 1) % n];
            next.push([
                0.25 * prev[0] + 0.5 * curr[0] + 0.25 * nxt[0],
                0.25 * prev[1] + 0.5 * curr[1] + 0.25 * nxt[1]
            ]);
        }
        current = next;
    }
    return current;
};

const buildCumulativeMeters = (points: number[][]): number[] => {
    const cum = [0];
    for (let i = 0; i < points.length - 1; i++) {
        cum.push(cum[i] + haversineMeters(points[i], points[i + 1]));
    }
    return cum;
};

const getRotationStats = (points: number[][], start: number, end: number) => {
    const s = Math.max(0, start);
    const e = Math.min(points.length - 1, end);
    let signed = 0;
    let pos = 0;
    let neg = 0;
    for (let i = s; i <= e - 2; i++) {
        const a = points[i];
        const b = points[i + 1];
        const c = points[i + 2];
        const ang1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const ang2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        let diff = ang2 - ang1;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        signed += diff;
        if (diff > 0) pos += diff;
        else neg += -diff;
    }
    return { signed, minor: Math.min(pos, neg) };
};

export const processTrackGeometry = (geoData: any) => {
    if (!geoData?.features || geoData.features.length < 2) return [];

    const outerCoords = extractCoords(geoData.features[0]);
    const innerCoords = extractCoords(geoData.features[1]);
    if (outerCoords.length < 3 || innerCoords.length < 3) return [];

    const centerline = smoothClosedPolyline(calculateCenterline(outerCoords, innerCoords), 1);
    const classificationLine = smoothClosedPolyline(centerline, 3);
    const cumMeters = buildCumulativeMeters(centerline);
    const totalMeters = turf.length(turf.lineString([...centerline, centerline[0]]), { units: 'kilometers' }) * 1000;
    const avgStep = centerline.length > 0 ? totalMeters / centerline.length : 1;
    const windowRadius = Math.max(4, Math.min(18, Math.round(15 / Math.max(avgStep, 0.3))));

    const harrisScores = calculateHarrisScores(centerline, windowRadius);
    
    const rawZones = detectRawZones(harrisScores, 0.4, windowRadius);
    const splitZones = splitCompoundZones(rawZones, harrisScores, avgStep);
    const mergedZones = mergeZones(splitZones, cumMeters, classificationLine, 24);
    
    return finalizeZones(mergedZones, centerline, classificationLine, cumMeters);
};

const calculateCenterline = (outer: number[][], inner: number[][]) => {
    return outer.map((p) => {
        const p2 = projectToNearestPoint(p, inner);
        return [(p[0] + p2[0]) / 2, (p[1] + p2[1]) / 2];
    });
};

const calculateHarrisScores = (points: number[][], l: number) => {
    const n = points.length;
    if (n < 3) return points.map(() => 0);

    return points.map((_, i, arr) => {
        const subset: number[][] = [];
        for (let offset = -l; offset <= l; offset++) {
            const idx = (((i + offset) % n) + n) % n;
            subset.push(arr[idx]);
        }

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
    const pad = Math.max(2, Math.floor(l * 0.6));

    for (let i = 0; i < scores.length; i++) {
        if (!current && scores[i] > tau) {
            current = { start: Math.max(0, i - pad), end: i, maxScore: scores[i] };
        } else if (current) {
            current.maxScore = Math.max(current.maxScore, scores[i]);
            const start = Math.max(0, i - l);
            const end = Math.min(scores.length, i + l);
            const window = scores.slice(start, end);
            const avg = window.reduce((a, b) => a + b, 0) / window.length;

            if (avg < tau * 0.25) {
                current.end = Math.max(current.start + 1, i - Math.floor(pad * 0.4));
                zones.push({ ...current });
                current = null;
            }
        }
    }

    if (current) {
        current.end = scores.length - 1;
        zones.push({ ...current });
    }

    return zones;
};

const splitCompoundZones = (zones: any[], scores: number[], avgStep: number) => {
    const results: any[] = [];
    const minSplitLen = Math.max(25, Math.round(70 / Math.max(avgStep, 0.3)));
    const margin = Math.max(8, Math.floor(minSplitLen / 3));

    for (const zone of zones) {
        if ((zone.end - zone.start) < minSplitLen) {
            results.push(zone);
            continue;
        }

        let splitPoint = -1;
        let minVal = Infinity;
        const searchStart = zone.start + margin;
        const searchEnd = zone.end - margin;

        for (let i = searchStart; i < searchEnd; i++) {
            if (scores[i] < minVal) {
                minVal = scores[i];
                splitPoint = i;
            }
        }

        if (splitPoint !== -1 && minVal < zone.maxScore * 0.08) {
            results.push({ start: zone.start, end: splitPoint, maxScore: zone.maxScore });
            results.push({ start: splitPoint + 1, end: zone.end, maxScore: zone.maxScore });
        } else {
            results.push(zone);
        }
    }
    return results;
};

const mergeZones = (zones: any[], cumMeters: number[], points: number[][], bridgeMeters: number) => {
    if (zones.length === 0) return [];
    const merged = [{ ...zones[0] }];
    for (let i = 1; i < zones.length; i++) {
        const last = merged[merged.length - 1];
        const lastEnd = Math.min(cumMeters.length - 1, Math.max(0, last.end));
        const currStart = Math.min(cumMeters.length - 1, Math.max(0, zones[i].start));
        const gapMeters = Math.max(0, cumMeters[currStart] - cumMeters[lastEnd]);

        const stats1 = getRotationStats(points, last.start, last.end);
        const stats2 = getRotationStats(points, zones[i].start, zones[i].end);
        const rot1 = stats1.signed;
        const rot2 = stats2.signed;

        const isDistinctHairpinBreak =
            gapMeters > 10 &&
            Math.sign(rot1) !== 0 &&
            Math.sign(rot2) !== 0 &&
            Math.sign(rot1) !== Math.sign(rot2) &&
            (Math.abs(rot1) > 2.35 || Math.abs(rot2) > 2.35);

        const isSameDirectionDoubleApexPair =
            Math.sign(rot1) !== 0 &&
            Math.sign(rot1) === Math.sign(rot2) &&
            stats1.minor < 0.25 &&
            stats2.minor < 0.25 &&
            Math.abs(rot1) < 2.2 &&
            Math.abs(rot2) < 2.2;

        const effectiveBridge = isSameDirectionDoubleApexPair ? Math.max(bridgeMeters, 38) : bridgeMeters;

        if (gapMeters < effectiveBridge && !isDistinctHairpinBreak) {
            last.end = Math.max(last.end, zones[i].end);
            last.maxScore = Math.max(last.maxScore, zones[i].maxScore);
        } else {
            merged.push({ ...zones[i] });
        }
    }
    return merged;
};

const finalizeZones = (zones: any[], centerline: number[][], classificationLine: number[][], cumMeters: number[]): Zone[] => {
    const rawFinalized = zones.map(z => {
        const start = Math.max(0, z.start);
        const end = Math.min(centerline.length - 1, z.end);
        const slice = centerline.slice(start, end + 1);
        const smoothSlice = classificationLine.slice(start, end + 1);
        const deltas: number[] = [];
        const stepMeters: number[] = [];
        let rotation = 0;

        for (let i = 0; i < smoothSlice.length - 2; i++) {
            const a = smoothSlice[i];
            const b = smoothSlice[i + 1];
            const c = smoothSlice[i + 2];
            const ang1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
            const ang2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
            let diff = ang2 - ang1;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;
            
            deltas.push(diff);
            stepMeters.push(Math.max(0.1, cumMeters[start + i + 2] - cumMeters[start + i + 1]));
            rotation += Math.abs(diff);
        }

        const distance = Math.max(0, cumMeters[end] - cumMeters[start]);
        const type = classifyTurnType(deltas, stepMeters, rotation, distance);

        return {
            startIndex: start,
            endIndex: end,
            points: slice,
            distance,
            totalRotation: rotation,
            label: type
        };
    }).filter(z => z.distance >= 6 && z.totalRotation >= 0.65);

    const ordered: Zone[] = [];
    for (const z of rawFinalized) {
        if (ordered.length > 0) {
            const prev = ordered[ordered.length - 1];
            if (z.startIndex <= prev.endIndex + 2) {
                z.startIndex = prev.endIndex + 3;
            }
        }
        if (z.endIndex > z.startIndex + 1) {
            ordered.push(z);
        }
    }

    return ordered;
};

const classifyTurnType = (deltas: number[], stepMeters: number[], totalRotation: number, distance: number) => {
    let flips = 0;
    let lastSignificantSign = 0;
    const threshold = 0.015; // Increased sensitivity floor
    const signThreshold = Math.max(threshold * 3, 0.045);
    let posRot = 0;
    let negRot = 0;

    for (const d of deltas) {
        if (d > 0) posRot += d;
        else negRot += -d;

        // Only consider a point if it's "hard" steering
        if (Math.abs(d) > signThreshold) {
            const currentSign = Math.sign(d);
            
            // If we changed direction significantly
            if (lastSignificantSign !== 0 && currentSign !== lastSignificantSign) {
                flips++;
            }
            lastSignificantSign = currentSign;
        }
    }

    const minorSideRot = Math.min(posRot, negRot);
    if (flips >= 3 && minorSideRot >= 0.42) return "SLALOM";
    if (flips >= 1 && minorSideRot >= 0.32) return "CHICANE";

    if (deltas.length >= 10 && totalRotation >= 1.35 && distance >= 36) {
        const curvatures = deltas.map((d, i) => Math.abs(d) / (stepMeters[i] || 1));
        const smoothed = curvatures.map((_, i, arr) => {
            const prev = arr[Math.max(0, i - 1)];
            const curr = arr[i];
            const next = arr[Math.min(arr.length - 1, i + 1)];
            return (prev + curr + next) / 3;
        });

        const peaks: { idx: number, val: number }[] = [];
        for (let i = 2; i < smoothed.length - 2; i++) {
            if (
                smoothed[i] > 0.025 &&
                smoothed[i] >= smoothed[i - 1] &&
                smoothed[i] >= smoothed[i - 2] &&
                smoothed[i] > smoothed[i + 1] &&
                smoothed[i] >= smoothed[i + 2]
            ) {
                peaks.push({ idx: i, val: smoothed[i] });
            }
        }

        if (peaks.length >= 2) {
            const first = peaks[0];
            const last = peaks[peaks.length - 1];
            let peakSeparationMeters = 0;
            for (let i = first.idx; i < last.idx; i++) {
                peakSeparationMeters += stepMeters[i] || 0;
            }

            if (peakSeparationMeters >= 18 && peakSeparationMeters >= distance * 0.35) {
                const midIdx = Math.floor((first.idx + last.idx) / 2);
                let firstHalfRot = 0;
                for (let i = 0; i <= midIdx; i++) firstHalfRot += Math.abs(deltas[i]);
                let secondHalfRot = 0;
                for (let i = midIdx + 1; i < deltas.length; i++) secondHalfRot += Math.abs(deltas[i]);

                let minBetween = Infinity;
                for (let i = first.idx + 1; i < last.idx; i++) {
                    if (smoothed[i] < minBetween) minBetween = smoothed[i];
                }

                if (
                    firstHalfRot >= 0.42 &&
                    secondHalfRot >= 0.42 &&
                    minBetween < Math.min(first.val, last.val) * 0.35
                ) {
                    return "DOUBLE_APEX";
                }
            }
        }
    }

    return "CORNER";
};


export const getSectorIndices = (outer: number[][], inner: number[][], zones: Zone[]): number[] => {
    if (!outer.length || !inner.length) return [];
    const centerline = smoothClosedPolyline(calculateCenterline(outer, inner), 1);

    let totalDist = 0;
    const cumulativeDist = [0];
    for (let i = 0; i < centerline.length - 1; i++) {
        totalDist += haversineMeters(centerline[i], centerline[i + 1]);
        cumulativeDist.push(totalDist);
    }

    const totalLoopDist = totalDist + haversineMeters(centerline[centerline.length - 1], centerline[0]);
    const circularGap = (d1: number, d2: number) => {
        const diff = Math.abs(d1 - d2);
        return Math.min(diff, totalLoopDist - diff);
    };

    const findOptimalIndex = (targetDist: number) => {
        let idx = cumulativeDist.findIndex(d => d >= targetDist);
        if (idx === -1) idx = centerline.length - 1;

        // Increased buffer to ensure visual separation (approx 10 meters)
        const safetyBuffer = 24;

        const isNearCorner = (index: number) => {
            const d = cumulativeDist[index];
            return zones.some(z => {
                const sDist = cumulativeDist[Math.max(0, Math.min(cumulativeDist.length - 1, z.startIndex))];
                const eDist = cumulativeDist[Math.max(0, Math.min(cumulativeDist.length - 1, z.endIndex))];
                const insideSpan = d >= sDist && d <= eDist;
                return insideSpan || circularGap(d, sDist) < safetyBuffer || circularGap(d, eDist) < safetyBuffer;
            });
        };

        if (isNearCorner(idx)) {
            let step = 1;
            const maxSearch = Math.floor(centerline.length / 3);
            while (step < maxSearch) {
                // Try looking forward then backward for a clean straight
                const fwd = (idx + step) % centerline.length;
                if (!isNearCorner(fwd)) return fwd;
                const bwd = (idx - step + centerline.length) % centerline.length;
                if (!isNearCorner(bwd)) return bwd;
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