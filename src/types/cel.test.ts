import { describe, it, expect } from 'vitest';
import { packCelKey, parseCelKey } from './cel.js';

describe('Cel Types (src/types/cel.ts)', () => {
    describe('packCelKey', () => {
        it('should correctly format layer ID and frame index into a string', () => {
            expect(packCelKey(0, 0)).toBe('0/0');
            expect(packCelKey(5, 12)).toBe('5/12');
            expect(packCelKey(100, 999)).toBe('100/999');
        });
    });

    describe('parseCelKey', () => {
        it('should correctly parse a valid cel key string', () => {
            expect(parseCelKey('0/0')).toEqual({ layerId: 0, frameIndex: 0 });
            expect(parseCelKey('5/12')).toEqual({ layerId: 5, frameIndex: 12 });
            expect(parseCelKey('100/999')).toEqual({ layerId: 100, frameIndex: 999 });
        });

        it('should return null for structurally invalid strings', () => {
            expect(parseCelKey('')).toBeNull();
            expect(parseCelKey('5')).toBeNull();
            expect(parseCelKey('5/')).toBeNull();
            expect(parseCelKey('/12')).toBeNull();
            expect(parseCelKey('5/12/3')).toBeNull();
            expect(parseCelKey('foo/bar')).toBeNull();
            expect(parseCelKey('5/bar')).toBeNull();
            expect(parseCelKey('foo/12')).toBeNull();
        });
    });
});
