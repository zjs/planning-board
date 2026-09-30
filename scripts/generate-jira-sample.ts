// Generates docs/samples/jira-export.csv: a synthetic export in Jira's CSV
// format, for trying the import (sprint 2) without real data. Three
// fictional projects, each with epics and their stories, plus some loose
// issues. It has the quirks a real export has: repeated Component/s,
// Labels, Sprint, and link columns; "Custom field (…)" headers; parents
// given by issue ID; quoted descriptions with commas, quotes, and line
// breaks; and links to issues outside the export.
//
// Run: npm run sample:jira

import { mkdirSync, writeFileSync } from 'node:fs';

type Issue = {
  summary: string;
  type: 'Epic' | 'Story' | 'Bug' | 'Task';
  components?: string[];
  version?: string;
  points?: number;
  team?: string;
  labels?: string[];
  description?: string;
  /** Summaries of issues this one blocks. */
  blocks?: string[];
  children?: Issue[];
};

type Project = { key: string; name: string; firstId: number; issues: Issue[] };

const PROJECTS: Project[] = [
  {
    key: 'IDN',
    name: 'Identity Platform',
    firstId: 20100,
    issues: [
      {
        summary: 'Enterprise SSO self-service',
        type: 'Epic',
        components: ['SSO'],
        version: '2027.2',
        points: 13,
        team: 'Platform',
        labels: ['enterprise'],
        description: 'Let customer admins set up, test, and rotate SSO without opening a support ticket.',
        children: [
          { summary: 'SAML metadata upload and validation', type: 'Story', components: ['SSO'], version: '2027.1', points: 5, team: 'Platform', labels: ['enterprise'], blocks: ['Test SSO connection from settings'] },
          { summary: 'Test SSO connection from settings', type: 'Story', components: ['SSO', 'Admin Console'], version: '2027.2', points: 3, team: 'Platform', blocks: ['Enforce SSO per workspace'] },
          { summary: 'Enforce SSO per workspace', type: 'Story', components: ['SSO'], version: '2027.2', points: 5, team: 'Platform', labels: ['enterprise', 'security'] },
          { summary: 'Certificate expiry warnings', type: 'Story', components: ['SSO', 'Notifications'], version: '2027.3', points: 2, team: 'Growth' },
        ],
      },
      {
        summary: 'Passwordless sign-in',
        type: 'Epic',
        components: ['MFA'],
        version: '2027.3',
        points: 13,
        team: 'Platform',
        labels: ['security'],
        description: 'Passkeys first, then retire SMS codes.\nSee the security review notes in the wiki.',
        children: [
          { summary: 'WebAuthn enrollment', type: 'Story', components: ['MFA'], version: '2027.2', points: 8, team: 'Platform', blocks: ['Passkey login flow'] },
          { summary: 'Passkey login flow', type: 'Story', components: ['MFA', 'SSO'], version: '2027.3', points: 5, team: 'Platform' },
          { summary: 'Retire SMS one-time codes', type: 'Story', components: ['MFA'], version: '2027.4', points: 3, team: 'Growth', labels: ['security'] },
          { summary: 'Recovery codes for passkey users', type: 'Story', components: ['MFA'], version: '2027.3', points: 2, team: 'Growth' },
        ],
      },
      {
        summary: 'Directory sync reliability',
        type: 'Epic',
        components: ['Directory Sync'],
        version: '2027.1',
        points: 8,
        team: 'Platform',
        children: [
          { summary: 'SCIM group push', type: 'Story', components: ['Directory Sync'], version: '2027.1', points: 5, team: 'Platform' },
          { summary: 'Sync health dashboard', type: 'Story', components: ['Directory Sync', 'Admin Console'], version: '2027.2', points: 3, team: 'Growth' },
          { summary: 'Deprovisioning grace period', type: 'Story', components: ['Directory Sync'], points: 2, team: 'Platform' },
        ],
      },
      { summary: 'Custom roles', type: 'Story', components: ['Roles'], version: '2027.4', points: 8, team: 'Growth', labels: ['enterprise'], description: 'Top request from the "Enterprise, EU" segment.' },
      { summary: 'Login page flickers on Safari', type: 'Bug', components: ['SSO'], version: '2027.1', points: 1, team: 'Growth' },
      { summary: 'Session timeout policy per workspace', type: 'Story', components: ['SSO', 'Roles'], team: 'Platform' },
    ],
  },
  {
    key: 'PAY',
    name: 'Payments',
    firstId: 30200,
    issues: [
      {
        summary: 'EU tax compliance',
        type: 'Epic',
        components: ['Tax'],
        version: '2027.2',
        points: 13,
        team: 'Core Payments',
        labels: ['compliance'],
        description: 'VAT OSS reporting and reverse charge, before the Q3 audit.',
        children: [
          { summary: 'Tax engine vendor migration', type: 'Story', components: ['Tax'], version: '2027.1', points: 8, team: 'Core Payments', blocks: ['VAT OSS reporting', 'Reverse charge handling'] },
          { summary: 'VAT OSS reporting', type: 'Story', components: ['Tax', 'Invoicing'], version: '2027.2', points: 5, team: 'Core Payments', labels: ['compliance'] },
          { summary: 'Reverse charge handling', type: 'Story', components: ['Tax', 'Invoicing'], version: '2027.3', points: 5, team: 'Core Payments', labels: ['compliance'] },
          { summary: 'Tax IDs collected at checkout', type: 'Story', components: ['Tax', 'Checkout'], version: '2027.2', points: 3, team: 'Growth' },
        ],
      },
      {
        summary: 'Payment gateway resilience',
        type: 'Epic',
        components: ['Gateway'],
        version: '2027.3',
        points: 13,
        team: 'Core Payments',
        children: [
          { summary: 'Second payment processor', type: 'Story', components: ['Gateway'], version: '2027.2', points: 13, team: 'Core Payments', blocks: ['Gateway failover'] },
          { summary: 'Gateway failover', type: 'Story', components: ['Gateway'], version: '2027.3', points: 8, team: 'Core Payments' },
          { summary: 'Smarter retries for failed payments', type: 'Story', components: ['Gateway', 'Subscriptions'], version: '2027.3', points: 5, team: 'Growth' },
          { summary: '3-D Secure 2 flows', type: 'Story', components: ['Gateway', 'Checkout'], version: '2027.1', points: 5, team: 'Core Payments', labels: ['compliance'] },
        ],
      },
      {
        summary: 'Flexible subscriptions',
        type: 'Epic',
        components: ['Subscriptions'],
        version: '2027.4',
        points: 8,
        team: 'Growth',
        children: [
          { summary: 'Mid-cycle plan changes', type: 'Story', components: ['Subscriptions'], version: '2027.3', points: 5, team: 'Growth', blocks: ['Proration preview'] },
          { summary: 'Proration preview', type: 'Story', components: ['Subscriptions', 'Checkout'], version: '2027.4', points: 3, team: 'Growth' },
          { summary: 'Seat-based add-ons', type: 'Story', components: ['Subscriptions', 'Invoicing'], points: 8, team: 'Growth' },
          { summary: 'Subscription pause', type: 'Story', components: ['Subscriptions'], points: 2, team: 'Growth' },
        ],
      },
      { summary: 'Invoice PDF redesign', type: 'Story', components: ['Invoicing'], version: '2027.1', points: 3, team: 'Growth', description: 'New layout, with the "Bill to" block first.' },
      { summary: 'Credit notes', type: 'Story', components: ['Invoicing'], version: '2027.2', points: 5, team: 'Core Payments' },
      { summary: 'Rounding error on multi-currency invoices', type: 'Bug', components: ['Invoicing'], version: '2027.1', points: 2, team: 'Core Payments' },
      { summary: 'Evaluate usage-based pricing', type: 'Task', labels: ['research'], team: 'Growth' },
    ],
  },
  {
    key: 'DATA',
    name: 'Data Platform',
    firstId: 40300,
    issues: [
      {
        summary: 'Customer-managed encryption keys',
        type: 'Epic',
        components: ['Pipeline', 'Search', 'Export'],
        version: '2027.3',
        points: 13,
        team: 'Data Infra',
        labels: ['enterprise', 'security'],
        children: [
          { summary: 'Key management service integration', type: 'Story', components: ['Pipeline'], version: '2027.2', points: 8, team: 'Data Infra', blocks: ['Encrypt search indexes with customer keys', 'Encrypt exports with customer keys'] },
          { summary: 'Encrypt search indexes with customer keys', type: 'Story', components: ['Search'], version: '2027.3', points: 5, team: 'Data Infra' },
          { summary: 'Encrypt exports with customer keys', type: 'Story', components: ['Export'], version: '2027.3', points: 3, team: 'Data Infra' },
          { summary: 'Key rotation runbook', type: 'Task', components: ['Pipeline'], version: '2027.4', points: 1, team: 'Data Infra' },
        ],
      },
      {
        summary: 'Warehouse export v2',
        type: 'Epic',
        components: ['Export'],
        version: '2027.2',
        points: 8,
        team: 'Data Infra',
        children: [
          { summary: 'Snowflake export connector', type: 'Story', components: ['Export'], version: '2027.1', points: 5, team: 'Data Infra' },
          { summary: 'BigQuery export connector', type: 'Story', components: ['Export'], version: '2027.2', points: 5, team: 'Data Infra' },
          { summary: 'Incremental export', type: 'Story', components: ['Export', 'Pipeline'], version: '2027.2', points: 8, team: 'Data Infra', blocks: ['Export column selection'] },
          { summary: 'Export column selection', type: 'Story', components: ['Export', 'Admin Console'], version: '2027.3', points: 3, team: 'Growth' },
        ],
      },
      {
        summary: 'Audit log for regulated customers',
        type: 'Epic',
        components: ['Audit Log'],
        version: '2027.4',
        points: 8,
        team: 'Data Infra',
        labels: ['compliance'],
        children: [
          { summary: 'Tamper-evident audit log', type: 'Story', components: ['Audit Log'], version: '2027.3', points: 8, team: 'Data Infra', blocks: ['SIEM streaming'] },
          { summary: 'SIEM streaming', type: 'Story', components: ['Audit Log', 'Pipeline'], version: '2027.4', points: 5, team: 'Data Infra' },
          { summary: 'Audit events for billing changes', type: 'Story', components: ['Audit Log', 'Invoicing'], version: '2027.2', points: 3, team: 'Core Payments' },
        ],
      },
      { summary: 'Zero-downtime index rebuild', type: 'Story', components: ['Search'], version: '2027.1', points: 8, team: 'Data Infra', blocks: ['Typo-tolerant search'] },
      { summary: 'Typo-tolerant search', type: 'Story', components: ['Search'], version: '2027.2', points: 5, team: 'Growth' },
      { summary: 'Pipeline lag alerting', type: 'Task', components: ['Pipeline'], points: 2, team: 'Data Infra' },
    ],
  },
];

