"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebGlHelper = exports.EWebGLSupport = void 0;
var app_1 = require("../constants/app");
/**
 * Enum constants returned by {@link WebGlHelper.getWebGlSupport}
 */
var EWebGLSupport;
(function (EWebGLSupport) {
    EWebGLSupport["WebGL2"] = "WebGL 2";
    EWebGLSupport["WebGL1"] = "WebGL 1";
    EWebGLSupport["NoWebGL"] = "No WebGL support";
})(EWebGLSupport = exports.EWebGLSupport || (exports.EWebGLSupport = {}));
/**
 * Helper class to extract WebGL1/2 detection and context creation
 */
var WebGlHelper = /** @class */ (function () {
    function WebGlHelper() {
    }
    /**
     * Static initializer function. Is called once by the framework on startup
     */
    WebGlHelper.initialize = function () {
        if (!WebGlHelper.initialized) {
            if (!WebGlHelper.webGlSupport && !app_1.IS_TEST_ENV) {
                var canvas = document.createElement("canvas");
                if (canvas.getContext("webgl2", { powerPreference: "high-performance" })) {
                    WebGlHelper.webGlSupport = EWebGLSupport.WebGL2;
                }
                else if (canvas.getContext("webgl")) {
                    WebGlHelper.webGlSupport = EWebGLSupport.WebGL1;
                }
                else {
                    WebGlHelper.webGlSupport = EWebGLSupport.NoWebGL;
                }
            }
            WebGlHelper.initialized = true;
        }
    };
    /**
     * Gets the WebGL support by the browser. See {@link EWebGLSupport} for options
     */
    WebGlHelper.getWebGlSupport = function () {
        return WebGlHelper.webGlSupport;
    };
    /**
     * Calls canvas.getContext() passing in "webgl" or "webgl2" depending on current browser WebGL Support.
     * @param canvas
     * @param options
     */
    WebGlHelper.getContext = function (canvas, options) {
        if (!canvas || app_1.IS_TEST_ENV) {
            return undefined;
        }
        if (WebGlHelper.webGlSupport === EWebGLSupport.WebGL1) {
            return canvas.getContext("webgl", __assign({}, options));
        }
        if (WebGlHelper.webGlSupport === EWebGLSupport.WebGL2) {
            return canvas.getContext("webgl2", __assign(__assign({}, options), { powerPreference: "high-performance" }));
        }
        throw new Error("SciChart: WebGL not supported!");
    };
    WebGlHelper.webGlSupport = undefined;
    WebGlHelper.initialized = false;
    return WebGlHelper;
}());
exports.WebGlHelper = WebGlHelper;
