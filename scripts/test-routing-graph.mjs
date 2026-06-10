import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-routing-test-'));

execFileSync(
  'npx',
  ['tsc', '--outDir', outDir, '--noEmit', 'false', '--module', 'ESNext'],
  { stdio: 'pipe' }
);

for (const dirent of fs.readdirSync(outDir, { recursive: true, withFileTypes: true })) {
  if (!dirent.isFile() || !dirent.name.endsWith('.js')) continue;
  const filePath = path.join(dirent.parentPath, dirent.name);
  const source = fs.readFileSync(filePath, 'utf8');
  const patched = source.replace(
    /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
    (_match, prefix, specifier, suffix) => {
      if (specifier.endsWith('.js') || specifier.endsWith('.json')) {
        return `${prefix}${specifier}${suffix}`;
      }
      return `${prefix}${specifier}.js${suffix}`;
    }
  );
  fs.writeFileSync(filePath, patched);
}

const { TransitGraph } = await import(pathToFileURL(path.join(outDir, 'core/transit-graph.js')));

function buildFixtureGraph() {
  const graph = new TransitGraph();
  graph.addNode('A', 0, 0);
  graph.addNode('B', 0, 0.01);
  graph.addNode('C', 0, 0.02);

  graph.nodes.get('A').neighbors.set('B', 100);
  graph.nodes.get('B').neighbors.set('C', 100);
  graph.nodes.get('A').neighbors.set('C', 1000);

  return graph;
}

{
  const graph = buildFixtureGraph();
  const times = graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], {
    boardingWaitSec: 60,
    transferPenaltySec: 300,
    direction: 'depart'
  });

  assert.equal(times.get('A'), 60);
  assert.equal(times.get('B'), 460);
  assert.equal(times.get('C'), 860);
  assert.deepEqual(graph.getPathTo('C'), ['A', 'B', 'C']);
}

{
  const graph = buildFixtureGraph();
  const times = graph.calculateNetworkTimes([{ id: 'A', initialWalkTime: 0 }], {
    boardingWaitSec: 60,
    transferPenaltySec: 300,
    direction: 'depart',
    maxNetworkTimeSec: 500
  });

  assert.equal(times.get('A'), 60);
  assert.equal(times.get('B'), 460);
  assert.equal(times.has('C'), false);
}

{
  const graph = buildFixtureGraph();
  const times = graph.calculateNetworkTimes([{ id: 'C', initialWalkTime: 0 }], {
    boardingWaitSec: 0,
    transferPenaltySec: 300,
    direction: 'arrive'
  });

  assert.equal(times.get('C'), 0);
  assert.equal(times.get('B'), 400);
  assert.equal(times.get('A'), 800);
}

console.log('Routing graph tests passed.');