/** Links out of the export, as a real filter export has. */
const OUTSIDE_LINKS: Record<string, string> = {
  'Enforce SSO per workspace': 'SEC-118',
  'Second payment processor': 'LEGAL-42',
};

const STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low'];
const PEOPLE = ['Dana Ortiz', 'Sam Okafor', 'Priya Nair', 'Lee Moreau', 'Jo Tanaka', ''];
const SPRINTS: Record<string, string[]> = {
  '2027.1': ['Sprint 41', 'Sprint 42'],
  '2027.2': ['Sprint 43'],
  '2027.3': [],
  '2027.4': [],
};

// Seeded PRNG (mulberry32), so every run writes the same file.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(2027);
const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;

type Row = Issue & { key: string; id: number; project: Project; parent?: { id: number; summary: string } };

const rows: Row[] = [];
for (const project of PROJECTS) {
  let n = 1;
  let id = project.firstId;
  const add = (issue: Issue, parent?: Row) => {
    const row: Row = { ...issue, key: `${project.key}-${n++}`, id: id++, project, ...(parent ? { parent: { id: parent.id, summary: parent.summary } } : {}) };
    rows.push(row);
    for (const child of issue.children ?? []) add(child, row);
  };
  for (const issue of project.issues) add(issue);
}
const keyOf = new Map(rows.map((r) => [r.summary, r.key]));
const blockedBy = new Map<string, string[]>();
for (const row of rows) {
  for (const target of row.blocks ?? []) {
    if (!keyOf.has(target)) throw new Error(`Unknown blocked issue: ${target}`);
    blockedBy.set(target, [...(blockedBy.get(target) ?? []), row.key]);
  }
}

