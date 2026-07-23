const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts/convergence-preflight.mjs');

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function runFixture(fixture) {
  const result = spawnSync(process.execPath, [scriptPath, '--fixture-stdin', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: JSON.stringify(fixture)
  });
  assert(result.status === 0, 'synthetic convergence preflight exits zero');
  return { raw: result.stdout, report: JSON.parse(result.stdout) };
}

const fixture = {
  worktrees: [
    {
      id: 'candidate-a',
      branch: 'codex/candidate-a',
      head: 'a'.repeat(40),
      changedPaths: [
        'package.json',
        'functions/api/ai/quick-grab.js',
        'ruf-ministry-hub-deploy-working/ruf-ministry-hub.html'
      ]
    },
    {
      id: 'candidate-b',
      branch: 'codex/candidate-b',
      head: 'b'.repeat(40),
      changedPaths: [
        'package.json',
        'ruf-ministry-hub-deploy-working/_headers',
        'ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js',
        'ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js'
      ]
    },
    {
      id: 'candidate-c',
      branch: 'codex/candidate-c',
      head: 'c'.repeat(40),
      changedPaths: ['docs/ministry-workflow.md']
    },
    {
      id: 'sensitive-candidate',
      branch: 'codex/sensitive-candidate',
      head: 'd'.repeat(40),
      changedPaths: ['.env.local', 'backups/real-export.json']
    },
    {
      id: 'ledger-sensitive-candidate',
      branch: 'codex/ledger-sensitive-candidate',
      head: 'e'.repeat(40),
      declaredSensitive: true,
      changedPaths: ['docs/uncertain-provenance.md']
    },
    {
      id: 'prunable-candidate',
      branch: 'codex/prunable-candidate',
      head: 'f'.repeat(40),
      prunable: true,
      changedPaths: []
    },
    {
      id: 'sensitive-prunable-candidate',
      branch: 'codex/sensitive-prunable-candidate',
      head: '1'.repeat(40),
      declaredSensitive: true,
      prunable: true,
      changedPaths: []
    }
  ]
};

const first = runFixture(fixture);
const second = runFixture(fixture);
const report = first.report;

assert(first.raw === second.raw, 'synthetic convergence report is deterministic');
assert(report.schemaVersion === 1, 'convergence report schema is versioned');
assert(report.mode === 'synthetic-fixture', 'fixture evidence is labeled synthetic');
assert(report.readOnly === true && report.candidateContentRead === false, 'preflight reads no candidate content and is read-only');
assert(report.governanceLedgerRead === false, 'synthetic mode reads no governance ledger');
assert(report.outputContainsFileContents === false, 'report excludes file contents');
assert(report.summary.worktreeCount === 7, 'report inventories every synthetic worktree');
assert(report.summary.changedWorktreeCount === 5, 'report counts changed synthetic worktrees');
assert(report.summary.sensitiveStopCount === 3, 'path, ledger, and prunable sensitive worktrees fail closed');
assert(report.summary.prunableMetadataOnlyCount === 1, 'explicitly prunable registration is counted metadata-only');
assert(report.summary.overlapPairCount === 1, 'preflight deduplicates overlap to one candidate pair');
assert(report.summary.potentialCandidateReduction === 1, 'preflight measures one potential candidate reduction');

const overlap = report.overlaps[0];
assert(overlap.left === 'candidate-a' && overlap.right === 'candidate-b', 'overlap pair is stable and sorted');
assert(overlap.classification === 'EXACT_PATH_OVERLAP', 'exact path overlap takes precedence');
assert(overlap.exactPaths.includes('package.json'), 'exact package overlap is detected');
assert(overlap.semanticKeys.includes('release-identity'), 'release identity semantic overlap is detected');
assert(overlap.semanticKeys.includes('route:api/ai/quick-grab.js'), 'root/deploy Function mirror overlap is detected');
assert(overlap.deltaClassification === 'NOT_VERIFIED', 'preflight does not invent merge compatibility');
assert(overlap.nextState === 'MAPPED_READ_ONLY_REQUIRED', 'preflight routes overlap to read-only mapping');

const sensitive = report.worktrees.find((worktree) => worktree.id === 'sensitive-candidate');
assert(sensitive.state === 'SENSITIVE_STOP', 'sensitive candidate is stopped');
assert(sensitive.sensitivePathCount === 2, 'sensitive paths are counted without disclosure');
assert(!first.raw.includes('.env.local'), 'sensitive environment path is redacted from output');
assert(!first.raw.includes('real-export.json'), 'sensitive export path is redacted from output');
const ledgerSensitive = report.worktrees.find((worktree) => worktree.id === 'ledger-sensitive-candidate');
assert(ledgerSensitive.state === 'SENSITIVE_STOP' && ledgerSensitive.declaredSensitive === true, 'ledger classification stops a worktree without reading its content');
const prunable = report.worktrees.find((worktree) => worktree.id === 'prunable-candidate');
assert(prunable.state === 'PRUNABLE_METADATA_ONLY', 'prunable registration is not treated as clean or live');
assert(prunable.prunable === true, 'prunable metadata is preserved in the report');
assert(prunable.gitStatusRead === false, 'prunable registration skips Git status');
assert(prunable.changedPathCount === 0, 'prunable registration reports no invented changed paths');
const sensitivePrunable = report.worktrees.find((worktree) => worktree.id === 'sensitive-prunable-candidate');
assert(sensitivePrunable.state === 'SENSITIVE_STOP', 'declared sensitive state remains dominant over prunable metadata');
assert(sensitivePrunable.gitStatusRead === false, 'sensitive prunable registration still skips Git status');
assert(report.nextAction.includes('do not merge dirty worktrees wholesale'), 'next action preserves sequential reconciliation');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const prohibited of ['writeFile', 'appendFile', 'rmSync', 'unlinkSync', 'git reset', 'git clean', 'git stash', 'git commit', 'git push', 'git merge']) {
  assert(!source.includes(prohibited), `preflight excludes mutation primitive: ${prohibited}`);
}
assert(source.includes("'status', '--porcelain=v1', '-z', '-uall'"), 'preflight uses Git metadata for dirty-state inventory');
assert(source.includes('Boolean(fields.prunable)'), 'preflight recognizes Git porcelain prunable detail text');
assert(source.includes('SENSITIVE_STOP'), 'preflight contains a sensitive stop state');
assert(source.includes('PRUNABLE_METADATA_ONLY'), 'preflight contains an explicit prunable metadata-only state');

console.log('All convergence preflight regression checks passed.');
