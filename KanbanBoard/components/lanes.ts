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
 * A choice column's raw value as a lane number, or `null`.
 *
 * On a real host this is the `typeof raw === 'number'` branch and nothing else:
 * a choice column's raw value is its option number. The string branch exists
 * for PCFHub's demo harness, whose fixture format carries **one value per
 * column** and so cannot express an option's number separately from its label.
 * A fixture written with numbers may still arrive as strings depending on how
 * the harness builds its records, and a board where every card silently lands
 * in Unassigned is a demo that misrepresents the control.
 *
 * Narrow on purpose: only an integer-valued string converts. `"Active"` stays
 * `null`, because a role bound to a text column should look unbound rather than
 * inventing lanes out of labels it cannot write back.
 */
export function laneValue(raw: unknown): number | null {
    if (typeof raw === 'number') {
        return Number.isInteger(raw) ? raw : null;
    }

    if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = Number(raw);

        return Number.isInteger(parsed) ? parsed : null;
    }

    return null;
}

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

/**
 * Lanes from a choice column's option set, as returned by
 * `context.utils.getEntityMetadata(entityName, [columnName])`.
 *
 * This is the only way to learn about a lane no record is in — a dataset
 * `Column` carries `name`, `displayName`, `dataType`, `alias`, `order`,
 * `visualSizeFactor`, `isHidden`, `isPrimary` and `disableSorting`, and nothing
 * about options. Deriving lanes from the loaded records therefore cannot show
 * an empty one, which on a new board means every card sits in one lane with
 * nowhere to move to.
 *
 * **Written defensively on purpose.** `EntityMetadata` is typed
 * `{ [key: string]: any }`, so nothing here is checked by the compiler and the
 * exact traversal is not pinned down by the documentation either. Each step
 * accepts the shapes that are plausible — a collection with `get()`, an array,
 * or a plain object — and the whole thing returns `[]` rather than throwing if
 * none of them match, so a surprise degrades to derived lanes instead of an
 * empty board.
 *
 * Verify this against a real form before trusting it. See SPEC.md.
 */
export function optionLanes(metadata: unknown, columnName: string): Lane[] {
    const attribute = pick(get(metadata, 'Attributes'), columnName, 'LogicalName');

    if (!attribute) {
        return [];
    }

    const optionSet = get(attribute, 'OptionSet');
    const raw = callable(optionSet, 'getOptions') ?? get(optionSet, 'Options') ?? optionSet;

    if (!Array.isArray(raw)) {
        return [];
    }

    const lanes: Lane[] = [];

    for (const option of raw) {
        const value = get(option, 'Value');
        const label = labelOf(option);

        if (typeof value === 'number' && Number.isInteger(value)) {
            lanes.push({ value, label: label || String(value) });
        }
    }

    return lanes;
}

/** An option's label, which is either a string or a localised label object. */
function labelOf(option: unknown): string {
    const label = get(option, 'Label');

    if (typeof label === 'string') {
        return label;
    }

    const localised = get(get(label, 'UserLocalizedLabel'), 'Label');

    return typeof localised === 'string' ? localised : '';
}

/** One member of an untyped bag, without asserting the bag has a shape. */
function get(source: unknown, key: string): unknown {
    if (typeof source !== 'object' || source === null) {
        return undefined;
    }

    return (source as Record<string, unknown>)[key];
}

/** Call `name` on `source` if it is a function, otherwise `undefined`. */
function callable(source: unknown, name: string): unknown {
    const fn = get(source, name);

    return typeof fn === 'function' ? (fn as () => unknown).call(source) : undefined;
}

/**
 * Find `wanted` in a collection that may be a Dataverse metadata collection
 * (`get(name)`), an array of objects keyed by `keyField`, or a plain object.
 */
function pick(collection: unknown, wanted: string, keyField: string): unknown {
    const viaGet = get(collection, 'get');

    if (typeof viaGet === 'function') {
        try {
            const found = (viaGet as (k: string) => unknown).call(collection, wanted);

            if (found) {
                return found;
            }
        } catch {
            // Fall through to the other shapes.
        }
    }

    if (Array.isArray(collection)) {
        return collection.find((entry) => get(entry, keyField) === wanted);
    }

    return get(collection, wanted);
}
