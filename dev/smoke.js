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

/** The GUID `openForm` resolves for a saved row: braced and upper-case, as measured. */
const SAVED = { savedEntityReference: [{ id: '{436E09A8-1F2B-4C3D-8E9F-0A1B2C3D4E5F}', entityType: 'new_workitem', name: 'New' }] };

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
    showSearch: true,
    allowCreate: true,
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

/*
 * Two routes, so three hosts. A record with a write half and no Web API —
 * which is what the record route buys — can still move; only a host with
 * neither is read-only.
 */
check(
    'and still where there is no Web API but the record can be written',
    bind({ webApi: 'absent' }).props().canMove === true,
    String(bind({ webApi: 'absent' }).props().canMove),
);

check(
    'and that it cannot where there is neither',
    bind({ webApi: 'absent', quirks: { editableAbsent: true } }).props().canMove === false,
    String(bind({ webApi: 'absent', quirks: { editableAbsent: true } }).props().canMove),
);

/*
 * The create route is `navigation.openForm`, which a canvas host withholds
 * whatever the maker set — and the maker can switch it off on a host that
 * has it.
 */
check('offers to add a card where the host has a form to open', plain.props().canCreate === true, String(plain.props().canCreate));

check('but not on canvas, which has no forms', bind({ host: 'canvas' }).props().canCreate === false, String(bind({ host: 'canvas' }).props().canCreate));

check('nor when the maker turned it off', bind({ inputs: { allowCreate: false } }).props().canCreate === false, String(bind({ inputs: { allowCreate: false } }).props().canCreate));

