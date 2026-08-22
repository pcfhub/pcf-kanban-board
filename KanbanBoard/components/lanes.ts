/**
 * Pure helpers, kept out of the render so they can be read — and corrected —
 * without React in the way. Nothing here touches `context`, the dataset, or the
 * DOM: everything arrives as plain data.
 */

/** A column of the board. `null` is the lane for cards whose status is not set. */
export interface Lane {
    value: number | null;
    label: string;
    /**
     * The option's colour, when the option set supplied one.
     *
     * Only the option set knows it — lanes derived from the loaded records and
     * lanes named in the `lanes` override both have `null`. So colour is
     * present on a model-driven board and absent everywhere else, which is why
     * it is rendered as decoration rather than as anything a reader has to
     * interpret.
     */
    color: string | null;
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
        lanes.push({ value, label, color: null });
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
        .map(([value, label]) => ({ value, label: label || String(value), color: null }));
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

    return [{ value: null, label, color: null }, ...lanes];
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
 * Lanes from a choice column's option set.
 *
 * Reads the route observed on a real form and nothing else:
 *
 *   metadata.Attributes.get(columnName).OptionSet.Options
 *
 * **The first hop is the one that is not obvious.** `getEntityMetadata`
 * resolves with a class instance, not a plain object: its own enumerable
 * properties are private fields — `_entityDescriptor`, `_entityType`,
 * `_attributes` (the column names that were *asked for*, not their metadata) —
 * and `Attributes` is a getter on the prototype. So `Object.keys` and
 * `Object.values` cannot see it, and two earlier versions of this function
 * walked the object, found the private fields, and concluded the entity had no
 * attributes. Reading it by name works, because property access traverses the
 * prototype chain even though enumeration does not.
 *
 * Each hop tolerates the two or three cheap variations of its shape rather than
 * insisting on one spelling, because only the first hop was ever observed
 * directly — the rest is what the type definitions and the Client API reference
 * describe. What it does *not* do any more is search: a recursive walk for
 * anything that looked like an option set found the right answer here and could
 * find the wrong one elsewhere, and it cost more bytes than the certainty was
 * worth.
 *
 * Returns `[]` on any miss, which the caller reports and falls back to lanes
 * derived from the loaded records. That path is a smaller board, not a broken
 * one — but it is invisible, so the caller logs `describeShape()` beside it.
 */
export function optionLanes(metadata: unknown, columnName: string): Lane[] {
    const attribute = attributeOf(metadata, columnName);
    const optionSet = get(attribute, 'OptionSet') ?? get(attribute, 'attributeDescriptor');
    const options = get(optionSet, 'Options') ?? optionSet;

    if (!Array.isArray(options)) {
        return [];
    }

    const lanes: Lane[] = [];

    for (const option of options) {
        const value = get(option, 'Value');

        if (typeof value === 'number' && Number.isInteger(value)) {
            lanes.push({
                value,
                label: labelOf(option) || String(value),
                color: hexColor(get(option, 'Color')),
            });
        }
    }

    return lanes;
}

/**
 * The metadata for one column, out of the `Attributes` collection.
 *
 * A Dataverse metadata collection answers `get(name)`. The array and
 * keyed-object forms cost a line each and cover a collection that arrived as
 * plain data instead.
 */
function attributeOf(metadata: unknown, columnName: string): unknown {
    const attributes = get(metadata, 'Attributes');
    const getter = get(attributes, 'get');

    if (typeof getter === 'function') {
        try {
            const found = (getter as (name: string) => unknown).call(attributes, columnName);

            if (found) {
                return found;
            }
        } catch {
            // Not that kind of collection.
        }
    }

    if (Array.isArray(attributes)) {
        return attributes.find((entry) => get(entry, 'LogicalName') === columnName);
    }

    return get(attributes, columnName);
}

/**
 * A compact description of what came back, for the console when the read finds
 * nothing.
 *
 * Kept even though nothing calls it on the happy path, because it is what
 * turned two blind install-and-test cycles into one. It reports structure
 * rather than content — keys and their types — and **includes prototype
 * getters**, or it would describe a different object than the one the read
 * failed on: private fields, and none of the public API.
 */
export function describeShape(value: unknown, depth = 0): string {
    if (depth > 4) {
        return '…';
    }

    if (Array.isArray(value)) {
        return value.length === 0 ? '[]' : `[${describeShape(value[0], depth + 1)} ×${value.length}]`;
    }

    if (typeof value !== 'object' || value === null) {
        return typeof value;
    }

    const keys = readableKeys(value);

    if (keys.length === 0) {
        return '{}';
    }

    const shown = keys.slice(0, 12);
    const body = shown
        .map((key) => {
            try {
                return `${key}: ${describeShape((value as Record<string, unknown>)[key], depth + 1)}`;
            } catch {
                return `${key}: <threw>`;
            }
        })
        .join(', ');

    return `{ ${body}${keys.length > shown.length ? `, …+${keys.length - shown.length}` : ''} }`;
}

/** Own keys, plus the accessors the prototype chain declares. */
function readableKeys(node: object): string[] {
    const keys = new Set<string>(Object.keys(node));

    let proto: object | null = Object.getPrototypeOf(node) as object | null;

    while (proto && proto !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(proto)) {
            const descriptor = Object.getOwnPropertyDescriptor(proto, key);

            if (key !== 'constructor' && descriptor && typeof descriptor.get === 'function') {
                keys.add(key);
            }
        }

        proto = Object.getPrototypeOf(proto) as object | null;
    }

    return [...keys];
}

/**
 * A colour if it is one, otherwise `null`.
 *
 * Validated rather than trusted. The value goes into an inline style and
 * `EntityMetadata` is untyped, so anything that is not plainly a hex colour is
 * dropped instead of handed to the browser to interpret.
 */
function hexColor(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : null;
}

/** An option's label, plain or wrapped in a localised label object. */
function labelOf(option: unknown): string {
    const label = get(option, 'Label');

    if (typeof label === 'string') {
        return label;
    }

    const user = get(get(label, 'UserLocalizedLabel'), 'Label');

    if (typeof user === 'string') {
        return user;
    }

    const localised = get(label, 'LocalizedLabels');
    const first = Array.isArray(localised) ? get(localised[0], 'Label') : undefined;

    return typeof first === 'string' ? first : '';
}

/** One member of an untyped bag, without asserting the bag has a shape. */
function get(source: unknown, key: string): unknown {
    if (typeof source !== 'object' || source === null) {
        return undefined;
    }

    return (source as Record<string, unknown>)[key];
}
