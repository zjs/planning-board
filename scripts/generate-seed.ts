// Generates src/seed/sample-plan.json: a synthetic but realistic plan for a
// fictional B2B SaaS product line. Titles, groups, and dependency chains are
// hand-written; sparseness (which items have sizes, quarters, sequence) comes
// from a seeded PRNG, so the output is identical on every run.
//
// Run: npm run seed

import { writeFileSync } from 'node:fs';

type Spec = { title: string; sys?: string[]; children?: Spec[]; group?: { time?: string; size?: string } };

const AREAS: [id: string, label: string, components: [id: string, label: string][]][] = [
  ['identity', 'Identity & Access', [['sso', 'SSO'], ['mfa', 'MFA'], ['scim', 'Directory Sync'], ['rbac', 'Roles & Permissions']]],
  ['billing', 'Billing', [['invoicing', 'Invoicing'], ['gateway', 'Payment Gateway'], ['tax', 'Tax Engine'], ['subscriptions', 'Subscriptions']]],
  ['data', 'Data Platform', [['pipeline', 'Event Pipeline'], ['export', 'Warehouse Export'], ['search', 'Search'], ['audit', 'Audit Log']]],
  ['cx', 'Customer Experience', [['console', 'Admin Console'], ['notify', 'Notifications'], ['api', 'Public API']]],
];

const BY_COMPONENT: Record<string, string[]> = {
  'identity/sso': ['SAML metadata auto-refresh', 'OIDC provider support', 'Just-in-time user provisioning', 'SSO enforcement per workspace', 'IdP-initiated login', 'Multiple IdPs per tenant', 'SSO session timeout policy'],
  'identity/mfa': ['TOTP enrollment rework', 'Retire SMS codes', 'Admin-enforced MFA', 'Remember trusted devices', 'Self-service MFA reset', 'Step-up auth for sensitive actions'],
  'identity/scim': ['SCIM 2.0 group push', 'Directory sync health dashboard', 'Deprovisioning grace period', 'Custom attribute mapping', 'Entra ID sync performance', 'Nested group flattening'],
  'identity/rbac': ['Custom roles', 'Permission audit report', 'Resource-level permissions', 'Role templates for new workspaces', 'Delegated admin', 'Least-privilege default role'],
  'billing/invoicing': ['Invoice PDF redesign', 'Multi-currency invoices', 'Credit notes', 'Consolidated invoicing for parent accounts', 'Scheduled invoice emails', 'PO numbers on invoices'],
  'billing/gateway': ['Second payment processor', '3-D Secure 2 flows', 'Smarter retries for failed payments', 'ACH direct debit', 'Payment method vaulting', 'Gateway failover', 'Wallet payments at checkout'],
  'billing/tax': ['VAT OSS reporting', 'US sales tax nexus rules', 'Tax-exempt certificates', 'Reverse charge handling', 'Tax engine vendor migration', 'Tax calculation caching'],
  'billing/subscriptions': ['Mid-cycle plan changes', 'Proration preview', 'Annual prepay discounts', 'Seat-based add-ons', 'Trial-to-paid conversion flow', 'Subscription pause'],
  'data/pipeline': ['Exactly-once event delivery', 'Schema registry', 'Backfill tooling', 'Dead-letter queue replay', 'Pipeline lag alerting', 'Event retention tiers'],
  'data/export': ['Snowflake export connector', 'BigQuery export connector', 'Incremental export', 'Export column selection', 'Parquet output'],
  'data/search': ['Zero-downtime index rebuild', 'Typo-tolerant search', 'Permission-aware search results', 'Search inside attachments', 'Saved searches', 'Search analytics for admins'],
  'data/audit': ['Audit log export API', 'Tamper-evident audit log', 'Audit retention settings', 'SIEM streaming', 'Admin action audit coverage', 'Audit log search filters'],
  'cx/console': ['Console navigation redesign', 'Bulk user actions', 'Settings search', 'Dark mode', 'Usage overview page', 'Onboarding checklist'],
  'cx/notify': ['Notification preferences center', 'Slack notifications', 'Digest emails', 'In-app notification inbox', 'Notification rate limiting', 'Microsoft Teams notifications'],
  'cx/api': ['Consistent API pagination', 'Idempotency keys', 'API versioning policy', 'Python SDK', 'Go SDK', 'Sandbox environments'],
};

