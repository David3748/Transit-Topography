import { describe, it, expect, beforeEach } from 'vitest';
import { TransitGraph } from '../../src/core/transit-graph';
import { distHaversine } from '../../src/utils/haversine';
import type { RoutingProfile } from '../../src/types';

const SPEED_MPS = 10;

function makeProfile(overrides: Partial<RoutingProfile> = {}): RoutingProfile {
    return {
        boardingWaitSec: 100,
        transferPenaltySec: 15,
        direction: 'depart',
        ...overrides,
    };
}

/**
 * Simple line graph: A(0,0) — B(0,0.01) — C(0,0.02)
 * with a branch D(0.01,0.01) off B.
 */
function buildGraph(): TransitGraph {
    const g = new TransitGraph();
    g.addNode('A', 0, 0);
    g.addNode('B', 0, 0.01);
    g.addNode('C', 0, 0.02);
    g.addNode('D', 0.01, 0.01);
    g.addEdge('A', 'B', SPEED_MPS);
    g.addEdge('B', 'C', SPEED_MPS);
    g.addEdge('B', 'D', SPEED_MPS);
    return g;
}

describe('TransitGraph structure', () => {
    let graph: TransitGraph;
    beforeEach(() => {
        graph = buildGraph();
    });

    it('registers nodes as stations', () => {
        expect(graph.nodes.size).toBe(4);
        expect(graph.stations).toHaveLength(4);
    });

    it('ignores duplicate node ids', () => {
        graph.addNode('A', 5, 5);
        expect(graph.nodes.size).toBe(4);
        expect(graph.nodes.get('A')!.lat).toBe(0);
    });

    it('creates bidirectional edges weighted by distance / speed', () => {
        const expected = distHaversine(0, 0, 0, 0.01) / SPEED_MPS;
        expect(graph.nodes.get('A')!.neighbors.get('B')).toBeCloseTo(expected, 6);
        expect(graph.nodes.get('B')!.neighbors.get('A')).toBeCloseTo(expected, 6);
    });

    it('skips edges referencing unknown nodes', () => {
        graph.addEdge('A', 'ZZZ', SPEED_MPS);
        expect(graph.nodes.get('A')!.neighbors.has('ZZZ')).toBe(false);
    });

    it('clear() empties nodes and stations', () => {
        graph.clear();
        expect(graph.nodes.size).toBe(0);
        expect(graph.stations).toHaveLength(0);
    });
});

describe('calculateNetworkTimes', () => {
    let graph: TransitGraph;
    beforeEach(() => {
        graph = buildGraph();
    });

    it('applies the boarding wait exactly once at the start', () => {
        const times = graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], makeProfile());
        expect(times.get('A')).toBeCloseTo(100, 6);
    });

    it('does not charge the transfer penalty when staying on line edges', () => {
        const times = graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], makeProfile());
        const ab = distHaversine(0, 0, 0, 0.01) / SPEED_MPS;
        const bc = distHaversine(0, 0.01, 0, 0.02) / SPEED_MPS;

        // Riding through consecutive stations costs pure travel time only
        expect(times.get('B')!).toBeCloseTo(100 + ab, 4);
        expect(times.get('C')!).toBeCloseTo(100 + ab + bc, 4);
    });

    it('charges the transfer penalty only on walk-transfer links', () => {
        // E sits ~111 m from B — inside the 200 m transfer threshold
        graph.addNode('E', 0.0006, 0.0106);
        graph.generateTransferEdges(200);

        const times = graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], makeProfile());
        const ab = distHaversine(0, 0, 0, 0.01) / SPEED_MPS;
        const beWalk = distHaversine(0, 0.01, 0.0006, 0.0106) / 1.3;

        expect(times.get('E')!).toBeCloseTo(100 + ab + beWalk + 15, 4);
    });

    it('includes initial walk time in the start cost', () => {
        const times = graph.calculateNetworkTimes(
            [{ id: 'A', initialWalkTime: 50 }],
            makeProfile()
        );
        expect(times.get('A')).toBeCloseTo(150, 6);
    });

    it('picks the cheapest of multiple entry stations', () => {
        const times = graph.calculateNetworkTimes(
            [
                { id: 'A', initialWalkTime: 0 },
                { id: 'C', initialWalkTime: 10 },
            ],
            makeProfile()
        );
        // Entering at C is cheaper for C than walking from A across two hops
        expect(times.get('C')).toBeCloseTo(110, 6);
    });

    it('respects the maxNetworkTimeSec cutoff', () => {
        // A is seeded at 100; B lands at ~226 (100 + ~111 travel + 15 penalty);
        // C lands at ~352. A cutoff of 250 keeps B but drops C and D.
        const times = graph.calculateNetworkTimes(
            [{ id: 'A', initialWalkTime: 0 }],
            makeProfile({ maxNetworkTimeSec: 250 })
        );
        expect(times.has('A')).toBe(true);
        expect(times.has('B')).toBe(true);
        expect(times.has('C')).toBe(false);
        expect(times.has('D')).toBe(false);
    });

    it('excludes even the first hop when the cutoff is below its cost', () => {
        const times = graph.calculateNetworkTimes(
            [{ id: 'A', initialWalkTime: 0 }],
            makeProfile({ maxNetworkTimeSec: 130 })
        );
        expect(times.has('A')).toBe(true); // start nodes are always seeded
        expect(times.has('B')).toBe(false); // ~226 > 130
    });

    it('produces identical times for depart and arrive on a symmetric graph', () => {
        const depart = graph.calculateNetworkTimes(
            [{ id: 'A', initialWalkTime: 0 }],
            makeProfile({ direction: 'depart' })
        );
        const arrive = graph.calculateNetworkTimes(
            [{ id: 'A', initialWalkTime: 0 }],
            makeProfile({ direction: 'arrive' })
        );
        for (const id of ['A', 'B', 'C', 'D']) {
            expect(arrive.get(id)).toBeCloseTo(depart.get(id)!, 6);
        }
    });

    it('supports the legacy numeric boarding-wait signature', () => {
        const times = graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], 100);
        expect(times.get('A')).toBeCloseTo(100, 6);
    });

    it('records predecessors for path reconstruction', () => {
        graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], makeProfile());
        expect(graph.getPathTo('C')).toEqual(['A', 'B', 'C']);
    });

    it('records the entry station for each reachable node', () => {
        graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], makeProfile());
        expect(graph.entryStations.get('C')).toBe('A');
        expect(graph.entryStations.get('D')).toBe('A');
    });
});

describe('generateTransferEdges', () => {
    it('links nearby nodes without duplicating existing faster edges', () => {
        const g = new TransitGraph();
        g.addNode('X', 0, 0);
        g.addNode('Y', 0, 0.001); // ~111 m away
        g.generateTransferEdges(200);

        const walkTime = distHaversine(0, 0, 0, 0.001) / 1.3;
        expect(g.nodes.get('X')!.neighbors.get('Y')).toBeCloseTo(walkTime, 4);
    });

    it('does not link nodes beyond the threshold', () => {
        const g = new TransitGraph();
        g.addNode('X', 0, 0);
        g.addNode('Y', 0, 0.01); // ~1.1 km away
        g.generateTransferEdges(200);
        expect(g.nodes.get('X')!.neighbors.has('Y')).toBe(false);
    });
});
