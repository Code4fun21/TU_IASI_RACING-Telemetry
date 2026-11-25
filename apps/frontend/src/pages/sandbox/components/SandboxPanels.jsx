import { TRAINING_MISSIONS } from "../presets/trainingData";

export function RegionReadoutCard({ regionStats, channelLabel, unit, onClear }) {
    if (!regionStats) return null;

    return (
        <div className="bg-indigo-950/70 border border-indigo-500/50 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
                <div className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">
                    Selected Window Readout — {channelLabel}
                </div>
                <div className="text-xs text-gray-400">{regionStats.count} samples highlighted</div>
            </div>

            <div className="flex flex-wrap gap-5 text-xs font-mono">
                <div>
                    <span className="text-gray-400 block">Delta Time</span>
                    <span className="text-white font-semibold">{regionStats.deltaTimeSec.toFixed(3)} s</span>
                </div>
                <div>
                    <span className="text-gray-400 block">Delta Distance</span>
                    <span className="text-white font-semibold">{regionStats.deltaDistM.toFixed(1)} m</span>
                </div>
                <div>
                    <span className="text-gray-400 block">Minimum</span>
                    <span className="text-cyan-300 font-semibold">
                        {regionStats.min.toFixed(3)} {unit}
                    </span>
                </div>
                <div>
                    <span className="text-gray-400 block">Peak (Max)</span>
                    <span className="text-emerald-300 font-semibold">
                        {regionStats.max.toFixed(3)} {unit}
                    </span>
                </div>
                <div>
                    <span className="text-gray-400 block">Average</span>
                    <span className="text-amber-300 font-semibold">
                        {regionStats.avg.toFixed(3)} {unit}
                    </span>
                </div>
                <div>
                    <span className="text-gray-400 block">RMS</span>
                    <span className="text-purple-300 font-semibold">
                        {regionStats.rms.toFixed(3)} {unit}
                    </span>
                </div>
            </div>

            <button
                onClick={onClear}
                className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 border border-gray-700"
            >
                Clear
            </button>
        </div>
    );
}

export function MissionsPanel({ allChannels, onLoadPreset }) {
    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold text-white">Telemetry Engineering Training Missions</h3>
                    <p className="text-xs text-gray-400">
                        Load a training dataset, complete the signal-processing task, and verify your derived channels automatically.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TRAINING_MISSIONS.map((m) => {
                    const completed = m.check(allChannels || {});
                    return (
                        <div
                            key={m.id}
                            className={`p-4 rounded-lg border space-y-2 ${
                                completed
                                    ? "bg-emerald-950/30 border-emerald-500/60"
                                    : "bg-gray-950/70 border-gray-800"
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-white">{m.title}</span>
                                <span
                                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                        completed
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : "bg-gray-800 text-gray-400"
                                    }`}
                                >
                                    {completed ? "Completed" : "Pending"}
                                </span>
                            </div>
                            <p className="text-xs text-gray-300 leading-relaxed">{m.step}</p>
                            <button
                                onClick={() => onLoadPreset(m.presetId)}
                                className="px-3 py-1.5 rounded bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-medium"
                            >
                                Load Mission Dataset
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}