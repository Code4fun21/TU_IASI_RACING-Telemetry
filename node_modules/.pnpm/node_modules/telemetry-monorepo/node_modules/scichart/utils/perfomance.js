"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAfterFramePaint = exports.PerformanceDebugHelper = exports.EPerformanceDebugLevel = exports.EPerformanceMarkType = void 0;
var guid_1 = require("./guid");
/**
 * Performance debugging checkpoints enum
 */
var EPerformanceMarkType;
(function (EPerformanceMarkType) {
    /**
     * A surface creation start.
     * @remarks used internally
     */
    EPerformanceMarkType["InitializationStart"] = "InitializationStart";
    /**
     * A surface creation end.
     * @remarks used internally
     */
    EPerformanceMarkType["InitializationEnd"] = "InitializationEnd";
    /**
     * WASM engine fetching and initialization start.
     * @remarks used internally.
     */
    EPerformanceMarkType["EngineInitStart"] = "EngineInitStart";
    /**
     * WASM engine fetching and initialization end.
     * @remarks used internally.
     */
    EPerformanceMarkType["EngineInitEnd"] = "EngineInitEnd";
    /**
     * First surface invalidation in a sequence.
     *
     * @description
     * Surface invalidation is triggered implicitly on data or property changes.
     * Invalidating a surface means that it should rerender.
     * Multiple calls of {@link SciChartSurfaceBase.invalidateElement} are batched based on the timing.
     *
     * @remarks used internally
     */
    EPerformanceMarkType["LeadingInvalidate"] = "LeadingInvalidate";
    /**
     * Subsequent surface invalidation.
     *
     * @description
     * The subsequent surface invalidation shouldn't affect rerender
     * since it is enough to have a single `invalidate` call ({@link LeadingInvalidate})
     * But it may be used to see the time and number of updates occurring.
     *
     * @remarks used internally.
     */
    EPerformanceMarkType["Invalidate"] = "Invalidate";
    /**
     * DataSeries update start.
     * @description
     * Appending, inserting, removing data in DataSeries.
     * @remarks used internally.
     */
    EPerformanceMarkType["DataUpdateStart"] = "DataUpdateStart";
    /**
     * DataSeries update end.
     * @remarks used internally.
     */
    EPerformanceMarkType["DataUpdateEnd"] = "DataUpdateEnd";
    /**
     * Chart rendering start.
     * @remarks used internally.
     */
    EPerformanceMarkType["RenderStart"] = "RenderStart";
    /**
     * Chart rendering end.
     * @remarks used internally.
     */
    EPerformanceMarkType["RenderEnd"] = "RenderEnd";
    /**
     * Chart rendered.
     * @description
     * Represents a chart being rendered to an in between state that will be followed by another render.
     * (In some rare cases it could mean that the resulting image may be ito be incomplete incorrect, outdated,
     * or require another render iteration to make related calculations.)
     *
     * In this state the surface is invalidated, thus another render call is expected to follow.
     * @remarks used internally.
     */
    EPerformanceMarkType["Rendered"] = "Rendered";
    /**
     * Chart rendered.
     * @description
     * Represents a chart being rendered to a complete state.
     * In this state the surface is NOT invalidated.
     * Next render will happen after invalidation is triggered.
     * @remarks used internally.
     */
    EPerformanceMarkType["FullStateRendered"] = "FullStateRendered";
    /**
     * Chart was painted.
     * @description
     * Chart has been visually pained to pixels.
     * @remarks used internally.
     */
    EPerformanceMarkType["Painted"] = "Painted";
    /**
     * Chart element resizing.
     * @remarks used internally.
     */
    EPerformanceMarkType["Resize"] = "Resize";
    /**
     * Browser zoom change.
     * @remarks used internally.
     */
    EPerformanceMarkType["DpiChange"] = "DpiChange";
    /**
     * Chart initialization.
     * @remarks
     * used internally in `chartBuilder`.
     * Otherwise, it is supposed to be used explicitly after the surface is created.
     */
    EPerformanceMarkType["SetupStart"] = "SetupStart";
    /**
     * Chart initialization.
     * @remarks
     * used internally in `chartBuilder`.
     * Otherwise, it is supposed to be used explicitly after the surface is created.
     */
    EPerformanceMarkType["SetupEnd"] = "SetupEnd";
    EPerformanceMarkType["CanvasInitializationStart"] = "CanvasInitializationStart";
    EPerformanceMarkType["CanvasInitializationEnd"] = "CanvasInitializationEnd";
    EPerformanceMarkType["AddSubSurfaceStart"] = "AddSubSurfaceStart";
    EPerformanceMarkType["AddSubSurfaceEnd"] = "AddSubSurfaceEnd";
    EPerformanceMarkType["RenderSurfaceDrawStart"] = "RenderSurfaceDrawStart";
    EPerformanceMarkType["RenderSurfaceDrawEnd"] = "RenderSurfaceDrawEnd";
    EPerformanceMarkType["DrawingLoopStart"] = "DrawingLoopStart";
    EPerformanceMarkType["DrawingLoopEnd"] = "DrawingLoopEnd";
    EPerformanceMarkType["CopyToCanvasStart"] = "CopyToCanvasStart";
    EPerformanceMarkType["CopyToCanvasEnd"] = "CopyToCanvasEnd";
    EPerformanceMarkType["GenericAnimationStart"] = "GenericAnimationStart";
    EPerformanceMarkType["GenericAnimationEnd"] = "GenericAnimationEnd";
    EPerformanceMarkType["AutoRangeStart"] = "AutoRangeStart";
    EPerformanceMarkType["AutoRangeEnd"] = "AutoRangeEnd";
    EPerformanceMarkType["LayoutStart"] = "LayoutStart";
    EPerformanceMarkType["LayoutEnd"] = "LayoutEnd";
    EPerformanceMarkType["GetTicksStart"] = "GetTicksStart";
    EPerformanceMarkType["GetTicksEnd"] = "GetTicksEnd";
    EPerformanceMarkType["DrawAxisBorderStart"] = "DrawAxisBorderStart";
    EPerformanceMarkType["DrawAxisBorderEnd"] = "DrawAxisBorderEnd";
    EPerformanceMarkType["DrawAxisBandsStart"] = "DrawAxisBandsStart";
    EPerformanceMarkType["DrawAxisBandsEnd"] = "DrawAxisBandsEnd";
    EPerformanceMarkType["DrawMinorGridLinesStart"] = "DrawMinorGridLinesStart";
    EPerformanceMarkType["DrawMinorGridLinesEnd"] = "DrawMinorGridLinesEnd";
    EPerformanceMarkType["DrawMajorGridLinesStart"] = "DrawMajorGridLinesStart";
    EPerformanceMarkType["DrawMajorGridLinesEnd"] = "DrawMajorGridLinesEnd";
    EPerformanceMarkType["DrawAxisBackgroundStart"] = "DrawAxisBackgroundStart";
    EPerformanceMarkType["DrawAxisBackgroundEnd"] = "DrawAxisBackgroundEnd";
    EPerformanceMarkType["DrawAxisLabelsStart"] = "DrawAxisLabelsStart";
    EPerformanceMarkType["DrawAxisLabelsEnd"] = "DrawAxisLabelsEnd";
    EPerformanceMarkType["DrawMinorTicksStart"] = "DrawMinorTicksStart";
    EPerformanceMarkType["DrawMinorTicksEnd"] = "DrawMinorTicksEnd";
    EPerformanceMarkType["DrawMajorTicksStart"] = "DrawMajorTicksStart";
    EPerformanceMarkType["DrawMajorTicksEnd"] = "DrawMajorTicksEnd";
    EPerformanceMarkType["DrawNativeTextStart"] = "DrawNativeTextStart";
    EPerformanceMarkType["DrawNativeTextEnd"] = "DrawNativeTextEnd";
    EPerformanceMarkType["DrawAnnotationStart"] = "DrawAnnotationStart";
    EPerformanceMarkType["DrawAnnotationEnd"] = "DrawAnnotationEnd";
    EPerformanceMarkType["ResampleSingleSeriesStart"] = "ResampleSingleSeriesStart";
    EPerformanceMarkType["ResampleSingleSeriesEnd"] = "ResampleSingleSeriesEnd";
    EPerformanceMarkType["DrawSingleSeriesStart"] = "DrawSingleSeriesStart";
    EPerformanceMarkType["DrawSingleSeriesEnd"] = "DrawSingleSeriesEnd";
    EPerformanceMarkType["DrawCollectionSeriesStart"] = "DrawCollectionSeriesStart";
    EPerformanceMarkType["DrawCollectionSeriesEnd"] = "DrawCollectionSeriesEnd";
    EPerformanceMarkType["PerformTextLayoutStart"] = "PerformTextLayoutStart";
    EPerformanceMarkType["PerformTextLayoutEnd"] = "PerformTextLayoutEnd";
    EPerformanceMarkType["DrawDataLabelsStart"] = "DrawDataLabelsStart";
    EPerformanceMarkType["DrawDataLabelsEnd"] = "DrawDataLabelsEnd";
    EPerformanceMarkType["PostDrawActionsStart"] = "PostDrawActionsStart";
    EPerformanceMarkType["PostDrawActionsEnd"] = "PostDrawActionsEnd";
    EPerformanceMarkType["PointerMoveStart"] = "PointerMoveStart";
    EPerformanceMarkType["PointerMoveEnd"] = "PointerMoveEnd";
    EPerformanceMarkType["PointerDownStart"] = "PointerDownStart";
    EPerformanceMarkType["PointerDownEnd"] = "PointerDownEnd";
    EPerformanceMarkType["PointerUpStart"] = "PointerUpStart";
    EPerformanceMarkType["PointerUpEnd"] = "PointerUpEnd";
    EPerformanceMarkType["ScrollStart"] = "ScrollStart";
    EPerformanceMarkType["ScrollEnd"] = "ScrollEnd";
    EPerformanceMarkType["DoubleClickStart"] = "DoubleClickStart";
    EPerformanceMarkType["DoubleClickEnd"] = "DoubleClickEnd";
    EPerformanceMarkType["MouseLeaveStart"] = "MouseLeaveStart";
    EPerformanceMarkType["MouseLeaveEnd"] = "MouseLeaveEnd";
    EPerformanceMarkType["MouseEnterStart"] = "MouseEnterStart";
    EPerformanceMarkType["MouseEnterEnd"] = "MouseEnterEnd";
})(EPerformanceMarkType = exports.EPerformanceMarkType || (exports.EPerformanceMarkType = {}));
var EPerformanceDebugLevel;
(function (EPerformanceDebugLevel) {
    EPerformanceDebugLevel[EPerformanceDebugLevel["Info"] = 0] = "Info";
    EPerformanceDebugLevel[EPerformanceDebugLevel["Verbose"] = 1] = "Verbose";
})(EPerformanceDebugLevel = exports.EPerformanceDebugLevel || (exports.EPerformanceDebugLevel = {}));
/**
 * @experimental
 * An util used for adding performance checkpoints which can be then used for analyzing the chart performance.
 * The checkpoints are created via the [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
 * @remarks
 * By default it is disabled, to make use of the utils set {@link PerformanceDebugHelper.enableDebug}.
 * Some checkpoints are set implicitly.
 * Custom checkpoints could be set using {@link PerformanceDebugHelper.mark}.
 * To output the results use {@link PerformanceDebugHelper.outputLogs}.
 */
