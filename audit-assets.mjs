import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = ['ruf-ministry-hub.html', 'ruf-ministry-hub.webmanifest', 'ruf-ministry-hub-sw.js', 'index.html'];
const source = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const refs = new Set();
for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) refs.add(match[1]);
for (const match of source.matchAll(/"([^"\\]+\.(?:html|webmanifest|svg|png|js))"/g)) refs.add(match[1]);
const missing = [];
for (const ref of refs) {
  if (/^(https?:|data:|#|\$\{)/.test(ref)) continue;
  const file = ref.replace(/^\.\//, '');
  if (!fs.existsSync(path.join(root, file))) missing.push(ref);
}
if (missing.length) {
  console.error('Missing deploy assets:', missing.join(', '));
  process.exit(1);
}
console.log('Asset audit passed. Referenced static assets exist.');
