// The three views and the text shown for each.

import type { View } from '../realtime/types';
import { formatBillions, percent, type StoryStats } from './analysis';

export type ViewCopy = {
    /** Controller button + "Showing:" label. */
    label: string;
    /** The big number in the left strip, and what it counts. */
    figure: (s: StoryStats) => string;
    figureLabel: (s: StoryStats) => string;
    /** One short sentence. */
    caption: (s: StoryStats) => string;
};

export const VIEW_ORDER: readonly View[] = ['everyone', 'stepfree', 'gaps'];

export const VIEWS: Record<View, ViewCopy> = {
    everyone: {
        label: 'Everyone',
        figure: (s) => String(s.tubeStations),
        figureLabel: () => 'Tube stations',
        caption: (s) =>
            `${formatBillions(s.tubeUsage)} journeys a year. This is the Tube most people see.`
    },
    stepfree: {
        label: 'Step-free only',
        figure: (s) => String(s.tubeStepFree),
        figureLabel: (s) => `of ${s.tubeStations} stations you can use without stairs`,
        caption: (s) =>
            `${percent(s.tubeNone, s.tubeStations)}% of Tube stations have no step-free route. Trains pass through; you can't get on or off.`
    },
    gaps: {
        label: 'Busiest gaps',
        figure: (s) => formatBillions(s.tubeUsageNone).replace(' billion', 'bn'),
        figureLabel: () => 'journeys a year at stations with no step-free route',
        caption: (s) =>
            `That is ${percent(s.tubeUsageNone, s.tubeUsage)}% of all Tube journeys, including London's busiest stations.`
    }
};

/** Autoplay: everyone -> stepfree -> gaps -> everyone ... */
export function nextView(view: View): View {
    return VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length];
}
