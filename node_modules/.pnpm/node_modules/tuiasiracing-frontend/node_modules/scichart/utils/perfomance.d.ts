/**
 * Performance debugging checkpoints enum
 */
export declare enum EPerformanceMarkType {
    /**
     * A surface creation start.
     * @remarks used internally
     */
    InitializationStart = "InitializationStart",
    /**
     * A surface creation end.
     * @remarks used internally
     */
    InitializationEnd = "InitializationEnd",
    /**
     * WASM engine fetching and initialization start.
     * @remarks used internally.
     */
    EngineInitStart = "EngineInitStart",
    /**
     * WASM engine fetching and initialization end.
     * @remarks used internally.
     */
    EngineInitEnd = "EngineInitEnd",
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
    LeadingInvalidate = "LeadingInvalidate",
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
    Invalidate = "Invalidate",
    /**
     * DataSeries update start.
     * @description
     * Appending, inserting, removing data in DataSeries.
     * @remarks used internally.
     */
    DataUpdateStart = "DataUpdateStart",
    /**
     * DataSeries update end.
     * @remarks used internally.
     */
    DataUpdateEnd = "DataUpdateEnd",
    /**
     * Chart rendering start.
     * @remarks used internally.
     */
    RenderStart = "RenderStart",
    /**
     * Chart rendering end.
     * @remarks used internally.
     */
    RenderEnd = "RenderEnd",
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
    Rendered = "Rendered",
    /**
     * Chart rendered.
     * @description
     * Represents a chart being rendered to a complete state.
     * In this state the surface is NOT invalidated.
     * Next render will happen after invalidation is triggered.
     * @remarks used internally.
     */
    FullStateRendered = "FullStateRendered",
    /**
     * Chart was painted.
     * @description
     * Chart has been visually pained to pixels.
     * @remarks used internally.
     */
    Painted = "Painted",
    /**
     * Chart element resizing.
     * @remarks used internally.
     */
    Resize = "Resize",
    /**
     * Browser zoom change.
     * @remarks used internally.
     */
    DpiChange = "DpiChange",
    /**
     * Chart initialization.
     * @remarks
     * used internally in `chartBuilder`.
     * Otherwise, it is supposed to be used explicitly after the surface is created.
     */
    SetupStart = "SetupStart",
    /**
     * Chart initialization.
     * @remarks
     * used internally in `chartBuilder`.
     * Otherwise, it is supposed to be used explicitly after the surface is created.
     */
    SetupEnd = "SetupEnd",
    CanvasInitializationStart = "CanvasInitializationStart",
    CanvasInitializationEnd = "CanvasInitializationEnd",
    AddSubSurfaceStart = "AddSubSurfaceStart",
    AddSubSurfaceEnd = "AddSubSurfaceEnd",
    RenderSurfaceDrawStart = "RenderSurfaceDrawStart",
    RenderSurfaceDrawEnd = "RenderSurfaceDrawEnd",
    DrawingLoopStart = "DrawingLoopStart",
    DrawingLoopEnd = "DrawingLoopEnd",
    CopyToCanvasStart = "CopyToCanvasStart",
    CopyToCanvasEnd = "CopyToCanvasEnd",
    GenericAnimationStart = "GenericAnimationStart",
    GenericAnimationEnd = "GenericAnimationEnd",
    AutoRangeStart = "AutoRangeStart",
    AutoRangeEnd = "AutoRangeEnd",
    LayoutStart = "LayoutStart",
    LayoutEnd = "LayoutEnd",
    GetTicksStart = "GetTicksStart",
    GetTicksEnd = "GetTicksEnd",
    DrawAxisBorderStart = "DrawAxisBorderStart",
    DrawAxisBorderEnd = "DrawAxisBorderEnd",
    DrawAxisBandsStart = "DrawAxisBandsStart",
    DrawAxisBandsEnd = "DrawAxisBandsEnd",
    DrawMinorGridLinesStart = "DrawMinorGridLinesStart",
    DrawMinorGridLinesEnd = "DrawMinorGridLinesEnd",
    DrawMajorGridLinesStart = "DrawMajorGridLinesStart",
    DrawMajorGridLinesEnd = "DrawMajorGridLinesEnd",
    DrawAxisBackgroundStart = "DrawAxisBackgroundStart",
    DrawAxisBackgroundEnd = "DrawAxisBackgroundEnd",
    DrawAxisLabelsStart = "DrawAxisLabelsStart",
    DrawAxisLabelsEnd = "DrawAxisLabelsEnd",
    DrawMinorTicksStart = "DrawMinorTicksStart",
    DrawMinorTicksEnd = "DrawMinorTicksEnd",
    DrawMajorTicksStart = "DrawMajorTicksStart",
    DrawMajorTicksEnd = "DrawMajorTicksEnd",
    DrawNativeTextStart = "DrawNativeTextStart",
    DrawNativeTextEnd = "DrawNativeTextEnd",
    DrawAnnotationStart = "DrawAnnotationStart",
    DrawAnnotationEnd = "DrawAnnotationEnd",
    ResampleSingleSeriesStart = "ResampleSingleSeriesStart",
    ResampleSingleSeriesEnd = "ResampleSingleSeriesEnd",
    DrawSingleSeriesStart = "DrawSingleSeriesStart",
    DrawSingleSeriesEnd = "DrawSingleSeriesEnd",
    DrawCollectionSeriesStart = "DrawCollectionSeriesStart",
    DrawCollectionSeriesEnd = "DrawCollectionSeriesEnd",
    PerformTextLayoutStart = "PerformTextLayoutStart",
    PerformTextLayoutEnd = "PerformTextLayoutEnd",
    DrawDataLabelsStart = "DrawDataLabelsStart",
    DrawDataLabelsEnd = "DrawDataLabelsEnd",
    PostDrawActionsStart = "PostDrawActionsStart",
    PostDrawActionsEnd = "PostDrawActionsEnd",
    PointerMoveStart = "PointerMoveStart",
    PointerMoveEnd = "PointerMoveEnd",
    PointerDownStart = "PointerDownStart",
    PointerDownEnd = "PointerDownEnd",
    PointerUpStart = "PointerUpStart",
    PointerUpEnd = "PointerUpEnd",
    ScrollStart = "ScrollStart",
    ScrollEnd = "ScrollEnd",
    DoubleClickStart = "DoubleClickStart",
    DoubleClickEnd = "DoubleClickEnd",
    MouseLeaveStart = "MouseLeaveStart",
    MouseLeaveEnd = "MouseLeaveEnd",
    MouseEnterStart = "MouseEnterStart",
    MouseEnterEnd = "MouseEnterEnd"
}
export declare enum EPerformanceDebugLevel {
    Info = 0,
    Verbose = 1
}
export declare type TPerformanceDetail = {
    relatedId?: string;
    contextId?: string;
    parentContextId?: string;
};
export declare type TProcessedDetail<TDetail extends TPerformanceDetail> = TDetail & {
    relatedId: string;
};
export interface TSciChartPerformanceMark<TDetail extends TPerformanceDetail> extends PerformanceMark {
    readonly detail: TDetail & {
        relatedId: string;
    };
}
export declare type TPerformanceMarkOptions<TDetail extends TPerformanceDetail> = TDetail & {
    level?: EPerformanceDebugLevel;
};
export declare type TSerializableMark = {
    startTime: DOMHighResTimeStamp;
    name: string;
    detail: TPerformanceDetail;
};
/** Serializable performance debug data with the timeOrigin of the thread */
export declare type TSciChartPerformanceData = {
    name: string;
    timeOrigin: DOMHighResTimeStamp;
    marks: TSerializableMark[];
};
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
export declare class PerformanceDebugHelper {
    static enableDebug: boolean;
    static debugLevel: EPerformanceDebugLevel;
    static instance: PerformanceDebugHelper;
    static mark<TDetail extends TPerformanceDetail>(type: EPerformanceMarkType | string, options?: TPerformanceMarkOptions<TDetail>): TSciChartPerformanceMark<TDetail>;
    /** @inheritDoc {@link PerformanceDebugHelper.getMarks{} */
    static getMarks(): TSciChartPerformanceMark<TPerformanceDetail>[];
    static clearMarks(name?: string): void;
    static outputLogs(): void;
    static toJSON(): TSciChartPerformanceData;
    separator: string;
    /**
     * Retrieves the marks.
     * @remarks the default implementation will return all PerformanceMark instances the browser's performance timeline (e.g. created via performance.mark)
     */
    getMarks(): TSciChartPerformanceMark<TPerformanceDetail>[];
    /**
     * Removes a specific mark by name or all marks if no name provided
     * @remarks the default implementation removes marks the browser's performance timeline as well.
     */
    clearMarks(name?: string): void;
    /**
     * Processes and creates a {@link TSciChartPerformanceMark} entry accordingly to provided  {@link TPerformanceMarkOptions | options }.
     * @remarks Make sure to provide a correct `level` option to define which marks are relevance. Default: EPerformanceDebugLevel.Info
     */
    addMark<TDetail extends TPerformanceDetail>(type: EPerformanceMarkType | string, options?: TPerformanceMarkOptions<TDetail>): TSciChartPerformanceMark<TDetail>;
    /**
     * Creates and returns {@link TSciChartPerformanceMark}
     *
     * @remarks default implementation adds mark to the browser's performance timeline.
     * Alternatively, override this to  add a mark to a separate collection without polluting the global object.
     * [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceMark)
     */
    protected createMark<TDetail extends TPerformanceDetail>(type: EPerformanceMarkType | string, groupId: string, detail: TProcessedDetail<TDetail>): TSciChartPerformanceMark<TDetail>;
}
/**
 * Runs `callback` shortly after the next browser Frame is produced.
 */
export declare function runAfterFramePaint(callback: () => void): void;
