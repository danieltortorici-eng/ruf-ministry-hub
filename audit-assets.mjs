import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const audits = [
  ['compatibility root', repositoryRoot],
  ['canonical deploy', path.join(repositoryRoot, 'ruf-ministry-hub-deploy-working')]
];
const files = ['ruf-ministry-hub.html', 'ruf-ministry-hub.webmanifest', 'ruf-ministry-hub-sw.js', 'index.html'];
const missing = [];
for (const [label, root] of audits) {
  const source = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const refs = new Set();
  for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) refs.add(match[1]);
  for (const match of source.matchAll(/"([^"\\]+\.(?:html|webmanifest|svg|png|js))"/g)) refs.add(match[1]);
  for (const ref of refs) {
    if (/^(https?:|data:|#|\$\{)/.test(ref)) continue;
    const file = ref.replace(/^\.\//, '');
    if (label === 'canonical deploy' && file === 'ruf-ministry-hub') {
      const redirects = fs.readFileSync(path.join(root, '_redirects'), 'utf8');
      const hasNativeHtmlTarget = fs.existsSync(path.join(root, 'ruf-ministry-hub.html'));
      const overridesNativeRoute = /^\/ruf-ministry-hub\s/m.test(redirects);
      if (hasNativeHtmlTarget && !overridesNativeRoute) continue;
    }
    if (!fs.existsSync(path.join(root, file))) missing.push(`${label}: ${ref}`);
  }
}
if (missing.length) {
  console.error('Missing deploy assets:', missing.join(', '));
  process.exit(1);
}
console.log('Asset audit passed. Referenced static assets exist.');
