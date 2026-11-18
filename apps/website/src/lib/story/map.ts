// Map data, layers, how bright things are in each view, and the camera.

import { WebMercatorViewport } from '@deck.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';

import type { View } from '../realtime/types';
import {
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    WALL_COLS,
    WALL_HEIGHT,
    WALL_ROWS,
    WALL_WIDTH
} from '../wall';
import { stationLevel, type StoryStats } from './analysis';
import { COLORS, MAP_PADDING } from './layout';
import type { Network } from './network';

// Dark basemap without labels (our own text is sized for the wall).
export const MAP_STYLE =
    'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

/** Slow fades and camera moves, so nothing on the wall moves quickly. */
export const FADE_MS = 1800;
export const CAMERA_MS = 2800;
/** Shorter glide for the zoom slider. */
export const ZOOM_MS = 600;
export const LINE_WIDTH = 10;

export type MapView = {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing: number;
    pitch: number;
};

export function toGeoJson(network: Network, stats: StoryStats) {
    const colorOf = new Map(network.lines.map((line) => [line.id, line.display]));
    const maxUsage = Math.max(...network.stations.map((s) => s.usage ?? 0));
    const gapIndexes = new Set(stats.busiestGaps.map((gap) => gap.index));

    const lines = {
        type: 'FeatureCollection' as const,
        features: network.segments.map((segment) => ({
            type: 'Feature' as const,
            properties: { color: colorOf.get(segment.line) ?? '#cccccc' },
            geometry: { type: 'LineString' as const, coordinates: segment.path }
        }))
    };
    const stations = {
        type: 'FeatureCollection' as const,
        features: network.stations.map((station, index) => ({
            type: 'Feature' as const,
            properties: {
                stepFree: (stationLevel(station) ?? 0) > 0,
                gap: gapIndexes.has(index),
                // Circle AREA proportional to passengers per year.
                radius: 8 + 26 * Math.sqrt((station.usage ?? 0) / maxUsage)
            },
            geometry: { type: 'Point' as const, coordinates: [station.lon, station.lat] }
        }))
    };
    return { lines, stations };
}

/** How bright each part of the map is. Used by both the deck.gl and MapLibre versions. */
export type Look = {
    lineOpacity: number;
    noStepFreeOpacity: number;
    stepFreeColor: string;
    gapOpacity: number;
};

export function lookFor(view: View): Look {
    return {
        // Busiest gaps: dim the lines so the pink stations stand out.
        lineOpacity: view === 'gaps' ? 0.45 : 0.9,
        // Stations with no step-free route fade out; step-free ones turn blue.
        noStepFreeOpacity: view === 'everyone' ? 1 : 0.1,
        stepFreeColor: view === 'everyone' ? COLORS.station : COLORS.stepFree,
        gapOpacity: view === 'gaps' ? 1 : 0
    };
}

const fade = { duration: FADE_MS, delay: 0 };

/** Add the sources + layers once. Afterwards only `applyLook` changes them. */
export function addLayers(map: MapLibreMap, data: ReturnType<typeof toGeoJson>) {
    map.addSource('lines', { type: 'geojson', data: data.lines });
    map.addSource('stations', { type: 'geojson', data: data.stations });

    map.addLayer({
        id: 'lines',
        type: 'line',
        source: 'lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': ['get', 'color'],
            'line-width': LINE_WIDTH,
            'line-opacity': 0.9,
            'line-opacity-transition': fade
        }
    });

    const stationLayer = (id: string, stepFree: boolean) =>
        map.addLayer({
            id,
            type: 'circle',
            source: 'stations',
            filter: ['==', ['get', 'stepFree'], stepFree],
            paint: {
                'circle-radius': ['get', 'radius'],
                'circle-color': COLORS.station,
                'circle-stroke-color': COLORS.stationStroke,
                'circle-stroke-width': 3,
                'circle-color-transition': fade,
                'circle-opacity-transition': fade,
                'circle-stroke-opacity-transition': fade
            }
        });
    stationLayer('stations-none', false);
    stationLayer('stations-stepfree', true);

    // The busiest stations with no step-free route, filled pink in the "gaps" view.
    map.addLayer({
        id: 'gap-stations',
        type: 'circle',
        source: 'stations',
        filter: ['==', ['get', 'gap'], true],
        paint: {
            'circle-radius': ['+', ['get', 'radius'], 6],
            'circle-color': COLORS.gap,
            'circle-stroke-color': COLORS.stationStroke,
            'circle-stroke-width': 4,
            'circle-opacity': 0,
            'circle-stroke-opacity': 0,
            'circle-opacity-transition': fade,
            'circle-stroke-opacity-transition': fade
        }
    });
}

