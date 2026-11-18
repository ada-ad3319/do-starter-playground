import { createFileRoute } from '@tanstack/react-router';
import { defineHooks, type Peer } from 'crossws';

import { advance, applyIntent } from '../lib/realtime/protocol';
import { createInitialShowState, type ShowState } from '../lib/realtime/types';

// How long each view stays on the wall during autoplay.
const AUTOPLAY_STEP_MS = 15_000;

// The server keeps the shared state. Controllers send requests, the server checks them and
// sends the new state to every screen and tablet. Kept on globalThis so a dev-server reload
// doesn't start a second autoplay timer.
const globalWithBus = globalThis as typeof globalThis & {
    __stepFreeBusV3?: { state: ShowState; anyPeer: Peer | null; timer: unknown };
};
const bus = (globalWithBus.__stepFreeBusV3 ??= {
    state: createInitialShowState(),
    anyPeer: null,
    timer: null
});

function broadcast(message: Record<string, unknown>) {
    // crossws keeps the list of connected peers; any one peer gives access to it.
    for (const peer of bus.anyPeer?.peers ?? []) peer.send(message);
}

function setState(next: ShowState) {
    bus.state = next;
    broadcast({ type: 'show/state', state: next });
}

// Autoplay: move to the next view every 15 s unless paused.
bus.timer ??= setInterval(() => {
    if (bus.state.playing) setState(advance(bus.state));
}, AUTOPLAY_STEP_MS);

const hooks = defineHooks({
    open(peer) {
        bus.anyPeer = peer;
        // `hello` gives a newly connected screen or tablet the current state straight away.
        peer.send({ type: 'hello', peerId: peer.id, state: bus.state });
        broadcast({ type: 'peer', peerCount: peer.peers.size });
    },
    message(_peer, message) {
        let payload: unknown;
        try {
            payload = message.json();
        } catch {
            return; // not JSON: ignore
        }
        const next = applyIntent(bus.state, payload);
        if (next) setState(next);
    },
    close(peer) {
        if (bus.anyPeer === peer) bus.anyPeer = [...peer.peers][0] ?? null;
        broadcast({ type: 'peer', peerCount: peer.peers.size });
    }
});

export const Route = createFileRoute('/bus')({
    server: {
        handlers: {
            GET: async () => {
                // HTTP fallback response: this endpoint is a websocket upgrade target.
                return Object.assign(
                    new Response('WebSocket upgrade is required.', { status: 426 }),
                    {
                        crossws: hooks
                    }
                );
            }
        }
    }
});
