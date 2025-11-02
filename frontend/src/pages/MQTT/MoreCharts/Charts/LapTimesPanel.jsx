import PropTypes from "prop-types";

function toMs(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 1000) : NaN; // unix seconds → ms
}

function fmt(ms) {
  if (!Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = Math.round(ms % 1000).toString().padStart(3, "0");
  return `${m}:${s.toString().padStart(2, "0")}.${f}`;
}

export default function LapTimesPanel({ laps, title = "Lap Times" }) {
  const rows = (Array.isArray(laps) ? laps : []).map((lap, idx) => {
    const s0 = toMs(lap.S0), s1 = toMs(lap.S1), s2 = toMs(lap.S2), s3 = toMs(lap.S3);
    const t1 = s1 - s0, t2 = s2 - s1, t3 = s3 - s2;
    const total = t1 + t2 + t3;
    return {
      lapNo: idx + 1,
      total, t1, t2, t3,
      dist: Number(lap.dist),
    };
  }).filter(r => Number.isFinite(r.total) && r.total > 0);

  const bestIdx = rows.length
    ? rows.reduce((best, r, i) => (r.total < rows[best].total ? i : best), 0)
    : -1;

  return (
    <div className="w-80 rounded-lg border bg-white p-3 shadow-sm">
      <h3 className="font-medium text-gray-700 mb-2">{title}</h3>
      <div className="text-sm text-gray-600">
        <div className="grid grid-cols-6 gap-x-2 font-semibold mb-1">
          <div>Lap</div><div className="col-span-2">Time</div>
          <div>S1</div><div>S2</div><div>S3</div>
        </div>
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div
              key={r.lapNo}
              className={`grid grid-cols-6 gap-x-2 items-center rounded px-1 py-0.5
                          ${i === bestIdx ? "bg-green-50 border border-green-200" : ""}`}
              title={`Distance: ${Number.isFinite(r.dist) ? r.dist.toFixed(1) : "—"} m`}
            >
              <div className="tabular-nums">#{r.lapNo}</div>
              <div className="col-span-2 tabular-nums font-semibold">{fmt(r.total)}</div>
              <div className="tabular-nums">{fmt(r.t1)}</div>
              <div className="tabular-nums">{fmt(r.t2)}</div>
              <div className="tabular-nums">{fmt(r.t3)}</div>
            </div>
          ))}
          {!rows.length && <div className="text-gray-400">No laps detected.</div>}
        </div>
      </div>
    </div>
  );
}

LapTimesPanel.propTypes = {
  laps: PropTypes.arrayOf(PropTypes.shape({
    S0: PropTypes.number,
    S1: PropTypes.number,
    S2: PropTypes.number,
    S3: PropTypes.number,
    dist: PropTypes.number,
  })),
  title: PropTypes.string,
};
