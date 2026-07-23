#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const SENSITIVE_PATH = /(^|\/)\.env(?:\.[^/]+)?(?:\/|$)|(^|\/)(?:\.dev\.vars|\.wrangler|node_modules|backups?|exports?|browser(?:-data)?|credentials?|secrets?|cookies?|real-data)(?:\/|$)|(^|\/)\.(?:ai|mock|person|prayer|follow-up)-|\.(?:pem|key|p12|sqlite|db|zip|log)$/i;

function fail(message) {
  process.stderr.write(`convergence-preflight: ${message}\n`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), fixture: null, summary: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') args.repo = argv[++index];
    else if (arg === '--fixture') args.fixture = argv[++index];
    else if (arg === '--fixture-stdin') args.fixture = '-';
    else if (arg === '--summary') args.summary = true;
    else if (arg === '--json') args.summary = false;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.repo) throw new Error('--repo requires a path');
  return args;
}

function git(args, cwd) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function parseWorktreeList(text) {
  return text.trim().split(/\n\n+/).filter(Boolean).map((block) => {
    const fields = {};
    for (const line of block.split('\n')) {
      const split = line.indexOf(' ');
      if (split === -1) fields[line] = true;
      else fields[line.slice(0, split)] = line.slice(split + 1);
    }
    const branch = String(fields.branch || '').replace(/^refs\/heads\//, '') || 'detached';
    return {
      id: branch === 'detached' ? basename(fields.worktree) : branch,
      path: fields.worktree,
      branch,
      head: fields.HEAD || 'UNKNOWN',
      prunable: Boolean(fields.prunable)
    };
  });
}

function parsePorcelainZ(text) {
  const tokens = text.split('\0');
  const paths = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const status = token.slice(0, 2);
    const path = token.slice(3);
    if (path) paths.push(path);
    if (/^[RC]|[RC]$/.test(status) && tokens[index + 1]) paths.push(tokens[++index]);
  }
  return [...new Set(paths)].sort();
}

