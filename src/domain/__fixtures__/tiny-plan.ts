import type { Item, Plan, SelectProperty, ValueNode } from '../model.ts';
import { SEQUENCE, SIZE, SYSTEM, TIME } from '../model.ts';

function values(...nodes: [id: string, parent: string | null, order: string][]): Record<string, ValueNode> {
  return Object.fromEntries(
    nodes.map(([id, parent, order]) => [id, { id, label: id.toUpperCase(), parent, order }]),
  );
}

export const system: SelectProperty = {
  kind: 'select',
  id: SYSTEM,
  name: 'System',
  levels: ['Area', 'Component'],
  multi: true,
  // Deliberately inserted out of order to exercise sorting.
  values: values(
    ['pay', null, 'a1'],
    ['id', null, 'a0'],
    ['pay/ledger', 'pay', 'a0'],
    ['id/sso', 'id', 'a1'],
    ['id/mfa', 'id', 'a0'],
  ),
};

export const time: SelectProperty = {
  kind: 'select',
  id: TIME,
  name: 'Time',
  levels: ['Quarter', 'Release'],
  multi: false,
  values: values(['q1', null, 'a0'], ['q2', null, 'a1'], ['q1/r1', 'q1', 'a0'], ['q1/r2', 'q1', 'a1'], ['q2/r1', 'q2', 'a0']),
};

export const size: SelectProperty = {
  kind: 'select',
  id: SIZE,
  name: 'Size',
  levels: ['Size'],
  multi: false,
  values: values(['s', null, 'a0'], ['m', null, 'a1'], ['l', null, 'a2']),
};

export function item(id: string, patch: Partial<Item> = {}): Item {
  return { id, title: id, description: '', parent: null, sequence: null, values: {}, ...patch };
}

export function plan(...items: Item[]): Plan {
  return {
    properties: {
      [SEQUENCE]: { kind: 'sequence', id: SEQUENCE, name: 'Sequence' },
      [SYSTEM]: system,
      [TIME]: time,
      [SIZE]: size,
    },
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    dependencies: [],
    related: [],
  };
}
