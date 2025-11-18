"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyToCanvas = void 0;
var logger_1 = require("../../utils/logger");
var perfomance_1 = require("../../utils/perfomance");
/** @ignore */
var copyToCanvas = function (sourceCanvas, getDestinationById) { return function (destinationId) {
    var _a;
    logger_1.Logger.debug("copyToCanvas");
    var mark = perfomance_1.PerformanceDebugHelper.mark(perfomance_1.EPerformanceMarkType.CopyToCanvasStart, {
        parentContextId: destinationId,
        level: perfomance_1.EPerformanceDebugLevel.Verbose
    });
    var destination = getDestinationById(destinationId);
    var sciChartSurface = destination === null || destination === void 0 ? void 0 : destination.sciChartSurface;
    var destinationCanvas = destination === null || destination === void 0 ? void 0 : destination.sciChartSurface.domCanvas2D;
    if (destinationCanvas) {
        var destinationCanvasContext = destinationCanvas.getContext("2d");
        destinationCanvasContext.globalCompositeOperation = "copy";
        destinationCanvasContext.drawImage(sourceCanvas, 0, 0, destinationCanvas.width, destinationCanvas.height, 0, 0, destinationCanvas.width, destinationCanvas.height);
        perfomance_1.PerformanceDebugHelper.mark(perfomance_1.EPerformanceMarkType.CopyToCanvasEnd, {
            contextId: sciChartSurface.id,
            parentContextId: destinationId,
            relatedId: (_a = mark === null || mark === void 0 ? void 0 : mark.detail) === null || _a === void 0 ? void 0 : _a.relatedId,
            level: perfomance_1.EPerformanceDebugLevel.Verbose
        });
        var isInvalidated = sciChartSurface.isInvalidated;
        sciChartSurface.renderedToDestination.raiseEvent(isInvalidated);
    }
}; };
exports.copyToCanvas = copyToCanvas;