const HEADER = [
  'Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status', 'Project key', 'Project name', 'Priority', 'Assignee', 'Created',
  'Component/s', 'Component/s', 'Component/s', 'Fix Version/s', 'Labels', 'Labels', 'Sprint', 'Sprint',
  'Custom field (Story Points)', 'Custom field (Team)', 'Parent', 'Parent summary', 'Description',
  'Outward issue link (Blocks)', 'Outward issue link (Blocks)', 'Inward issue link (Blocks)',
];

const pad = (values: readonly string[], n: number) => [...values, ...Array<string>(n).fill('')].slice(0, n);
const quote = (field: string) => (/[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field);

const lines = [HEADER.map(quote).join(',')];
for (const row of rows) {
  const version = row.version ?? '';
  const status = version === '2027.1' ? pick(['In Progress', 'In Review', 'Done']) : version === '' ? 'To Do' : pick(STATUSES.slice(0, 2));
  const day = 1 + Math.floor(random() * 28);
  const outward = (row.blocks ?? []).map((s) => keyOf.get(s)!);
  if (OUTSIDE_LINKS[row.summary]) outward.push(OUTSIDE_LINKS[row.summary]!);
  const fields = [
    row.summary,
    row.key,
    String(row.id),
    row.type,
    status,
    row.project.key,
    row.project.name,
    pick(PRIORITIES),
    pick(PEOPLE),
    `2026-0${1 + Math.floor(random() * 8)}-${String(day).padStart(2, '0')} 10:${String(Math.floor(random() * 60)).padStart(2, '0')}`,
    ...pad(row.components ?? [], 3),
    version,
    ...pad(row.labels ?? [], 2),
    ...pad(SPRINTS[version] ?? [], 2),
    row.points === undefined ? '' : String(row.points),
    row.team ?? '',
    row.parent ? String(row.parent.id) : '',
    row.parent?.summary ?? '',
    row.description ?? '',
    ...pad(outward, 2),
    ...pad(blockedBy.get(row.summary) ?? [], 1),
  ];
  if (outward.length > 2 || (blockedBy.get(row.summary)?.length ?? 0) > 1 || (row.components?.length ?? 0) > 3) {
    throw new Error(`Row ${row.key} has more values than the header has columns for`);
  }
  if (fields.length !== HEADER.length) throw new Error(`Row ${row.key} has ${fields.length} fields`);
  lines.push(fields.map(quote).join(','));
}

mkdirSync(new URL('../docs/samples/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/samples/jira-export.csv', import.meta.url), lines.join('\r\n') + '\r\n');
console.log(`Wrote docs/samples/jira-export.csv: ${rows.length} issues`);