var PerformanceDebugHelper = /** @class */ (function () {
    function PerformanceDebugHelper() {
        this.separator = "_";
    }
    PerformanceDebugHelper.mark = function (type, options) {
        if (!PerformanceDebugHelper.enableDebug)
            return undefined;
        return PerformanceDebugHelper.instance.addMark(type, options);
    };
    /** @inheritDoc {@link PerformanceDebugHelper.getMarks{} */
    PerformanceDebugHelper.getMarks = function () {
        return PerformanceDebugHelper.instance.getMarks();
    };
    PerformanceDebugHelper.clearMarks = function (name) {
        return PerformanceDebugHelper.instance.clearMarks(name);
    };
    PerformanceDebugHelper.outputLogs = function () {
        var allMarks = PerformanceDebugHelper.instance.getMarks();
        allMarks.forEach(function (entry) {
            console.log(entry.name, entry.startTime);
        });
    };
    PerformanceDebugHelper.toJSON = function () {
        var allMarks = PerformanceDebugHelper.instance.getMarks();
        var serializedMarks = allMarks.map(function (_a) {
            var name = _a.name, startTime = _a.startTime, detail = _a.detail;
            return ({ name: name, startTime: startTime, detail: detail });
        });
        return { name: self.name, timeOrigin: performance.timeOrigin, marks: serializedMarks };
    };
    /**
     * Retrieves the marks.
     * @remarks the default implementation will return all PerformanceMark instances the browser's performance timeline (e.g. created via performance.mark)
     */
    PerformanceDebugHelper.prototype.getMarks = function () {
        return performance.getEntriesByType("mark");
    };
    /**
     * Removes a specific mark by name or all marks if no name provided
     * @remarks the default implementation removes marks the browser's performance timeline as well.
     */
    PerformanceDebugHelper.prototype.clearMarks = function (name) {
        performance.clearMarks(name);
    };
    /**
     * Processes and creates a {@link TSciChartPerformanceMark} entry accordingly to provided  {@link TPerformanceMarkOptions | options }.
     * @remarks Make sure to provide a correct `level` option to define which marks are relevance. Default: EPerformanceDebugLevel.Info
     */
    PerformanceDebugHelper.prototype.addMark = function (type, options) {
        var _a;
        var _b = options !== null && options !== void 0 ? options : { level: EPerformanceDebugLevel.Info }, level = _b.level, contextDetail = __rest(_b, ["level"]);
        var debugLevel = level !== null && level !== void 0 ? level : EPerformanceDebugLevel.Info;
        if (debugLevel <= PerformanceDebugHelper.debugLevel) {
            var groupId = (_a = options === null || options === void 0 ? void 0 : options.relatedId) !== null && _a !== void 0 ? _a : (0, guid_1.generateGuid)();
            contextDetail.relatedId = groupId;
            return this.createMark(type, groupId, contextDetail);
        }
        return null;
    };
    /**
     * Creates and returns {@link TSciChartPerformanceMark}
     *
     * @remarks default implementation adds mark to the browser's performance timeline.
     * Alternatively, override this to  add a mark to a separate collection without polluting the global object.
     * [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceMark)
     */
    PerformanceDebugHelper.prototype.createMark = function (type, groupId, detail) {
        return performance.mark("".concat(type).concat(this.separator).concat(groupId), { detail: detail });
    };
    PerformanceDebugHelper.enableDebug = false;
    PerformanceDebugHelper.debugLevel = EPerformanceDebugLevel.Info;
    PerformanceDebugHelper.instance = new PerformanceDebugHelper();
    return PerformanceDebugHelper;
}());
exports.PerformanceDebugHelper = PerformanceDebugHelper;
/**
 * Runs `callback` shortly after the next browser Frame is produced.
 */
function runAfterFramePaint(callback) {
    var messageChannel = new MessageChannel();
    // Setup the callback to run in a Task
    messageChannel.port1.onmessage = callback;
    // Queue the Task on the Task Queue
    messageChannel.port2.postMessage(undefined);
}
exports.runAfterFramePaint = runAfterFramePaint;
