/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * A **virtual dataset** control that *writes*. `updateView` returns the element
 * it wants rendered, so these assertions read the props it handed down and the
 * calls it made — and here the calls are the more interesting half, because
 * moving a card is an optimistic update that has to move back when the server
 * refuses.
 *
 * Why it exists alongside `npm start`: that harness reports no second page and
 * has no Web API, so it can reach neither the paging code nor the write. And
 * the write's failure path is the one that matters most: it is where a card
 * that has visibly moved either returns to where the record actually is, or
 * sits somewhere it never went.
 *
 * **What passing here does NOT mean.** Every value is supplied by this file. It
 * cannot tell you that a real `updateRecord` accepts this payload, that a
 * choice column takes the lane value, or that drag and drop works — the
 * assertions drive the callbacks the component would call, not a pointer.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const fixture = require('./fixture.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'KanbanBoard', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/KanbanBoard. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

if (reactGlobals.length > 0) {
    const React = require(path.join(root, 'node_modules', 'react'));

    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

const fluent = new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

/*
 * `getString` answers with a marked key rather than a real string, so an
 * assertion can tell "read from the .resx" apart from "hardcoded in the
 * source" — which would otherwise look identical in the output.
 *
 * `KanbanBoard_MoveFailed` keeps its `{0}`, because the control substitutes the
 * card's title into it. A marker with the placeholder stripped out turns that
 * substitution into a silent no-op — which would pass an assertion about the
 * message existing while proving the opposite of the one that matters: that a
 * failure names the card it was.
 */
const marked = (key) => (key === 'KanbanBoard_MoveFailed' ? 'resx:KanbanBoard_MoveFailed {0}' : `resx:${key}`);

/**
 * Every input the manifest declares, with its defaults.
 *
 * Stated in full rather than left to fall through as `undefined`: the platform
 * hands down `{ raw: … }` for every property in the manifest, defaulted if the
 * maker set nothing, so a fixture omitting one tests a host that does not
 * exist.
 */
const INPUTS = {
    // No `pageSize`, and that is the manifest's own state rather than an
    // omission: the property carries no `default-value`, so a maker who never
    // touched it hands the control nothing. Seeding it here would make the
    // adopt-the-host path unreachable from every bind in this file.
    lanes: '',
    laneWidth: 280,
    laneColors: true,
    openOnCardClick: true,
};

const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function bind(options) {
    // `pageSize` here is the **host's** — what `paging.pageSize` reports and
    // what the board therefore adopts when the maker set nothing. It is not the
    // control's input; that lives in `inputs` and is deliberately unset.
    const settings = { pageSize: 50, ...options, inputs: { ...INPUTS, ...((options || {}).inputs || {}) } };
    const handle = host.createHost(fixture, { getString: marked, ...settings });
    const container = dom.createElement('div');
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(
        handle.context,
        () => {
            notifications += 1;
        },
        {},
        container,
    );

    let driven = host.drive(instance, handle, 10);

    const view = {
        instance,
        handle,
        get driven() {
            return driven;
        },
        props: () => (driven.element && driven.element.props) || {},
        calls: () => handle.state.calls,
        notifications: () => notifications,
        settle: () => {
            driven = host.drive(instance, handle, 10);

            return driven;
        },
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(view);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
    };

    live.push(view);

    return view;
}

/** Let the promise chain behind a move settle before reading the result. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ------------------------------------------------------- what it hands down */

const plain = bind({});

check('settles instead of refreshing forever', plain.driven.looping === false, `${plain.driven.passes} passes`);

/*
 * The assertion about a call that must **not** happen.
 *
 * `pageSize` carried `default-value="50"`, so a maker who never touched the
 * property still produced a control that told the host how many rows to fetch —
 * replacing the *Rows per page* the user had set on a main grid and the row
 * count the maker set on a subgrid. `pcf-row-commands` shipped that and had to
 * be released twice to take it back out. The property has no default now:
 * unset, the board takes whatever the host is already fetching.
 */
check(
    'an unset page size overrides nothing — the host is already paging',
    plain.calls().filter((call) => call.startsWith('setPageSize')).length === 0,
    plain.calls().join(' '),
);

const overriding = bind({ inputs: { pageSize: 3 } });

check(
    'a page size the maker did set is asked for once and then left alone',
    overriding.calls().filter((call) => call.startsWith('setPageSize')).length === 1,
    overriding.calls().join(' '),
);

/*
 * A main grid answers the width and never the height — `-1` for the life of the
 * control, however politely it asks. A control that waits for a positive number
 * waits forever, which is how `pcf-row-commands` ran its rows off the bottom of
 * a page and took the pager with them.
 */
const unmeasured = bind({ width: 900, quirks: { heightUnmeasured: true } });

check(
    'renders on a host that measures a width and never a height',
    unmeasured.handle.context.mode.allocatedHeight === -1 && !unmeasured.driven.looping,
    `allocatedHeight ${unmeasured.handle.context.mode.allocatedHeight}`,
);

check('returns an element rather than writing into a container', plain.driven.element !== undefined);

check('lays the records out in lanes', Array.isArray(plain.props().lanes) && plain.props().lanes.length > 0, `${(plain.props().lanes || []).length} lanes`);

/*
 * **Roles are found by alias, and read by name.** `alias` is the
 * property-set's role from the manifest; `name` is the column the maker pointed
 * it at, and it is what `getValue()` takes. The fixture keeps them different so
 * a control confusing the two puts every card in the same lane.
 */
const statusColumn = fixture.columns.find((column) => column.alias === 'statusField');

check(
    'the fixture keeps alias and name different, or nothing below proves anything',
    statusColumn.alias !== statusColumn.name,
    `alias: ${statusColumn.alias}, name: ${statusColumn.name}`,
);

/*
 * **`lanes` and `cards` are separate props**, and that is the control
 * deciding rather than an accident: the lanes come from the choice column's
 * option-set metadata — which loads asynchronously and exists even where no
 * card is in them — while the cards come from the dataset. An empty lane is
 * still a drop target, so a board that derived its lanes from the cards it
 * happens to have could never accept the first card into one.
 *
 * So a card's lane is read off the card.
 */
const cardOf = (view, id) => (view.props().cards || []).find((card) => card.id === id);
const laneOf = (view, id) => (cardOf(view, id) || {}).lane;

check(
    'cards land in the lane their status column says',
    laneOf(plain, 'w1') === 1 && laneOf(plain, 'w5') === 3,
    `w1 in lane ${laneOf(plain, 'w1')}, w5 in lane ${laneOf(plain, 'w5')}`,
);

/*
 * A choice column is nullable, so a record with no status still has to land
 * somewhere rather than vanish off the board.
 */
check(
    'a record with no status is still a card, in the unassigned lane',
    cardOf(plain, 'w6') !== undefined && laneOf(plain, 'w6') === null,
    `w6 lane: ${JSON.stringify(laneOf(plain, 'w6'))}`,
);

check(
    'and the unassigned lane exists to hold it',
    (plain.props().lanes || []).some((lane) => lane.value === null),
    JSON.stringify((plain.props().lanes || []).map((lane) => lane.value)),
);

check('the lane width the maker set is passed down, with a floor', bind({ inputs: { laneWidth: 10 } }).props().laneWidth >= 160, String(bind({ inputs: { laneWidth: 10 } }).props().laneWidth));

/* ------------------------------------------------------- writable or not */

/*
 * `context.webAPI` is typed as always present and, with `required="false"` in
 * the manifest, is exactly what it is not. The component hides the move
 * affordances when it cannot write — a board that let you drag on a read-only
 * host would move the card and silently put it back.
 */
check('reports that it can write where the host allows it', plain.props().canMove === true, String(plain.props().canMove));

check('and that it cannot where there is no Web API', bind({ webApi: 'absent' }).props().canMove === false, String(bind({ webApi: 'absent' }).props().canMove));

/* ------------------------------------------------------------- the move */

(async () => {
    /*
     * **The optimistic move.** The card moves before the server has agreed,
     * because a board that waits for a round trip feels broken — so the control
     * holds a pending override and repaints immediately.
     */
    const moved = bind({});

    moved.props().onMove('w1', 3);

    check('a move repaints immediately rather than waiting for the server', moved.notifications() >= 1, String(moved.notifications()));

    moved.settle();

    check(
        'putting the card in the lane it was dropped into',
        laneOf(moved, 'w1') === 3,
        `lane ${laneOf(moved, 'w1')}`,
    );

    await flush();

    const write = moved.calls().find((call) => call.startsWith('updateRecord'));

    check(
        'and writing the new status to the column the role points at',
        Boolean(write) && write.includes('new_stage') && write.includes('new_workitem'),
        write || 'no updateRecord',
    );

    check('then refreshing, so the override retires against real data', moved.calls().some((call) => call === 'refresh'), moved.calls().join(' '));

    /*
     * **The rollback**, which is the assertion this whole file is for.
     *
     * A failed write leaves a card sitting in a lane the record is not in. The
     * control takes the override back out and says which card it was — and it
     * reads the label *before* the write, because by the time a rejection
     * arrives the record may be gone from a refreshed dataset.
     */
    const refused = bind({ webApi: 'rejects' });
    const before = laneOf(refused, 'w1');

    refused.props().onMove('w1', 3);
    refused.settle();

    check('a card moves optimistically even when the write will fail', laneOf(refused, 'w1') === 3, `lane ${laneOf(refused, 'w1')}`);

    await flush();
    refused.settle();

    check(
        'and moves back when the server refuses, rather than sitting where it never went',
        laneOf(refused, 'w1') === before,
        `back to lane ${laneOf(refused, 'w1')}, was ${before}`,
    );

    check(
        'telling the user which card it was',
        typeof refused.props().moveError === 'string' && refused.props().moveError.includes('Rewrite the import validator'),
        refused.props().moveError,
    );

    /*
     * A rejected `updateRecord` is typed as `unknown` and is not reliably an
     * `Error` — the platform rejects with its own shape. `[object Object]` at
     * the user is the failure this asserts against.
     */
    check(
        'and what went wrong, without printing [object Object]',
        typeof refused.props().moveError === 'string' && !refused.props().moveError.includes('[object Object]'),
        refused.props().moveError,
    );

    const odd = bind({ webApi: 'rejects', rejection: 'a bare string' });

    odd.props().onMove('w2', 3);
    await flush();
    odd.settle();

    check(
        'even when the rejection is not an object at all',
        typeof odd.props().moveError === 'string' && !odd.props().moveError.includes('[object Object]'),
        odd.props().moveError,
    );

    /*
     * Dropping a card back where it started is not a write. Without this the
     * board issues an update for every pick-up-and-put-down.
     */
    const nudged = bind({});
    const home = laneOf(nudged, 'w3');

    nudged.props().onMove('w3', home);
    await flush();

    check(
        'dropping a card back where it started writes nothing',
        !nudged.calls().some((call) => call.startsWith('updateRecord')),
        nudged.calls().join(' ') || 'no calls',
    );

    /*
     * The guard that stands between an absent API and a TypeError inside a
     * promise nobody is awaiting.
     */
    const readOnly = bind({ webApi: 'absent' });

    readOnly.props().onMove('w1', 3);
    await flush();

    check(
        'a host that cannot write is not asked to',
        !readOnly.calls().some((call) => call.startsWith('updateRecord')),
        readOnly.calls().join(' ') || 'no calls',
    );

    /* ------------------------------------------------------------ opening */

    const opened = bind({});

    opened.props().onOpenRecord('w1');

    check(
        'opening a card asks the platform to navigate rather than routing itself',
        opened.calls().some((call) => call.startsWith('openDatasetItem')),
        opened.calls().join(' '),
    );

    /* --------------------------------------------------- what destroy owes */

    /*
     * **Keep this when the rest of the file changes.** It needs no knowledge of
     * what this control takes.
     */
    disposeAll();

    const timersBefore = time.pending();
    const listeners = () => Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
    const listenersBefore = listeners();

    bind({}).destroy();

    check('destroy() releases every timer the control took', time.pending() === timersBefore, `${timersBefore} → ${time.pending()}`);

    check('and every document-level listener', listeners() === listenersBefore, `${listenersBefore} → ${listeners()}`);

    disposeAll();

    report();
})();

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real view still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
