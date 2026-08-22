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
 * Lanes from a choice column's option set, out of whatever
 * `context.utils.getEntityMetadata(entityName, [columnName])` returned.
 *
 * This is the only way to learn about a lane no record is in — a dataset
 * `Column` carries `name`, `displayName`, `dataType`, `alias`, `order`,
 * `visualSizeFactor`, `isHidden`, `isPrimary` and `disableSorting`, and nothing
 * about options.
 *
 * **It searches for a shape rather than walking a path**, and that is a
 * deliberate second attempt. `EntityMetadata` is typed `{ [key: string]: any }`,
 * the documentation describes the Client API's shape rather than this one, and a
 * first version that walked `Attributes` → `OptionSet` → `Options` found
 * nothing against a real form. Guessing a longer path is the same bet again.
 *
 * What is *not* a guess is the target. The type definitions pin it down:
 * `OptionSetMetadata` is `{ Options: OptionMetadata[] }` and `OptionMetadata` is
 * `{ Label: string; Value: number; Color: string }`. So this looks for an array
 * whose members have a numeric `Value` and a `Label`, wherever it sits.
 *
 * Scoped, not blind: it first finds the node describing this column — an object
 * whose `LogicalName` or `name` matches — and searches inside that. Only if the
 * column cannot be found does it search the whole document, and then only
 * accepts an unambiguous answer, because `statecode` and `statuscode` both carry
 * option sets and picking the wrong one silently would be worse than falling
 * back to derived lanes.
 */
export function optionLanes(metadata: unknown, columnName: string): Lane[] {
    const column = findColumnNode(metadata, columnName);
    const found = findOptionArrays(column ?? metadata);

    /*
     * Inside the column's own node, the first option array is the right one —
     * an attribute commonly carries the same options twice, once under
     * `OptionSet` and again under `GlobalOptionSet`, and demanding a unique
     * answer would reject exactly the case this exists for.
     *
     * Outside it, uniqueness is the only safety available: `statecode` and
     * `statuscode` both have option sets, and silently grouping a board by the
     * wrong one is worse than falling back to derived lanes.
     */
    const chosen = column ? found[0] : found.length === 1 ? found[0] : undefined;

    if (!chosen) {
        return [];
    }

    const lanes: Lane[] = [];

    for (const option of chosen) {
        const value = get(option, 'Value');

        if (typeof value === 'number' && Number.isInteger(value)) {
            lanes.push({ value, label: labelOf(option) || String(value) });
        }
    }

    return lanes;
}

/**
 * A compact description of what came back, for the console when the search
 * finds nothing.
 *
 * Prints structure rather than content: the keys at each level, and the type of
 * each. Enough to write the next version of `optionLanes()` from, without
 * dumping an entity's entire metadata into a log.
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

    const keys = readableKeys(value as object);

    if (keys.length === 0) {
        return '{}';
    }

    const shown = keys.slice(0, 12);
    const body = shown
        .map((k) => {
            try {
                return `${k}: ${describeShape((value as Record<string, unknown>)[k], depth + 1)}`;
            } catch {
                return `${k}: <threw>`;
            }
        })
        .join(', ');

    return `{ ${body}${keys.length > shown.length ? `, …+${keys.length - shown.length}` : ''} }`;
}

/**
 * The node describing `columnName`, by whichever key the platform used.
 *
 * Two ways to be found, because metadata collections come in two flavours. Most
 * are plain objects or arrays and turn up in the walk. Some expose their
 * contents *only* through a `get(name)` method, and those are invisible to
 * `Object.values` — a walk alone would report the column missing on a shape
 * where it is perfectly available.
 */
function findColumnNode(root: unknown, columnName: string): unknown {
    let match: unknown = null;

    walk(root, (node) => {
        if (match) {
            return;
        }

        for (const key of ['LogicalName', 'logicalName', 'name', 'Name']) {
            if (get(node, key) === columnName) {
                match = node;
                return;
            }
        }

        const getter = node.get;

        if (typeof getter === 'function') {
            try {
                const found = (getter as (name: string) => unknown).call(node, columnName);

                if (typeof found === 'object' && found !== null) {
                    match = found;
                }
            } catch {
                // A `get` that is not this kind of getter. Keep walking.
            }
        }
    });

    return match;
}

