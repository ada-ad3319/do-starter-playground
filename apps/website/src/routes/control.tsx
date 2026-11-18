import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '../components/button';
import { Slider } from '../components/slider';
import { controlEngine } from '../lib/realtime/engines/control-engine';
import { ZOOM_MAX, ZOOM_MIN } from '../lib/realtime/protocol';
import { useControlStore } from '../lib/realtime/stores/control-store';
import { VIEW_ORDER, VIEWS } from '../lib/story/views';

export const Route = createFileRoute('/control')({
    // Optional label so the two simulator tablets can be told apart.
    validateSearch: (search: Record<string, unknown>) => ({
        operator: typeof search.operator === 'string' ? search.operator.slice(0, 12) : 'A'
    }),
    component: ControlPage
});

const HINTS = {
    everyone: 'The whole network',
    stepfree: 'Only step-free stations',
    gaps: 'Busiest stations without step-free access'
};

// The tablet: buttons and a slider that send requests to the bus.
function ControlPage() {
    const { operator } = Route.useSearch();
    const show = useControlStore((state) => state.show);
    const isLive = useControlStore((state) => state.connection === 'open');
    // While dragging, show the finger's position; otherwise show what the wall is showing.
    const [dragZoom, setDragZoom] = useState<number | null>(null);
    const zoom = dragZoom ?? show.zoom;

    return (
        <main className="min-h-screen w-full bg-[var(--background)] text-[var(--foreground)]">
            <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
                <header className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <div>
                        <p className="text-[10px] tracking-[0.2em] text-[var(--muted-foreground)] uppercase">
                            Operator {operator}
                        </p>
                        <h1 className="text-sm font-semibold">Step-Free London</h1>
                    </div>
                    <span
                        className={`text-[11px] font-medium ${isLive ? 'text-emerald-500' : 'text-amber-500'}`}
                    >
                        {isLive ? '● Live' : '● Reconnecting…'}
                    </span>
                </header>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {VIEW_ORDER.map((view, index) => (
                        <Button
                            key={view}
                            onClick={() => controlEngine.setView(view)}
                            variant={show.view === view ? 'highlight' : 'normal'}
                            className="flex flex-col items-start py-3 text-left"
                        >
                            <span className="text-base font-semibold">
                                {index + 1}. {VIEWS[view].label}
                            </span>
                            <span className="text-[11px] text-[var(--muted-foreground)]">
                                {HINTS[view]}
                            </span>
                        </Button>
                    ))}
                </div>

                <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold uppercase">Zoom</span>
                        <span className="text-[var(--muted-foreground)]">
                            {zoom === 0
                                ? 'View default'
                                : `${zoom > 0 ? '+' : ''}${zoom.toFixed(1)}`}
                        </span>
                    </div>
                    <Slider
                        label="Zoom"
                        min={ZOOM_MIN}
                        max={ZOOM_MAX}
                        step={0.1}
                        value={zoom}
                        onValueChange={(value) => {
                            setDragZoom(value);
                            controlEngine.setZoom(value); // throttled inside the engine
                        }}
                        onInteractionChange={(isDragging) => {
                            if (!isDragging) setDragZoom(null);
                        }}
                    />
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                        Zooms towards the middle of the map. Choosing a view resets it.
                    </p>
                </section>

                <Button onClick={() => controlEngine.setPlaying(!show.playing)} variant="normal">
                    {show.playing ? '❚❚ Pause autoplay' : '▶ Resume autoplay (every 15 s)'}
                </Button>
            </div>
        </main>
    );
}
