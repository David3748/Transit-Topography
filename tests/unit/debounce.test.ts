import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../src/utils/debounce';

describe('debounce', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not call the function before the delay', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 200);
        debounced();
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(199);
        expect(fn).not.toHaveBeenCalled();
    });

    it('calls the function once after the delay', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 200);
        debounced();
        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('coalesces rapid calls and uses the latest arguments', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 200);
        debounced('first');
        vi.advanceTimersByTime(100);
        debounced('second');
        vi.advanceTimersByTime(100);
        debounced('third');
        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('third');
    });

    it('allows a second invocation after the window passes', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);
        debounced('a');
        vi.advanceTimersByTime(100);
        debounced('b');
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