/** Every array that looks like an option set, anywhere under `root`. */
function findOptionArrays(root: unknown): Array<unknown[]> {
    const found: Array<unknown[]> = [];

    walk(root, (node) => {
        for (const value of Object.values(node)) {
            if (isOptionArray(value) && !found.includes(value)) {
                found.push(value);
            }
        }
    });

    return found;
}

/**
 * An array of `{ Value: number, Label: … }`.
 *
 * Every member must qualify, not just the first: an array of mixed shapes is
 * something else that happens to start like an option set.
 */
function isOptionArray(value: unknown): value is unknown[] {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }

    return value.every((entry) => {
        const optionValue = get(entry, 'Value');

        return typeof optionValue === 'number' && get(entry, 'Label') !== undefined;
    });
}

/**
 * Visit every object under `root`, breadth-first and bounded.
 *
 * **Prototype accessors are followed, and that is the whole reason this works.**
 * What `getEntityMetadata` resolves with is a class instance, not a plain bag:
 * its own enumerable properties are private fields — `_entityDescriptor`,
 * `_entityType`, `_attributes` (which holds the column *names* that were asked
 * for, not their metadata) — while the public `Attributes` is a getter on the
 * prototype. `Object.keys` and `Object.values` do not enumerate prototype
 * getters, so a walk built on them sees the private fields, misses the public
 * API entirely, and reports that the entity has no attributes.
 *
 * Reading a getter can run code, so every read is guarded: a throwing accessor
 * is skipped rather than failing the search.
 *
 * Metadata can also contain cycles and is large, so this tracks what it has
 * seen and stops after a fixed number of nodes.
 */
function walk(root: unknown, visit: (node: Record<string, unknown>) => void): void {
    const seen = new Set<unknown>();
    const queue: unknown[] = [root];
    let budget = 20000;

    while (queue.length > 0 && budget > 0) {
        const node = queue.shift();
        budget -= 1;

        if (typeof node !== 'object' || node === null || seen.has(node)) {
            continue;
        }

        seen.add(node);

        if (Array.isArray(node)) {
            queue.push(...node);
            continue;
        }

        const record = node as Record<string, unknown>;

        visit(record);

        for (const key of readableKeys(node)) {
            try {
                const value = record[key];

                if (typeof value === 'object' && value !== null) {
                    queue.push(value);
                }
            } catch {
                // An accessor that throws when read. Nothing to follow.
            }
        }
    }
}

/**
 * Every key worth reading on `node`: its own, plus the accessors its prototype
 * chain declares.
 *
 * Stops before `Object.prototype`, whose members are not data, and skips
 * anything already declared nearer the instance so a getter is read once.
 */
function readableKeys(node: object): string[] {
    const keys = new Set<string>(Object.keys(node));

    let proto: object | null = Object.getPrototypeOf(node) as object | null;

    while (proto && proto !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(proto)) {
            if (key === 'constructor') {
                continue;
            }

            const descriptor = Object.getOwnPropertyDescriptor(proto, key);

            // Getters only. A plain method on the prototype is behaviour, and
            // calling arbitrary methods to see what falls out is a different
            // and much worse idea.
            if (descriptor && typeof descriptor.get === 'function') {
                keys.add(key);
            }
        }

        proto = Object.getPrototypeOf(proto) as object | null;
    }

    return [...keys];
}

/** An option's label, which is either a string or a localised label object. */
function labelOf(option: unknown): string {
    const label = get(option, 'Label');

    if (typeof label === 'string') {
        return label;
    }

    for (const path of [['UserLocalizedLabel', 'Label'], ['LocalizedLabels', '0', 'Label']]) {
        let node: unknown = label;

        for (const step of path) {
            node = Array.isArray(node) ? node[Number(step)] : get(node, step);
        }

        if (typeof node === 'string') {
            return node;
        }
    }

    return '';
}

/** One member of an untyped bag, without asserting the bag has a shape. */
function get(source: unknown, key: string): unknown {
    if (typeof source !== 'object' || source === null) {
        return undefined;
    }

    return (source as Record<string, unknown>)[key];
}
