import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mirrors = [
  {
    canonical: 'ruf-ministry-hub-deploy-working/functions/api/ai/health.js',
    mirror: 'functions/api/ai/health.js'
  },
  {
    canonical: 'ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js',
    mirror: 'functions/api/ai/quick-grab.js'
  },
  {
    canonical: 'ruf-ministry-hub-deploy-working/functions/api/[[path]].js',
    mirror: 'functions/api/[[path]].js'
  }
];

const failures = [];
for (const pair of mirrors) {
  const canonicalPath = path.resolve(root, pair.canonical);
  const mirrorPath = path.resolve(root, pair.mirror);
  if (!fs.existsSync(canonicalPath)) {
    failures.push(`missing canonical output: ${pair.canonical}`);
    continue;
  }
  if (!fs.existsSync(mirrorPath)) {
    failures.push(`missing mirrored output: ${pair.mirror}`);
    continue;
  }
  if (!fs.readFileSync(canonicalPath).equals(fs.readFileSync(mirrorPath))) {
    failures.push(`${pair.mirror} drifted from ${pair.canonical}`);
  }
}

if (failures.length) {
  console.error('Generated-output drift audit failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  console.error('Copy each canonical Pages Function to its root mirror, review the diff, and rerun npm test.');
  process.exit(1);
}

console.log(`Generated-output drift audit passed for ${mirrors.length} Pages Function mirrors.`);
