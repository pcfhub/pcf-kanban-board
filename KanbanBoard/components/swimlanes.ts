/**
 * Swimlanes and the sort menu — 0.5.0, as pure helpers in the manner of
 * `lanes.ts`: nothing here touches `context`, the dataset or the DOM.
 *
 * Every shape below was measured before it was written (SPEC.md, *The 0.4.8
 * probe*, 2026-10-10), on a form and in a canvas app.
 */

import { Card, Lane, laneValue } from './lanes';

/** What the Swimlane column is, and so how a row is keyed and written. */
export type RowKind = 'choice' | 'yesno' | 'lookup';

/** Where a row change goes: a lookup's bind needs these two, read from metadata. */
export interface RowBind {
    /** The `@odata.bind` key's left side — measured `ownerid` for Owner. */
    navigationProperty: string;
    /** The target table's entity set — `teams`, `systemusers`. */
    entitySet: string;
}

/** A row of the board. `key` `null` is the row for cards with no value, which takes no drop. */
export interface Row {
    key: string | null;
    label: string;
    /**
     * What a move into this row writes: an option number, a boolean, or a
     * record reference. `null` for the empty row.
     */
    value: number | boolean | { etn: string; id: string } | null;
}

/**
 * The kind of a Swimlane column, from the dataset column's `dataType`, or
 * `null` for a type the manifest's group does not hold.
 */
export function rowKind(dataType: string | undefined): RowKind | null {
    if (dataType === 'OptionSet') {
        return 'choice';
    }

    if (dataType === 'TwoOptions') {
        return 'yesno';
    }

    if (typeof dataType === 'string' && dataType.indexOf('Lookup') === 0) {
        return 'lookup';
    }

    return null;
}

/** A GUID as the dataset spells it elsewhere: bare and lower-case. */
function bare(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null;
    }

    const trimmed = raw.trim().replace(/^\{|\}$/g, '').toLowerCase();

    return /^[0-9a-f-]{36}$/.test(trimmed) ? trimmed : null;
}

/**
 * One card's row, from the column's raw value and its formatted value.
 *
 * - **A choice** arrives as the string `"858010003"` on a form and as the
 *   number in canvas; `laneValue` takes both.
 * - **A Yes/No** arrives as `"1"` / `"0"` on a form; a boolean or a number
 *   is taken too, since canvas was not measured for one.
 * - **Owner or a lookup** arrives as `{ etn, id: { guid }, name }`, the GUID
 *   bare and lower-case — the key carries the table too, because a user and a
 *   team can never share a row.
 * - **Never set** is `null`, and the empty row: a Yes/No left blank is not
 *   *No*.
 */
export function rowOf(kind: RowKind, raw: unknown, formatted: string | null, emptyLabel: string): Row {
    if (raw === null || raw === undefined || raw === '') {
        return { key: null, label: emptyLabel, value: null };
    }

    if (kind === 'choice') {
        const value = laneValue(raw);

        return value === null
            ? { key: null, label: emptyLabel, value: null }
            : { key: String(value), label: formatted || String(value), value };
    }

    if (kind === 'yesno') {
        const yes = raw === true || raw === 1 || raw === '1' || raw === 'true';
        const no = raw === false || raw === 0 || raw === '0' || raw === 'false';

        if (!yes && !no) {
            return { key: null, label: emptyLabel, value: null };
        }

        return { key: yes ? '1' : '0', label: formatted || (yes ? '1' : '0'), value: yes };
    }

    const reference = raw as { etn?: unknown; id?: unknown; name?: unknown };
    const guid = bare(typeof reference.id === 'object' && reference.id !== null
        ? (reference.id as { guid?: unknown }).guid
        : reference.id);

    if (typeof reference.etn !== 'string' || guid === null) {
        return { key: null, label: emptyLabel, value: null };
    }

    const label = formatted || (typeof reference.name === 'string' ? reference.name : guid);

    return { key: `${reference.etn}:${guid}`, label, value: { etn: reference.etn, id: guid } };
}

/**
 * The rows the loaded cards are in, in a stable order: a choice by option
 * value, as lanes are derived; a Yes/No with Yes first; a lookup by name. The
 * empty row goes first when some card is in it — a card the board cannot
 * place is still a record the maker can see in the view.
 */
export function deriveRows(kind: RowKind, cards: Card[], emptyLabel: string): Row[] {
    const seen = new Map<string, Row>();
    let empty = false;

    for (const card of cards) {
        if (!card.row || card.row.key === null) {
            empty = empty || card.row !== undefined;
            continue;
        }

        if (!seen.has(card.row.key)) {
            seen.set(card.row.key, card.row);
        }
    }

    const rows = [...seen.values()];

    if (kind === 'choice') {
        rows.sort((a, b) => (a.value as number) - (b.value as number));
    } else if (kind === 'yesno') {
        rows.sort((a, b) => (a.key === '1' ? -1 : 0) - (b.key === '1' ? -1 : 0));
    } else {
        rows.sort((a, b) => a.label.localeCompare(b.label));
    }

    return empty ? [{ key: null, label: emptyLabel, value: null }, ...rows] : rows;
}

/**
 * A choice column's rows from its option set — read with the lanes' own
 * `optionLanes` — so a row no card is in yet still appears, with any row
 * a loaded card is in that the options did not name kept after them.
 */
