/** @ignore */
export declare type IntersectionObserverConstructor = new (callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => IntersectionObserver;
/**
 * @ignore
 * Observe the visibility of an element using {@link IntersectionObserver} API
 * @param element Element to observe
 * @param callback Callback when visibility changes
 * @param observerClass Constructor for IntersectionObserver (allows mocking)
 */
export declare class VisibilityObserver {
    static observe(element: HTMLDivElement, callback: (isVisible: boolean) => void): VisibilityObserver;
    protected readonly element: HTMLDivElement;
    protected readonly callback: (isVisible: boolean) => void;
    private observer;
    protected constructor(element: HTMLDivElement, callback: (isVisible: boolean) => void);
    disconnect(): void;
    protected init(): void;
}