const CROSS_CUTTING: Spec[] = [
  { title: 'Customer-managed encryption keys', sys: ['data/pipeline', 'data/export', 'data/search', 'data/audit'] },
  { title: 'Tenant data deletion (GDPR)', sys: ['data/pipeline', 'data/search', 'billing/invoicing', 'identity/scim'] },
  { title: 'Audit events for billing changes', sys: ['data/audit', 'billing/subscriptions'] },
  { title: 'Seat sync from directory', sys: ['identity/scim', 'billing/subscriptions'] },
  { title: 'Role-based invoice access', sys: ['identity/rbac', 'billing/invoicing'] },
  { title: 'Console-wide search', sys: ['data/search', 'cx/console'] },
  { title: 'Failed-payment alerts', sys: ['billing/gateway', 'cx/notify'] },
  { title: 'Login anomaly alerts', sys: ['identity/mfa', 'cx/notify', 'data/audit'] },
  { title: 'Export job status in API', sys: ['data/export', 'cx/api'] },
  { title: 'Product analytics events', sys: ['data/pipeline', 'cx/console'] },
  { title: 'SSO-bound API tokens', sys: ['identity/sso', 'cx/api'] },
  { title: 'Tax IDs collected at checkout', sys: ['billing/tax', 'cx/console'] },
  { title: 'Permission checks in search and export', sys: ['identity/rbac', 'data/search', 'data/export'] },
  { title: 'Webhook secret rotation', sys: ['cx/api', 'identity/rbac'] },
];

// Deliberately untagged: requirement 21 says every feature must work without system values.
const UNTAGGED = [
  'Accessibility audit fixes', 'Pen-test remediation', 'Onboarding docs refresh', 'Pricing page experiment',
  'SOC 2 Type II evidence collection', 'German and French localization', 'Advisory board feedback triage',
  'Faster CI builds', 'Node 24 upgrade', 'Incident review follow-ups', 'Partner program portal',
  'Churn survey in cancellation flow', 'Page-load performance budget', 'Design system tokens',
  'Support macro cleanup', 'Sales demo environment',
];

// Tagged with an area but no component yet: what a PM writes before engineering has
// placed the work. Zooming Identity shows them in "No component" (Q18), ready to
// refine (sprint 1, exit criterion 4). Their values are fixed and they're added after
// the random passes, so every other item stays exactly as it was.
const AREA_ONLY: { title: string; time?: string; size?: string; sequence?: number }[] = [
  { title: 'Contractor and guest identities', time: 'q3', size: 'l', sequence: 8 },
  { title: 'Session management overhaul', time: 'q2' },
  { title: 'Identity for acquired products' },
];