function loadDeclaredSensitiveWorktrees(repo) {
  const ledger = readFileSync(resolve(repo, 'docs/build-operations.md'), 'utf8');
  const identifiers = new Set();
  for (const line of ledger.split('\n')) {
    if (!line.includes('SENSITIVE_STOP')) continue;
    for (const match of line.matchAll(/`([^`]+)`/g)) identifiers.add(match[1]);
  }
  return identifiers;
}

function inventoryRepository(repo) {
  const root = resolve(repo);
  const declaredSensitive = loadDeclaredSensitiveWorktrees(root);
  const worktrees = parseWorktreeList(git(['worktree', 'list', '--porcelain'], root));
  return worktrees.map((worktree) => {
    const prunable = worktree.prunable === true;
    return {
      ...worktree,
      declaredSensitive: declaredSensitive.has(worktree.id)
      || declaredSensitive.has(worktree.branch)
      || declaredSensitive.has(worktree.path)
      || declaredSensitive.has(basename(worktree.path)),
      gitStatusRead: !prunable,
      changedPaths: prunable
        ? []
        : parsePorcelainZ(git(['status', '--porcelain=v1', '-z', '-uall', '--ignore-submodules=all'], worktree.path))
    };
  });
}

function loadFixture(source) {
  const raw = source === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(source), 'utf8');
  const fixture = JSON.parse(raw);
  if (!fixture || !Array.isArray(fixture.worktrees)) throw new Error('fixture must contain a worktrees array');
  return fixture.worktrees.map((worktree, index) => {
    const prunable = worktree.prunable === true;
    return {
      id: String(worktree.id || `synthetic-${index + 1}`),
      branch: String(worktree.branch || 'synthetic'),
      head: String(worktree.head || 'SYNTHETIC'),
      declaredSensitive: worktree.declaredSensitive === true,
      prunable,
      gitStatusRead: !prunable,
      changedPaths: prunable ? [] : [...new Set((worktree.changedPaths || []).map(String))].sort()
    };
  });
}

function semanticKeys(relativePath) {
  const path = relativePath.replaceAll('\\', '/');
  const normalized = path.replace(/^ruf-ministry-hub-deploy-working\//, '');
  const keys = new Set();

  if (/^(?:functions\/api\/|cloudflare\/)/.test(normalized)) keys.add(`route:${normalized.replace(/^functions\//, '')}`);
  if (normalized.startsWith('functions/')) keys.add(`mirror:${normalized}`);
  if (/(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path) || path.startsWith('.github/workflows/')) keys.add('dependency-and-supply-chain');
  if (/(?:^|\/)(?:ruf-ministry-hub\.html|ruf-ministry-hub-sw\.js|ruf-ministry-hub\.webmanifest|_headers|index\.html|package\.json)$/.test(path)) keys.add('release-identity');
  if (/(?:^|\/)(?:ruf-ministry-hub\.html|ruf-ministry-hub-sw\.js|ruf-ministry-hub\.webmanifest|index\.html)$/.test(path)) keys.add('offline-shell-and-cache');
  if (/(?:^|\/)(?:_headers|_redirects|wrangler\.jsonc|index\.html)$/.test(path)) keys.add('routing-and-csp');
  if (/schema|migration|storage|backup|vault|action|proposal/i.test(path)) keys.add('data-schema-storage-actions');
  if (/accessib|a11y|voiceover|dynamic-type/i.test(path)) keys.add('accessibility-contract');
  if (/service-worker|ruf-ministry-hub-sw/i.test(path)) keys.add('service-worker-contract');
  if (/privacy|secret|egress|retention/i.test(path)) keys.add('privacy-boundary');

  return [...keys].sort();
}

function connectedComponents(nodes, edges) {
  const neighbors = new Map(nodes.map((node) => [node, new Set()]));
  for (const [left, right] of edges) {
    neighbors.get(left)?.add(right);
    neighbors.get(right)?.add(left);
  }
  const seen = new Set();
  let components = 0;
  for (const node of nodes) {
    if (seen.has(node)) continue;
    components += 1;
    const queue = [node];
    seen.add(node);
    while (queue.length) {
      const current = queue.shift();
      for (const neighbor of neighbors.get(current) || []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return components;
}

export function buildMatrix(rawWorktrees, mode = 'git-metadata') {
  const worktrees = rawWorktrees.map((worktree) => {
    const prunable = worktree.prunable === true;
    const changedPaths = prunable ? [] : [...new Set(worktree.changedPaths || [])].sort();
    const safePaths = changedPaths.filter((path) => !SENSITIVE_PATH.test(path));
    const sensitivePathCount = changedPaths.length - safePaths.length;
    const declaredSensitive = worktree.declaredSensitive === true;
    const keys = new Set();
    if (!declaredSensitive) for (const path of safePaths) for (const key of semanticKeys(path)) keys.add(key);
    return {
      id: worktree.id,
      branch: worktree.branch,
      head: worktree.head,
      changedPathCount: changedPaths.length,
      sensitivePathCount,
      declaredSensitive,
      prunable,
      gitStatusRead: prunable ? false : worktree.gitStatusRead !== false,
      state: declaredSensitive || sensitivePathCount
        ? 'SENSITIVE_STOP'
        : prunable
          ? 'PRUNABLE_METADATA_ONLY'
          : changedPaths.length
            ? 'INVENTORIED'
            : 'CLEAN',
      safePaths,
      semanticKeys: [...keys].sort()
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  const overlaps = [];
  for (let leftIndex = 0; leftIndex < worktrees.length; leftIndex += 1) {
    const left = worktrees[leftIndex];
    if (left.state !== 'INVENTORIED') continue;
    for (let rightIndex = leftIndex + 1; rightIndex < worktrees.length; rightIndex += 1) {
      const right = worktrees[rightIndex];
      if (right.state !== 'INVENTORIED') continue;
      const exactPaths = left.safePaths.filter((path) => right.safePaths.includes(path));
      const semanticKeys = left.semanticKeys.filter((key) => right.semanticKeys.includes(key));
      if (!exactPaths.length && !semanticKeys.length) continue;
      overlaps.push({
        left: left.id,
        right: right.id,
        classification: exactPaths.length ? 'EXACT_PATH_OVERLAP' : 'SEMANTIC_OVERLAP',
        exactPaths,
        semanticKeys,
        deltaClassification: 'NOT_VERIFIED',
        nextState: 'MAPPED_READ_ONLY_REQUIRED'
      });
    }
  }

  const changed = worktrees.filter((worktree) => worktree.changedPathCount > 0);
  const safeChanged = changed.filter((worktree) => worktree.state === 'INVENTORIED');
  const edges = overlaps.map((overlap) => [overlap.left, overlap.right]);
  const components = connectedComponents(safeChanged.map((worktree) => worktree.id), edges);

  return {
    schemaVersion: 1,
    mode,
    readOnly: true,
    candidateContentRead: false,
    governanceLedgerRead: mode === 'git-metadata',
    outputContainsFileContents: false,
    stateMachine: ['DETECTED', 'STOPPED', 'INVENTORIED', 'MAPPED', 'WORK_ORDERED', 'RECONCILING', 'FROZEN', 'REVIEWED', 'INTEGRATED_LOCAL', 'EXTERNAL_GATE'],
    summary: {
      worktreeCount: worktrees.length,
      changedWorktreeCount: changed.length,
      changedPathCount: changed.reduce((sum, worktree) => sum + worktree.changedPathCount, 0),
      sensitiveStopCount: worktrees.filter((worktree) => worktree.state === 'SENSITIVE_STOP').length,
      prunableMetadataOnlyCount: worktrees.filter((worktree) => worktree.state === 'PRUNABLE_METADATA_ONLY').length,
      overlapPairCount: overlaps.length,
      convergenceGroupCount: components,
      potentialCandidateReduction: Math.max(0, safeChanged.length - components)
    },
    worktrees: worktrees.map(({ safePaths, semanticKeys: keys, ...worktree }) => ({ ...worktree, semanticKeys: keys })),
    overlaps,
    nextAction: overlaps.length
      ? 'Freeze the named sources, map deltas read-only, and issue one exact isolated Integration Reconciler work order; do not merge dirty worktrees wholesale.'
      : 'No convergence work order is justified by current Git metadata.'
  };
}

function renderSummary(matrix) {
  const summary = matrix.summary;
  return [
    `CONVERGENCE_PREFLIGHT worktrees=${summary.worktreeCount} changed=${summary.changedWorktreeCount} paths=${summary.changedPathCount}`,
    `OVERLAP pairs=${summary.overlapPairCount} groups=${summary.convergenceGroupCount} potential_reduction=${summary.potentialCandidateReduction}`,
    `SENSITIVE_STOP worktrees=${summary.sensitiveStopCount}`,
    `PRUNABLE_METADATA_ONLY worktrees=${summary.prunableMetadataOnlyCount}`,
    `NEXT ${matrix.nextAction}`
  ].join('\n');
}

try {
  const args = parseArgs(process.argv.slice(2));
  const worktrees = args.fixture ? loadFixture(args.fixture) : inventoryRepository(args.repo);
  const matrix = buildMatrix(worktrees, args.fixture ? 'synthetic-fixture' : 'git-metadata');
  process.stdout.write(`${args.summary ? renderSummary(matrix) : JSON.stringify(matrix, null, 2)}\n`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
