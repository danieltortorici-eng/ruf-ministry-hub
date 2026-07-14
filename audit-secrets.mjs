import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const browserFiles = [
  'index.html',
  'ruf-ministry-hub.html',
  'ruf-ministry-hub-sw.js',
  'ruf-ministry-hub-deploy-working/index.html',
  'ruf-ministry-hub-deploy-working/ruf-ministry-hub.html',
  'ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js'
];
const browserForbidden = [
  { label: 'OpenAI API key env var in browser bundle', pattern: /OPENAI_API_KEY/ },
  { label: 'Likely OpenAI secret key', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { label: 'Direct bearer token in browser bundle', pattern: /Authorization\s*:\s*["'`]Bearer\s+/i },
  { label: 'Direct OpenAI SDK import in browser bundle', pattern: /from\s+["'`]openai["'`]|import\(["'`]openai["'`]\)/ }
];
const trackedSecretSignatures = [
  { label: 'Likely OpenAI secret key', pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Likely GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { label: 'Likely AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'Private key material', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ }
];
const forbiddenTrackedPaths = [
  /(^|\/)\.env\.local$/,
  /(^|\/)\.env\.(?!example$)[^/]+$/,
  /(^|\/)\.dev\.vars(?:\.[^/]+)?$/,
  /(^|\/)(?:id_rsa|id_ed25519)$/,
  /\.(?:pem|key)$/i,
  /(^|\/)ruf-ministry-hub-backup[^/]*\.json$/i,
  /(^|\/)ministry-data[^/]*\.json$/i
];
const failures = [];
for (const file of browserFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of browserForbidden) {
    if (rule.pattern.test(text)) failures.push(`${file}: ${rule.label}`);
  }
}

const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
if (listed.status !== 0) {
  console.error('Secret audit could not list tracked files.');
  process.exit(listed.status ?? 1);
}

const trackedFiles = listed.stdout.split('\0').filter(Boolean);
for (const file of trackedFiles) {
  if (forbiddenTrackedPaths.some(pattern => pattern.test(file))) {
    failures.push(`${file}: forbidden repository secret or ministry-data path`);
    continue;
  }

  const absolutePath = path.resolve(file);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
  const buffer = fs.readFileSync(absolutePath);
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');
  for (const rule of trackedSecretSignatures) {
    if (rule.pattern.test(text)) failures.push(`${file}: ${rule.label}`);
  }
}

if (failures.length) {
  console.error('Secret/client-boundary audit failed:');
  failures.forEach(failure => console.error('- ' + failure));
  process.exit(1);
}
console.log(`Secret/client-boundary audit passed across ${trackedFiles.length} tracked/proposed files and ${browserFiles.length} browser assets.`);
