/**
 * Pure helpers, kept out of the render so they can be read — and corrected —
 * without React in the way. Nothing here touches `context`, the dataset, or the
 * DOM: everything arrives as plain data.
 */

/** A column of the board. `null` is the lane for cards whose status is not set. */
export interface Lane {
    value: number | null;
    label: string;
}

export interface Card {
    id: string;
    title: string;
    assignee: string | null;
    badge: string | null;
    lane: number | null;
    /** The lane label as the platform formatted it, kept for derived lanes. */
    laneLabel: string;
}

/**
 * The manifest's `property-set` names.
 *
 * These are the strings a column carries in `alias`, never in `name` — the
 * inversion is the expensive bug in this pattern, so the lookup lives in one
 * place rather than being spelled out at each call site.
 */
export const ROLES = {
    status: 'statusField',
    title: 'titleField',
    assignee: 'assigneeField',
    badge: 'badgeField',
} as const;

/**
 * Parse the `lanes` override: `"1=New,2=Active,3=Resolved"`.
 *
 * Deliberately forgiving about whitespace and deliberately strict about the
 * number: an entry whose left side is not an integer is dropped rather than
 * coerced, because `NaN` as a lane value would silently collect every card
 * that failed to parse into one heap.
 *
 * Order is the maker's, not numeric — the whole reason to set this property is
 * to say that Resolved comes after Active even though nothing in the data says
 * so. Duplicate values keep their first appearance.
 */
export function parseLanes(spec: string): Lane[] {
    const lanes: Lane[] = [];
    const seen = new Set<number>();

    for (const entry of spec.split(',')) {
        const at = entry.indexOf('=');

        if (at < 0) {
            continue;
        }

        const value = Number(entry.slice(0, at).trim());
        const label = entry.slice(at + 1).trim();

        if (!Number.isInteger(value) || label === '' || seen.has(value)) {
            continue;
        }

        seen.add(value);
        lanes.push({ value, label });
    }

    return lanes;
}

/**
 * The lanes actually present in the loaded cards, ascending by option value.
 *
 * This cannot invent a lane no card is in — an empty "Resolved" column simply
 * does not appear — which is the limitation the `lanes` property exists to
 * lift. Ascending by value rather than by label because an option set's values
 * are usually authored in the order the maker thinks about them.
 */
export function deriveLanes(cards: Card[]): Lane[] {
    const seen = new Map<number, string>();

    for (const card of cards) {
        if (card.lane !== null && !seen.has(card.lane)) {
            seen.set(card.lane, card.laneLabel);
        }
    }

    return [...seen.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([value, label]) => ({ value, label: label || String(value) }));
}

/**
 * Prepend the lane for cards with no status value, but only if there are any.
 *
 * Dropping those cards would be the tidier board and a silent loss of records
 * the maker can see in the view — the one outcome a control must not have. It
 * is not a drop target: writing `null` back to a choice column is a different
 * intention from moving a card, and not one a drag should express.
 */
export function withUnassigned(lanes: Lane[], cards: Card[], label: string): Lane[] {
    if (!cards.some((card) => card.lane === null)) {
        return lanes;
    }

    return [{ value: null, label }, ...lanes];
}

/** The cards in a lane, in the order the view supplied them. */
export function cardsInLane(cards: Card[], lane: Lane): Card[] {
    return cards.filter((card) => card.lane === lane.value);
}

/**
 * A content signature for the whole board.
 *
 * Used by the component to decide when to drop its optimistic overlay: every
 * `updateView` hands down freshly built objects, so identity says nothing and
 * only the content can say whether anything actually changed.
 */
export function boardKey(cards: Card[]): string {
    return cards.map((card) => `${card.id}:${card.lane ?? ''}`).join('|');
}
