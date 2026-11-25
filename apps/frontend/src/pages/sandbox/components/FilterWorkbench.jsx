import { useState, useRef } from "react";
import { FilterComparisonChart } from "../charts/AnalysisCharts";
import { exportWorkspaceJSON, exportFilteredCSV } from "../store/sandboxStore";

export default function FilterWorkbench({
    rawChannels,
    allChannels,
    residuals,
    labels,
    units,
    timeMs,
    fs,
    recipes,
    onAddRecipe,
    onDeleteRecipe,
    onImportRecipes,
    onCreateTareChannel,
    onCreateDerivativeChannel,
    onCreateMatlabChannel
}) {
    const channelKeys = Object.keys(rawChannels);
    const [sourceKey, setSourceKey] = useState(
        rawChannels.Acceleration_on_X_axis ? "Acceleration_on_X_axis" : channelKeys[0] || ""
    );
    const [filterType, setFilterType] = useState("BUTTERWORTH_LP");

    const [smaMode, setSmaMode] = useState("samples");
    const [smaSamples, setSmaSamples] = useState(9);
    const [smaMs, setSmaMs] = useState(180);
    const [emaAlpha, setEmaAlpha] = useState(0.18);
    const [bwCutoff, setBwCutoff] = useState(5);
    const [bwOrder, setBwOrder] = useState(2);
    const [medianWin, setMedianWin] = useState(5);
    const [savgolWin, setSavgolWin] = useState(11);
    const [savgolOrder, setSavgolOrder] = useState(3);
    const [hpCutoff, setHpCutoff] = useState(1.0);
    const [notchFreq, setNotchFreq] = useState(22);
    const [notchQ, setNotchQ] = useState(6);
    const [kalmanQ0, setKalmanQ0] = useState(0.01);
    const [kalmanQ1, setKalmanQ1] = useState(0.1);
    const [kalmanR, setKalmanR] = useState(2.0);

    const [matlabName, setMatlabName] = useState("Custom_Filter");
    const [matlabExpr, setMatlabExpr] = useState("y[n] = 0.88 * y[n-1] + 0.12 * x[n]");
    const [matlabError, setMatlabError] = useState("");
    const [previewKey, setPreviewKey] = useState("");

    const fileInputRef = useRef(null);

    const handleApplyFilter = () => {
        if (!sourceKey) return;
        const effectiveSmaSamples =
            smaMode === "ms" ? Math.max(1, Math.round((smaMs / 1000) * fs)) : smaSamples;

const paramsMap = {
            SMA: { windowSamples: effectiveSmaSamples },
            EMA: { alpha: emaAlpha },
            BUTTERWORTH_LP: { cutoffHz: bwCutoff, order: bwOrder },
            MEDIAN: { windowSize: medianWin },
            SAVGOL: { windowSize: savgolWin, polyOrder: savgolOrder },
            HIGHPASS: { cutoffHz: hpCutoff, order: bwOrder },
            NOTCH: { centerFreqHz: notchFreq, qFactor: notchQ },
            KALMAN_2D: { q0: kalmanQ0, q1: kalmanQ1, r: kalmanR }
        };

        const outKey = `${sourceKey}_${filterType}_${Date.now().toString().slice(-4)}`;
        const recipe = {
            id: outKey,
            outputKey: outKey,
            sourceKey,
            filterType,
            params: paramsMap[filterType]
        };
        onAddRecipe(recipe);
        setPreviewKey(outKey);
    };

    const handleRunMatlab = async () => {
        setMatlabError("");
        try {
            const safeName = `Math_${matlabName.trim().replace(/\s+/g, "_") || "Formula"}`;
            await onCreateMatlabChannel(safeName, matlabExpr, sourceKey);
            setPreviewKey(safeName);
        } catch (err) {
            setMatlabError(err.message);
        }
    };

    const handleJsonUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (Array.isArray(parsed.recipes)) {
                    onImportRecipes(parsed.recipes);
                }
            } catch {
                return;
            }
        };
        reader.readAsText(file);
    };

    const activePreviewRecipe = recipes.find((r) => r.outputKey === previewKey) || recipes[recipes.length - 1];
    const previewSourceArr = activePreviewRecipe ? rawChannels[activePreviewRecipe.sourceKey] : rawChannels[sourceKey];
    const previewFilteredArr = activePreviewRecipe ? allChannels[activePreviewRecipe.outputKey] : null;
    const previewResidualArr = activePreviewRecipe ? residuals[activePreviewRecipe.outputKey] : null;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-white">Predefined DSP Filter Designer</h3>
                        <span className="text-xs text-gray-400 font-mono">Grid Fs: {fs} Hz</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Target Raw Channel</label>
                            <select
                                value={sourceKey}
                                onChange={(e) => setSourceKey(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            >
                                {channelKeys.map((k) => (
                                    <option key={k} value={k}>
                                        {labels[k] || k}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Filter Type</label>
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            >
                                <option value="SMA">Simple Moving Average (SMA)</option>
                                <option value="EMA">Exponential Moving Average (EMA)</option>
                                <option value="BUTTERWORTH_LP">Low-Pass Butterworth (1st–4th)</option>
                                <option value="MEDIAN">Median Filter (Spike Rejection)</option>
                                <option value="SAVGOL">Savitzky-Golay Polynomial</option>
                                <option value="HIGHPASS">High-Pass Filter (Drift/Vibration)</option>
                                <option value="NOTCH">Band-Stop / Notch Filter (RPM)</option>
                                <option value="KALMAN_2D">2D Kalman Filter (Decoder V2)</option>
                            </select>
                        </div>
                    </div>

                    <div className="p-3 bg-gray-950/70 border border-gray-800 rounded-md space-y-3 text-xs text-gray-300">
                        {filterType === "SMA" && (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSmaMode("samples")}
                                        className={`px-2 py-1 rounded ${smaMode === "samples" ? "bg-indigo-600 text-white" : "bg-gray-800"}`}
                                    >
                                        Samples
                                    </button>
                                    <button
                                        onClick={() => setSmaMode("ms")}
                                        className={`px-2 py-1 rounded ${smaMode === "ms" ? "bg-indigo-600 text-white" : "bg-gray-800"}`}
                                    >
                                        Milliseconds
                                    </button>
                                </div>
                                {smaMode === "samples" ? (
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span>Window Size</span>
                                            <span className="font-mono text-indigo-400">{smaSamples} samples</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={3}
                                            max={101}
                                            step={2}
                                            value={smaSamples}
                                            onChange={(e) => setSmaSamples(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span>Window Duration</span>
                                            <span className="font-mono text-indigo-400">{smaMs} ms</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={20}
                                            max={2000}
                                            step={20}
                                            value={smaMs}
                                            onChange={(e) => setSmaMs(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {filterType === "EMA" && (
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span>Smoothing Factor (Alpha)</span>
                                    <span className="font-mono text-indigo-400">{emaAlpha.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0.01}
                                    max={0.95}
                                    step={0.01}
                                    value={emaAlpha}
                                    onChange={(e) => setEmaAlpha(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                        )}

                        {(filterType === "BUTTERWORTH_LP" || filterType === "HIGHPASS") && (
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Cutoff Frequency (Fc)</span>
                                        <span className="font-mono text-indigo-400">
                                            {filterType === "BUTTERWORTH_LP" ? bwCutoff : hpCutoff} Hz
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0.2}
                                        max={Math.max(5, Math.floor(fs * 0.45))}
                                        step={0.2}
                                        value={filterType === "BUTTERWORTH_LP" ? bwCutoff : hpCutoff}
                                        onChange={(e) =>
                                            filterType === "BUTTERWORTH_LP"
                                                ? setBwCutoff(Number(e.target.value))
                                                : setHpCutoff(Number(e.target.value))
                                        }
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Filter Order</span>
                                        <span className="font-mono text-indigo-400">{bwOrder}th Order</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={1}
                                        max={4}
                                        step={1}
                                        value={bwOrder}
                                        onChange={(e) => setBwOrder(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        )}

                        {filterType === "MEDIAN" && (
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span>Median Window Size</span>
                                    <span className="font-mono text-indigo-400">{medianWin} samples</span>
                                </div>
                                <input
                                    type="range"
                                    min={3}
                                    max={31}
                                    step={2}
                                    value={medianWin}
                                    onChange={(e) => setMedianWin(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                        )}

                        {filterType === "SAVGOL" && (
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Window Size (Odd)</span>
                                        <span className="font-mono text-indigo-400">{savgolWin} samples</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={5}
                                        max={51}
                                        step={2}
                                        value={savgolWin}
                                        onChange={(e) => setSavgolWin(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Polynomial Order</span>
                                        <span className="font-mono text-indigo-400">Order {savgolOrder}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={2}
                                        max={5}
                                        step={1}
                                        value={savgolOrder}
                                        onChange={(e) => setSavgolOrder(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        )}

                        {filterType === "NOTCH" && (
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Center Rejection Frequency</span>
                                        <span className="font-mono text-indigo-400">{notchFreq} Hz</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={1}
                                        max={Math.max(10, Math.floor(fs * 0.45))}
                                        step={0.5}
                                        value={notchFreq}
                                        onChange={(e) => setNotchFreq(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Quality Factor (Q)</span>
                                        <span className="font-mono text-indigo-400">Q = {notchQ}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={1}
                                        max={25}
                                        step={1}
                                        value={notchQ}
                                        onChange={(e) => setNotchQ(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        )}
                        {filterType === "KALMAN_2D" && (
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setKalmanQ0(0.01);
                                            setKalmanQ1(0.1);
                                            setKalmanR(2.0);
                                        }}
                                        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-indigo-300"
                                    >
                                        IMU Preset (R=2.0)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setKalmanQ0(0.01);
                                            setKalmanQ1(0.1);
                                            setKalmanR(0.5);
                                        }}
                                        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-indigo-300"
                                    >
                                        Analog Preset (R=0.5)
                                    </button>
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Measurement Noise (R)</span>
                                        <span className="font-mono text-indigo-400">{kalmanR.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0.05}
                                        max={10}
                                        step={0.05}
                                        value={kalmanR}
                                        onChange={(e) => setKalmanR(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Rate Process Noise (Q0)</span>
                                        <span className="font-mono text-indigo-400">{kalmanQ0.toFixed(4)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0.0001}
                                        max={0.2}
                                        step={0.0005}
                                        value={kalmanQ0}
                                        onChange={(e) => setKalmanQ0(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Value Process Noise (Q1)</span>
                                        <span className="font-mono text-indigo-400">{kalmanQ1.toFixed(3)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0.001}
                                        max={1.0}
                                        step={0.005}
                                        value={kalmanQ1}
                                        onChange={(e) => setKalmanQ1(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handleApplyFilter}
                            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                        >
                            Apply Filter & Save Channel
                        </button>
                        <button
                            onClick={() => onCreateTareChannel(sourceKey)}
                            className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs"
                        >
                            Zero / Tare Baseline
                        </button>
                        <button
                            onClick={() => onCreateDerivativeChannel(sourceKey)}
                            className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs"
                        >
                            Compute Derivative (d/dt)
                        </button>
                    </div>
                </div>

                <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-5 space-y-4">
                    <h3 className="text-base font-semibold text-white">MATLAB-Style Equation & Filter Lab</h3>
                    <p className="text-xs text-gray-400">
                        Supports difference equations (<code className="text-indigo-300">y[n] = 0.9*y[n-1] + 0.1*x[n]</code>),
                        filter coefficients (<code className="text-indigo-300">b = [0.25, 0.25, 0.25, 0.25]; a = [1];</code>),
                        or multi-channel math (<code className="text-indigo-300">sqrt(Acceleration_on_X_axis^2 + Acceleration_on_Y_axis^2)</code>).
                    </p>

                    <div className="space-y-3 text-xs">
                        <div>
                            <label className="block text-gray-400 mb-1">Output Derived Channel Name</label>
                            <input
                                type="text"
                                value={matlabName}
                                onChange={(e) => setMatlabName(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-gray-400 mb-1">MATLAB Expression (x = {sourceKey})</label>
                            <textarea
                                rows={3}
                                value={matlabExpr}
                                onChange={(e) => setMatlabExpr(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-emerald-300 font-mono"
                            />
                        </div>

                        {matlabError && <div className="text-rose-400 text-xs">{matlabError}</div>}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <button
                                onClick={handleRunMatlab}
                                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                            >
                                Evaluate & Create Channel
                            </button>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => exportWorkspaceJSON(recipes)}
                                    className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200"
                                >
                                    Export JSON Setup
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200"
                                >
                                    Import JSON
                                </button>
                                <button
                                    onClick={() => exportFilteredCSV(timeMs, allChannels)}
                                    className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200"
                                >
                                    Export CSV
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    onChange={handleJsonUpload}
                                    className="hidden"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {recipes.length > 0 && (
                <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4 space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Active Non-Destructive Derived Channels ({recipes.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {recipes.map((r) => (
                            <div
                                key={r.id}
                                onClick={() => setPreviewKey(r.outputKey)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs cursor-pointer border ${
                                    activePreviewRecipe?.outputKey === r.outputKey
                                        ? "bg-indigo-950 border-indigo-500 text-indigo-200"
                                        : "bg-gray-800 border-gray-700 text-gray-300"
                                }`}
                            >
                                <span>{r.outputKey}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteRecipe(r.id);
                                    }}
                                    className="text-gray-400 hover:text-rose-400 font-bold"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {previewSourceArr && previewFilteredArr && (
                <FilterComparisonChart
                    timeMs={timeMs}
                    rawValues={previewSourceArr}
                    filteredValues={previewFilteredArr}
                    residualValues={previewResidualArr}
                    channelLabel={activePreviewRecipe?.outputKey || sourceKey}
                    unit={units[activePreviewRecipe?.sourceKey || sourceKey] || "-"}
                />
            )}
        </div>
    );
}