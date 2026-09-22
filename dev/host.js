/*
 * The platform, stood in for: a working `DataSet` with real paging and real
 * sorting, plus the switches for the ways a real one misbehaves.
 *
 * Loaded by both `harness.html` in a browser and `smoke.js` in Node, which is
 * why it attaches to `window` *and* assigns `module.exports` and requires
 * neither to exist.
 *
 * ---
 *
 * **Why this exists.** Every dataset control in the catalogue is published at
 * `demo.fidelity: "limited"` for the same reason: the hub's harness seeds a
 * single page, reports no next or previous page, and discards sorting between
 * renders. `npm start` is not much better — it will bind a CSV, but it will not
 * put the control on page three of a sorted view and then change the page size
 * underneath it.
 *
 * So the paging and sorting code in a dataset control — which is most of the
 * hard code in a dataset control — has never been exercised by anything before
 * this file. It ships with twelve records and a page size of five for exactly
 * that reason: three pages is the smallest number that tells you whether page
 * two came from the platform or from a slice.
 *
 * ---
 *
 * **The `quirks` switches are the point, not a curiosity.**
 *
 * The scaffolded control carries three repairs for behaviour observed on a real
 * model-driven form, and each one looks like superstition until you can turn
 * the behaviour on:
 *
 *   - `loadNextPage(true)` **ignores its argument** and hands back the whole
 *     range from page one, so `sortedRecordIds` accumulates instead of
 *     replacing. This is why the control slices.
 *   - `hasPreviousPage` **stays false** after paging forward, so a pager driven
 *     by it can never go back. This is why the control counts pages itself.
 *   - `firstPageNumber` **disagrees with the ids**, which is how a range like
 *     "4–9 of 6" gets printed. This is why the label is built from the
 *     control's own counter.
 *
 * Default them to the observed behaviour, not the documented one. A harness
 * that models the platform as it is written down will pass a control that
 * cannot page on a real form — which is the exact failure these switches exist
 * to prevent.
 *
 * ---
 *
 * **A stub must never be more capable than the thing it stands in for.**
 * `refresh()` here does not re-render; it records that a render is owed, and
 * the driver decides when to run it. That is deliberate. A `refresh()` that
 * re-entered `updateView` immediately would hide the loop a guarded mutator
 * exists to prevent, and would make an infinite one look like a hang instead of
 * a count.
 */

