import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import TimestampSelect from "../MQTT/Components/TimestampSelect";

import {
    SANDBOX_STORAGE_KEYS,
    buildTypedTelemetryStore,
    buildDerivedLabel,
    parseRawCanHexLog,
    evaluateChartAvailability,
    loadSavedRecipes,
    saveRecipesToStorage
} from "./store/sandboxStore";
import { BUNDLED_PRESETS, generatePresetDataset } from "./presets/trainingData";
import { useDspWorker } from "./hooks/useDspWorker";
import { computeRegionStats } from "./dsp/mathEngine";

import MultiTraceChart from "./charts/MultiTraceChart";
import SandboxGGChart from "./charts/SandboxGGChart";
import SandboxTrackMap from "./charts/SandboxTrackMap";
import {
    FFTChart,
    DamperHistogramChart,
    CustomXYChart,
    LapOverlayChart
} from "./charts/AnalysisCharts";
import FilterWorkbench from "./components/FilterWorkbench";
import { RegionReadoutCard, MissionsPanel } from "./components/SandboxPanels";

const readBlobAsText = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
    });

export default function SandBox() {
    const navigate = useNavigate();
    const { runTask } = useDspWorker();
    const rawCanInputRef = useRef(null);

    const [sandboxSessions, setSandboxSessions] = useState([]);
    const [selectedSourceId, setSelectedSourceId] = useState(
        () => localStorage.getItem(SANDBOX_STORAGE_KEYS.SESSION_ID) || "preset:clean_lap"
    );
    const [activeTab, setActiveTab] = useState(
        () => localStorage.getItem(SANDBOX_STORAGE_KEYS.ACTIVE_TAB) || "charts"
    );
    const [xAxisMode, setXAxisMode] = useState(
        () => localStorage.getItem(SANDBOX_STORAGE_KEYS.X_AXIS_MODE) || "time"
    );

    const [rawFileData, setRawFileData] = useState(null);
    const [geoData, setGeoData] = useState(null);
    const [gatesJson, setGatesJson] = useState(null);
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");

    const [selectedTs, setSelectedTs] = useState(null);
    const [selectedLap, setSelectedLap] = useState(null);
    const [selectedTurn, setSelectedTurn] = useState(null);

    const [recipes, setRecipes] = useState(() => loadSavedRecipes());
    const [derivedChannels, setDerivedChannels] = useState({});
    const [residuals, setResiduals] = useState({});

    const [selectedTraceKeys, setSelectedTraceKeys] = useState([
        "GPS_Speed",
        "Acceleration_on_X_axis",
        "Acceleration_on_Y_axis"
    ]);
    const [activeAnalysisView, setActiveAnalysisView] = useState("multi_trace");
    const [regionSelection, setRegionSelection] = useState(null);

    useEffect(() => {
        api.getSessions(true)
            .then((list) => {
                const flagged = Array.isArray(list)
                    ? list.filter((s) => Number(s.is_sandbox) === 1 || s.is_sandbox === true)
                    : [];
                setSandboxSessions(flagged);
            })
            .catch(() => setSandboxSessions([]));
    }, []);

    useEffect(() => {
        localStorage.setItem(SANDBOX_STORAGE_KEYS.SESSION_ID, selectedSourceId);
    }, [selectedSourceId]);

    useEffect(() => {
        localStorage.setItem(SANDBOX_STORAGE_KEYS.ACTIVE_TAB, activeTab);
    }, [activeTab]);

    useEffect(() => {
        localStorage.setItem(SANDBOX_STORAGE_KEYS.X_AXIS_MODE, xAxisMode);
    }, [xAxisMode]);

    useEffect(() => {
        saveRecipesToStorage(recipes);
    }, [recipes]);

    useEffect(() => {
        if (!selectedSourceId) return;
        setSelectedTs(null);
        setSelectedLap(null);
        setSelectedTurn(null);
        setRegionSelection(null);

        if (selectedSourceId.startsWith("preset:")) {
            const presetId = selectedSourceId.replace("preset:", "");
            const data = generatePresetDataset(presetId);
            setRawFileData(data);
            setGeoData(null);
            setGatesJson(null);
            setStatusMsg(`Loaded bundled training dataset (${data.rows.length} samples).`);
            return;
        }

        if (selectedSourceId.startsWith("rawcan:")) {
            return;
        }

        const sessionObj = sandboxSessions.find((s) => String(s.id) === String(selectedSourceId));
        if (!sessionObj) return;

        let cancelled = false;
        const loadR2Session = async () => {
            setLoading(true);
            setStatusMsg("Downloading telemetry file from R2...");
            try {
                console.log(sessionObj);
                const fileBlob = await api.downloadFile(sessionObj.decodedFileName || sessionObj.filePath);
                const text = await readBlobAsText(fileBlob);
                const parsed = JSON.parse(text);

                if (sessionObj.trackId) {
                    try {
                        const track = await api.getTrackById(sessionObj.trackId);
                        const [gBlob, cBlob] = await Promise.all([
                            api.downloadFile(track.gates),
                            api.downloadFile(track.coordinates)
                        ]);
                        if (!cancelled) {
                            setGatesJson(JSON.parse(await readBlobAsText(gBlob)));
                            setGeoData(JSON.parse(await readBlobAsText(cBlob)));
                        }
                    } catch {
                        if (!cancelled) {
                            setGatesJson(null);
                            setGeoData(null);
                        }
                    }
                }

                if (!cancelled) {
                    setRawFileData(parsed);
                    setStatusMsg(`Loaded R2 session "${sessionObj.name || sessionObj.id}".`);
                }
            } catch (err) {
                if (!cancelled) setStatusMsg(`Failed to load session: ${err.message}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadR2Session();
        return () => {
            cancelled = true;
        };
    }, [selectedSourceId, sandboxSessions]);

    const handleRawCanFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setStatusMsg(`Decoding raw CAN hex log "${file.name}" via CANDecoderV2...`);
        try {
            const text = await file.text();
            const decoded = await parseRawCanHexLog(text, gatesJson ? { gates: gatesJson } : null);
            setRawFileData(decoded);
            setSelectedSourceId(`rawcan:${file.name}`);
            setStatusMsg(`Decoded ${decoded.rows.length} CAN frames from ${file.name}.`);
        } catch (err) {
            setStatusMsg(`CAN decode failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const availableLaps = useMemo(() => {
        return rawFileData?.Gates_times?.lap_data || [];
    }, [rawFileData]);

    const availableTurns = useMemo(() => {
        const turns = new Set();
        availableLaps.forEach((lap) => {
            Object.keys(lap).forEach((k) => {
                if (k.startsWith("T")) {
                    turns.add(k.replace(/ IN$/, "").replace(/ OUT$/, ""));
                }
            });
        });
        return Array.from(turns);
    }, [availableLaps]);

    const activeTimeWindow = useMemo(() => {
        if (selectedTurn && availableLaps.length > 0) {
            const lap = selectedLap !== null ? availableLaps[selectedLap] : availableLaps[0];
            if (lap) {
                const tIn = lap[`${selectedTurn} IN`] || lap[selectedTurn];
                const tOut = lap[`${selectedTurn} OUT`] || (tIn ? tIn + 3000 : null);
                if (tIn && tOut) return { min: Math.min(tIn, tOut), max: Math.max(tIn, tOut) };
            }
        }
        if (selectedLap !== null && availableLaps[selectedLap]) {
            const lap = availableLaps[selectedLap];
            return {
                min: Number(lap.S0),
                max: Number(lap.S3 || lap.ts)
            };
        }
        if (selectedTs) {
            return {
                min: Number(selectedTs.startTime),
                max: Number(selectedTs.endTime)
            };
        }
        return null;
    }, [selectedTurn, selectedLap, selectedTs, availableLaps]);

    const baseStore = useMemo(() => {
        return buildTypedTelemetryStore(rawFileData, activeTimeWindow);
    }, [rawFileData, activeTimeWindow]);

    useEffect(() => {
        let cancelled = false;
        const recomputeRecipes = async () => {
            const nextDerived = {};
            const nextResiduals = {};

            for (const r of recipes) {
                const src = baseStore.rawChannels[r.sourceKey];
                if (!src || src.length === 0) continue;

                try {
                    if (r.kind === "TARE") {
                        const res = await runTask("TARE", {
                            values: src,
                            speedKmh: baseStore.rawChannels.GPS_Speed || null,
                            timeMs: baseStore.timeMs
                        });
                        nextDerived[r.outputKey] = res.values;
                        nextResiduals[r.outputKey] = new Float64Array(src.length).fill(res.offset);
                    } else if (r.kind === "DERIVATIVE") {
                        const res = await runTask("DERIVATIVE", {
                            timeMs: baseStore.timeMs,
                            values: src,
                            scaleFactor: 10
                        });
                        nextDerived[r.outputKey] = res;
                    } else if (r.kind === "MATLAB") {
                        const res = await runTask("MATLAB", {
                            expression: r.expression,
                            sourceArray: src,
                            allChannelsMap: { ...baseStore.rawChannels, ...nextDerived }
                        });
                        nextDerived[r.outputKey] = res;
                    } else {
                        const res = await runTask("FILTER", {
                            filterType: r.filterType,
                            values: src,
                            timeMs: baseStore.timeMs,
                            fs: baseStore.fs,
                            params: r.params
                        });
                        nextDerived[r.outputKey] = res.filtered;
                        nextResiduals[r.outputKey] = res.residual;
                    }
                } catch {
                    continue;
                }
            }

            if (!cancelled) {
                setDerivedChannels(nextDerived);
                setResiduals(nextResiduals);
            }
        };

        recomputeRecipes();
        return () => {
            cancelled = true;
        };
    }, [baseStore, recipes, runTask]);

    const allChannels = useMemo(() => {
        return { ...baseStore.rawChannels, ...derivedChannels };
    }, [baseStore.rawChannels, derivedChannels]);

    const allLabels = useMemo(() => {
        const merged = { ...baseStore.labels };
        recipes.forEach((r) => {
            merged[r.outputKey] = buildDerivedLabel(r, baseStore.labels);
        });
        return merged;
    }, [baseStore.labels, recipes]);

    const chartAvailability = useMemo(() => {
        return evaluateChartAvailability(allChannels, baseStore.gatesData);
    }, [allChannels, baseStore.gatesData]);

    const regionStats = useMemo(() => {
        if (!regionSelection) return null;
        const values = allChannels[regionSelection.channelKey];
        if (!values) return null;
        return computeRegionStats(
            baseStore.timeMs,
            allChannels.Distance,
            values,
            regionSelection.startX,
            regionSelection.endX,
            xAxisMode
        );
    }, [regionSelection, allChannels, baseStore.timeMs, xAxisMode]);

    

    const handleAddRecipe = useCallback((recipe) => {
        setRecipes((prev) => [...prev, recipe]);
        setSelectedTraceKeys((prev) => (prev.includes(recipe.outputKey) ? prev : [...prev, recipe.outputKey]));
    }, []);

    const handleDeleteRecipe = useCallback((id) => {
        setRecipes((prev) => prev.filter((r) => r.id !== id));
    }, []);

    const handleCreateTareChannel = useCallback(
        (sourceKey) => {
            const outputKey = `${sourceKey}_TARED`;
            handleAddRecipe({ id: outputKey, kind: "TARE", outputKey, sourceKey });
        },
        [handleAddRecipe]
    );

    const handleCreateDerivativeChannel = useCallback(
        (sourceKey) => {
            const outputKey = `VEL_${sourceKey}`;
            handleAddRecipe({ id: outputKey, kind: "DERIVATIVE", outputKey, sourceKey });
        },
        [handleAddRecipe]
    );

    const handleCreateMatlabChannel = useCallback(
        async (outputKey, expression, sourceKey) => {
            const src = baseStore.rawChannels[sourceKey];
            await runTask("MATLAB", {
                expression,
                sourceArray: src,
                allChannelsMap: allChannels
            });
            handleAddRecipe({ id: outputKey, kind: "MATLAB", outputKey, sourceKey, expression });
        },
        [baseStore.rawChannels, allChannels, runTask, handleAddRecipe]
    );

    const toggleTraceChannel = (key) => {
        setSelectedTraceKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    };

    const currentNumericSessionId =
        !selectedSourceId.startsWith("preset:") && !selectedSourceId.startsWith("rawcan:")
            ? selectedSourceId
            : null;

    const totalAnomalies = useMemo(() => {
        return Object.values(baseStore.anomalies || {}).reduce((acc, list) => acc + list.length, 0);
    }, [baseStore.anomalies]);

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 space-y-5">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/")}
                        className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 border border-gray-700"
                    >
                        ← Home
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-white tracking-tight">Telemetry DSP Sand Box</h1>
                        <p className="text-xs text-gray-400">{statusMsg || "Ready"}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={selectedSourceId}
                        onChange={(e) => setSelectedSourceId(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white max-w-xs"
                    >
                        <optgroup label="Bundled Training Presets">
                            {BUNDLED_PRESETS.map((p) => (
                                <option key={p.id} value={`preset:${p.id}`}>
                                    {p.name}
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="Curated Sandbox Sessions (R2)">
                            {sandboxSessions.map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                    {s.name || `Session #${s.id}`} {s.notes ? `— ${s.notes}` : ""}
                                </option>
                            ))}
                        </optgroup>
                    </select>

                    <button
                        onClick={() => rawCanInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-indigo-300"
                    >
                        Decode Raw CAN Hex (.txt/.log)
                    </button>
                    <input
                        ref={rawCanInputRef}
                        type="file"
                        accept=".txt,.log,.csv"
                        onChange={handleRawCanFileUpload}
                        className="hidden"
                    />

                    <div className="flex rounded-md overflow-hidden border border-gray-700 text-xs">
                        <button
                            onClick={() => setXAxisMode("time")}
                            className={`px-3 py-1.5 ${
                                xAxisMode === "time" ? "bg-indigo-600 text-white font-semibold" : "bg-gray-800 text-gray-300"
                            }`}
                        >
                            X: Time
                        </button>
                        <button
                            onClick={() => setXAxisMode("distance")}
                            disabled={!allChannels.Distance}
                            className={`px-3 py-1.5 disabled:opacity-40 ${
                                xAxisMode === "distance"
                                    ? "bg-indigo-600 text-white font-semibold"
                                    : "bg-gray-800 text-gray-300"
                            }`}
                        >
                            X: Distance
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gray-900/70 border border-gray-800 rounded-xl p-3">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Driver / Stint Slice</label>
                    {currentNumericSessionId ? (
                        <TimestampSelect
                            sessionId={currentNumericSessionId}
                            onSelect={(ts) => {
                                setSelectedTs(ts);
                                setSelectedLap(null);
                            }}
                        />
                    ) : (
                        <div className="text-xs text-gray-500 py-2 px-3 bg-gray-950/60 rounded border border-gray-800">
                            Full session active (select R2 multi-driver session for stints)
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">Lap Gate Slice</label>
                    <select
                        value={selectedLap ?? ""}
                        onChange={(e) => setSelectedLap(e.target.value === "" ? null : Number(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white"
                    >
                        <option value="">All Laps ({availableLaps.length} detected)</option>
                        {availableLaps.map((lap, idx) => (
                            <option key={idx} value={idx}>
                                Lap {idx + 1} {lap.lap_time ? `(${(lap.lap_time / 1000).toFixed(2)}s)` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">Corner / Turn Gate Slice</label>
                    <select
                        value={selectedTurn ?? ""}
                        onChange={(e) => setSelectedTurn(e.target.value === "" ? null : e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white"
                    >
                        <option value="">All Corners ({availableTurns.length} gates)</option>
                        {availableTurns.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: "charts", label: "Charts Workspace" },
                        { id: "filters", label: "Filters & Derived Signals" },
                        { id: "signals", label: `Loaded Signals (${Object.keys(allChannels).length})` },
                        { id: "missions", label: "Training Missions" }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                                activeTab === tab.id
                                    ? "bg-indigo-600 text-white shadow"
                                    : "bg-gray-900 text-gray-300 border border-gray-800 hover:bg-gray-800"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {totalAnomalies > 0 && (
                    <div className="px-3 py-1.5 rounded-md bg-amber-950/60 border border-amber-500/40 text-xs text-amber-300">
                        {totalAnomalies} sensor dropout / stale-frame windows flagged on timeline
                    </div>
                )}
            </div>

            {loading ? (
                <div className="p-12 text-center text-indigo-400 bg-gray-900/60 border border-gray-800 rounded-xl">
                    Loading and resampling telemetry streams...
                </div>
            ) : (
                <>
                    {activeTab === "charts" && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-2 bg-gray-900/80 border border-gray-800 rounded-lg p-2.5">
                                {[
                                    { id: "multi_trace", label: "Synchronized Multi-Trace" },
                                    { id: "gg_circle", label: "G-G Traction Circle" },
                                    { id: "track_map", label: "2D GPS Track Map" },
                                    { id: "fft_spectrum", label: "FFT Spectrum" },
                                    { id: "damper_hist", label: "Damper Histogram" },
                                    { id: "custom_xy", label: "Custom XY Scatter" },
                                    { id: "lap_overlay", label: "Lap Overlay" }
                                ].map((v) => {
                                    const avail = chartAvailability[v.id] || { enabled: true };
                                    return (
                                        <button
                                            key={v.id}
                                            disabled={!avail.enabled}
                                            title={avail.reason || v.label}
                                            onClick={() => setActiveAnalysisView(v.id)}
                                            className={`px-3 py-1.5 rounded text-xs font-medium disabled:opacity-35 disabled:cursor-not-allowed ${
                                                activeAnalysisView === v.id
                                                    ? "bg-emerald-600 text-white"
                                                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                                            }`}
                                        >
                                            {v.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {regionStats && (
                                <RegionReadoutCard
                                    regionStats={regionStats}
                                    channelLabel={baseStore.labels[regionSelection.channelKey] || regionSelection.channelKey}
                                    unit={baseStore.units[regionSelection.channelKey] || ""}
                                    onClear={() => setRegionSelection(null)}
                                />
                            )}

                            {activeAnalysisView === "multi_trace" && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-1.5 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
                                        {Object.keys(allChannels).map((key) => {
                                            const active = selectedTraceKeys.includes(key);
                                            const isDerived = Boolean(derivedChannels[key]);
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => toggleTraceChannel(key)}
                                                    className={`px-2.5 py-1 rounded-full text-xs border transition ${
                                                        active
                                                            ? isDerived
                                                                ? "bg-emerald-600/90 border-emerald-400 text-white"
                                                                : "bg-indigo-600/90 border-indigo-400 text-white"
                                                            : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                                                    }`}
                                                >
                                                    {baseStore.labels[key] || key}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <MultiTraceChart
                                        selectedChannels={selectedTraceKeys}
                                        allChannels={allChannels}
                                        labels={baseStore.labels}
                                        units={baseStore.units}
                                        anomalies={baseStore.anomalies}
                                        timeMs={baseStore.timeMs}
                                        distanceM={allChannels.Distance}
                                        xAxisMode={xAxisMode}
                                        onRegionSelect={(startX, endX, channelKey) =>
                                            setRegionSelection({ startX, endX, channelKey })
                                        }
                                    />
                                </div>
                            )}

                            {activeAnalysisView === "gg_circle" && <SandboxGGChart allChannels={allChannels} />}

                            {activeAnalysisView === "track_map" && (
                                <SandboxTrackMap
                                    allChannels={allChannels}
                                    timeMs={baseStore.timeMs}
                                    geoData={geoData}
                                    gatesData={gatesJson}
                                />
                            )}

                            {activeAnalysisView === "fft_spectrum" && (
                                <FFTChart
                                    allChannels={allChannels}
                                    labels={baseStore.labels}
                                    timeMs={baseStore.timeMs}
                                    runTask={runTask}
                                />
                            )}

                            {activeAnalysisView === "damper_hist" && (
                                <DamperHistogramChart
                                    allChannels={allChannels}
                                    timeMs={baseStore.timeMs}
                                    runTask={runTask}
                                />
                            )}

                            {activeAnalysisView === "custom_xy" && (
                                <CustomXYChart
                                    allChannels={allChannels}
                                    labels={baseStore.labels}
                                    units={baseStore.units}
                                />
                            )}

                            {activeAnalysisView === "lap_overlay" && (
                                <LapOverlayChart
                                    allChannels={allChannels}
                                    labels={baseStore.labels}
                                    units={baseStore.units}
                                    timeMs={baseStore.timeMs}
                                    gatesData={baseStore.gatesData}
                                />
                            )}
                        </div>
                    )}

                    {activeTab === "filters" && (
                        <FilterWorkbench
                            rawChannels={baseStore.rawChannels}
                            allChannels={allChannels}
                            residuals={residuals}
                            labels={baseStore.labels}
                            units={baseStore.units}
                            timeMs={baseStore.timeMs}
                            fs={baseStore.fs}
                            recipes={recipes}
                            onAddRecipe={handleAddRecipe}
                            onDeleteRecipe={handleDeleteRecipe}
                            onImportRecipes={(imported) => setRecipes(imported)}
                            onCreateTareChannel={handleCreateTareChannel}
                            onCreateDerivativeChannel={handleCreateDerivativeChannel}
                            onCreateMatlabChannel={handleCreateMatlabChannel}
                        />
                    )}

                    {activeTab === "signals" && (
                        <div className="bg-gray-900/90 border border-gray-800 rounded-lg overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-950 text-gray-400 uppercase border-b border-gray-800">
                                    <tr>
                                        <th className="py-3 px-4">Channel Key</th>
                                        <th className="py-3 px-4">Display Label</th>
                                        <th className="py-3 px-4">Layer</th>
                                        <th className="py-3 px-4">Unit</th>
                                        <th className="py-3 px-4">Samples</th>
                                        <th className="py-3 px-4">Health / Dropouts</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {Object.keys(allChannels).map((key) => {
                                        const isDerived = Boolean(derivedChannels[key]);
                                        const issues = baseStore.anomalies?.[key] || [];
                                        return (
                                            <tr key={key} className="hover:bg-gray-800/40">
                                                <td className="py-2.5 px-4 font-mono text-indigo-300">{key}</td>
                                                <td className="py-2.5 px-4 text-white">{baseStore.labels[key] || key}</td>
                                                <td className="py-2.5 px-4">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-[11px] ${
                                                            isDerived
                                                                ? "bg-emerald-500/20 text-emerald-300"
                                                                : "bg-gray-800 text-gray-300"
                                                        }`}
                                                    >
                                                        {isDerived ? "Derived" : "Raw"}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-gray-400">{baseStore.units[key] || "-"}</td>
                                                <td className="py-2.5 px-4 font-mono">{allChannels[key].length}</td>
                                                <td className="py-2.5 px-4">
                                                    {issues.length === 0 ? (
                                                        <span className="text-emerald-400">Clean</span>
                                                    ) : (
                                                        <span className="text-amber-400">{issues.length} flagged</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === "missions" && (
                        <MissionsPanel
                            allChannels={allChannels}
                            onLoadPreset={(presetId) => {
                                setSelectedSourceId(`preset:${presetId}`);
                                setActiveTab("filters");
                            }}
                        />
                    )}
                </>
            )}
        </div>
    );
}