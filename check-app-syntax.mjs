import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const html = fs.readFileSync('ruf-ministry-hub.html', 'utf8');
const start = html.indexOf('<script>');
const end = html.lastIndexOf('</script>');
if (start === -1 || end === -1 || end <= start) {
  console.error('Could not find main inline app script in ruf-ministry-hub.html.');
  process.exit(1);
}
const script = html.slice(start + '<script>'.length, end);
const tempFile = path.join(os.tmpdir(), 'ruf-ministry-hub-inline-script-check.js');
fs.writeFileSync(tempFile, script);
const result = spawnSync(process.execPath, ['--check', tempFile], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('App script syntax check passed.');
