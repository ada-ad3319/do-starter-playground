// Wall size. The real DO is 16 x 4 screens of 1920x1080; the simulator defaults to 4 x 2.
// Change it with env variables, e.g. `VITE_WALL_COLS=16 VITE_WALL_ROWS=4 pnpm dev`.

export const SCREEN_WIDTH = 1920;
export const SCREEN_HEIGHT = 1080;

const DEFAULT_COLS = 4;
const DEFAULT_ROWS = 2;
const MAX_COLS = 32;
const MAX_ROWS = 8;

export function parseWallDimension(value: unknown, fallback: number, max: number): number {
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return Math.min(max, parsed);
}

export const WALL_COLS = parseWallDimension(import.meta.env.VITE_WALL_COLS, DEFAULT_COLS, MAX_COLS);
export const WALL_ROWS = parseWallDimension(import.meta.env.VITE_WALL_ROWS, DEFAULT_ROWS, MAX_ROWS);

export const WALL_WIDTH = WALL_COLS * SCREEN_WIDTH;
export const WALL_HEIGHT = WALL_ROWS * SCREEN_HEIGHT;
