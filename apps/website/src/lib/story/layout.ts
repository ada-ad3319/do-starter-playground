// Wall layout in wall pixels. Following the DO toolkit: text is at least 3% of the wall
// height, and each text block covers whole screens so no text crosses a screen edge.

import {
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    WALL_COLS,
    WALL_HEIGHT,
    WALL_ROWS,
    WALL_WIDTH
} from '../wall';

/** Text sizes as a share of the canvas height (toolkit minimum is 3%). */
export const TYPE = {
    title: Math.round(WALL_HEIGHT * 0.09),
    figure: Math.round(WALL_HEIGHT * 0.12),
    heading: Math.round(WALL_HEIGHT * 0.045),
    body: Math.round(WALL_HEIGHT * 0.036),
    small: Math.round(WALL_HEIGHT * 0.03)
} as const;

export type Box = { x: number; y: number; width: number; height: number };

/** Each side strip is a whole number of screen columns (1 on the 4x2 simulator, 3 on the DO). */
const STRIP_COLS = Math.max(1, Math.round(WALL_COLS * 0.2));
const STRIP_WIDTH = STRIP_COLS * SCREEN_WIDTH;
/** Top and bottom blocks split on a screen row boundary. */
const TOP_ROWS = Math.max(1, Math.floor(WALL_ROWS / 2));
const TOP_HEIGHT = TOP_ROWS * SCREEN_HEIGHT;

export const PADDING = Math.round(SCREEN_HEIGHT * 0.08);

export const LEFT_TOP: Box = { x: 0, y: 0, width: STRIP_WIDTH, height: TOP_HEIGHT };
export const LEFT_BOTTOM: Box = {
    x: 0,
    y: TOP_HEIGHT,
    width: STRIP_WIDTH,
    height: WALL_HEIGHT - TOP_HEIGHT
};
export const RIGHT_TOP: Box = {
    x: WALL_WIDTH - STRIP_WIDTH,
    y: 0,
    width: STRIP_WIDTH,
    height: TOP_HEIGHT
};
export const RIGHT_BOTTOM: Box = {
    x: WALL_WIDTH - STRIP_WIDTH,
    y: TOP_HEIGHT,
    width: STRIP_WIDTH,
    height: WALL_HEIGHT - TOP_HEIGHT
};

/** Camera padding: fit the network into the middle columns, between the two strips. */
export const MAP_PADDING = {
    left: STRIP_WIDTH + PADDING,
    right: STRIP_WIDTH + PADDING,
    top: PADDING,
    bottom: PADDING
};

/** Colours, based on the Imperial palette. */
export const COLORS = {
    background: '#05070F',
    panel: 'rgba(5, 8, 22, 0.88)',
    text: '#E6EAF2',
    muted: '#9AA3B5',
    /** Step-free highlight (Imperial "Pool"). */
    stepFree: '#00ACD7',
    /** No step-free access (Imperial "Cherry red", softened). */
    gap: '#E0436A',
    station: '#E6EAF2',
    stationStroke: '#070A16'
} as const;
