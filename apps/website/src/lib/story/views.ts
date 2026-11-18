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
        caption: (s) => `${formatBillions(s.tubeUsage)} entries and exits in ${s.usageYear}.`
    },
    stepfree: {
        label: 'Step-free only',
        figure: (s) => String(s.tubeStepFree),
        figureLabel: (s) =>
            `of ${s.tubeStations} Tube stations are step-free from street to platform`,
        caption: (s) =>
            `The other ${s.tubeNone} (${percent(s.tubeNone, s.tubeStations)}%) can only be used with stairs or escalators.`
    },
    gaps: {
        label: 'Busiest stations',
        figure: (s) => formatBillions(s.tubeUsageNone).replace(' billion', 'bn'),
        figureLabel: () => 'entries and exits a year at stations without step-free access',
        caption: (s) => `${percent(s.tubeUsageNone, s.tubeUsage)}% of all Tube entries and exits.`
    }
};

/** Autoplay: everyone -> stepfree -> gaps -> everyone ... */
export function nextView(view: View): View {
    return VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length];
}
