"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisibilityObserver = void 0;
/**
 * @ignore
 * Observe the visibility of an element using {@link IntersectionObserver} API
 * @param element Element to observe
 * @param callback Callback when visibility changes
 * @param observerClass Constructor for IntersectionObserver (allows mocking)
 */
var VisibilityObserver = /** @class */ (function () {
    function VisibilityObserver(element, callback) {
        this.callback = callback;
        this.element = element;
    }
    VisibilityObserver.observe = function (element, callback) {
        var vo = new VisibilityObserver(element, callback);
        vo.init();
        return vo;
    };
    VisibilityObserver.prototype.disconnect = function () {
        this.observer.disconnect();
    };
    VisibilityObserver.prototype.init = function () {
        var _this = this;
        this.observer = new IntersectionObserver(function (entries) {
            for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
                var entry = entries_1[_i];
                _this.callback(entry.isIntersecting);
            }
        }, {
            root: null,
            threshold: 0.01 // Trigger when even 1% of the element is visible
        });
        this.observer.observe(this.element);
    };
    return VisibilityObserver;
}());
exports.VisibilityObserver = VisibilityObserver;
