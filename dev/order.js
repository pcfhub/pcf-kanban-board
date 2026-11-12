/*
 * Cards in your own order: the writes a drop needs and the keyboard across
 * lanes — `lib/rank-order` (the template's) asserted directly, the way this
 * board calls it.
 *
 *     npm run order
 *
 * No bundle, no React, no DOM. Every plan is checked the way the platform
 * would: the writes applied, the list re-read in the order column's order
 * (cards with no value first), and the result compared with the order the
 * user asked for. A plan that lets a tie decide a position fails, because a
 * tie is the server's to break.
 *
 * What passing here does NOT mean: that the board writes what the plan says,
 * holds the order until a fetch agrees, or puts a refused card back — that is
 * `npm run smoke` against the rig — nor that the platform does what SPEC.md
 * 0.6.0 measured on the day it was measured.
 */

'use strict';

const { load } = require('./load.js');

const plan = load('lib/rank-order/plan');
const lift = load('lib/rank-order/lift');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);

    if (a === e) {
        passed += 1;
        console.log('  ok    ' + label);
    } else {
        failed += 1;
        console.log('  FAIL  ' + label + '\n          got      ' + a + '\n          expected ' + e);
    }
}

function section(title) {
    console.log('\n' + title);
}

/* -------------------------------------------------------------- the helpers */

/** Cards named a, b, c … with these values. */
const lane = (values, prefix = '') => values.map((value, i) => ({ id: prefix + String.fromCharCode(97 + i), value }));

/** The writes applied to every card named, then the server's sort: nulls first, ascending, ties as they were. */
function reread(cards, writes) {
    const next = new Map(cards.map((card) => [card.id, card.value]));
    writes.forEach((write) => next.set(write.id, write.to));
    const keyed = cards.map((card, index) => ({ id: card.id, value: next.get(card.id), index }));
    keyed.sort((x, y) => {
        if (x.value === null || y.value === null) {
            return x.value === null && y.value === null ? x.index - y.index : x.value === null ? -1 : 1;
        }
        return x.value - y.value || x.index - y.index;
    });
    return keyed;
}

/**
 * The plan's order survives a re-read of the lane with the block in it, and
 * no card it wrote shares a value with a neighbour.
 */
function survives(rows, block, result) {
    const after = reread([...rows, ...block], result.writes);
    const written = new Set(result.writes.map((write) => write.id));
    const ids = after.map((card) => card.id).join(',');
    const apart = after.every((card, i) => i === 0
        || (!written.has(card.id) && !written.has(after[i - 1].id))
        || after[i - 1].value < card.value);
    return ids === result.order.join(',') && apart;
}

/** Every value written inside what the edges allow. */
function inside(rows, result, edges) {
    const values = rows.map((row) => row.value).filter((value) => value !== null);
    const min = Math.min(edges.min ?? Infinity, ...values);
    const max = Math.max(edges.max ?? -Infinity, ...values);
    const floor = edges.floor ?? plan.FLOOR;
    const ceiling = edges.ceiling ?? plan.CEILING;
    const lowest = Number.isFinite(min) ? (edges.first ? Math.min(floor, min) : min) : floor;
    const highest = Number.isFinite(max) ? (edges.last ? Math.max(ceiling, max) : max) : ceiling;
    return result.writes.every((write) => write.to >= lowest && write.to <= highest && Number.isInteger(write.to));
}

/* ------------------------------------------------------------ planInsert */

section('planInsert — a card dropped into a lane');

{
    const rows = lane([10, 20, 30]);
    const edges = { first: true, last: true };

    check('between 10 and 20, only the card is written: 11',
        plan.planInsert(rows, [{ id: 'x', value: 45 }], 1, edges).writes, [{ id: 'x', from: 45, to: 11 }]);
    check('at the top of a lane: packed down against the card below, 9',
        plan.planInsert(rows, [{ id: 'x', value: 45 }], 0, edges).writes, [{ id: 'x', from: 45, to: 9 }]);
    check('at the end of a fully loaded board: one above the last, 31',
        plan.planInsert(rows, [{ id: 'x', value: 5 }], 3, edges).writes, [{ id: 'x', from: 5, to: 31 }]);
    check('a card whose value already fits is not written at all',
        plan.planInsert(rows, [{ id: 'x', value: 25 }], 2, edges).writes, []);
    check('a card with no value is given one',
        plan.planInsert(rows, [{ id: 'x', value: null }], 2, edges).writes, [{ id: 'x', from: null, to: 21 }]);
    check('the order it reports is the lane with the card in place',
        plan.planInsert(rows, [{ id: 'x', value: 45 }], 1, edges).order, ['a', 'x', 'b', 'c']);
}

