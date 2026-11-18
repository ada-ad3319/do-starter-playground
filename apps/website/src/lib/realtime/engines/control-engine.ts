import { throttle } from '@tanstack/pacer';

import { clampZoom, sanitizeShowState } from '../protocol';
import { controlStore } from '../stores/control-store';
import type { BusMessage, ControlStoreState, HelloBusMessage, View } from '../types';
import { BusEngine } from './bus-engine';

// Send at most one zoom message every 100 ms while the slider is dragged (BEST_PRACTICES).
const ZOOM_SEND_WAIT_MS = 100;

export class ControlEngine extends BusEngine<ControlStoreState> {
    private readonly sendZoomThrottled = throttle(
        (zoom: number) => this.send({ type: 'control/zoom', zoom }),
        { wait: ZOOM_SEND_WAIT_MS, leading: true, trailing: true }
    );

    private constructor() {
        super('control', controlStore);
    }

    static getInstance() {
        const globalWithControlEngine = globalThis as typeof globalThis & {
            __controlEngineInstance?: ControlEngine;
        };
        globalWithControlEngine.__controlEngineInstance ??= new ControlEngine();
        return globalWithControlEngine.__controlEngineInstance;
    }

    // The tablet only sends requests; its buttons show the state the server sends back.
    setView(view: View) {
        this.send({ type: 'control/view', view });
    }

    setZoom(zoom: number) {
        this.sendZoomThrottled(clampZoom(zoom));
    }

    setPlaying(playing: boolean) {
        this.send({ type: 'control/playing', playing });
    }

    protected override shouldIgnoreSelfMessages() {
        return false;
    }

    protected override onMessage(message: BusMessage) {
        if (message.type === 'show/state') this.applyState(message.state);
    }

    protected override onHello(hello: HelloBusMessage) {
        this.applyState(hello.state);
    }

    private applyState(value: unknown) {
        const show = sanitizeShowState(value);
        if (show) this.store.setState((prev) => ({ ...prev, show }));
    }
}

export const controlEngine = ControlEngine.getInstance();
