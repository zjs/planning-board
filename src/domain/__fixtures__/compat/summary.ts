import type { Plan } from '../../model.ts';

/** What a compatibility check compares: everything a person would notice missing. */
export function compatSummary(plan: Plan) {
  const items = Object.values(plan.items);
  const titleOf = (id: string) => plan.items[id]?.title ?? id;
  return {
    cards: items.length,
    titles: items.map((i) => i.title).sort(),
    children: items.filter((i) => i.parent !== null).length,
    /** "Child ⊂ Group" pairs, by title. */
    groups: items.flatMap((i) => (i.parent === null ? [] : [`${i.title} ⊂ ${titleOf(i.parent)}`])).sort(),
    dependencies: plan.dependencies.length,
    /** "A → B" pairs, by title. */
    links: plan.dependencies.map((d) => `${titleOf(d.from)} → ${titleOf(d.to)}`).sort(),
    /** "A ~ B" related pairs (Q44), by title. Versions before sprint 8 have none. */
    related: plan.related.map((l) => [titleOf(l.a), titleOf(l.b)].sort().join(' ~ ')).sort(),
    /** "Title: property=value,value" for every value a card holds, by value label path. */
    values: items
      .flatMap((i) =>
        Object.entries(i.values)
          .filter(([, v]) => v.length > 0)
          .map(([p, v]) => `${i.title}: ${p}=${[...v].sort().join(',')}`),
      )
      .sort(),
    /** "Title: key / description" for every card with either. */
    details: items
      .filter((i) => i.description || i.externalKey)
      .map((i) => `${i.title}: ${i.externalKey ?? ''} / ${i.description}`)
      .sort(),
    /** Property names, by ID. */
    properties: Object.values(plan.properties)
      .map((p) => `${p.id}=${p.name}`)
      .sort(),
    /** Cards in sequence order, cards sharing a column joined with "|". */
    sequence: [...new Set(items.flatMap((i) => (i.sequence === null ? [] : [i.sequence])))]
      .sort()
      .map((key) =>
        items
          .filter((i) => i.sequence === key)
          .map((i) => i.title)
          .sort()
          .join('|'),
      ),
  };
}