export function rowsFromOptions(options: Lane[], fromCards: Row[]): Row[] {
    const rows: Row[] = options
        .filter((option) => option.value !== null)
        .map((option) => ({ key: String(option.value), label: option.label, value: option.value as number }));
    const known = new Set(rows.map((row) => row.key));
    const empty = fromCards.filter((row) => row.key === null);
    const extra = fromCards.filter((row) => row.key !== null && !known.has(row.key));

    return [...empty, ...rows, ...extra];
}

/**
 * What a move into `row` writes on `column`, beside the lane's own payload.
 *
 * A choice writes its number and a Yes/No its boolean — both measured
 * through the record and through the Web API on a form. **Owner and a lookup
 * write only through the Web API**: the record stages `null` for one and the
 * save is refused ("Attribute: ownerid cannot be set to NULL", measured), so
 * the key is `<navigation property>@odata.bind` and the value
 * `/<entity set>(<guid>)` — accepted to a team, read back as one. `null` when
 * a lookup's bind could not be resolved, which the caller refuses.
 */
export function rowPayload(kind: RowKind, column: string, row: Row, bind: RowBind | null): Record<string, unknown> | null {
    if (row.value === null) {
        return null;
    }

    if (kind !== 'lookup') {
        return { [column]: row.value };
    }

    if (!bind) {
        return null;
    }

    const reference = row.value as { etn: string; id: string };

    return { [`${bind.navigationProperty}@odata.bind`]: `/${bind.entitySet}(${reference.id})` };
}

/** The cards in one lane and one row, in the order the view supplied them. */
export function cardsInCell(cards: Card[], lane: Lane, row: Row): Card[] {
    return cards.filter((card) => card.lane === lane.value && (card.row ? card.row.key : null) === row.key);
}

/**
 * The sentence to show for a refused write.
 *
 * Usually the `message`. **But the server can send an unfilled template**:
 * reassigning to a user without read on the table was refused with the
 * message *"Assignee {2}(Id = {3}) is missing {0} privilege on {1} entity
 * (OTC={4})…"* — placeholders and all — beside the readable `title`
 * *"Assignee does not hold the required read privilege or access."*
 * (measured 2026-10-10). A message with a `{n}` in it gives way to the title.
 */
export function faultText(error: unknown): string {
    if (typeof error !== 'object' || error === null) {
        return String(error);
    }

    const message = (error as { message?: unknown }).message;
    const title = (error as { title?: unknown }).title;

    if (typeof message === 'string' && /\{\d+\}/.test(message) && typeof title === 'string' && title.trim() !== '') {
        return title;
    }

    return typeof message === 'string' ? message : String(error);
}

/** A sort the menu can apply: a column of the dataset, and a direction (0 ascending, 1 descending). */
export interface SortChoice {
    name: string;
    direction: 0 | 1;
}

/** A column the sort menu offers. */
export interface SortOption {
    name: string;
    label: string;
}

/**
 * The columns the sort menu offers: the dataset's own, roles included,
 * **and nothing else.** Measured: a sort on a column outside the dataset is
 * ignored silently on a form — the view's own order comes back while
 * `dataset.sorting` goes on naming it — so offering one would put a choice in
 * the menu that does nothing there. Canvas would sort it; the menu is the
 * same on both.
 *
 * Dropped: a column with no name (canvas's unset role), one the view marks
 * `disableSorting` or hides — a user cannot see what it sorts by — and a
 * second entry for the same column (canvas hands each role over twice).
 *
 * The label is the column's display name, **with the column's name beside it
 * where two would read the same**: a text column called "Owner" next to the
 * real Owner is an ordinary view, and two identical entries in a menu are a
 * coin toss.
 */
export function sortOptions(
    columns: { name: string | null; displayName?: string; disableSorting?: boolean; isHidden?: boolean }[],
): SortOption[] {
    const options: SortOption[] = [];
    const seen = new Set<string>();

    for (const column of columns) {
        if (typeof column.name !== 'string' || column.name === '' || column.disableSorting === true
            || column.isHidden === true || seen.has(column.name)) {
            continue;
        }

        seen.add(column.name);
        options.push({ name: column.name, label: column.displayName || column.name });
    }

    const counts = new Map<string, number>();

    options.forEach((option) => counts.set(option.label, (counts.get(option.label) ?? 0) + 1));

    return options
        .map((option) => ((counts.get(option.label) ?? 0) > 1 ? { ...option, label: `${option.label} (${option.name})` } : option))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The `sortBy` input: `"createdon desc"`, `"cll_title"`, `"cll_title asc"`.
 * A direction other than `asc`/`desc` reads as no sort at all rather than
 * a guess.
 */
export function parseSort(spec: string): SortChoice | null {
    const parts = spec.trim().split(/\s+/);

    if (parts[0] === undefined || parts[0] === '' || parts.length > 2) {
        return null;
    }

    const direction = (parts[1] ?? 'asc').toLowerCase();

    if (direction !== 'asc' && direction !== 'desc') {
        return null;
    }

    return { name: parts[0], direction: direction === 'desc' ? 1 : 0 };
}

/** Where a user's sort is kept: per table and per view, in this browser. */
export function sortStorageKey(entity: string, viewId: string | null): string {
    return `pcfhub-kanban-sort:${entity}:${viewId ?? 'no-view'}`;
}
