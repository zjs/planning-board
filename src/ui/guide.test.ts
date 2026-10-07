import { describe, expect, it } from 'vitest';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { blankPlan } from '../domain/builtins.ts';
import { SIZE, SYSTEM, type Plan } from '../domain/model.ts';
import { currentStep, offersGuide, stepsDone, STEPS } from './guide.ts';

const blank = (...items: ReturnType<typeof item>[]): Plan => ({
  ...blankPlan(),
  items: Object.fromEntries(items.map((i) => [i.id, i])),
});

describe('the guided start (Q53)', () => {
  it('starts at the brain dump, and counts it done at three ideas', () => {
    expect(currentStep(blank())?.id).toBe('dump');
    expect(currentStep(blank(item('a'), item('b')))?.id).toBe('dump');
    expect(currentStep(blank(item('a'), item('b'), item('c')))?.id).toBe('area');
  });

  it('moves on as areas are made, ideas sorted, sized, and grouped', () => {
    const ideas = [item('a'), item('b'), item('c')];
    const withArea: Plan = {
      ...blank(...ideas),
      properties: { ...blankPlan().properties, [SYSTEM]: plan().properties[SYSTEM]! },
    };
    expect(currentStep(withArea)?.id).toBe('sort');
    const sorted = { ...withArea, items: { ...withArea.items, a: item('a', { values: { [SYSTEM]: ['id'] } }) } };
    expect(currentStep(sorted)?.id).toBe('view');
    const sized = { ...sorted, items: { ...sorted.items, b: item('b', { values: { [SIZE]: ['m'] } }) } };
    expect(currentStep(sized)?.id).toBe('group');
    const grouped = { ...sized, items: { ...sized.items, c: item('c', { parent: 'b' }) } };
    expect(currentStep(grouped)).toBeNull();
    expect(stepsDone(grouped)).toBe(STEPS.length);
  });

  it('counts steps in order, so a later step done early doesn’t skip one', () => {
    // A card inside another, but no areas yet: still at "make a place".
    const p = blank(item('a'), item('b'), item('c', { parent: 'a' }));
    expect(currentStep(p)?.id).toBe('area');
    expect(stepsDone(p)).toBe(1);
  });

  it('is offered until it has been finished or skipped', () => {
    expect(offersGuide(null)).toBe(true);
    expect(offersGuide('running')).toBe(true);
    expect(offersGuide('finished')).toBe(false);
    expect(offersGuide('skipped')).toBe(false);
  });
});
