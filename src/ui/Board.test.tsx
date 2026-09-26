import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { item, plan } from '../domain/__fixtures__/tiny-plan.ts';
import { SEQUENCE, SYSTEM, type Plan } from '../domain/model.ts';
import { layoutView, type ViewSpec } from '../domain/view.ts';
import { Board } from './Board.tsx';

function render(p: Plan, view: ViewSpec): string {
  return renderToStaticMarkup(
    <Board
      plan={p}
      view={view}
      layout={layoutView(p, view)}
      xLabel="X"
      yLabel="Y"
      lifted={null}
      target={null}
      onCardPointerDown={() => undefined}
      justMoved={null}
      scrollRef={createRef()}
    />,
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('Board', () => {
  it('interleaves droppable gaps with sequence columns', () => {
    const p = plan(item('a', { sequence: 'a0', values: { [SYSTEM]: ['id'] } }), item('b', { sequence: 'a1', values: { [SYSTEM]: ['id'] } }));
    const html = render(p, { x: { property: SEQUENCE, level: 0 }, y: { property: SYSTEM, level: 0 } });
    // 2 area rows × (2 columns + 3 gaps) droppable cells.
    expect(count(html, 'data-drop="cell"')).toBe(10);
    expect(count(html, 'class="cell gap"')).toBe(6);
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
});