section('planInsert — a block of selected cards');

{
    const rows = lane([10, 20, 30]);
    const block = [{ id: 'x', value: 500 }, { id: 'y', value: null }, { id: 'z', value: 7 }];
    const result = plan.planInsert(rows, block, 1, { first: true, last: true });

    check('three cards between 10 and 20 take 11, 12, 13 in the order given',
        result.writes.map((write) => write.id + write.to), ['x11', 'y12', 'z13']);
    check('and a re-read agrees', survives(rows, block, result), true);
    check('a block at the top packs down: 7, 8, 9 above a 10',
        plan.planInsert(rows, block, 0, { first: true, last: true }).writes.map((write) => write.to), [7, 8, 9]);
}

section('planInsert — a lane of a board that loads more');

{
    // This lane holds 10, 20, 30; the board's loaded cards span 1 … 40 and there is more to load.
    const rows = lane([10, 20, 30]);
    const edges = { first: true, last: false, min: 1, max: 40 };

    check('at the end of the lane, below what is not loaded: 31, not past 40',
        plan.planInsert(rows, [{ id: 'x', value: 99 }], 3, edges).writes.map((write) => write.to), [31]);

    const full = lane([38, 39, 40]);
    const squeezed = plan.planInsert(full, [{ id: 'x', value: 99 }], 3, { first: true, last: false, max: 40 });

    check('a lane already at the loaded maximum renumbers inside it rather than past it',
        squeezed.ok && squeezed.writes.every((write) => write.to <= 40), true);
    check('and a re-read agrees', survives(full, [{ id: 'x', value: 99 }], squeezed), true);
    check('an empty lane takes the first value the limits allow from 1',
        plan.planInsert([], [{ id: 'x', value: null }], 0, { first: true, last: false, min: -3, max: 40 }).writes.map((w) => w.to), [1]);
    check('an empty lane on a board whose loaded cards stop at 0 stays under it',
        plan.planInsert([], [{ id: 'x', value: null }], 0, { first: true, last: false, min: -9, max: 0 }).writes.map((w) => w.to), [0]);
}

section('planInsert — the column\'s own range');

{
    const rows = lane([1, 2, 3]);

    check('at the top of 1, 2, 3 with the floor at 1 there is room only by renumbering below the loaded span',
        plan.planInsert(rows, [{ id: 'x', value: 9 }], 0, { first: true, last: true }).writes.map((w) => w.id + w.to),
        ['x1', 'a2', 'b3', 'c4']);
    check('with the column\'s floor opened, the card alone goes to 0',
        plan.planInsert(rows, [{ id: 'x', value: 9 }], 0, { first: true, last: true, floor: -1000000 }).writes.map((w) => w.to), [0]);
    check('a ceiling below the next value renumbers rather than exceeding it',
        plan.planInsert(lane([8, 9, 10]), [{ id: 'x', value: null }], 3, { first: true, last: true, ceiling: 10 }).writes.every((w) => w.to <= 10), true);
}

section('planInsert — refusals');

{
    check('a lane holding a card with no value refuses: it sorts first wherever it is drawn',
        plan.planInsert(lane([null, 10]), [{ id: 'x', value: 5 }], 2, { first: true, last: true }).reason, 'unnumbered');
    check('nothing to move', plan.planInsert(lane([10]), [], 0, { first: true, last: true }).reason, 'noMove');
    check('a slot past the end', plan.planInsert(lane([10]), [{ id: 'x', value: 5 }], 2, { first: true, last: true }).reason, 'noMove');
    check('no room anywhere inside a full span',
        plan.planInsert(lane([1, 2, 3]), [{ id: 'x', value: 9 }], 1, { first: false, last: false }).reason, 'noRoom');
}

section('planInsert — every drop on random boards');

{
    // A small deterministic generator, so a failure prints the same case every run.
    let seed = 20261112;
    const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    let cases = 0;
    let bad = null;
    let writes = 0;

    for (let run = 0; run < 3000 && !bad; run += 1) {
        const n = Math.floor(random() * 7);
        const values = [];
        let value = Math.floor(random() * 6) - 2;
        for (let i = 0; i < n; i += 1) {
            value += random() < 0.3 ? 0 : 1 + Math.floor(random() * 4);
            values.push(value);
        }
        const rows = lane(values);
        const k = 1 + Math.floor(random() * 3);
        const block = Array.from({ length: k }, (_, i) => ({ id: 'x' + i, value: random() < 0.4 ? null : Math.floor(random() * 40) - 5 }));
        const at = Math.floor(random() * (n + 1));
        const first = random() < 0.85;
        const last = random() < 0.5;
        const spanMax = n > 0 ? Math.max(...values) + Math.floor(random() * 3) : undefined;
        const edges = { first, last, ...(spanMax !== undefined ? { max: spanMax } : {}), ...(random() < 0.5 ? { floor: -1000 } : {}) };
        const result = plan.planInsert(rows, block, at, edges);

        cases += 1;

        if (!result.ok) {
            // A refusal is fine only for a tie or an unnumbered card the plan could not avoid, or no room at all.
            if (result.reason !== 'noRoom') {
                bad = { rows: values, block, at, edges, result };
            }
            continue;
        }

        writes += result.writes.length;

        if (!survives(rows, block, result) || !inside(rows, result, edges)) {
            bad = { rows: values, block, at, edges, result };
        }
    }

    check(`3000 random drops: every plan survives a re-read and stays inside its limits (${cases} cases, ${writes} writes)`, bad, null);
}