(function (root, factory) {
    'use strict';

    var api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.__pcfHost = api;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    /** `SortDirection` is a numeric union: 0 ascending, 1 descending. */
    var ASCENDING = 0;
    var DESCENDING = 1;

    var STRINGS = {
        KanbanBoard_Name: 'Kanban Board',
        KanbanBoard_MoveFailed: 'Could not move {0}.',
        KanbanBoard_Search: 'Search cards',
        KanbanBoard_MatchCount: '{0} of {1}',
        KanbanBoard_AddCard: 'Add a card to {0}',
        KanbanBoard_ReadOnly: 'This host cannot write to the record.',
        KanbanBoard_Unassigned: 'Unassigned',
        KanbanBoard_Empty: 'No records.',
        KanbanBoard_Error: 'The records could not be loaded.',
        KanbanBoard_Loading: 'Loading…',
        KanbanBoard_NoColumns: 'No columns have been chosen for this control.',
        KanbanBoard_Next: 'Next',
        KanbanBoard_Previous: 'Previous',
        KanbanBoard_OpenRecord: 'Open {0}',
        KanbanBoard_SortBy: 'Sort by {0}',
        KanbanBoard_PageStatus: 'Page {0}',
        KanbanBoard_RangeStatus: '{0}–{1} of {2}',
    };

    var HOSTS = {
        'model-driven': { label: 'model-driven form', publishesTheme: true },
        canvas: { label: 'canvas app', publishesTheme: false },
    };

    /**
     * `context.client.getFormFactor()`, which is a number and not the one most
     * people guess.
     *
     * **0 Unknown, 1 Desktop, 2 Tablet, 3 Phone.** Web is `1`, and `3` — the
     * value that looks like it ought to mean "the big one" — is a phone. A
     * dataset control that drops columns on a narrow client is comparing
     * against one of these, and comparing against the wrong one drops them
     * everywhere except where it meant to.
     */
    var FORM_FACTORS = { unknown: 0, desktop: 1, tablet: 2, phone: 3 };

    var DEFAULTS = {
        host: 'model-driven',
        formFactor: 'desktop',
        /**
         * `mode.allocatedWidth` / `allocatedHeight`.
         *
         * **-1 until the control calls `mode.trackContainerResize(true)`**, and
         * that is the default here because it is the platform's. A table that
         * decides its column widths from a width it never asked for lays out
         * against -1 on every host.
         */
        width: -1,
        height: -1,
        pageSize: 5,
        visible: true,
        dark: undefined,
        rtl: false,
        /** No records yet, which is the state of the first `updateView`. */
        loading: false,
        error: false,
        errorMessage: 'The records could not be loaded.',
        /** Replace with `[]` to see the empty state, or with a subset. */
        records: null,
        columns: null,

        /**
         * The control's own input properties, merged into `parameters`.
         *
         * The scaffolded control has only `pageSize`, and every real one grows
         * more. Pass them as raw values — `{ selectionMode: 'multiple' }` — and
         * they arrive as `{ raw: … }` where the control expects them.
         *
         * Passing them rather than editing this file is what keeps a repo's
         * copy of the rig close enough to the template's to update by copying.
         */
        inputs: {},

        /**
         * Whether context.webAPI is there, and what it does.
         * 'works' | 'rejects' | 'absent'.
         */
        webApi: 'works',
        /** What a rejection carries. Not an Error, because the platform's is not. */
        rejection: null,

        /**
         * What `navigation.openForm` resolves with. Measured by
         * `pcf-data-table` (2026-09-11): a dismissed quick create resolves
         * `{ savedEntityReference: null }` — not `[]`, not a rejection — and a
         * saved one `{ savedEntityReference: [{ id: "{436E09A8-…}", entityType,
         * name }] }`, braced and upper-case. The default is the dismissal,
         * because it is the shape a control forgets to handle.
         */
        openFormReturns: { savedEntityReference: null },

        /**
         * `mode.contextInfo` — the parent record of a form subgrid, which a
         * control passes to `openForm` as `createFromEntity`. Undocumented, so
         * absent by default: a main grid has none, and a control that reads it
         * unguarded finds out here.
         */
        contextInfo: undefined,

        quirks: {
            /**
             * Whether the record carries the write half of `EntityRecord` —
             * `setValue`, `save`, `isEditable`. Off by default, because a
             * real model-driven subgrid has them (measured 2026-09-09 and
             * 2026-09-11); on, it models the host that does not, which a
             * control survives by falling back to `webAPI.updateRecord`.
             * None of the three is in the typings.
             */
            editableAbsent: false,

            /** `save()` rejects. The path a rollback exists for. */
            saveRejects: false,

            /**
             * Columns `isEditable` answers `false` for. On the measured subgrid
             * `statecode` and `statuscode` came back `false` while a Choice
             * column on the same row came back `true` — all three reporting
             * `OptionSet`. A board grouped by `statuscode` has to write
             * through the Web API instead, which is why this is a switch.
             */
            readOnlyColumns: ['statecode'],

            /**
             * `loadNextPage(true)` returns the whole range from page one rather
             * than only the new page. Observed on a real form; defaulted on
             * because that is what a real form does.
             */
            accumulatePages: true,
            /** `hasPreviousPage` never becomes true. Observed on a real form. */
            previousPageStuck: true,
            /** `totalResultCount` is -1 — common on large views. */
            uncounted: false,
            /**
             * Whether `paging.loadExactPage` exists at all. It is typed as
             * required, which is a claim about the type definitions rather than
             * about the host, so a control that calls it unguarded is worth
             * being able to break here.
             */
            hasLoadExactPage: true,

            /**
             * Whether `dataset.sorting` exists at all.
             *
             * **This one is not hypothetical, and it is not the platform — it
             * is `npm start`.** The local test harness's dataset mock sets
             * `sorting: undefined`, so `dataset.sorting.find(...)` throws a
             * TypeError that the harness swallows: the control renders as an
             * empty box with nothing in the console. A freshly scaffolded
             * dataset control did exactly that until this switch existed to
             * catch it.
             *
             * Off by default because a real form supplies the array — the
             * default models the platform, and the assertion in `smoke.js`
             * covers the one host known to deviate.
             */
            sortingAbsent: false,
            /**
             * `mode.allocatedHeight` stays -1 however the host is sized, and
             * however politely the control asks.
             *
             * **This is a main grid, and it is by design rather than a timing
             * problem.** A control on a table's main grid is handed a measured
             * *width* and never a height: `trackContainerResize(true)` changes
             * the width and leaves the height at -1 for the life of the control.
             *
             * It matters because "-1 means the host has not measured *yet*" is
             * the natural reading, and a control that waits for a positive
             * number waits forever. `pcf-row-commands` gated its scroll layout
             * on a measured height and ran twenty-five rows off the bottom of a
             * main grid, taking the pager — the only route to page two — with
             * them.
             *
             * Off by default, because a form subgrid does measure both.
             */
            heightUnmeasured: false,

        },
    };

    function formatted(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    /**
     * Build the dataset and the context around it.
     *
     * The returned handle carries the engine's own view of the world —
     * `refreshes`, `calls`, the true page — so an assertion can be about what
     * the control *asked the platform to do*, which is the half that a rendered
     * table never shows.
     */
    function createHost(fixture, options) {
        var o = Object.assign({}, DEFAULTS, options || {});
        var quirks = Object.assign({}, DEFAULTS.quirks, (options || {}).quirks);
        var hostKind = HOSTS[o.host] || HOSTS['model-driven'];

        /*
         * **Each host gets its own rows.** `record.save()` commits into the
         * row and the next fetch applies it, so a host sharing the fixture's
         * row objects would leak every write into every host created after
         * it — and it did: a suite that moved w1 to lane 3 left w1 in lane 3
         * for the rest of the file, and "move w1 to 3" became a no-op that
         * passed as "a refused write put it back". The values are copied
         * one level deep, which is as deep as a fixture row goes.
         */
        var allRecords = (o.records || fixture.records).map(function (row) {
            return Object.assign({}, row, { values: Object.assign({}, row.values), staged: null, committed: null });
        });
        var columns = o.columns || fixture.columns;

        var state = {
            /** The page the platform believes it is on. */
            page: 1,
            /**
             * The page size actually in force, which is not the one most
             * recently requested — `setPageSize` does nothing until the next
             * fetch, and that gap is where a mutator loop lives.
             */
            pageSize: o.pageSize,
            requestedPageSize: o.pageSize,
            refreshes: 0,
            renderOwed: false,
            /** Every mutator the control called, in order, with its argument. */
            calls: [],
        };

        var sorting = [];

        function log(name, argument) {
            state.calls.push(argument === undefined ? name : name + '(' + JSON.stringify(argument) + ')');
        }

        /** All records in the order the current sort puts them. */
        function ordered() {
            var rows = allRecords.slice();

            if (sorting.length === 0) {
                return rows;
            }

            /*
             * Only the first entry is honoured, and that is not a shortcut: a
             * view's ORDER BY is what `dataset.sorting` holds, and a control
             * that pushes instead of replacing builds a three-deep sort nobody
             * asked for. Sorting by one column here makes that visible as a
             * wrong order rather than hiding it behind a stable tie-break.
             */
            var by = sorting[0];

            return rows.sort(function (a, b) {
                var left = formatted(a.values[by.name]);
                var right = formatted(b.values[by.name]);
                var compared = left.localeCompare(right);

                return by.sortDirection === DESCENDING ? -compared : compared;
            });
        }

        /**
         * What `sortedRecordIds` holds.
         *
         * With `accumulatePages` on — the observed platform behaviour — it is
         * every id from page one to the current page, which is why a control
         * that renders the array directly stacks page two under page one.
         */
        function visibleIds() {
            var rows = ordered();
            var end = state.page * state.pageSize;
            var start = quirks.accumulatePages ? 0 : (state.page - 1) * state.pageSize;

            return rows.slice(start, end).map(function (row) {
                return row.id;
            });
        }

        function recordFor(row) {
            var record = {
                getRecordId: function () {
                    return row.id;
                },
                getValue: function (name) {
                    return row.values[name];
                },
                getFormattedValue: function (name) {
                    return formatted(row.values[name]);
                },
                getNamedReference: function () {
                    return { id: row.id, name: formatted(row.values.name), etn: fixture.targetEntityType };
                },
            };

            /*
             * **The write half of `EntityRecord`, which the type definitions do
             * not declare.** Ported from the template's dataset rig, where the
             * measurements are recorded: `setValue` + `save` committed a Choice
             * integer on a real subgrid (2026-09-11), and it is the route that
             * needs no `<uses-feature>` and exists where `webAPI` does not.
             */
            if (quirks.editableAbsent) {
                return record;
            }

            // Staged, not applied: `setValue` on the platform does not commit.
            row.staged = row.staged || {};

            /*
             * **Returns `undefined`, because the platform does.** Microsoft's
             * reference page types it `Promise`; a rig that returned one let
             * `pcf-data-table` chain `.then` off it for three releases.
             */
            record.setValue = function (name, value) {
                log('record.setValue', name + '=' + JSON.stringify(value));
                row.staged[name] = value;

                return undefined;
            };

            record.save = function () {
                log('record.save', row.id);

                if (quirks.saveRejects) {
                    row.staged = {};

                    return Promise.reject(o.rejection || { message: 'The platform refused this write.' });
                }

                /*
                 * **Resolving is not applying.** A resolved `save()` is
                 * Dataverse accepting the write; the dataset re-reads on a
                 * separate fetch, and until then the record still reports
                 * the old value — the window an optimistic control holds its
                 * own value across. Applied at the next `fetched()`.
                 */
                row.committed = Object.assign(row.committed || {}, row.staged);
                row.staged = {};

                return Promise.resolve();
            };

            /*
             * **A Promise, because the platform's is.** An unawaited call is a
             * truthy Promise, so `if (record.isEditable(name))` is true for
             * every column; returning a bare boolean here would let that pass.
             */
            record.isEditable = function (name) {
                return Promise.resolve(quirks.readOnlyColumns.indexOf(name) === -1);
            };

            return record;
        }

        var dataset = {
            get columns() {
                return columns;
            },

            get sortedRecordIds() {
                return o.loading || o.error ? [] : visibleIds();
            },

            /*
             * Keyed by id and containing only the records of the current page,
             * because that is what the platform hands over — a control that
             * reaches for a record it was not given gets `undefined`, and the
             * scaffolded table's `if (!record) continue` is written for exactly
             * that.
             */
            get records() {
                var map = {};

                visibleIds().forEach(function (id) {
                    var row = allRecords.filter(function (candidate) {
                        return candidate.id === id;
                    })[0];

                    if (row) {
                        map[id] = recordFor(row);
                    }
                });

                return map;
            },

            /**
             * Mutated in place by the control. That is the documented API —
             * and `undefined` under `sortingAbsent`, which is what `npm start`
             * hands over.
             */
            get sorting() {
                return quirks.sortingAbsent ? undefined : sorting;
            },

            filtering: {
                getFilter: function () {
                    return undefined;
                },
                setFilter: function (expression) {
                    log('filtering.setFilter', expression && expression.conditions ? expression.conditions.length : true);
                },
                clearFilter: function () {
                    log('filtering.clearFilter');
                },
            },

            paging: {
                get pageSize() {
                    return state.pageSize;
                },

                get totalResultCount() {
                    return quirks.uncounted ? -1 : allRecords.length;
                },

                get hasNextPage() {
                    return state.page * state.pageSize < allRecords.length;
                },

                /*
                 * False after paging forward, as observed. The platform treats
                 * the load as the range 1..N, and a range beginning at page one
                 * truthfully has nothing before it — so a pager driven by this
                 * can go forward and never come back.
                 */
                get hasPreviousPage() {
                    return quirks.previousPageStuck ? false : state.page > 1;
                },

                /*
                 * Disagrees with the ids when pages accumulate: it reports the
                 * current page while `sortedRecordIds` holds every page up to
                 * it. A label that takes its start from here and its row count
                 * from the array prints a range past its own total.
                 */
                get firstPageNumber() {
                    return state.page;
                },

                setPageSize: function (size) {
                    log('setPageSize', size);
                    // Requested, not applied. Nothing changes until a fetch.
                    state.requestedPageSize = size;
                },

                loadNextPage: function (loadOnlyNewPage) {
                    log('loadNextPage', loadOnlyNewPage);
                    state.page += 1;
                    fetched();
                },

                loadPreviousPage: function (loadOnlyNewPage) {
                    log('loadPreviousPage', loadOnlyNewPage);
                    state.page = Math.max(1, state.page - 1);
                    fetched();
                },

                loadExactPage: quirks.hasLoadExactPage
                    ? function (page) {
                        log('loadExactPage', page);
                        state.page = Math.max(1, page);
                        fetched();
                    }
                    : undefined,

                reset: function () {
                    log('paging.reset');
                    state.page = 1;
                    fetched();
                },
            },

            get loading() {
                return o.loading;
            },

            get error() {
                return o.error;
            },

            get errorMessage() {
                return o.errorMessage;
            },

            getTitle: function () {
                return fixture.title;
            },

            getTargetEntityType: function () {
                return fixture.targetEntityType;
            },

            refresh: function () {
                log('refresh');
                fetched();
            },

            openDatasetItem: function (reference) {
                log('openDatasetItem', reference && reference.id);
            },

            getSelectedRecordIds: function () {
                return [];
            },

            setSelectedRecordIds: function (ids) {
                log('setSelectedRecordIds', ids.length);
            },

            clearSelectedRecordIds: function () {
                log('clearSelectedRecordIds');
            },

            addColumn: function (name) {
                log('addColumn', name);
            },
        };

        /**
         * A round trip to the server: the requested page size takes effect and
         * a render is owed.
         *
         * Owed rather than performed, so that a control which refreshes from
         * inside `updateView` shows up as a count instead of a stack overflow.
         */
        function fetched() {
            state.pageSize = state.requestedPageSize;
            state.refreshes += 1;
            state.renderOwed = true;

            // Values a resolved `save()` committed become visible on the
            // re-read, not before — see `record.save`.
            allRecords.forEach(function (row) {
                if (row.committed) {
                    Object.assign(row.values, row.committed);
                    row.committed = null;
                }
            });
        }

        function createContext() {
            var parameters = {
                records: dataset,
                /*
                 * **The control's `pageSize` input is not the host's page size,
                 * and this rig used to hand over one number for both.**
                 *
                 * `o.pageSize` is what the *platform* is paging at — what
                 * `paging.pageSize` reports, the way a main grid reports the
                 * user's *Rows per page*. The input below is what the *maker*
                 * typed into the property, and the point of that property
                 * carrying no `default-value` is that leaving it alone is a
                 * state the control can see. Seeding it from `o.pageSize` made
                 * that state unreachable: every mount looked like a maker who
                 * had deliberately asked for exactly what the host was already
                 * doing, so the adopt-the-host path was never once exercised.
                 */
                pageSize: {
                    raw: Object.hasOwn(o.inputs, 'pageSize') ? o.inputs.pageSize : null,
                    type: 'Whole.None',
                },
            };

            // The control's own inputs, wrapped the way the platform hands them
            // over. A raw `null` is a real value here — an input the maker left
            // unset — so it is passed through rather than defaulted.
            Object.keys(o.inputs).forEach(function (name) {
                parameters[name] = { raw: o.inputs[name], type: (parameters[name] || {}).type };
            });

            return {
                parameters: parameters,

                mode: {
                    isVisible: o.visible,
                    isControlDisabled: false,
                    label: fixture.title,
                    // Undocumented, and absent unless the host says otherwise.
                    contextInfo: o.contextInfo,
                    // Recorded rather than delivered — "did the control ask for
                    // resize notifications" is a decision worth asserting; the
                    // resize itself comes from the `width` option.
                    trackContainerResize: function (value) {
                        log('trackContainerResize', value);
                    },
                    setFullScreen: function (value) {
                        log('setFullScreen', value);
                    },
                    allocatedWidth: o.width,
                    // Pinned at -1 under `heightUnmeasured`, whatever `height`
                    // says — a main grid answers the width and never this.
                    allocatedHeight: quirks.heightUnmeasured ? -1 : o.height,
                },

                resources: {
                    getString:
                        o.getString
                        || function (key) {
                            return STRINGS[key] !== undefined ? STRINGS[key] : key;
                        },
                },

                /*
                 * **This control writes**, which no other dataset control here
                 * does through `updateRecord`, and the write is the interesting
                 * part: the card moves optimistically and has to move back if
                 * the server refuses.
                 *
                 * `webApi: 'absent'` withholds it entirely. That is not a
                 * hypothetical — `context.webAPI` is typed as always present
                 * and with `required="false"` in the manifest is exactly what
                 * it is not, so the control checks
                 * `typeof context.webAPI?.updateRecord === 'function'` and the
                 * component hides the drag affordances when it comes back
                 * false. A board that let you drag on a read-only host would
                 * move the card and silently put it back.
                 *
                 * The rejection is deliberately **not an `Error`**. The
                 * platform rejects with its own shape, and a control printing
                 * `[object Object]` at the user is the failure this stub is
                 * built to expose.
                 */
                /**
                 * `context.utils`, which the lane loader reads the status
                 * column's options from.
                 *
                 * **Canvas publishes this object and refuses to run it**, and
                 * refuses *synchronously*: `getEntityMetadata: Method not
                 * implemented.` thrown from the call rather than returned as a
                 * rejected promise. Measured on a real canvas app, 2026-09-21.
                 *
                 * The rig had no `utils` at all, so the lane loader was never
                 * exercised here and the crash it caused on canvas was
                 * unreachable by any assertion. A rig that omits a surface is a
                 * friendlier host than the platform, which is the shape of
                 * every defect this file has hidden.
                 */
                /**
                 * `context.page`, absent from the API reference entirely and
                 * the only measured way to tell a model-driven host from a
                 * canvas one — every other surface is published on both.
                 * Measured with a host probe, 2026-09-22. `getClientUrl` is
                 * published on both too, but it *answers* on one and **throws**
                 * on the other.
                 *
                 * `o.page: false` models a model-driven host that publishes
                 * neither this nor `Xrm`, where the Web API fallback is
                 * withheld deliberately.
                 */
                page: o.page === false
                    ? undefined
                    : {
                        getClientUrl: function () {
                            log('page.getClientUrl');

                            if (hostKind.label === 'canvas app') {
                                throw new Error('getClientUrl: Method not implemented.');
                            }

                            return 'https://rig.crm.invalid';
                        },
                    },

                utils: o.utils === false
                    ? undefined
                    : {
                        getEntityMetadata: function (entityName, attributes) {
                            log('utils.getEntityMetadata', { entity: entityName, attributes: attributes });

                            if (hostKind.label === 'canvas app') {
                                throw new Error('getEntityMetadata: Method not implemented.');
                            }

                            return Promise.resolve({
                                Attributes: {
                                    get: function () {
                                        return undefined;
                                    },
                                },
                            });
                        },
                    },

                webAPI:
                    o.webApi === 'absent'
                        ? undefined
                        : {
                              updateRecord: function (entity, id, data) {
                                  log('updateRecord', entity + ' ' + id + ' ' + JSON.stringify(data));

                                  return o.webApi === 'rejects'
                                      ? Promise.reject(o.rejection || { message: 'Insufficient privileges' })
                                      : Promise.resolve({ id: id, name: 'updated', etn: entity });
                              },
                          },

                /*
                 * `navigation` is typed as always present and is absent on
                 * canvas and on the hub's demo harness, so the bag itself is
                 * withheld there. **Both arguments are logged**: the second,
                 * `parameters`, is how a quick create arrives with a column
                 * already set — the lane, here — and a stub that logged only
                 * the options would certify a "+" that opens a blank form.
                 */
                navigation:
                    hostKind.label === 'canvas app'
                        ? undefined
                        : {
                              openForm: function (formOptions, parameters) {
                                  log('navigation.openForm', { options: formOptions, parameters: parameters });

                                  return Promise.resolve(o.openFormReturns);
                              },
                          },

                // Absent on a host that publishes no theme — canvas, and the
                // hub's own demo harness.
                fluentDesignLanguage: hostKind.publishesTheme ? { isDarkTheme: Boolean(o.dark) } : undefined,

                userSettings: { isRTL: o.rtl, languageId: 1033 },

                client: {
                    getClient: function () {
                        return o.formFactor === 'phone' || o.formFactor === 'tablet' ? 'Mobile' : 'Web';
                    },
                    getFormFactor: function () {
                        return FORM_FACTORS[o.formFactor] !== undefined ? FORM_FACTORS[o.formFactor] : 1;
                    },
                    isOffline: function () {
                        return false;
                    },
                },

                updatedProperties: [],
            };
        }

        return {
            dataset: dataset,
            context: createContext(),
            /** A fresh context object, as the platform hands down each pass. */
            nextContext: createContext,
            state: state,
            quirks: quirks,
            options: o,
            /** True while the control has asked for data it has not re-rendered against. */
            renderOwed: function () {
                return state.renderOwed;
            },
            settled: function () {
                state.renderOwed = false;
            },
        };
    }

    /**
     * Render until the control stops asking for more, and say how many passes
     * it took.
     *
     * This is the single most useful thing this file does. A dataset control's
     * mutators — `setPageSize`, `refresh`, `loadExactPage` — all end in a new
     * `updateView`, so an unguarded one is an infinite loop that a browser
     * shows as a hang and a rendered table shows as nothing at all. Here it is
     * a number: **a settled control renders twice** (once, then once more for
     * the page size it asked for), and anything that keeps climbing to the
     * limit is the loop.
     */
    function drive(instance, handle, limit) {
        var passes = 0;
        var max = limit || 10;
        var element;

        do {
            handle.settled();
            element = instance.updateView(handle.nextContext());
            passes += 1;
        } while (handle.renderOwed() && passes < max);

        /*
         * `element` is what a *virtual* control returned on the last pass, and
         * `undefined` for a standard one, which wrote into its container
         * instead. Handing it back is what lets one set of assertions read
         * either shape — a virtual dataset control's decisions are all in the
         * props it passed down.
         */
        return { passes: passes, looping: handle.renderOwed(), element: element };
    }

    function captureRegistration(global) {
        var box = { name: null, ctor: null };

        global.ComponentFramework = global.ComponentFramework || {};
        global.ComponentFramework.registerControl = function (fullName, ctor) {
            box.name = fullName;
            box.ctor = ctor;
        };

        return box;
    }

    return {
        ASCENDING: ASCENDING,
        DESCENDING: DESCENDING,
        FORM_FACTORS: FORM_FACTORS,
        HOSTS: HOSTS,
        STRINGS: STRINGS,
        DEFAULTS: DEFAULTS,
        createHost: createHost,
        drive: drive,
        captureRegistration: captureRegistration,
    };
});
