// The compatibility gate for boards kept in the browser (ADR 0005): a board
// an earlier version stored must open in this one with nothing lost. Each
// fixture is the Yjs document that version wrote for its sample plan
// (scripts/generate-compat-fixtures.ts), compared with the plan file the
// same version saved from the same sample. Boards from before schema 2
// (sprint 10, ADR 0016) open through the same migration the app runs.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { compatSummary } from '../domain/__fixtures__/compat/summary.ts';
import { LEVEL } from '../domain/model.ts';
import { planFileText, readPlanFile } from '../domain/planJson.ts';
import { readPlan, schemaOf } from '../store/schema.ts';
import { migrateV1 } from '../store/schemaV1.ts';
import { createPlanStore, ensureBuiltIns, renameItem } from './store.ts';

const dir = new URL('../domain/__fixtures__/compat/', import.meta.url);
const boards = readdirSync(dir).filter((f) => f.endsWith('.board.yjs')).sort();

function openBoard(file: string) {
  const saved = new Y.Doc();
  Y.applyUpdate(saved, new Uint8Array(readFileSync(new URL(file, dir))));
  let doc = saved;
  if (schemaOf(saved) === 1) {
    doc = new Y.Doc();
    migrateV1(saved, doc);
  }
  const store = createPlanStore(doc);
  ensureBuiltIns(store);
  return store;
}

describe('boards stored by earlier versions', () => {
  it('has a board from every released version', () => {
    expect(boards).toEqual(['sprint-0', 'sprint-1', 'sprint-10', 'sprint-2', 'sprint-3', 'sprint-4', 'sprint-5', 'sprint-6', 'sprint-7-before-rank', 'sprint-7', 'sprint-8-before-related', 'sprint-8', 'sprint-9'].map((v) => `${v}.board.yjs`));
  });

  for (const file of boards) {
    const version = file.replace('.board.yjs', '');
    it(`${version}: opens with the same plan that version saved to a file, and stays editable`, () => {
      const store = openBoard(file);
      const plan = readPlan(store.doc);
      const fromFile = readPlanFile(readFileSync(new URL(`${version}.plan.json`, dir), 'utf8'));
      if (!fromFile.ok) throw new Error(fromFile.summary);
      expect(compatSummary(plan)).toEqual(compatSummary(fromFile.plan));
      expect(plan.properties[LEVEL]).toBeDefined();

      // It can be edited and saved like any board.
      const first = Object.values(plan.items)[0]!;
      expect(renameItem(store, first.id, `${first.title} (renamed)`)).toBe(true);
      const saved = readPlanFile(planFileText(readPlan(store.doc)));
      expect(saved.ok).toBe(true);
      expect(schemaOf(store.doc)).toBe(2);
    });
  }
});