/* ------------------------------------------------------------ liftGridKey */

section('liftGridKey — the keyboard across lanes');

{
    // Three lanes: the lifted card's own (3 cards, so 3 slots), then 2 and 4 other cards (3 and 5 slots).
    const layout = { places: [3, 3, 5] };
    const spot = { column: 0, index: 1 };
    const up = lift.liftGridKey(lift.GRID_RESTING, { key: ' ' }, 'b', spot, layout);
    const press = (state, key, more = {}) => lift.liftGridKey(state, { key, ...more }, 'b', spot, { ...layout, ...more.layout });

    check('Space lifts where the card is', [up.event, up.state.at], ['lift', { column: 0, index: 1 }]);
    check('Enter lifts too', lift.liftGridKey(lift.GRID_RESTING, { key: 'Enter' }, 'b', spot, layout).event, 'lift');
    check('Down moves within the lane', press(up.state, 'ArrowDown').state.at, { column: 0, index: 2 });
    check('Down at the end is an edge, announced, nothing moves',
        [press({ ...up.state, at: { column: 0, index: 2 } }, 'ArrowDown').event], ['edge']);
    check('Right carries it to the next lane, in the same slot', press(up.state, 'ArrowRight').state.at, { column: 1, index: 1 });
    check('Right from slot 4 of a long lane to a short one lands at its end',
        press({ ...up.state, at: { column: 2, index: 4 } }, 'ArrowLeft').state.at, { column: 1, index: 2 });
    check('Left from the first lane is an edge', press(up.state, 'ArrowLeft').event, 'edge');
    check('a closed lane is skipped',
        lift.liftGridKey(up.state, { key: 'ArrowRight' }, 'b', spot, { places: [3, 3, 5], open: (c) => c !== 1 }).state.at,
        { column: 2, index: 1 });
    check('and with every lane that way closed it is an edge',
        lift.liftGridKey(up.state, { key: 'ArrowRight' }, 'b', spot, { places: [3, 3, 5], open: (c) => c === 0 }).event, 'edge');
    check('right to left, Left goes to the next lane',
        lift.liftGridKey(up.state, { key: 'ArrowLeft' }, 'b', spot, { places: [3, 3, 5], rtl: true }).state.at,
        { column: 1, index: 1 });
    check('Home and End go to the lane\'s ends',
        [press({ ...up.state, at: { column: 2, index: 2 } }, 'Home').state.at, press({ ...up.state, at: { column: 2, index: 2 } }, 'End').state.at],
        [{ column: 2, index: 0 }, { column: 2, index: 4 }]);
    check('Space drops somewhere else', press({ ...up.state, at: { column: 1, index: 0 } }, ' ').event, 'drop');
    check('Space where it was lifted is a cancel, not a write', press(up.state, ' ').event, 'cancel');
    check('Escape cancels', press({ ...up.state, at: { column: 1, index: 0 } }, 'Escape').event, 'cancel');
    check('Tab cancels and lets the focus go',
        [press(up.state, 'Tab').event, press(up.state, 'Tab').handled], ['cancel', false]);
    check('a modified key is not ours, lifted or not',
        [press(up.state, 'ArrowDown', { ctrl: true }).handled, lift.liftGridKey(lift.GRID_RESTING, { key: ' ', alt: true }, 'b', spot, layout).handled],
        [false, false]);
    check('a stray letter while lifted is swallowed and changes nothing',
        [press(up.state, 'k').handled, press(up.state, 'k').state.at], [true, { column: 0, index: 1 }]);
    check('arrows before a lift are not taken', lift.liftGridKey(lift.GRID_RESTING, { key: 'ArrowDown' }, 'b', spot, layout).handled, false);
}

console.log(`\n  ${passed} passed${failed ? `, ${failed} FAILED` : ''} — the plan and the keys only; the board applying them is npm run smoke`);
process.exit(failed ? 1 : 0);
