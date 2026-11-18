import type { Network } from '../story/network';

export type BusMessage = {
    // Keep message kinds namespaced (`control/*`, `show/*`).
    type: string;
    peerId?: string;
    peerCount?: number;
    [key: string]: unknown;
};

/** everyone: full network. stepfree: only step-free stations. gaps: busiest stations without step-free access. */
export type View = 'everyone' | 'stepfree' | 'gaps';

/** The shared state sent to every screen and tablet. */
export type ShowState = {
    view: View;
    /** Extra zoom on top of the view's own camera, from the controller slider (0 = none). */
    zoom: number;
    /** True while the server steps through the views by itself. */
    playing: boolean;
};

export type HelloBusMessage = BusMessage & {
    type: 'hello';
    peerId: string;
    state?: ShowState;
};

export type EngineRole = 'screen' | 'control';

export type EngineConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export type EngineStoreState = {
    role: EngineRole;
    peerId: string | null;
    connection: EngineConnectionState;
    messageCount: number;
    lastMessageType: string | null;
    lastMessageAt: number | null;
    lastError: string | null;
};

export const createInitialEngineStoreState = (role: EngineRole): EngineStoreState => ({
    role,
    peerId: null,
    connection: 'idle',
    messageCount: 0,
    lastMessageType: null,
    lastMessageAt: null,
    lastError: null
});

export const createInitialShowState = (): ShowState => ({
    view: 'everyone',
    zoom: 0,
    playing: true
});

export type ControlStoreState = EngineStoreState & {
    show: ShowState;
};

export type ScreenStoreState = EngineStoreState & {
    show: ShowState;
    network: Network | null;
    networkError: string | null;
};

export const createInitialControlStoreState = (): ControlStoreState => ({
    ...createInitialEngineStoreState('control'),
    show: createInitialShowState()
});

export const createInitialScreenStoreState = (): ScreenStoreState => ({
    ...createInitialEngineStoreState('screen'),
    show: createInitialShowState(),
    network: null,
    networkError: null
});