check('passes the search switch down', bind({ inputs: { showSearch: false } }).props().showSearch === false, String(bind({ inputs: { showSearch: false } }).props().showSearch));

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

    /*
     * **Through the record, not the Web API.** `setValue` on the column the
     * role points at — `name`, never `alias` — then one `save()`. The Web
     * API is not touched on a record that allows the write.
     */
    const staged = moved.calls().find((call) => call.startsWith('record.setValue'));

    check(
        'and writing the new status through the record, to the column the role points at',
        Boolean(staged) && staged.includes('new_stage=3'),
        staged || 'no record.setValue',
    );

    check('then saving the record', moved.calls().some((call) => call.startsWith('record.save')), moved.calls().join(' '));

    check('and not the Web API, which this record did not need', !moved.calls().some((call) => call.startsWith('updateRecord')), moved.calls().join(' '));

    check('then refreshing, so the override retires against real data', moved.calls().some((call) => call === 'refresh'), moved.calls().join(' '));

    /*
     * **The override retires against data, not against the promise.** The
     * rig applies a committed value on the next fetch, the way a re-read
     * does, and the card is then placed from the record.
     */
    moved.settle();

    check(
        'after which the card is placed from the record, with no override left',
        laneOf(moved, 'w1') === 3 && moved.handle.dataset.records.w1.getValue('new_stage') === 3,
        `lane ${laneOf(moved, 'w1')}, record says ${moved.handle.dataset.records.w1.getValue('new_stage')}`,
    );

    /*
     * **The second route.** `isEditable` answers `false` for `statuscode` on
     * a real subgrid while the column reports `OptionSet`, and a board is
     * grouped by it more often than by anything else. That record goes
     * through `webAPI.updateRecord`, and only that record.
     */
    const readOnly = bind({ quirks: { readOnlyColumns: ['new_stage'] } });

    readOnly.props().onMove('w1', 3);
    await flush();

    const viaApi = readOnly.calls().find((call) => call.startsWith('updateRecord'));

    check(
        'a column the record refuses to edit is written through the Web API instead',
        Boolean(viaApi) && viaApi.includes('new_stage') && viaApi.includes('new_workitem'),
        viaApi || 'no updateRecord',
    );

    check('with nothing staged on the record', !readOnly.calls().some((call) => call.startsWith('record.setValue')), readOnly.calls().join(' '));

    /*
     * And a record with no write half at all — the host the typings describe
     * — takes the Web API without asking `isEditable`, which it cannot.
     */
    const bare = bind({ quirks: { editableAbsent: true } });

    bare.props().onMove('w1', 3);
    await flush();

    check('a record with no write half goes straight to the Web API', bare.calls().some((call) => call.startsWith('updateRecord')), bare.calls().join(' '));

    /*
     * **A refused `save()` rolls back like a refused update.** Same override,
     * same message, same refresh — the route must not change what a failure
     * looks like.
     */
    const refusedSave = bind({ quirks: { saveRejects: true }, rejection: { message: 'Insufficient privileges' } });

    refusedSave.props().onMove('w1', 3);
    refusedSave.settle();
    await flush();
    refusedSave.settle();

    check('a refused save puts the card back', laneOf(refusedSave, 'w1') === 1, `lane ${laneOf(refusedSave, 'w1')}`);

    check(
        'and names the card and the reason',
        typeof refusedSave.props().moveError === 'string' && refusedSave.props().moveError.includes('Insufficient privileges'),
        String(refusedSave.props().moveError),
    );

    /* ----------------------------------------------------------- the create */

    /*
     * **The quick create, with the lane passed as a form parameter.** The
     * second argument to `openForm` is how a column arrives already set, and
     * the typings make it `{ [key: string]: string }` — so the option number
     * goes as a string. `createFromEntity` seeds the parent only where the
     * host names one.
     */
    const creating = bind({ contextInfo: { entityTypeName: 'account', entityId: 'parent-1', entityRecordName: 'Parent' } });

    creating.props().onCreate(2);
    await flush();

    const openedForm = creating.calls().find((call) => call.startsWith('navigation.openForm'));
    const openedWith = openedForm ? JSON.parse(openedForm.slice('navigation.openForm('.length, -1)) : null;

    check('adding a card opens the quick create form for the view\'s table', Boolean(openedWith) && openedWith.options.entityName === 'new_workitem' && openedWith.options.useQuickCreateForm === true, openedForm || 'no openForm');

    check(
        'with the lane passed as a form parameter, as a string, on the column the role points at',
        Boolean(openedWith) && openedWith.parameters && openedWith.parameters.new_stage === '2',
        JSON.stringify(openedWith && openedWith.parameters),
    );

    check(
        'and the parent seeded from contextInfo, so the card lands in this subgrid',
        Boolean(openedWith) && openedWith.options.createFromEntity && openedWith.options.createFromEntity.id === 'parent-1',
        JSON.stringify(openedWith && openedWith.options.createFromEntity),
    );

    check('a dismissed form reports nothing and fetches nothing', creating.instance.getOutputs().createdRecordId === '' && !creating.calls().some((call) => call === 'refresh'), `"${creating.instance.getOutputs().createdRecordId}" ${creating.calls().join(' ')}`);

    const noParent = bind({});

    noParent.props().onCreate(2);
    await flush();

    const openedBare = noParent.calls().find((call) => call.startsWith('navigation.openForm'));

    check('a main grid, with no parent, leaves createFromEntity out', Boolean(openedBare) && !openedBare.includes('createFromEntity'), openedBare || 'no openForm');

    const saved = bind({ openFormReturns: SAVED });
    const notifiedBefore = saved.notifications();

    saved.props().onCreate(3);
    await flush();

    check(
        'a saved form reports the new id unbraced and lower-case, like the other outputs',
        saved.instance.getOutputs().createdRecordId === '436e09a8-1f2b-4c3d-8e9f-0a1b2c3d4e5f',
        saved.instance.getOutputs().createdRecordId,
    );

    check('notifying the change and refreshing so the card appears', saved.notifications() > notifiedBefore && saved.calls().some((call) => call === 'refresh'), `${saved.notifications() - notifiedBefore} notifications; ${saved.calls().join(' ')}`);

    /*
     * **The rollback**, which is the assertion this whole file is for.
     *
     * A failed write leaves a card sitting in a lane the record is not in. The
     * control takes the override back out and says which card it was — and it
     * reads the label *before* the write, because by the time a rejection
     * arrives the record may be gone from a refreshed dataset.
     */
    // `webApi: 'rejects'` reaches the write only on a record that cannot take
    // it itself; the record route is the one refusing above.
    const refused = bind({ webApi: 'rejects', quirks: { editableAbsent: true } });
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

    const odd = bind({ webApi: 'rejects', rejection: 'a bare string', quirks: { editableAbsent: true } });

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
    const unwritable = bind({ webApi: 'absent', quirks: { editableAbsent: true } });

    unwritable.props().onMove('w1', 3);
    await flush();

    check(
        'a host that cannot write is not asked to, by either route',
        !unwritable.calls().some((call) => call.startsWith('updateRecord') || call.startsWith('record.')),
        unwritable.calls().join(' ') || 'no calls',
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


    /*
     * **Repaginating resets the page, and applying the first size does not.**
     *
     * A page size that changes *after* one has been applied recuts the result
     * set, so "page 3" stops meaning what it meant and the platform answers a
     * request for it with nothing. The first application is the other case: at
     * mount the platform is already on page one, and `reset()` is itself a
     * fetch — so resetting there buys a round trip for nothing.
     *
     * Mutating the maker's input mid-flight is the only way to reach this from
     * a suite. The property is read fresh from `options.inputs` on every pass,
     * so this models a property edited in the form designer — which is the only
     * way the size changes in this control, and why the omission went unnoticed
     * here until `pcf-data-table` found it with a rows-per-page picker.
     */
    const repaginated = bind({ inputs: { pageSize: 4 } });
    const resets = () => repaginated.calls().filter((call) => call === 'paging.reset').length;
    const resetOnMount = resets();

    repaginated.handle.options.inputs.pageSize = 9;
    repaginated.settle();

    check(
        'the first page size costs no reset, and changing it afterwards does',
        resetOnMount === 0 && resets() === 1,
        `${resetOnMount} at mount, ${resets()} after the change`,
    );

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
