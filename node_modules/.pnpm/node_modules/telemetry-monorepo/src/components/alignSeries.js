// Align multiple [[ms, value]] series to a shared time grid.
// Keeps your own ids; returns { dateTime, series: [{ id, name, unit, data: (y|null)[] }] }
export function alignToSharedTime(seriesDefs, {
  grid = "regular",      // "base" | "regular" | "union"
  baseIndex = 0,         // used when grid === "base"
  stepMs,                // step for "regular"; if omitted, auto from median of base
  method = "linear",     // "linear" | "nearest" | "ffill"
  toleranceMs = 500,     // max gap to sample across; otherwise null
} = {}) {
  const EPS = 0.001;

  const clean = (pairs=[]) => {
    const a = pairs.map(([t,v]) => [Number(t), Number(v)])
                   .filter(([t,v]) => Number.isFinite(t) && Number.isFinite(v))
                   .sort((p,q) => p[0]-q[0]);
    let last = -Infinity;
    return a.map(([t,v]) => {
      if (t <= last) t = last + EPS;
      last = t; return [t,v];
    });
  };

  const defs = seriesDefs.map(s => ({
    id:   s.id,
    name: s.name,
    unit: s.unit || "",
    data: clean(s.data),
  }));

  if (!defs.length) return { dateTime: [], series: [] };

  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a,b)=>a-b);
    const m = Math.floor(s.length/2);
    return s.length%2 ? s[m] : 0.5*(s[m-1]+s[m]);
  };
  const medianStep = (pairs) =>
    median(pairs.slice(1).map((p,i)=>p[0]-pairs[i][0]).filter(x=>x>0)) || 50;

  // ---- build grid ----
  let gridTimes = [];
  if (grid === "base") {
    gridTimes = defs[baseIndex]?.data.map(p=>p[0]) || [];
  } else if (grid === "union") {
    const set = new Set();
    defs.forEach(d => d.data.forEach(([t]) => set.add(t)));
    gridTimes = [...set].sort((a,b)=>a-b);
  } else { // "regular"
    const base = defs[baseIndex]?.data || defs[0].data;
    const h = stepMs || medianStep(base);
    const all = defs.flatMap(d=>d.data.map(p=>p[0]));
    const min = Math.min(...all), max = Math.max(...all);
    const n = Math.max(1, Math.round((max-min)/h));
    gridTimes = Array.from({length:n+1}, (_,i)=>min + i*h);
  }

  // ---- sampling helpers ----
  const lowerBound = (pairs, x) => {
    let lo=0, hi=pairs.length;
    while (lo < hi) {
      const mid = (lo+hi)>>1;
      if (pairs[mid][0] < x) lo = mid+1; else hi = mid;
    }
    return lo;
  };

  const sampleAt = (pairs, t) => {
    if (!pairs.length) return null;
    const i = lowerBound(pairs, t);

    if (method === "nearest") {
      const L = i-1, R = Math.min(i, pairs.length-1);
      const cand = [];
      if (L >= 0) cand.push(pairs[L]);
      if (R >= 0) cand.push(pairs[R]);
      let best=null, bestDt=Infinity;
      for (const [tt,vv] of cand) {
        const dt = Math.abs(tt-t);
        if (dt < bestDt) { bestDt=dt; best=vv; }
      }
      return bestDt <= toleranceMs ? best : null;
    }

    if (method === "ffill") {
      const idx = i-1;
      if (idx < 0) return null;
      const [tt,vv] = pairs[idx];
      return (t-tt) <= toleranceMs ? vv : null;
    }

    // linear (default)
    const i0 = i-1, i1 = i;
    if (i0 < 0 || i1 >= pairs.length) return null;
    const [t0,v0] = pairs[i0], [t1,v1] = pairs[i1];
    const span = t1 - t0;
    if (span <= 0) return null;
    if ((t-t0) > toleranceMs || (t1-t) > toleranceMs) return null;
    const a = (t - t0) / span;
    return v0 + a*(v1 - v0);
  };

  const aligned = defs.map(d => ({
    id: d.id,
    name: d.name,
    unit: d.unit,
    data: gridTimes.map(t => sampleAt(d.data, t)),
  }));

  return { dateTime: gridTimes, series: aligned };
}