/** MapLibre fades to the new values using the `-transition` settings above. */
export function applyLook(map: MapLibreMap, look: Look) {
    map.setPaintProperty('lines', 'line-opacity', look.lineOpacity);
    map.setPaintProperty('stations-none', 'circle-opacity', look.noStepFreeOpacity);
    map.setPaintProperty('stations-none', 'circle-stroke-opacity', look.noStepFreeOpacity);
    map.setPaintProperty('stations-stepfree', 'circle-color', look.stepFreeColor);
    map.setPaintProperty('gap-stations', 'circle-opacity', look.gapOpacity);
    map.setPaintProperty('gap-stations', 'circle-stroke-opacity', look.gapOpacity);
}

export const DEFAULT_VIEW: MapView = {
    longitude: -0.1276,
    latitude: 51.5072,
    zoom: 10,
    bearing: 0,
    pitch: 0
};

/** Camera for the whole wall, fitting the network (or the busiest gaps) between the text strips. */
export function cameraFor(network: Network | null, stats: StoryStats | null, view: View): MapView {
    if (!network || !stats) return DEFAULT_VIEW;
    const stations =
        view === 'gaps'
            ? stats.busiestGaps.map((gap) => network.stations[gap.index])
            : network.stations;
    const lons = stations.map((s) => s.lon);
    const lats = stations.map((s) => s.lat);
    const pad = view === 'gaps' ? 0.015 : 0; // a little room around the busiest stations
    const fitted = new WebMercatorViewport({ width: WALL_WIDTH, height: WALL_HEIGHT }).fitBounds(
        [
            [Math.min(...lons) - pad, Math.min(...lats) - pad / 2],
            [Math.max(...lons) + pad, Math.max(...lats) + pad / 2]
        ],
        { padding: MAP_PADDING }
    );
    return {
        longitude: fitted.longitude,
        latitude: fitted.latitude,
        zoom: fitted.zoom,
        bearing: 0,
        pitch: 0
    };
}

/** Charing Cross: the traditional centre of London, where the zoom slider zooms towards. */
const CENTRAL_LONDON = { longitude: -0.1246, latitude: 51.5074 };

/**
 * Add the slider zoom. Zooming in also moves the centre towards central London (fully by +1),
 * because the middle of the whole network is further west, out along the Elizabeth line.
 */
export function withSliderZoom(camera: MapView, view: View, zoom: number): MapView {
    const pull = view === 'gaps' ? 0 : Math.min(1, Math.max(0, zoom));
    return {
        ...camera,
        longitude: camera.longitude + (CENTRAL_LONDON.longitude - camera.longitude) * pull,
        latitude: camera.latitude + (CENTRAL_LONDON.latitude - camera.latitude) * pull,
        zoom: camera.zoom + zoom
    };
}

/** This screen's camera: the wall camera moved by this screen's offset from the wall centre. */
export function screenView(wallView: MapView, c: number, r: number): MapView {
    const viewport = new WebMercatorViewport({
        ...wallView,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT
    });
    const [x, y] = viewport.project([wallView.longitude, wallView.latitude]);
    const dx = (c + 0.5 - WALL_COLS / 2) * SCREEN_WIDTH;
    const dy = (r + 0.5 - WALL_ROWS / 2) * SCREEN_HEIGHT;
    const [longitude, latitude] = viewport.unproject([x + dx, y + dy]);
    return { ...wallView, longitude, latitude };
}
