import { TGradientStop } from "../../../../types/TGradientStop";
import { TSciChart } from "../../../../types/TSciChart";
import { WebGlRenderContext2D } from "../../../Drawing/WebGlRenderContext2D";
import { RenderPassData } from "../../../Services/RenderPassData";
import { CanvasTexture } from "../../TextureManager/CanvasTexture";
import { UniformHeatmapRenderableSeries } from "../UniformHeatmapRenderableSeries";
import { BaseSeriesDrawingProvider } from "./BaseSeriesDrawingProvider";
/**
 * Used internally - a drawing provider performs drawing for a {@link UniformHeatmapRenderableSeries} using
 * our WebAssembly WebGL rendering engine
 */
export declare class UniformHeatmapDrawingProvider extends BaseSeriesDrawingProvider<UniformHeatmapRenderableSeries> {
    private paletteTexture;
    private heatTextureCache;
    private packedFloatParams;
    private hasNaNs;
    private opacity;
    private gradientStops;
    /**
     * Creates an instance of the {@link UniformHeatmapDrawingProvider}
     * @param webAssemblyContext The {@link TSciChart | SciChart 2D WebAssembly Context} containing native methods and
     * access to our WebGL2 Engine and WebAssembly numerical methods
     * @param parentSeries the parent {@link UniformHeatmapRenderableSeries} which this drawing provider is attached to
     */
    constructor(webAssemblyContext: TSciChart, parentSeries: UniformHeatmapRenderableSeries);
    /**
     * @inheritDoc
     */
    delete(): void;
    /**
     * @inheritDoc
     */
    onSeriesPropertyChange(propertyName: string): void;
    protected seriesHasDataChanges(): void;
    /**
     * @inheritDoc
     */
    draw(renderContext: WebGlRenderContext2D, renderPassData: RenderPassData): void;
    protected createPaletteTexture(width: number, height: number, gradientStops: TGradientStop[], globalOpacity: number, hasNaNs: boolean): CanvasTexture;
    private recreatePalette;
    private drawHeatmap;
}
