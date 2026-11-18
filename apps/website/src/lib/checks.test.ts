import { describe, expect, test } from 'vite-plus/test';

import committedNetwork from '../../public/data/network.json';
import { applyIntent, sanitizeShowState } from './realtime/protocol';
import { createInitialShowState } from './realtime/types';
import { NetworkValidationError, parseNetwork } from './story/network';
import { parseWallDimension } from './wall';

describe('data validation', () => {
    test('the committed network.json is valid', () => {
        expect(parseNetwork(committedNetwork).stations.length).toBeGreaterThan(250);
    });

    test('a malformed file is rejected', () => {
        expect(() => parseNetwork({ version: 1, lines: [] })).toThrow(NetworkValidationError);
    });
});

describe('message checking', () => {
    test('valid controller messages change the state', () => {
        const next = applyIntent(createInitialShowState(), {
            type: 'control/view',
            view: 'stepfree'
        });
        expect(next).toEqual({ view: 'stepfree', zoom: 0, playing: false });
    });

    test('invalid messages are ignored', () => {
        const state = createInitialShowState();
        expect(applyIntent(state, { type: 'control/view', view: 'xray' })).toBeNull();
        expect(applyIntent(state, { type: 'control/playing', playing: 'yes' })).toBeNull();
        expect(sanitizeShowState({ view: 'everyone', playing: true })).toBeNull();
        // Zoom is kept inside the slider range.
        expect(applyIntent(state, { type: 'control/zoom', zoom: 50 })?.zoom).toBe(3);
    });
});

describe('wall size setting', () => {
    test('reads numbers from env strings and falls back on bad input', () => {
        expect(parseWallDimension('16', 4, 32)).toBe(16);
        expect(parseWallDimension('abc', 4, 32)).toBe(4);
        expect(parseWallDimension('99', 4, 32)).toBe(32);
    });
});
