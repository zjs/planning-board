// The compatibility gate (ADR 0005): every plan file an earlier version saved
// must still open, with nothing lost, and save again cleanly. The fixtures were
// written by each version's own code (scripts/generate-compat-fixtures.ts).
// A failure here is a compatibility break, and it blocks CI.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEVEL, type Plan } from './model.ts';
import { planFileText, readPlanFile } from './planJson.ts';
import { compatSummary } from './__fixtures__/compat/summary.ts';

const dir = new URL('./__fixtures__/compat/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.plan.json')).sort();

function open(text: string): Plan {
  const result = readPlanFile(text);
  if (!result.ok) throw new Error(`${result.summary}\n${result.details.join('\n')}`);
  return result.plan;
}

describe('plan files saved by earlier versions', () => {
  it('has a fixture from every released version', () => {
    expect(files.filter((f) => !f.includes('.import.'))).toEqual([
      'sprint-0.plan.json',
      'sprint-1.plan.json',
      'sprint-2.plan.json',
      'sprint-3.plan.json',
      'sprint-4.plan.json',
      'sprint-5.plan.json',
    ]);
  });

  for (const file of files) {
    describe(file, () => {
      const text = readFileSync(new URL(file, dir), 'utf8');
      const raw = JSON.parse(text) as { items: { title: string; parent?: string }[]; dependencies?: unknown[] };

      it('opens with every card, group and link', () => {
        const plan = open(text);
        const summary = compatSummary(plan);
        expect(summary.cards).toBe(raw.items.length);
        expect(summary.titles).toEqual(raw.items.map((i) => i.title).sort());
        expect(summary.children).toBe(raw.items.filter((i) => i.parent).length);
        expect(summary.dependencies).toBe(raw.dependencies?.length ?? 0);
        // Built-ins added since get filled in, with no values.
        expect(plan.properties[LEVEL]).toBeDefined();
      });

      it('keeps every value, description and Jira key the file gives a card', () => {
        const plan = open(text);
        const byTitle = new Map(Object.values(plan.items).map((i) => [i.title, i]));
        const fileItems = JSON.parse(text) as {
          items: { title: string; description?: string; externalKey?: string; values?: Record<string, string | string[]> }[];
          properties: { id: string; name: string }[];
        };
        for (const p of fileItems.properties) expect(plan.properties[p.id]?.name, p.id).toBe(p.name);
        for (const item of fileItems.items) {
          const card = byTitle.get(item.title)!;
          if (item.description) expect(card.description, `${item.title}: description`).toBe(item.description);
          if (item.externalKey) expect(card.externalKey, `${item.title}: Jira key`).toBe(item.externalKey);
          for (const [property, value] of Object.entries(item.values ?? {})) {
            const want = (Array.isArray(value) ? value : [value]).sort();
            expect([...(card.values[property] ?? [])].sort(), `${item.title}: ${property}`).toEqual(want);
          }
        }
      });

      it('saves, and the saved file opens to the same plan', () => {
        const plan = open(text);
        const again = planFileText(plan);
        // The writer saves links in a fixed order, which hand-written files don't always follow.
        const sorted = (p: Plan) => ({ ...p, dependencies: [...p.dependencies].sort((a, b) => `${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`)) });
        expect(sorted(open(again))).toEqual(sorted(plan));
        expect(planFileText(open(again))).toBe(again);
      });
    });
  }
});
