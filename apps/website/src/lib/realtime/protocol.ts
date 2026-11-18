// Checks for messages from controllers and the server.

import { nextView, VIEW_ORDER } from '../story/views';
import type { ShowState, View } from './types';

/** Zoom slider range, in map zoom levels on top of each view's camera (+1 = twice as close). */
export const ZOOM_MIN = -1;
export const ZOOM_MAX = 3;

export function isView(value: unknown): value is View {
    return VIEW_ORDER.includes(value as View);
}

/** Keep zoom inside the slider range, rounded to 0.1. */
export function clampZoom(value: number): number {
    return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 10) / 10;
}

/** Check a state snapshot received from the server. Returns null if it is malformed. */
export function sanitizeShowState(value: unknown): ShowState | null {
    if (typeof value !== 'object' || value === null) return null;
    const { view, zoom, playing } = value as Record<string, unknown>;
    if (!isView(view) || typeof playing !== 'boolean') return null;
    if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return null;
    return { view, zoom: clampZoom(zoom), playing };
}

/**
 * Apply one controller message to the current state. Returns the new state, or null if the
 * message is invalid. Using the controller pauses autoplay.
 */
export function applyIntent(state: ShowState, message: unknown): ShowState | null {
    if (typeof message !== 'object' || message === null) return null;
    const payload = message as Record<string, unknown>;
    if (payload.type === 'control/view' && isView(payload.view)) {
        // A new view starts from its own framing again.
        return { view: payload.view, zoom: 0, playing: false };
    }
    if (
        payload.type === 'control/zoom' &&
        typeof payload.zoom === 'number' &&
        Number.isFinite(payload.zoom)
    ) {
        return { ...state, zoom: clampZoom(payload.zoom), playing: false };
    }
    if (payload.type === 'control/playing' && typeof payload.playing === 'boolean') {
        return { ...state, playing: payload.playing };
    }
    return null;
}

/** Autoplay step: next view, back to its own framing. */
export function advance(state: ShowState): ShowState {
    return { view: nextView(state.view), zoom: 0, playing: true };
}
