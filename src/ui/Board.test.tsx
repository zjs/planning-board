import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { item, plan, size } from '../domain/__fixtures__/tiny-plan.ts';
import { SEQUENCE, SIZE, SYSTEM, type Plan } from '../domain/model.ts';
import { layoutView, type ViewSpec } from '../domain/view.ts';
import { Board } from './Board.tsx';

function render(p: Plan, view: ViewSpec, compact = false): string {
  return renderToStaticMarkup(
    <Board
      plan={p}
      view={view}
      layout={layoutView(p, view)}
      xLabel="X"
      yLabel="Y"
      xNone="No X"
      yNone="No Y"
      compact={compact}
      onCompactChange={() => undefined}
      lifted={null}
      target={null}
      onCardPointerDown={() => undefined}
      justMoved={null}
      scrollRef={createRef()}
      selected={new Set()}
      editing={null}
      onCardDoubleClick={() => undefined}
      onCardZoom={() => undefined}
      lines={[]}
      onHover={() => undefined}
      onLineClick={() => undefined}
      onSpotDoubleClick={() => undefined}
      onCommitEdit={() => undefined}
      onCancelEdit={() => undefined}
      onBackgroundPointerDown={() => undefined}
      zoomableLanes={{ x: new Set(), y: new Set() }}
      onLaneZoom={() => undefined}
      mismatches={{ onCard: new Map(), inside: new Map() }}
    />,
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('Board', () => {
  it('interleaves droppable gaps with sequence columns', () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }), item('b', { sequence: 'a1', values: { [SYSTEM]: ['id'] } }));
    const html = render(p, { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } });
    // 2 area rows × (2 columns + 3 gaps) cells, plus a holding lane per row, per column track, and the corner.
    expect(count(html, 'data-drop="cell"')).toBe(10 + 2 + 5 + 1);
    expect(count(html, 'class="cell gap"')).toBe(6);
    expect(count(html, 'class="cell holding-cell holding-bottom gap"')).toBe(3);
  });

  it('with nothing sequenced, offers one full-size drop target per lane, on either axis', () => {
    const p = plan(item('a', { values: { [SYSTEM]: ['id'] } }));
    for (const view of [
      { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } },
      { x: { property: SYSTEM, level: 0 }, y: { property: SEQUENCE, level: 0 } },
    ]) {
      const html = render(p, view);
      expect(count(html, 'class="cell lone-gap"')).toBe(2);
      expect(count(html, 'Drop a card here to start the sequence')).toBe(2);
      expect(html).not.toContain('gap-row');
    }
  });

  it('puts cards missing a value in the holding lane for the value they have, as chips when asked', () => {
    const p = plan(
      item('row-only', { values: { [SYSTEM]: ['id'] } }),
      item('column-only', { sequence: 'a0' }),
      item('neither'),
    );
    const view = { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } };
    const html = render(p, view);
    expect(html).toMatch(/data-row="id" aria-label="ID, No X">.*data-item="row-only"/);
    expect(html).toMatch(/data-column="a0" aria-label="No Y, X column">.*data-item="column-only"/);
    expect(html).toMatch(/holding-corner" data-drop="cell" aria-label="No Y, No X">.*data-item="neither"/);
    expect(count(html, 'card chip')).toBe(0);
    expect(count(render(p, view, true), 'card chip')).toBe(3);
  });

  it('still shows row holding lanes when the column property has no values', () => {
    const p = plan(item('tagged', { values: { [SYSTEM]: ['id'] } }), item('untagged'));
    p.properties[SIZE] = { ...size, values: {} };
    const html = render(p, { x: { property: SIZE, level: 0 }, y: { property: SYSTEM, level: 0 } });
    expect(html).toContain('No cards have a x value yet');
    expect(html).toMatch(/data-row="id" aria-label="ID, No X">.*data-item="tagged"/);
    expect(html).toMatch(/holding-corner" data-drop="cell" aria-label="No Y, No X">.*data-item="untagged"/);
  });
});
