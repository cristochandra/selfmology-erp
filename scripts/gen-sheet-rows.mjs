#!/usr/bin/env node
/**
 * Generate paste-ready TSV for the Selfmology ERP tracker spreadsheet.
 *
 *   node scripts/gen-sheet-rows.mjs
 *
 * Reads git history + docs/change-log-overrides.json, writes docs/sheet-exports/.
 * See docs/CHANGE_MANAGEMENT.md for the method and the column definitions.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'docs/sheet-exports');

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

// Commit `type` -> which Release Log column the summary rolls up into.
const RELEASE_SECTION = {
  feat: 'features', data: 'features', style: 'features', perf: 'features',
  fix: 'bugs',
  refactor: null, docs: null, chore: null, test: null
};

// Free-text scope -> the sheet's Modules vocabulary.
const MODULE_ALIASES = {
  dashboard: 'Dashboard', inventory: 'Inventory', stock: 'Inventory',
  delivery: 'Delivery', do: 'Delivery', expenses: 'Expenses', expense: 'Expenses',
  crm: 'CRM', customers: 'CRM', invoices: 'CRM', invoice: 'CRM',
  purchasing: 'Purchasing', manufacturing: 'Manufacturing',
  reports: 'Reports', settings: 'Settings', users: 'Users'
};

// Fallback when the commit has no scope: guess the module from the paths touched.
const PATH_MODULES = [
  [/js\/modules\/dashboard\.js/, 'Dashboard'],
  [/js\/modules\/inventory\.js/, 'Inventory'],
  [/js\/modules\/delivery-orders\.js/, 'Delivery'],
  [/js\/modules\/expenses\.js/, 'Expenses'],
  [/js\/modules\/(invoices|customers)\.js/, 'CRM'],
  [/js\/modules\/master-data\.js/, 'Settings'],
  [/js\/modules\/users\.js/, 'Users']
];

const TSV_SAFE = (v) =>
  String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

const toTsv = (header, rows) =>
  [header, ...rows].map((r) => r.map(TSV_SAFE).join('\t')).join('\n') + '\n';

function loadOverrides() {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, 'docs/change-log-overrides.json'), 'utf8'));
  } catch {
    return {};
  }
}

function readCommits() {
  // Oldest first, so Change IDs and version inheritance run forward in time.
  const SEP = '';
  const raw = git('log', '--reverse', '--date=short', `--pretty=format:%h${SEP}%ad${SEP}%an${SEP}%s${SEP}%b${SEP}`);
  if (!raw.trim()) return [];

  return raw.split('\n').filter(Boolean).map((chunk) => {
    const [sha, date, author, subject, body = ''] = chunk.split(SEP);
    if (!sha) return null;
    const files = Number(
      git('show', '--pretty=format:', '--name-only', sha.trim())
        .split('\n').filter(Boolean).length
    );
    return { sha: sha.trim(), date, author, subject, body, files };
  }).filter(Boolean);
}

function parseSubject(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/);
  if (!m) return { type: 'chore', scope: '', summary: subject };
  return { type: m[1].toLowerCase(), scope: (m[2] || '').toLowerCase(), summary: m[3] };
}

function moduleFor(scope, sha) {
  if (MODULE_ALIASES[scope]) return MODULE_ALIASES[scope];
  let paths = '';
  try {
    paths = git('show', '--pretty=format:', '--name-only', sha);
  } catch { /* shallow or missing object */ }
  for (const [re, mod] of PATH_MODULES) if (re.test(paths)) return mod;
  return '';
}

function ticketFor(commit, override) {
  if (override?.ticket) return override.ticket;
  const m = `${commit.subject} ${commit.body}`.match(/\bTK-\d{3,}\b/);
  return m ? m[0] : '—';
}

function build() {
  const overrides = loadOverrides();
  const versionAnchors = overrides._versions || {};
  const commits = readCommits();

  let currentVersion = '';
  const changes = commits.map((c, i) => {
    if (versionAnchors[c.sha]) currentVersion = versionAnchors[c.sha];
    const o = overrides[c.sha] || {};
    const { type, scope, summary } = parseSubject(c.subject);
    return {
      changeId: `CH-${String(i + 1).padStart(4, '0')}`,
      date: c.date,
      version: o.version || currentVersion,
      type,
      module: o.module || moduleFor(scope, c.sha),
      summary,
      detail: o.detail || '',
      ticket: ticketFor(c, o),
      sha: c.sha,
      files: c.files,
      author: c.author,
      risk: o.risk || '',
      verification: o.verification || '',
      rollback: o.rollback || '',
      status: o.status || 'Shipped'
    };
  });

  // ---- Change Log tab ----
  const changeHeader = ['Change ID', 'Date', 'Version', 'Type', 'Module', 'Summary',
    'Detail', 'Ticket ID', 'Commit', 'Files Changed', 'Author',
    'Risk', 'Verification', 'Rollback', 'Status'];
  const changeRows = changes.map((c) => [
    c.changeId, c.date, c.version, c.type, c.module, c.summary, c.detail,
    c.ticket, c.sha, c.files, c.author, c.risk, c.verification, c.rollback, c.status
  ]);

  // ---- Release Log tab: roll changes up by version ----
  const byVersion = new Map();
  for (const c of changes) {
    if (!c.version) continue;
    if (!byVersion.has(c.version)) {
      byVersion.set(c.version, { date: c.date, features: [], bugs: [], owner: c.author });
    }
    const rel = byVersion.get(c.version);
    if (c.date > rel.date) rel.date = c.date;
    const section = RELEASE_SECTION[c.type];
    if (section === 'features') rel.features.push(c.summary);
    else if (section === 'bugs') {
      // Only prefix the ticket when the summary doesn't already name it.
      const named = c.ticket && c.ticket !== '—' && !c.summary.includes(c.ticket);
      rel.bugs.push(named ? `${c.ticket} ${c.summary}` : c.summary);
    }
  }

  // Known Issues and Notes cannot be derived from commits — a caveat is
  // precisely the thing the commit didn't say. They come from _releases.
  const releaseMeta = overrides._releases || {};
  const releaseHeader = ['Version', 'Release Date', 'Features Delivered', 'Bugs Fixed',
    'Known Issues', 'Owner', 'Notes'];
  const releaseRows = [...byVersion.entries()].map(([version, r]) => {
    const meta = releaseMeta[version] || {};
    return [`v${version}`, r.date, r.features.join('; '), r.bugs.join('; '),
      meta.knownIssues || '', meta.owner || r.owner, meta.notes || ''];
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, 'change-log.tsv'), toTsv(changeHeader, changeRows));
  writeFileSync(resolve(OUT_DIR, 'release-log.tsv'), toTsv(releaseHeader, releaseRows));

  const missing = changes.filter((c) => !c.risk && RELEASE_SECTION[c.type] !== null);
  console.log(`change-log.tsv   ${changeRows.length} rows`);
  console.log(`release-log.tsv  ${releaseRows.length} rows`);
  console.log(`\nwritten to ${OUT_DIR}`);
  if (missing.length) {
    console.log(`\n${missing.length} shipped change(s) still have no Risk/Verification/Rollback.`);
    console.log('Add them to docs/change-log-overrides.json:');
    for (const c of missing.slice(-8)) console.log(`  ${c.sha}  ${c.summary.slice(0, 62)}`);
    if (missing.length > 8) console.log(`  … and ${missing.length - 8} older`);
  }
}

build();
