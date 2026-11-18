// Types and checks for `/data/network.json` (made by data-pipeline/build_network.py).
// If the file has the wrong shape we throw an error, which the wall shows instead of the map.

export const NETWORK_URL = '/data/network.json';

export type NetworkLine = {
    id: string;
    name: string;
    mode: 'tube' | 'elizabeth-line' | 'dlr';
    /** Colour used on the dark wall (official TfL colour, brightened where needed). */
    display: string;
};

/** Step-free level for one line at one station: 2 = all platforms, 1 = some, 0 = none. */
export type StepFreeLevel = 0 | 1 | 2;

export type NetworkStation = {
    id: string;
    name: string;
    lon: number;
    lat: number;
    lines: string[];
    /** One step-free level per entry in `lines`. */
    sf: StepFreeLevel[];
    /** Entries + exits per year (TfL Annual Station Counts), or null if not published. */
    usage: number | null;
};

export type NetworkSegment = {
    line: string;
    /** Track between two consecutive stations, as [lon, lat] points. */
    path: Array<[number, number]>;
};

export type Network = {
    usageYear: number;
    stepFreeFeedDate: string;
    lines: NetworkLine[];
    stations: NetworkStation[];
    segments: NetworkSegment[];
};

export class NetworkValidationError extends Error {
    override name = 'NetworkValidationError';
}

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new NetworkValidationError(message);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isLonLat = (v: unknown): v is [number, number] =>
    Array.isArray(v) &&
    v.length === 2 &&
    isNumber(v[0]) &&
    isNumber(v[1]) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90;

/** Validate an untrusted JSON payload and return a typed network. */
export function parseNetwork(payload: unknown): Network {
    check(isObject(payload), 'network file is not an object');
    check(payload.version === 1, 'unsupported network file version');
    check(Array.isArray(payload.lines) && payload.lines.length > 0, 'lines missing');
    check(Array.isArray(payload.stations) && payload.stations.length > 0, 'stations missing');
    check(Array.isArray(payload.segments), 'segments missing');

    const lines = payload.lines.map((line, i): NetworkLine => {
        check(isObject(line) && typeof line.id === 'string', `lines[${i}] is invalid`);
        check(['tube', 'elizabeth-line', 'dlr'].includes(line.mode as string), `lines[${i}].mode`);
        check(
            typeof line.display === 'string' && /^#[0-9a-f]{6}$/i.test(line.display),
            `lines[${i}].display`
        );
        return {
            id: line.id,
            name: String(line.name),
            mode: line.mode as NetworkLine['mode'],
            display: line.display
        };
    });
    const lineIds = new Set(lines.map((line) => line.id));

    const stations = payload.stations.map((s, i): NetworkStation => {
        check(
            isObject(s) && typeof s.id === 'string' && typeof s.name === 'string',
            `stations[${i}]`
        );
        check(isLonLat([s.lon, s.lat]), `stations[${i}] has bad coordinates`);
        check(
            Array.isArray(s.lines) && s.lines.every((l) => lineIds.has(l as string)),
            `stations[${i}].lines`
        );
        check(
            Array.isArray(s.sf) &&
                s.sf.length === s.lines.length &&
                s.sf.every((x) => x === 0 || x === 1 || x === 2),
            `stations[${i}].sf`
        );
        check(s.usage === null || (isNumber(s.usage) && s.usage >= 0), `stations[${i}].usage`);
        return {
            id: s.id,
            name: s.name,
            lon: s.lon as number,
            lat: s.lat as number,
            lines: s.lines as string[],
            sf: s.sf as StepFreeLevel[],
            usage: s.usage as number | null
        };
    });

    const segments = payload.segments.map((seg, i): NetworkSegment => {
        check(isObject(seg) && lineIds.has(seg.line as string), `segments[${i}].line`);
        check(
            Array.isArray(seg.path) && seg.path.length >= 2 && seg.path.every(isLonLat),
            `segments[${i}].path`
        );
        return { line: seg.line as string, path: seg.path as Array<[number, number]> };
    });

    const sources = isObject(payload.sources) ? payload.sources : {};
    return {
        usageYear: isNumber(sources.usageYear) ? sources.usageYear : 0,
        stepFreeFeedDate:
            typeof sources.stepFreeFeedDate === 'string' ? sources.stepFreeFeedDate : '',
        lines,
        stations,
        segments
    };
}

export async function loadNetwork(): Promise<Network> {
    const response = await fetch(NETWORK_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${NETWORK_URL}`);
    return parseNetwork((await response.json()) as unknown);
}
