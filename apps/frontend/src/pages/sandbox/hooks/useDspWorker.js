import { useEffect, useRef, useCallback } from "react";

export function useDspWorker() {
    const workerRef = useRef(null);
    const pendingRef = useRef(new Map());
    const seqRef = useRef(1);

    useEffect(() => {
        const worker = new Worker(new URL("../workers/dspWorker.js", import.meta.url), {
            type: "module"
        });

        worker.onmessage = (event) => {
            const { id, ok, result, error } = event.data;
            const entry = pendingRef.current.get(id);
            if (!entry) return;
            pendingRef.current.delete(id);
            if (ok) entry.resolve(result);
            else entry.reject(new Error(error || "DSP Worker error"));
        };

        worker.onerror = (err) => {
            pendingRef.current.forEach((entry) => entry.reject(err));
            pendingRef.current.clear();
        };

        workerRef.current = worker;

        return () => {
            worker.terminate();
            workerRef.current = null;
            pendingRef.current.clear();
        };
    }, []);

    const runTask = useCallback((task, payload) => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) {
                reject(new Error("DSP Worker is not initialized."));
                return;
            }
            const id = seqRef.current++;
            pendingRef.current.set(id, { resolve, reject });
            workerRef.current.postMessage({ id, task, payload });
        });
    }, []);

    return { runTask };
}