const GROUPS: Spec[] = [
  {
    title: 'EU data residency',
    // Tagged at area level: values can sit at any level of the hierarchy.
    sys: ['data'],
    group: { time: 'q2', size: 'xl' },
    children: [
      {
        title: 'Regional pipeline shards',
        sys: ['data/pipeline'],
        children: [
          { title: 'Region routing for events', sys: ['data/pipeline'] },
          { title: 'EU Kafka cluster', sys: ['data/pipeline'] },
          { title: 'Cross-region replication guardrails', sys: ['data/pipeline', 'data/audit'] },
        ],
      },
      { title: 'EU invoice storage', sys: ['billing/invoicing'] },
      { title: 'Region-pinned directory sync', sys: ['identity/scim'] },
      { title: 'Residency setting in console', sys: ['cx/console'] },
    ],
  },
  {
    title: 'Usage-based pricing',
    sys: ['billing'],
    group: { size: 'xl' },
    children: [
      {
        title: 'Metering',
        sys: ['data/pipeline'],
        children: [
          { title: 'Metering event schema', sys: ['data/pipeline'] },
          { title: 'Meter aggregation job', sys: ['data/pipeline'] },
        ],
      },
      { title: 'Rated usage on invoices', sys: ['billing/invoicing', 'billing/subscriptions'] },
      { title: 'Usage dashboard', sys: ['cx/console'] },
      { title: 'Overage notifications', sys: ['cx/notify'] },
    ],
  },
  {
    title: 'Passwordless login',
    sys: ['identity/mfa'],
    group: { time: 'q1', size: 'm' },
    children: [
      { title: 'WebAuthn enrollment', sys: ['identity/mfa'] },
      { title: 'Passkey login flow', sys: ['identity/sso', 'identity/mfa'] },
      // Deliberate mismatch for the group/child checks: larger than its group.
      { title: 'Account recovery codes', sys: ['identity/mfa'], group: { size: 'l' } },
    ],
  },
  {
    title: 'Public API v2',
    sys: ['cx/api'],
    group: { time: 'q3', size: 'l' },
    children: [
      {
        title: 'API auth',
        sys: ['cx/api'],
        children: [
          { title: 'OAuth client credentials', sys: ['identity/sso', 'cx/api'] },
          { title: 'Scoped API tokens', sys: ['identity/rbac', 'cx/api'] },
          { title: 'Token usage audit', sys: ['data/audit', 'cx/api'] },
        ],
      },
      { title: 'Rate limiting v2', sys: ['cx/api'] },
      { title: 'Webhooks v2', sys: ['cx/api', 'cx/notify'] },
      { title: 'OpenAPI 3.1 spec', sys: ['cx/api'] },
    ],
  },
];

/** [prerequisite, dependent] by title. */
const DEPENDENCIES: [string, string][] = [
  ['Schema registry', 'Metering event schema'],
  ['Metering event schema', 'Meter aggregation job'],
  ['Exactly-once event delivery', 'Meter aggregation job'],
  ['Meter aggregation job', 'Rated usage on invoices'],
  ['Rated usage on invoices', 'Usage dashboard'],
  ['Rated usage on invoices', 'Overage notifications'],
  ['Custom roles', 'Scoped API tokens'],
  ['Scoped API tokens', 'Webhooks v2'],
  ['OAuth client credentials', 'Rate limiting v2'],
  ['Idempotency keys', 'Webhooks v2'],
  ['Resource-level permissions', 'Permission-aware search results'],
  ['Resource-level permissions', 'Permission checks in search and export'],
  ['SCIM 2.0 group push', 'Seat sync from directory'],
  ['Seat sync from directory', 'Seat-based add-ons'],
  ['EU Kafka cluster', 'Region routing for events'],
  ['Region routing for events', 'Cross-region replication guardrails'],
  ['Region routing for events', 'EU invoice storage'],
  ['Tamper-evident audit log', 'Audit log export API'],
  ['Audit log export API', 'SIEM streaming'],
  ['WebAuthn enrollment', 'Passkey login flow'],
  ['Account recovery codes', 'Passkey login flow'],
  ['Payment method vaulting', 'ACH direct debit'],
  ['Multi-currency invoices', 'Consolidated invoicing for parent accounts'],
  ['Tax engine vendor migration', 'VAT OSS reporting'],
  ['Tax engine vendor migration', 'US sales tax nexus rules'],
  ['Mid-cycle plan changes', 'Proration preview'],
  ['API versioning policy', 'OpenAPI 3.1 spec'],
  ['OpenAPI 3.1 spec', 'Python SDK'],
  ['OpenAPI 3.1 spec', 'Go SDK'],
  ['Notification preferences center', 'Slack notifications'],
  ['Notification preferences center', 'Digest emails'],
  ['Console navigation redesign', 'Settings search'],
  ['Zero-downtime index rebuild', 'Typo-tolerant search'],
  ['Customer-managed encryption keys', 'Tenant data deletion (GDPR)'],
  ['Audit events for billing changes', 'SIEM streaming'],
  ['Product analytics events', 'Usage overview page'],
];

