import { describe, expect, it } from 'vitest';
import { item, plan, system } from './__fixtures__/tiny-plan.ts';
import { SYSTEM, TIME, type SelectProperty } from './model.ts';
import {
  isBuiltIn,
  levelNameProblem,
  moveTargets,
  planValueDelete,
  planValueMove,
  propertiesInOrder,
  propertyNameProblem,
  reorderKey,
  siblingsOf,
  valueLabelProblem,
} from './properties.ts';

const withOrder = (property: SelectProperty, id: string, order: string): SelectProperty => ({
  ...property,
  values: { ...property.values, [id]: { ...property.values[id]!, order } },
});

describe('names', () => {
  const p = plan();

  it('refuses blank and clashing property names, ignoring case', () => {
    expect(propertyNameProblem(p, '  ')).toBe('A property needs a name.');
    expect(propertyNameProblem(p, 'time')).toBe('There\'s already a property called “time”.');
    expect(propertyNameProblem(p, 'Time', TIME)).toBeNull();
    expect(propertyNameProblem(p, 'Team')).toBeNull();
  });

  it('refuses a value label its siblings already use, but not a cousin’s', () => {
    expect(valueLabelProblem(system, 'id/sso', 'id')).toBe('“id/sso” is already here.');
    expect(valueLabelProblem(system, 'ID/SSO', 'id', 'id/sso')).toBeNull();
    expect(valueLabelProblem(system, 'ID/SSO', 'pay')).toBeNull();
  });

  it('refuses a level name the property already has', () => {
    expect(levelNameProblem(system, 1, 'area')).toBe('System already has a level called “area”.');
    expect(levelNameProblem(system, 1, 'Service')).toBeNull();
  });

  it('knows the built-ins, and lists them first', () => {
    expect(['sequence', 'system', 'size', 'time', 'pteam'].map(isBuiltIn)).toEqual([true, true, true, true, false]);
    expect(propertiesInOrder(p).map((x) => x.id)).toEqual(['sequence', 'system', 'size', 'time']);
  });
});

describe('planValueDelete (Q4)', () => {
  it('moves a deleted release’s cards to its quarter', () => {
    const p = plan(item('a', { values: { [TIME]: ['q1/r1'] } }), item('b', { values: { [TIME]: ['q1/r2'] } }));
    expect(planValueDelete(p, TIME, 'q1/r1')).toEqual({
      removed: ['q1/r1'],
      parent: 'q1',
      cards: [{ item: 'a', values: ['q1'] }],
    });
  });

  it('deletes everything below the value, and clears top-level values', () => {
    const p = plan(
      item('a', { values: { [SYSTEM]: ['id/sso', 'pay'] } }),
      item('b', { values: { [SYSTEM]: ['id'] } }),
      item('c', { values: { [SYSTEM]: ['pay/ledger'] } }),
    );
    const deletion = planValueDelete(p, SYSTEM, 'id')!;
    expect(deletion.removed.sort()).toEqual(['id', 'id/mfa', 'id/sso']);
    expect(deletion.cards).toEqual([
      { item: 'a', values: ['pay'] },
      { item: 'b', values: [] },
    ]);
  });

  it('keeps the more precise sibling rather than adding the parent back', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso', 'id/mfa'] } }));
    expect(planValueDelete(p, SYSTEM, 'id/sso')!.cards).toEqual([{ item: 'a', values: ['id/mfa'] }]);
  });

  it('does nothing for an unknown value', () => {
    expect(planValueDelete(plan(), SYSTEM, 'nope')).toBeNull();
  });
});

describe('planValueMove', () => {
  it('moves a component to another area, keeping its cards', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso'] } }));
    const move = planValueMove(p, SYSTEM, 'id/sso', 'pay')!;
    expect(move.cards).toEqual([]);
    expect(move.order > system.values['pay/ledger']!.order).toBe(true);
  });

  it('drops the new parent from cards that now hold both', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id/sso', 'pay'] } }));
    expect(planValueMove(p, SYSTEM, 'id/sso', 'pay')!.cards).toEqual([{ item: 'a', values: ['id/sso'] }]);
  });

  it('only moves within a level, to a new parent, without a label clash', () => {
    const p = plan();
    expect(moveTargets(system, 'id/sso').map((t) => t.id)).toEqual(['pay']);
    expect(moveTargets(system, 'id')).toEqual([]);
    expect(planValueMove(p, SYSTEM, 'id/sso', 'id')).toBeNull();
    expect(planValueMove(p, SYSTEM, 'id', 'pay')).toBeNull();
    expect(planValueMove(p, SYSTEM, 'id/sso', 'pay/ledger')).toBeNull();
    const clash = { ...p, properties: { ...p.properties, [SYSTEM]: { ...system, values: { ...system.values, 'pay/x': { id: 'pay/x', label: 'ID/SSO', parent: 'pay', order: 'a5' } } } } };
    expect(planValueMove(clash, SYSTEM, 'id/sso', 'pay')).toBeNull();
  });
});

describe('reorderKey', () => {
  const order = (property: SelectProperty) => siblingsOf(property, null).map((n) => n.id);

  it('moves a value one place up or down', () => {
    const size = plan().properties['size'] as SelectProperty;
    expect(order(size)).toEqual(['s', 'm', 'l']);
    expect(order(withOrder(size, 'l', reorderKey(size, 'l', 'up')!))).toEqual(['s', 'l', 'm']);
    expect(order(withOrder(size, 's', reorderKey(size, 's', 'down')!))).toEqual(['m', 's', 'l']);
    expect(order(withOrder(size, 'm', reorderKey(size, 'm', 'up')!))).toEqual(['m', 's', 'l']);
  });

  it('does nothing at either end', () => {
    const size = plan().properties['size'] as SelectProperty;
    expect(reorderKey(size, 's', 'up')).toBeNull();
    expect(reorderKey(size, 'l', 'down')).toBeNull();
  });
});
