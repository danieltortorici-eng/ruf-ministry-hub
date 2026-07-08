import fs from 'node:fs';

const files = ['ruf-ministry-hub.html', 'ruf-ministry-hub-sw.js', 'index.html'];
const forbidden = [
  { label: 'OpenAI API key env var in browser bundle', pattern: /OPENAI_API_KEY/ },
  { label: 'Likely OpenAI secret key', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { label: 'Direct bearer token in browser bundle', pattern: /Authorization\s*:\s*["'`]Bearer\s+/i },
  { label: 'Direct OpenAI SDK import in browser bundle', pattern: /from\s+["'`]openai["'`]|import\(["'`]openai["'`]\)/ }
];
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) failures.push(`${file}: ${rule.label}`);
  }
}
if (failures.length) {
  console.error('Secret/client-boundary audit failed:');
  failures.forEach(failure => console.error('- ' + failure));
  process.exit(1);
}
console.log('Secret/client-boundary audit passed. No browser API keys or direct OpenAI SDK imports found.');
