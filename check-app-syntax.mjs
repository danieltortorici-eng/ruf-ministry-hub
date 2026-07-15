import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const appFiles = [
  ['compatibility root', 'ruf-ministry-hub.html'],
  ['canonical deploy', 'ruf-ministry-hub-deploy-working/ruf-ministry-hub.html']
];
for (const [label, file] of appFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('<script>');
  const end = html.lastIndexOf('</script>');
  if (start === -1 || end === -1 || end <= start) {
    console.error(`Could not find main inline app script in ${file}.`);
    process.exit(1);
  }
  const script = html.slice(start + '<script>'.length, end);
  const tempFile = path.join(os.tmpdir(), `ruf-ministry-hub-inline-script-check-${label.replace(/[^a-z0-9]+/gi, '-')}.js`);
  fs.writeFileSync(tempFile, script);
  const result = spawnSync(process.execPath, ['--check', tempFile], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`${label} app script syntax check passed.`);
}
