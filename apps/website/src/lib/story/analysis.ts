// All the numbers shown on the wall, calculated from the data.

import type { Network, NetworkStation, StepFreeLevel } from './network';

/** Lines where every station is step-free. */
export const MODEL_LINE_IDS: ReadonlySet<string> = new Set(['elizabeth', 'dlr']);

/** Overall level across some of a station's lines: 2 = all step-free, 1 = some, 0 = none. */
export function stationLevel(
    station: NetworkStation,
    includeLine: (lineId: string) => boolean = () => true
): StepFreeLevel | null {
    const levels = station.sf.filter((_, i) => includeLine(station.lines[i]));
    if (levels.length === 0) return null;
    if (levels.every((level) => level === 2)) return 2;
    return levels.some((level) => level > 0) ? 1 : 0;
}

export type LineStat = {
    id: string;
    name: string;
    color: string;
    stations: number;
    stepFree: number;
};
export type BusyGap = { index: number; name: string; usage: number };

export type StoryStats = {
    tubeStations: number;
    tubeLines: number;
    tubeStepFree: number;
    tubeNone: number;
    tubeUsage: number;
    tubeUsageNone: number;
    /** Tube lines, worst step-free share first. */
    lines: LineStat[];
    /** Elizabeth line + DLR. */
    modelLines: LineStat[];
    /** Busiest stations with no step-free route at all. */
    busiestGaps: BusyGap[];
    usageYear: number;
};

export function computeStoryStats(network: Network): StoryStats {
    const tubeIds = new Set(network.lines.filter((l) => l.mode === 'tube').map((l) => l.id));
    const stats: StoryStats = {
        tubeStations: 0,
        tubeLines: tubeIds.size,
        tubeStepFree: 0,
        tubeNone: 0,
        tubeUsage: 0,
        tubeUsageNone: 0,
        lines: [],
        modelLines: [],
        busiestGaps: [],
        usageYear: network.usageYear
    };

    network.stations.forEach((station, index) => {
        const level = stationLevel(station, (line) => tubeIds.has(line));
        if (level === null) return; // not a Tube station
        stats.tubeStations += 1;
        stats.tubeUsage += station.usage ?? 0;
        if (level > 0) {
            stats.tubeStepFree += 1;
            return;
        }
        stats.tubeNone += 1;
        stats.tubeUsageNone += station.usage ?? 0;
        if (stationLevel(station) === 0 && station.usage) {
            stats.busiestGaps.push({ index, name: station.name, usage: station.usage });
        }
    });
    stats.busiestGaps = stats.busiestGaps.sort((a, b) => b.usage - a.usage).slice(0, 6);

    const lineStat = (lineId: string): LineStat => {
        const line = network.lines.find((l) => l.id === lineId)!;
        const served = network.stations.filter((s) => s.lines.includes(lineId));
        const stepFree = served.filter((s) => s.sf[s.lines.indexOf(lineId)] > 0).length;
        return {
            id: line.id,
            name: line.name,
            color: line.display,
            stations: served.length,
            stepFree
        };
    };
    stats.lines = [...tubeIds]
        .map(lineStat)
        .sort((a, b) => a.stepFree / a.stations - b.stepFree / b.stations);
    stats.modelLines = [...MODEL_LINE_IDS].map(lineStat);
    return stats;
}

export const formatMillions = (value: number) => `${(value / 1_000_000).toFixed(1)}M`;
export const formatBillions = (value: number) => `${(value / 1_000_000_000).toFixed(1)} billion`;
export const percent = (part: number, whole: number) =>
    whole === 0 ? 0 : Math.round((100 * part) / whole);
