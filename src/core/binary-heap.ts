/**
 * Binary Heap Priority Queue (Min Heap)
 */
export class BinaryHeap<T extends { time: number }> {
    private content: T[] = [];

    push(element: T): void {
        this.content.push(element);
        this.bubbleUp(this.content.length - 1);
    }

    pop(): T {
        const result = this.content[0];
        const end = this.content.pop()!;
        if (this.content.length > 0) {
            this.content[0] = end;
            this.sinkDown(0);
        }
        return result;
    }

    size(): number {
        return this.content.length;
    }

    private bubbleUp(n: number): void {
        const element = this.content[n];
        while (n > 0) {
            const parentN = Math.floor((n + 1) / 2) - 1;
            const parent = this.content[parentN];
            if (element.time >= parent.time) break;
            this.content[parentN] = element;
            this.content[n] = parent;
            n = parentN;
        }
    }

    private sinkDown(n: number): void {
        const length = this.content.length;
        const element = this.content[n];
        const elemTime = element.time;

        while (true) {
            const child2N = (n + 1) * 2;
            const child1N = child2N - 1;
            let swap: number | null = null;
            let child1Time: number = 0;

            if (child1N < length) {
                const child1 = this.content[child1N];
                child1Time = child1.time;
                if (child1Time < elemTime) swap = child1N;
            }

            if (child2N < length) {
                const child2 = this.content[child2N];
                const child2Time = child2.time;
                if (child2Time < (swap === null ? elemTime : child1Time)) swap = child2N;
            }

            if (swap === null) break;
            this.content[n] = this.content[swap];
            this.content[swap] = element;
            n = swap;
        }
    }
}
