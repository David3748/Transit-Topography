import { describe, it, expect } from 'vitest';
import { BinaryHeap } from '../../src/core/binary-heap';

describe('BinaryHeap', () => {
    it('starts empty', () => {
        const heap = new BinaryHeap<{ time: number }>();
        expect(heap.size()).toBe(0);
    });

    it('pops the minimum element first', () => {
        const heap = new BinaryHeap<{ time: number }>();
        [5, 1, 9, 3, 7].forEach(time => heap.push({ time }));

        const popped: number[] = [];
        while (heap.size() > 0) popped.push(heap.pop().time);

        expect(popped).toEqual([1, 3, 5, 7, 9]);
    });

    it('handles a single element', () => {
        const heap = new BinaryHeap<{ time: number }>();
        heap.push({ time: 42 });
        expect(heap.size()).toBe(1);
        expect(heap.pop().time).toBe(42);
        expect(heap.size()).toBe(0);
    });

    it('preserves heap order with interleaved push/pop', () => {
        const heap = new BinaryHeap<{ time: number }>();
        heap.push({ time: 10 });
        heap.push({ time: 4 });
        expect(heap.pop().time).toBe(4);
        heap.push({ time: 3 });
        heap.push({ time: 20 });
        expect(heap.pop().time).toBe(3);
        expect(heap.pop().time).toBe(10);
        expect(heap.pop().time).toBe(20);
    });

    it('handles duplicate priorities', () => {
        const heap = new BinaryHeap<{ time: number; tag: string }>();
        heap.push({ time: 5, tag: 'a' });
        heap.push({ time: 5, tag: 'b' });
        heap.push({ time: 1, tag: 'c' });
        expect(heap.pop().tag).toBe('c');
        expect(heap.size()).toBe(2);
    });

    it('sorts a large random input correctly', () => {
        const heap = new BinaryHeap<{ time: number }>();
        const values = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 10000));
        values.forEach(time => heap.push({ time }));

        let prev = -Infinity;
        while (heap.size() > 0) {
            const { time } = heap.pop();
            expect(time).toBeGreaterThanOrEqual(prev);
            prev = time;
        }
    });
});