/** Dependencies placed out of order on purpose, so conflict checks have something to find. */
const SEQUENCE_VIOLATIONS = new Set(['Tax engine vendor migration', 'Notification preferences center']);
const TIME_VIOLATIONS = new Set(['Mid-cycle plan changes']);

const QUARTERS = ['q1', 'q2', 'q3', 'q4'];
const SIZES = ['xs', 's', 'm', 'l', 'xl'];

// mulberry32
let state = 0x5eed;
function rand(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
function weighted<T>(entries: [T, number][]): T {
  let r = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, weight] of entries) if ((r -= weight) < 0) return value;
  return entries[entries.length - 1]![0];
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

interface OutItem {
  id: string;
  title: string;
  parent?: string;
  sequence?: number;
  values?: Record<string, string | string[]>;
}

const items: OutItem[] = [];
const byTitle = new Map<string, OutItem>();
const pinned = new Map<string, { time?: string; size?: string }>();

function add(spec: Spec, parent?: string) {
  const id = slug(spec.title);
  if (byTitle.has(spec.title) || items.some((i) => i.id === id)) throw new Error(`duplicate: ${spec.title}`);
  const item: OutItem = { id, title: spec.title, ...(parent ? { parent } : {}) };
  if (spec.sys?.length) item.values = { system: spec.sys };
  if (spec.group) pinned.set(spec.title, spec.group);
  items.push(item);
  byTitle.set(spec.title, item);
  for (const child of spec.children ?? []) add(child, id);
}

for (const [component, titles] of Object.entries(BY_COMPONENT)) {
  for (const title of titles) add({ title, sys: [component] });
}
CROSS_CUTTING.forEach((spec) => add(spec));
UNTAGGED.forEach((title) => add({ title }));
GROUPS.forEach((spec) => add(spec));

const deps = DEPENDENCIES.map(([from, to]) => {
  const a = byTitle.get(from);
  const b = byTitle.get(to);
  if (!a || !b) throw new Error(`unknown dependency: ${from} -> ${to}`);
  return [a.id, b.id] as [string, string];
});

// Sequence columns: unlinked items spread across the timeline; a dependent
// lands one or two columns after its latest prerequisite. Quarters follow
// columns, so the plan reads roughly left to right in both views.
const prereqs = new Map<string, string[]>();
for (const [from, to] of deps) prereqs.set(to, [...(prereqs.get(to) ?? []), from]);
const linked = new Set(deps.flat());
const randInt = (max: number) => Math.floor(rand() * (max + 1));
const columns = new Map<string, number>();
function columnOf(id: string): number {
  if (!columns.has(id)) {
    const before = prereqs.get(id) ?? [];
    columns.set(
      id,
      before.length ? Math.max(...before.map(columnOf)) + 1 + randInt(1) : randInt(linked.has(id) ? 3 : 10),
    );
  }
  return columns.get(id)!;
}
items.forEach((item) => columnOf(item.id));
const COLUMNS_PER_QUARTER = 3;

for (const item of items) {
  let column = columnOf(item.id);
  if (SEQUENCE_VIOLATIONS.has(item.title)) column += 7;
  const hasSequence = linked.has(item.id) || rand() < 0.7;
  if (hasSequence) item.sequence = column;

  const values = (item.values ??= {});
  const override = pinned.get(item.title);
  const hasSize = override?.size !== undefined || rand() < 0.5;
  const hasTime = override?.time !== undefined || (hasSize ? rand() < 0.75 : rand() < 0.25);
  if (hasSize) {
    values.size = override?.size ?? weighted([['xs', 1], ['s', 2.5], ['m', 3.5], ['l', 2], ['xl', 1]]);
  }
  if (hasTime) {
    let q = override?.time
      ? QUARTERS.indexOf(override.time)
      : Math.min(QUARTERS.length - 1, Math.floor(columnOf(item.id) / COLUMNS_PER_QUARTER));
    if (TIME_VIOLATIONS.has(item.title)) q = QUARTERS.length - 1;
    const quarter = QUARTERS[q]!;
    values.time = rand() < 0.3 ? `${quarter}/${pick(['r1', 'r2'])}` : quarter;
  }
  if (Object.keys(values).length === 0) delete item.values;
}

