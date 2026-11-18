import { createFileRoute, useLocation } from '@tanstack/react-router';
import { Map, type MapRef } from '@vis.gl/react-maplibre';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DeckMap } from '../components/deck-map';
import { WallOverlay } from '../components/wall-overlay';
import '../lib/realtime/engines/screen-engine'; // connects this tab to the bus
import { useScreenStore } from '../lib/realtime/stores/screen-store';
import { computeStoryStats } from '../lib/story/analysis';
import { COLORS, TYPE } from '../lib/story/layout';
import {
    addLayers,
    applyLook,
    CAMERA_MS,
    ZOOM_MS,
    cameraFor,
    withSliderZoom,
    MAP_STYLE,
    screenView,
    lookFor,
    toGeoJson
} from '../lib/story/map';
import { useTweenView } from '../lib/use-tween';
import { SCREEN_HEIGHT, SCREEN_WIDTH, WALL_COLS, WALL_ROWS } from '../lib/wall';

import 'maplibre-gl/dist/maplibre-gl.css';

// One `/screen?c=<column>&r=<row>` page is one screen of the wall. It gets { view, zoom, playing }
// from the bus and works out its own part of the map and text.

export const Route = createFileRoute('/screen')({
    component: ScreenPage
});

type MapInstance = ReturnType<MapRef['getMap']>;

function ScreenPage() {
    const search = useLocation().search as Record<string, unknown>;
    const c = clampInt(search.c, WALL_COLS);
    const r = clampInt(search.r, WALL_ROWS);

    const show = useScreenStore((state) => state.show);
    const network = useScreenStore((state) => state.network);
    const networkError = useScreenStore((state) => state.networkError);
    const connection = useScreenStore((state) => state.connection);
    const stats = useMemo(() => (network ? computeStoryStats(network) : null), [network]);

    const [isClient, setIsClient] = useState(false);
    // Top-level page (a real DO screen): DeckGL. Inside an iframe (the simulator): MapLibre only.
    const [useDeck, setUseDeck] = useState(false);
    const [scale, setScale] = useState(1);
    const [map, setMap] = useState<MapInstance | null>(null);
    const [layersReady, setLayersReady] = useState(false);
    const mapRef = useCallback((ref: MapRef | null) => setMap(ref?.getMap() ?? null), []);

    useEffect(() => {
        // Browser-only work happens after hydration (the live state arrives over the websocket).
        setIsClient(true);
        setUseDeck(window.self === window.top);
        // Always draw at 1920x1080 and scale to the window, so the maths is identical on a DO
        // screen, in the simulator iframe, or in a laptop tab.
        const resize = () =>
            setScale(Math.min(innerWidth / SCREEN_WIDTH, innerHeight / SCREEN_HEIGHT));
        resize();
        addEventListener('resize', resize);
        return () => removeEventListener('resize', resize);
    }, []);

    // MapLibre path: add the TfL lines + stations once both the map style and the data are loaded.
    useEffect(() => {
        if (!map || !network || !stats || layersReady) return;
        const add = () => {
            if (map.getSource('stations') || !map.isStyleLoaded()) return;
            addLayers(map, toGeoJson(network, stats));
            setLayersReady(true);
        };
        // The style may finish loading before or after this runs, so try now and on map events.
        add();
        const events = ['load', 'styledata', 'idle'] as const;
        events.forEach((event) => map.on(event, add));
        return () => events.forEach((event) => map.off(event, add));
    }, [map, network, stats, layersReady]);

    // How bright each part of the map should be for this view.
    const look = useMemo(() => lookFor(show.view), [show.view]);
    useEffect(() => {
        if (map && layersReady) applyLook(map, look);
    }, [map, layersReady, look]);

    // One camera for the whole wall (plus the slider zoom), then shifted for this screen.
    const target = withSliderZoom(cameraFor(network, stats, show.view), show.view, show.zoom);
    // A new view glides slowly (CAMERA_MS); slider moves within a view glide quickly (ZOOM_MS).
    const wallView = useTweenView(
        target,
        `${show.view}-${stats ? 'ready' : 'loading'}`,
        CAMERA_MS,
        ZOOM_MS
    );
    const view = screenView(wallView, c, r);

    return (
        <main
            className="h-screen w-screen overflow-hidden"
            style={{ background: COLORS.background }}
        >
            <div
                className="pointer-events-none relative origin-top-left overflow-hidden"
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, transform: `scale(${scale})` }}
            >
                {isClient && (
                    <>
                        {useDeck ? (
                            <DeckMap view={view} network={network} stats={stats} look={look} />
                        ) : (
                            <Map
                                ref={mapRef}
                                mapStyle={MAP_STYLE}
                                attributionControl={false}
                                interactive={false}
                                // DO screens are 1x pixel ratio; keeps 8 simulator iframes light.
                                pixelRatio={1}
                                {...view}
                                style={{ width: '100%', height: '100%' }}
                            />
                        )}
                        <WallOverlay c={c} r={r} view={show.view} stats={stats} />
                        <Status error={networkError} connected={connection === 'open'} />
                    </>
                )}
            </div>
        </main>
    );
}

function Status({ error, connected }: { error: string | null; connected: boolean }) {
    if (error) {
        return (
            <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center"
                style={{
                    background: 'rgba(5,7,15,0.85)',
                    color: COLORS.text,
                    fontSize: TYPE.heading
                }}
            >
                <p style={{ color: COLORS.gap, fontWeight: 700 }}>
                    Could not load the TfL network data
                </p>
                <p style={{ fontSize: TYPE.body, color: COLORS.muted }}>{error}</p>
            </div>
        );
    }
    if (!connected) {
        return (
            <p
                className="absolute top-4 right-6"
                style={{ fontSize: TYPE.small, color: COLORS.muted }}
            >
                Reconnecting to controller…
            </p>
        );
    }
    return null;
}

/** Read `c` / `r` from the URL, defaulting to 0 and clamping to the wall size. */
function clampInt(value: unknown, size: number) {
    const n = Number(value);
    return Number.isInteger(n) ? Math.min(size - 1, Math.max(0, n)) : 0;
}
