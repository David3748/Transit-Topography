import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, 'src/data/city-config.ts');
const dataDir = path.join(root, 'transit_data');

const source = fs.readFileSync(configPath, 'utf8');
const dataFiles = new Set(
  fs.readdirSync(dataDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => `transit_data/${file}`)
);

// Match one city block in CITIES. Keys may be quoted ('nyc') or bare (nyc);
// blocks are indented 4 spaces and close with a 4-space brace.
const cityBlocks = [...source.matchAll(/^ {4}(?:'([^']+)'|([A-Za-z_$][\w$]*)):\s*\{([\s\S]*?)\n {4}\}/gm)].map(
  (match) => [match[1] ?? match[2], match[3]]
);
const walkingMatch = source.match(/WALKING_NETWORK_CITIES\s*=\s*\[([\s\S]*?)\];/);
const walkingCities = walkingMatch
  ? [...walkingMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];

const errors = [];
const warnings = [];

function extractFiles(block, property) {
  const match = block.match(new RegExp(`${property}:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function extractString(block, property) {
  const match = block.match(new RegExp(`${property}:\\s*'([^']+)'`));
  return match ? match[1] : null;
}

for (const [cityKey, block] of cityBlocks) {
  const files = extractFiles(block, 'files');
  const busFiles = extractFiles(block, 'busFiles');
  const water = extractString(block, 'water');
  const buildings = extractString(block, 'buildings');

  if (files.length === 0) {
    errors.push(`${cityKey}: missing required files[] entry`);
  }

  for (const file of files) {
    if (!dataFiles.has(file)) {
      errors.push(`${cityKey}: required transit asset is missing: ${file}`);
    }
  }

  for (const file of busFiles) {
    if (!dataFiles.has(file)) {
      errors.push(`${cityKey}: optional bus asset is referenced but missing: ${file}`);
    }
  }

  for (const file of [water, buildings].filter(Boolean)) {
    if (!dataFiles.has(file)) {
      errors.push(`${cityKey}: optional mask asset is referenced but missing: ${file}`);
    }
  }

  const walkingFile = `transit_data/walking_${cityKey}.json`;
  const hasWalkingFile = dataFiles.has(walkingFile);
  const advertisesWalking = walkingCities.includes(cityKey);

  if (advertisesWalking && !hasWalkingFile) {
    errors.push(`${cityKey}: listed in WALKING_NETWORK_CITIES but ${walkingFile} is missing`);
  }

  if (hasWalkingFile && !advertisesWalking) {
    warnings.push(`${cityKey}: walking data exists but is not advertised in WALKING_NETWORK_CITIES`);
  }
}

for (const cityKey of walkingCities) {
  if (!cityBlocks.some(([key]) => key === cityKey)) {
    errors.push(`${cityKey}: listed in WALKING_NETWORK_CITIES but not present in CITIES`);
  }
}

if (warnings.length > 0) {
  console.warn('Data manifest warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error('Data manifest validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Data manifest valid: ${cityBlocks.length} cities, ${dataFiles.size} data files checked.`);