for (const { title, time, size, sequence } of AREA_ONLY) {
  add({ title, sys: ['identity'] });
  const item = items[items.length - 1]!;
  if (time) item.values!.time = time;
  if (size) item.values!.size = size;
  if (sequence !== undefined) item.sequence = sequence;
}

// Card levels (Q32), fixed rather than random so every other value stays as it was. Groups and
// what's inside them get levels: a group holding groups is an initiative, any other group an
// epic, and the rest stories. Two cross-cutting cards are epics with nothing inside yet. Every
// other card has no level: not decided yet, as while brainstorming.
const EPICS_WITHOUT_CHILDREN = ['Customer-managed encryption keys', 'Tenant data deletion (GDPR)'];
function setLevel(spec: Spec) {
  const item = byTitle.get(spec.title)!;
  const level = !spec.children?.length ? 'story' : spec.children.some((c) => c.children?.length) ? 'initiative' : 'epic';
  (item.values ??= {}).level = level;
  spec.children?.forEach(setLevel);
}
GROUPS.forEach(setLevel);
for (const title of EPICS_WITHOUT_CHILDREN) (byTitle.get(title)!.values ??= {}).level = 'epic';

const plan = {
  format: 'planning-board',
  version: 1,
  properties: [
    {
      id: 'system',
      name: 'System',
      levels: ['Area', 'Component'],
      multi: true,
      values: AREAS.map(([id, label, components]) => ({
        id,
        label,
        children: components.map(([cid, clabel]) => ({ id: `${id}/${cid}`, label: clabel })),
      })),
    },
    {
      id: 'level',
      name: 'Level',
      levels: ['Level'],
      values: [
        { id: 'initiative', label: 'Initiative' },
        { id: 'epic', label: 'Epic' },
        { id: 'story', label: 'Story' },
      ],
    },
    {
      id: 'time',
      name: 'Time',
      levels: ['Quarter', 'Release'],
      values: QUARTERS.map((q, i) => ({
        id: q,
        label: `Q${i + 1} 2027`,
        children: [1, 2].map((r) => ({ id: `${q}/r${r}`, label: `27.${i * 2 + r}` })),
      })),
    },
    {
      id: 'size',
      name: 'Size',
      levels: ['Size'],
      values: SIZES.map((s) => ({ id: s, label: s.toUpperCase() })),
    },
  ],
  items,
  dependencies: deps,
};

const out = new URL('../src/seed/sample-plan.json', import.meta.url);
writeFileSync(out, JSON.stringify(plan, null, 2) + '\n');

const quarterCounts = QUARTERS.map((q) => items.filter((i) => String(i.values?.time ?? '').startsWith(q)).length);
const stats = {
  quarterCounts,
  columns: new Set(items.map((i) => i.sequence).filter((c) => c !== undefined)).size,
  items: items.length,
  topLevel: items.filter((i) => !i.parent).length,
  withSystem: items.filter((i) => i.values?.system).length,
  multiComponent: items.filter((i) => (i.values?.system?.length ?? 0) > 1).length,
  withSize: items.filter((i) => i.values?.size).length,
  withTime: items.filter((i) => i.values?.time).length,
  withLevel: items.filter((i) => i.values?.level).length,
  withSequence: items.filter((i) => i.sequence !== undefined).length,
  dependencies: deps.length,
};
console.log(`wrote ${out.pathname}`, stats);
