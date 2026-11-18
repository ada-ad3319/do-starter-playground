import { loadNetwork } from '../../story/network';
import { sanitizeShowState } from '../protocol';
import { screenStore } from '../stores/screen-store';
import type { BusMessage, HelloBusMessage, ScreenStoreState } from '../types';
import { BusEngine } from './bus-engine';

export class ScreenEngine extends BusEngine<ScreenStoreState> {
    private constructor() {
        super('screen', screenStore);
        if (typeof window !== 'undefined') void this.loadNetwork();
    }

    static getInstance() {
        const globalWithScreenEngine = globalThis as typeof globalThis & {
            __screenEngineInstance?: ScreenEngine;
        };
        globalWithScreenEngine.__screenEngineInstance ??= new ScreenEngine();
        return globalWithScreenEngine.__screenEngineInstance;
    }

    private async loadNetwork() {
        try {
            const network = await loadNetwork();
            this.store.setState((prev) => ({ ...prev, network, networkError: null }));
        } catch (error) {
            // Shown on the wall instead of a broken map; retried when the bus reconnects.
            const networkError = error instanceof Error ? error.message : String(error);
            this.store.setState((prev) => ({ ...prev, networkError }));
        }
    }

    // The server sends the state to everyone, including whoever asked for the change.
    protected override shouldIgnoreSelfMessages() {
        return false;
    }

    protected override onMessage(message: BusMessage) {
        if (message.type === 'show/state') this.applyState(message.state);
    }

    protected override onHello(hello: HelloBusMessage) {
        this.applyState(hello.state);
        if (this.store.state.networkError) void this.loadNetwork();
    }

    private applyState(value: unknown) {
        const show = sanitizeShowState(value);
        if (show) this.store.setState((prev) => ({ ...prev, show }));
    }
}

export const screenEngine = ScreenEngine.getInstance();
