import { useEffect, useRef, useState } from 'react';

import type { MapView } from './story/map';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Move the camera smoothly to `target`. A new view (`sceneKey` changes) takes `sceneMs`;
 * slider changes within the same view take the shorter `adjustMs`.
 */
export function useTweenView(target: MapView, sceneKey: string, sceneMs: number, adjustMs: number) {
    const [view, setView] = useState(target);
    const viewRef = useRef(target);
    const lastSceneRef = useRef(sceneKey);
    const { longitude, latitude, zoom } = target;

    useEffect(() => {
        const from = viewRef.current;
        const duration = lastSceneRef.current === sceneKey ? adjustMs : sceneMs;
        lastSceneRef.current = sceneKey;
        const start = performance.now();
        let frame = 0;
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const k = easeInOutCubic(t);
            const next = {
                ...from,
                longitude: from.longitude + (longitude - from.longitude) * k,
                latitude: from.latitude + (latitude - from.latitude) * k,
                zoom: from.zoom + (zoom - from.zoom) * k
            };
            viewRef.current = next;
            setView(next);
            if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame); // never leak animation frames
    }, [longitude, latitude, zoom, sceneKey, sceneMs, adjustMs]);

    return view;
}
