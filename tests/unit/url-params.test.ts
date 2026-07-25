// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeQuery, getUrlParams, updateUrl } from '../../src/utils/url-params';

describe('normalizeQuery', () => {
    it('converts ordinal words to numeric form', () => {
        expect(normalizeQuery('First Avenue')).toBe('1st Avenue');
        expect(normalizeQuery('fifth avenue and tenth street')).toBe('5th avenue and 10th street');
    });

    it('is case-insensitive', () => {
        expect(normalizeQuery('THIRD Street')).toBe('3rd Street');
    });

    it('leaves other text untouched', () => {
        expect(normalizeQuery('Grand Central Terminal')).toBe('Grand Central Terminal');
    });
});

describe('getUrlParams', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/');
    });

    it('returns nulls for a bare URL', () => {
        expect(getUrlParams()).toEqual({
            city: null,
            lat: null,
            lng: null,
            hour: null,
            direction: null,
            time: null,
            buses: null,
        });
    });

    it('parses a fully-populated share URL', () => {
        window.history.replaceState(
            {},
            '',
            '/?city=nyc&lat=40.75&lng=-73.98&hour=8.5&direction=arrive&time=45&buses=1'
        );
        expect(getUrlParams()).toEqual({
            city: 'nyc',
            lat: 40.75,
            lng: -73.98,
            hour: 8.5,
            direction: 'arrive',
            time: 45,
            buses: true,
        });
    });

    it('accepts only the documented maxTime values', () => {
        window.history.replaceState({}, '', '/?time=60');
        expect(getUrlParams().time).toBe(60);
        window.history.replaceState({}, '', '/?time=22');
        expect(getUrlParams().time).toBeNull();
        window.history.replaceState({}, '', '/?time=abc');
        expect(getUrlParams().time).toBeNull();
    });

    it('parses buses as a strict boolean flag', () => {
        window.history.replaceState({}, '', '/?buses=1');
        expect(getUrlParams().buses).toBe(true);
        window.history.replaceState({}, '', '/?buses=0');
        expect(getUrlParams().buses).toBe(false);
        window.history.replaceState({}, '', '/?buses=yes');
        expect(getUrlParams().buses).toBeNull();
    });

    it('keeps lat=0 (falsy but valid coordinate)', () => {
        window.history.replaceState({}, '', '/?lat=0&lng=0');
        const params = getUrlParams();
        expect(params.lat).toBe(0);
        expect(params.lng).toBe(0);
    });

    it('rejects non-numeric values', () => {
        window.history.replaceState({}, '', '/?lat=abc&lng=-73.98&hour=soon');
        const params = getUrlParams();
        expect(params.lat).toBeNull();
        expect(params.hour).toBeNull();
        expect(params.lng).toBe(-73.98);
    });

    it('rejects out-of-range coordinates and hours', () => {
        window.history.replaceState({}, '', '/?lat=91&lng=-181&hour=25');
        const params = getUrlParams();
        expect(params.lat).toBeNull();
        expect(params.lng).toBeNull();
        expect(params.hour).toBeNull();
    });

    it('accepts boundary values', () => {
        window.history.replaceState({}, '', '/?lat=-90&lng=180&hour=23.5');
        const params = getUrlParams();
        expect(params.lat).toBe(-90);
        expect(params.lng).toBe(180);
        expect(params.hour).toBe(23.5);
    });

    it('rejects an invalid direction', () => {
        window.history.replaceState({}, '', '/?direction=sideways');
        expect(getUrlParams().direction).toBeNull();
    });
});

describe('updateUrl', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/');
    });

    it('writes all parameters to the URL', () => {
        updateUrl('sf', 37.7749, -122.4194, 17.5, 'depart');
        const params = new URL(window.location.href).searchParams;
        expect(params.get('city')).toBe('sf');
        expect(params.get('lat')).toBe('37.77490');
        expect(params.get('lng')).toBe('-122.41940');
        expect(params.get('hour')).toBe('17.5');
        expect(params.get('direction')).toBe('depart');
    });

    it('round-trips through getUrlParams', () => {
        updateUrl('london', 51.5074, -0.1278, 8, 'arrive');
        expect(getUrlParams()).toEqual({
            city: 'london',
            lat: 51.5074,
            lng: -0.1278,
            hour: 8,
            direction: 'arrive',
            time: null,
            buses: null,
        });
    });

    it('round-trips the maxTime and buses extras', () => {
        updateUrl('sf', 37.7749, -122.4194, 17.5, 'depart', { maxTime: 60, buses: true });
        const params = getUrlParams();
        expect(params.time).toBe(60);
        expect(params.buses).toBe(true);
    });

    it('leaves unrelated params intact', () => {
        window.history.replaceState({}, '', '/?webgl=0');
        updateUrl('nyc', 40.7, -74.0);
        const params = new URL(window.location.href).searchParams;
        expect(params.get('webgl')).toBe('0');
    });
});
