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
    ['pay', null, 'b'],
    ['id', null, 'a'],
    ['pay/ledger', 'pay', 'a'],
    ['id/sso', 'id', 'b'],
    ['id/mfa', 'id', 'a'],
  ),
};

export const time: SelectProperty = {
  kind: 'select',
  id: TIME,
  name: 'Time',
  levels: ['Quarter', 'Release'],
  multi: false,
  values: values(['q1', null, 'a'], ['q2', null, 'b'], ['q1/r1', 'q1', 'a'], ['q1/r2', 'q1', 'b'], ['q2/r1', 'q2', 'a']),
};

export const size: SelectProperty = {
  kind: 'select',
  id: SIZE,
  name: 'Size',
  levels: ['Size'],
  multi: false,
  values: values(['s', null, 'a'], ['m', null, 'b'], ['l', null, 'c']),
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
  };
}
