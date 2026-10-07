import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { KanbanBoardControl, IProps, MoveOutcome } from './components/KanbanBoardControl';
import {
    Card,
    Lane,
    ROLES,
    STATUS,
    STATUS_REASON,
    allowsMove,
    boardKey,
    deriveLanes,
    describeShape,
    laneValue,
    movePayload,
    numberValue,
    optionLanes,
    parseLanes,
    parseLimits,
    transitionRules,
    withUnassigned,
} from './components/lanes';
import { TotalsAnswer, loadTotals } from './data/totals';
import { Filter, filterToFetchXml } from './lib/view-aggregate/fetchXml';
import { ParentReading, rowsConfirm } from './lib/view-aggregate/parent';
import { WebApiReader } from './lib/view-aggregate/aggregate';

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Column = ComponentFramework.PropertyHelper.DataSetApi.Column;

/**
 * The write half of a dataset record, which the type definitions do not
 * declare and a model-driven host supplies.
 *
 * Measured on a real subgrid by `pcf-data-table` (a text cell 2026-09-09, a
 * Choice integer 2026-09-11): `setValue` then one `save()` commits, needs
 * no `<uses-feature>` and so no install-time prompt, and is the route that
 * exists on a host where `webAPI` does not. **`setValue` returns
 * `undefined`** — Microsoft's reference page types it `Promise`, and
 * chaining `.then` off it is a synchronous `TypeError` outside every
 * `.catch`. **`isEditable` is a Promise**, so an unawaited call is truthy for
 * every column; it answers `false` for `statecode` and `statuscode` while
 * both report `OptionSet`, which is exactly the column a board is most often
 * grouped by — and the reason `webAPI.updateRecord` stays as the second
 * route rather than being deleted.
 */
interface EditableRecord {
    setValue(columnName: string, value: unknown): unknown;
    save(): Promise<unknown>;
    isEditable(columnName: string): Promise<boolean> | boolean;
}

/** The record as something that can be written to, or `null`. Detected on the three methods actually called. */
function editableRecord(record: unknown): EditableRecord | null {
    const candidate = record as EditableRecord | undefined;

    return candidate
        && typeof candidate.setValue === 'function'
        && typeof candidate.save === 'function'
        && typeof candidate.isEditable === 'function'
        ? candidate
        : null;
}

/**
 * `navigation.openForm`, or `null`. Typed as always present; absent on
 * canvas and on the hub's demo harness — detected per method, the
 * `pcf-row-commands` rule.
 */
type FormOpener = (options: Record<string, unknown>, parameters?: Record<string, string>) => Promise<unknown>;

/**
 * Whether this host is one where a model-driven-only API means anything.
 *
 * **`typeof x.method === 'function'` is not that test.** Measured with a host
 * probe on a real canvas app, 2026-09-22: **fifteen of fifteen** platform
 * surfaces are published there, `navigation.openForm` among them, and the ones
 * safe to call throw `Method not implemented.` from the call itself.
 *
 * `getClientUrl` refuses by throwing, and a thrown refusal is an answer once it
 * is caught. It is undocumented — absent from the API reference entirely —
 * which is why it is read defensively and why the `Xrm` global is tried after
 * it.
 */
function modelDrivenHost(context: ComponentFramework.Context<IInputs>): boolean {
    return clientUrlOf(context) !== null;
}

/** The organisation URL, or `null` on a host that will not say. See `modelDrivenHost`. */
function clientUrlOf(context: ComponentFramework.Context<IInputs>): string | null {
    const ask = <T>(call: () => T): T | undefined => {
        try {
            return call();
        } catch {
            return undefined;
        }
    };

    const page = (context as { page?: { getClientUrl?: unknown } }).page;
    const fromPage = typeof page?.getClientUrl === 'function'
        ? ask(() => (page.getClientUrl as () => unknown)())
        : undefined;
    const fromGlobal = ask(() => (globalThis as {
        Xrm?: { Utility?: { getGlobalContext?: () => { getClientUrl?: () => unknown } } };
    }).Xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.());

    const found = [fromPage, fromGlobal].find((url) => typeof url === 'string' && url !== '');

    return typeof found === 'string' ? found.replace(/\/+$/, '') : null;
}

/** A same-origin metadata read: `context.webAPI` cannot address `EntityDefinitions`. */
function readMetadata<T>(clientUrl: string, path: string): Promise<T> {
    return fetch(`${clientUrl}/api/data/v9.2/${path}`, {
        headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
        credentials: 'same-origin',
    }).then((response) => (response.ok ? (response.json() as Promise<T>) : Promise.reject(response.status)));
}

/**
 * The quick create opener, or `null` on a host that cannot open a form.
 *
 * **`typeof navigation.openForm === 'function'` is not that test.** It passes
 * on canvas, where the method exists and refuses — so the plus icon was drawn
 * in an app that has no forms at all, and pressing it could only fail.
 *
 * The method has to exist **and** the host has to be one where it means
 * anything. See `modelDrivenHost`.
 */
function formOpener(context: ComponentFramework.Context<IInputs>): FormOpener | null {
    const navigation = (context as { navigation?: { openForm?: unknown } }).navigation;

    if (!navigation || typeof navigation.openForm !== 'function') {
        return null;
    }

    return modelDrivenHost(context) ? (navigation.openForm as FormOpener).bind(navigation) : null;
}

/**
 * `mode.contextInfo` — untyped, measured by `pcf-data-table` on a form
 * subgrid as `{ entityTypeName, entityId, entityRecordName }`, the parent
 * record. A main grid has no parent, so both fields are checked.
 */
function parentReference(
    context: ComponentFramework.Context<IInputs>,
): { entityType: string; id: string } | null {
    const info = (context.mode as { contextInfo?: { entityTypeName?: unknown; entityId?: unknown } })
        .contextInfo;

    return info && typeof info.entityTypeName === 'string' && typeof info.entityId === 'string'
        ? { entityType: info.entityTypeName, id: info.entityId }
        : null;
}

/**
 * A GUID as the other outputs spell it: unbraced, lower-case. `openForm`
 * resolves `{ id: "{436E09A8-…}" }` where the dataset's ids are bare and
 * lower-case, so a form comparing `createdRecordId` with `openedRecordId`
 * would never match without this.
 */
function bareGuid(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null;
    }

    const trimmed = raw.trim().replace(/^\{|\}$/g, '').toLowerCase();

    return /^[0-9a-f-]{36}$/.test(trimmed) ? trimmed : null;
}

/** The platform's ceiling on a page. Not in the type definitions. */
const MAX_PAGE_SIZE = 250;

/**
 * A board over a Dataverse view, grouped by a choice column.
 *
 * Everything that talks to the platform lives in this file. The component never
 * sees `context` or the dataset — every call reaches it as a callback prop.
 * That is not tidiness: it keeps the whole platform surface in one file that
 * can be read against the type definitions in a single pass, which is the only
 * way to be sure about an API this narrow.
 *
 * Three things shape the rest of this class.
 *
 * **`updateView` runs on every change to any bound value, including the ones
 * this control caused itself.** A dataset has mutators — `setPageSize`,
 * `refresh`, `loadNextPage` — and calling any of them unguarded from
 * `updateView` is an infinite loop, not a slow render. Every mutator below is
 * in an event handler or a promise callback; `applyPageSize` is the one
 * exception and it is guarded on this control's own field.
 *
 * **This control writes.** Moving a card writes the lane column — through the
 * record where the record allows it, through `webAPI.updateRecord` where it
 * does not — and the card moves on screen before the write resolves, because
 * nobody waits a round trip to see a drag land. That optimism has to be paid for: `pending` holds the moves
 * this control has asserted but not yet seen confirmed, `reconcile()` retires
 * them as the refreshed data catches up, and the `.catch()` puts a card back
 * when the write is refused. A card left sitting in a lane the record is not in
 * is worse than a drag that visibly fails.
 *
 * **A board loads more, it does not turn pages.** `loadNextPage()` with no
 * argument returns the whole loaded range, so `sortedRecordIds` accumulates and
 * the board simply grows — the behaviour a table has to defend against and the
 * one a board wants. So this control never slices, never tracks a page number,
 * and reads `hasNextPage` only to decide whether Load more is offered.
 */
export class KanbanBoard implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;
    private openedRecordId = '';
    private movedRecordId = '';
    private createdRecordId = '';

    /**
     * The page size this control has already asked the platform for.
     *
     * Guarding on this rather than on `ds.paging.pageSize` is the whole trick:
     * the platform's own value will not equal the requested one until the
     * refresh lands, so comparing against it re-fires at least once more — and
     * if the platform clamps the request, it never converges at all.
     */
    private appliedPageSize = 0;

    /**
     * Moves asserted locally and not yet confirmed by the data: record id to
     * the lane value this control asked for.
     *
     * Retired in `reconcile()`, not on the promise resolving. A resolved
     * `updateRecord` means Dataverse accepted the write, not that the dataset
     * has re-read it — clearing on resolve would drop the override while the
     * old value was still on screen, and the card would jump back and then
     * forward again.
     */
    private readonly pending = new Map<string, number>();

    /** Cards with a write in flight, so the component can show them as busy. */
    private readonly moving = new Set<string>();

    /**
     * Asked at render time, not copied into the props. A refused move changes
     * no output, so a form calls `updateView` for the move's start and never
     * again: a copied list kept the card in it for good, and the card stayed
     * "Moving…" with its Move button disabled (0.4.1, measured on a sub-grid
     * with a business rule refusing the save). The component re-renders itself
     * when the move settles, and then this answers from the live set.
     */
    private readonly isMoving = (recordId: string): boolean => this.moving.has(recordId);

    private moveError: string | null = null;

    /**
     * Refused moves so far. The board clears its optimistic placement when
     * this changes, because a refusal changes nothing else it could see: the
     * card never left its lane in the data. See `useOptimisticLanes`.
     */
    private failedMoves = 0;


    /**
     * The lane column's options, read for their **state** — what a move
     * between Status Reasons has to send beside the reason. Keyed by
     * `table:column`, and read even when the maker set **Lanes**: those carry
     * labels and colours, never states. One `getEntityMetadata` call per key
     * for the life of the control.
     */
    private readonly states = new Map<string, Promise<Lane[]>>();

    /** Same-origin metadata reads, cached for the life of the control. */
    private enforced: Promise<boolean> | null = null;
    private primaryId: Promise<string> | null = null;
    private parentCandidates: Promise<{ column: string; target: string }[]> | null = null;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        // No container: a virtual control never receives one.
        this.notifyOutputChanged = notifyOutputChanged;

        /*
         * Ask to be told how much width we were given.
         *
         * Without this, `allocatedWidth` is not populated at all. With it, the
         * board can pin itself to the space the host allocated — which is the
         * only way to scroll sideways inside a host that sizes itself to its
         * content. Measured across host shapes: a block, flex-row or grid
         * parent constrains the board and CSS alone is enough, while
         * `fit-content`, `inline-block` and `table` parents take their width
         * *from* the board, so `max-width: 100%` resolves against a number the
         * board itself produced and constrains nothing.
         *
         * Feature-detected: it is typed as always present, which is a claim
         * about the type definitions rather than about the host.
         */
        if (typeof context.mode.trackContainerResize === 'function') {
            context.mode.trackContainerResize(true);
        }
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const dataset = context.parameters.records;

        this.applyPageSize(context, dataset);

        const status = this.roleColumn(dataset, ROLES.status);
        const title = this.roleColumn(dataset, ROLES.title);

        // Retire settled overrides before building the cards, so a confirmed
        // move is read from the data rather than from this control's memory.
        this.reconcile(dataset, status);

        const cards = this.cards(dataset, status, title);
        const getString = (id: string): string => context.resources.getString(id);
        const value = this.roleColumn(dataset, ROLES.value);
        const limitsSpec = (context.parameters.laneLimits?.raw ?? '').trim();
        const limits = Object.fromEntries(parseLimits(limitsSpec));
        // Totals are asked for when there is something to total or a limit to
        // count against — neither, and the board sends no query at all.
        const totalsWanted = status !== undefined && (value !== undefined || limitsSpec !== '');

        const props: IProps = {
            cards,
            hasValue: value !== undefined,
            limits,
            totalsWanted,
            totals: totalsWanted && status ? this.totalsRoute(context, dataset, status, value ?? null, cards) : null,
            formatValue: (amount: number): string => this.formatValue(context, value, amount),
            lanes: this.lanes(context, cards, getString),
            hasStatus: status !== undefined,
            hasTitle: title !== undefined,
            canMove: this.canWrite(context, dataset),
            canCreate: (context.parameters.allowCreate.raw ?? true) && formOpener(context) !== null,
            showSearch: context.parameters.showSearch.raw ?? true,
            isMoving: this.isMoving,
            moveError: this.moveError,
            failedMoves: this.failedMoves,
            loading: dataset.loading,
            error: dataset.error,
            errorMessage: dataset.errorMessage,
            hasNextPage: dataset.paging.hasNextPage,
            laneWidth: Math.max(160, Math.trunc(context.parameters.laneWidth.raw ?? 280)),
            // -1 means "no limit" and 0 means "not laid out yet". Neither is a
            // width to pin the board to, so both become null and the CSS is
            // left to cope on its own.
            allocatedWidth: context.mode.allocatedWidth > 0 ? context.mode.allocatedWidth : null,
            laneColors: context.parameters.laneColors.raw ?? true,
            openOnCardClick: context.parameters.openOnCardClick.raw ?? true,
            visible: context.mode.isVisible,
            disabled: context.mode.isControlDisabled,
            isRTL: context.userSettings.isRTL,
            // Typed as of @types/powerapps-component-framework 1.3.18, so no
            // cast is needed — but absent in PCFHub's demo harness, which is
            // why the component falls back to Fluent's own light theme.
            theme: context.fluentDesignLanguage?.tokenTheme,
            title: dataset.getTitle(),
            getString,
            unassignedLabel: getString('KanbanBoard_Unassigned'),
            lanesKey: status ? `${dataset.getTargetEntityType()}:${status.name}` : '',
            loadLanes: this.laneLoader(context, dataset, status),
            loadRules: status && status.name === STATUS_REASON
                ? (): Promise<Record<string, number[]>> => this.rulesFor(context, dataset.getTargetEntityType(), status.name)
                : null,
            onMove: (recordId: string, toValue: number): Promise<MoveOutcome> =>
                this.moveCard(context, dataset, recordId, toValue),
            onCreate: (laneValue: number): void => this.createCard(context, dataset, laneValue),
            onOpenRecord: (id: string): void => this.openRecord(dataset, id),
            onLoadMore: (): void => this.loadMore(dataset),
        };

        return React.createElement(KanbanBoardControl, props);
    }

    /**
     * `null` is not `undefined` here: the generated `IOutputs` types every
     * output as optional, and `undefined` means "no change" — so a cleared
     * value would be unobservable. Emit the empty string instead.
     */
    public getOutputs(): IOutputs {
        return {
            movedRecordId: this.movedRecordId,
            openedRecordId: this.openedRecordId,
            createdRecordId: this.createdRecordId,
        };
    }

    public destroy(): void {
        // The platform unmounts the React tree for a virtual control, and this
        // control holds no listeners, timers or observers of its own. The
        // in-flight writes are deliberately not cancelled: `updateRecord` has
        // already reached Dataverse and there is nothing to take back.
    }

    /**
     * A `property-set` column, found by **alias**.
     *
     * `column.alias` carries the role name from the manifest; `column.name`
     * carries the maker's real schema name. Reading the record by `alias` — or
     * matching the column by `name` — renders nothing at all against a real
     * view while passing any fixture whose two values happen to be equal. It is
     * the most expensive mistake available in this pattern, so it is made once,
     * here.
     */
    private roleColumn(dataset: DataSet, alias: string): Column | undefined {
        return (dataset.columns ?? []).find((column) => column.alias === alias);
    }

    /**
     * Whether this host can be written to at all — by either route.
     *
     * The record's own write half is checked first, on the first loaded
     * record, because it is the route that costs nothing: no feature, no
     * prompt, and present on hosts that have no `webAPI`. WebAPI is
     * Dataverse-dependent and absent in canvas; the manifest declares it
     * `required="false"` precisely so the host leaves it out rather than
     * refusing to load the component, which makes checking for it here the
     * other half of that decision.
     *
     * `context.webAPI` is typed as always present, so the optional access is
     * deliberately narrower than the type: a required member is a claim about
     * the type definitions, not about the host. Which route a *particular*
     * card takes is decided per record in `write`, because `isEditable` is
     * per column and per record and cannot be answered from here.
     */
    /**
     * Whether a lane change can be saved.
     *
     * **Two routes, and only the second needed a host test.** The dataset
     * record writes through `setValue`/`save`, which works wherever the record
     * can be written — canvas included — so that branch is untouched. Gating
     * the whole method would have withheld drag-between-lanes on canvas, where
     * it works.
     *
     * The Web API fallback is the one that lied: `updateRecord` exists on
     * canvas and refuses, so this returned `true` on a canvas host whose
     * records were not editable and the drag could only fail.
     */
    private canWrite(context: ComponentFramework.Context<IInputs>, dataset: DataSet): boolean {
        const firstId = (dataset.sortedRecordIds ?? [])[0];

        if (firstId !== undefined && editableRecord(dataset.records[firstId]) !== null) {
            return true;
        }

        return typeof context.webAPI?.updateRecord === 'function' && modelDrivenHost(context);
    }

    /** Ask for a new page size, but only when it actually changed. See the note above. */
    private applyPageSize(context: ComponentFramework.Context<IInputs>, dataset: DataSet): void {
        const raw = context.parameters.pageSize.raw;

        /*
         * **The platform already has a page size, and it is usually the right
         * one.** `paging.pageSize` is the size the host is actually retrieving
         * with — a main grid's *Rows per page* personalisation, a subgrid's
         * form-designer setting, the canvas default.
         *
         * So the property carries no `default-value`, and this is the half of
         * that decision written in code: unset, adopt what the host is doing and
         * **never call `setPageSize` at all**; set, override. Adopting still
         * records the number, because the page slice and the pager label both
         * need to know how big a page is — reading it is not the same as asking
         * for it. See the manifest for why the default was removed.
         */
        if (raw === null || raw === undefined) {
            // `0` is "the host did not say", not "one row per page". A fallback
            // of `1` is a page size the platform never has, and the slice would
            // cut the view down to it — twenty rows arriving and one drawn.
            this.appliedPageSize = dataset.paging.pageSize > 0 ? dataset.paging.pageSize : 0;

            return;
        }

        const wanted = Math.min(Math.max(Math.trunc(raw), 1), MAX_PAGE_SIZE);

        if (wanted === this.appliedPageSize) {
            return;
        }

        const previous = this.appliedPageSize;

        this.appliedPageSize = wanted;
        dataset.paging.setPageSize(wanted);

        /*
         * **Repaginating makes the platform's current page mean something
         * else**, so the fetch starts from the first one again — but only when
         * the size actually changed. `previous` is 0 until a size has been
         * applied, and at mount the platform is already on page one: resetting
         * there is a round trip for nothing, since `reset()` is a fetch and the
         * `refresh()` below is a second one.
         *
         * There is no page counter to reset here — the board loads more with `loadNextPage()` rather than turning pages — so this is
         * `paging.reset()` alone. Found by the rule that fixed
         * `pcf-data-table` 0.2.0, where a rows-per-page picker made it
         * reachable.
         */
        if (previous > 0) {
            dataset.paging.reset();
        }

        dataset.refresh();
    }

    /**
     * Drop the overrides the data has caught up with.
     *
     * Two ways an override retires: the record now reports the value this
     * control asked for, or the record has left the view entirely — which is
     * what happens when the board is bound to a filtered view and the card was
     * moved out of it. Without the second case the map grows for the lifetime
     * of the control, and every entry in it is a card the board is placing from
     * memory rather than from data.
     *
     * Reads only. Called from `updateView`, so a mutator here would loop.
     */
    private reconcile(dataset: DataSet, status: Column | undefined): void {
        if (this.pending.size === 0 || !status) {
            return;
        }

        for (const [id, wanted] of [...this.pending]) {
            const record = dataset.records[id];

            if (!record) {
                this.pending.delete(id);
                continue;
            }

            // Through `laneValue`: a Choice answers the numeric *string*
            // `"3"` on a form, and `===` against the number asked for never
            // matched — so an override never retired against data.
            if (laneValue(record.getValue(status.name)) === wanted) {
                this.pending.delete(id);
            }
        }
    }

    /**
     * Every loaded record as a card, with any pending move applied.
     *
     * `sortedRecordIds` is passed through whole and never sliced: with bare
     * `loadNextPage()` the accumulation *is* the board.
     */
    private cards(dataset: DataSet, status: Column | undefined, title: Column | undefined): Card[] {
        if (!status || !title) {
            return [];
        }

        const assignee = this.roleColumn(dataset, ROLES.assignee);
        const badge = this.roleColumn(dataset, ROLES.badge);
        const value = this.roleColumn(dataset, ROLES.value);
        const built: Card[] = [];

        for (const id of dataset.sortedRecordIds ?? []) {
            const record = dataset.records[id];

            if (!record) {
                continue;
            }

            // A choice column's raw value is its option number. Anything that
            // is not one — an unset column, or a role bound to a column that is
            // not a choice — is left unassigned rather than coerced into lane
            // NaN. See `laneValue` for why a numeric string counts.
            const actual = laneValue(record.getValue(status.name));
            const override = this.pending.get(id);

            built.push({
                id,
                title: record.getFormattedValue(title.name),
                assignee: assignee ? record.getFormattedValue(assignee.name) : null,
                badge: badge ? record.getFormattedValue(badge.name) : null,
                lane: override ?? actual,
                laneLabel: record.getFormattedValue(status.name),
                value: value ? numberValue(record.getValue(value.name)) : null,
            });
        }

        return built;
    }

    /**
     * A function the component can call to fetch the status column's options,
     * or `null` when there is nothing to fetch.
     *
     * **This is handed over rather than resolved here, and that is the whole
     * point.** `getEntityMetadata` is asynchronous and `updateView` is not, so
     * an earlier version stored the answer on this instance and called
     * `notifyOutputChanged()` to get a repaint. That does not work: the call
     * announces that *outputs* changed, and these outputs did not, so the
     * platform has no reason to call `updateView` again. The lanes arrived and
     * nothing re-rendered.
     *
     * React's own state does not have that problem. The component holds the
     * result and `setState` repaints unconditionally, whatever the host does —
     * which is also why `pcf-data-table` mirrors its selection in React rather
     * than trusting a repaint.
     *
     * Model-driven only: `context.utils` is Dataverse-dependent and absent in
     * canvas, which is why the manifest declares `Utility` as
     * `required="false"`. It costs canvas nothing — without `WebAPI` the board
     * is read-only there, and a lane nobody can move a card into is decoration.
     */
    private laneLoader(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        status: Column | undefined,
    ): (() => Promise<Lane[]>) | null {
        const override = (context.parameters.lanes.raw ?? '').trim();

        if (override !== '' || !status || typeof context.utils?.getEntityMetadata !== 'function') {
            return null;
        }

        const entity = dataset.getTargetEntityType();
        const column = status.name;

        /*
         * **The executor is not ceremony.** A host can publish this method and
         * refuse to run it *synchronously* — canvas answers
         * `getEntityMetadata: Method not implemented.` from the call itself,
         * measured on a real canvas app 2026-09-21 against `pcf-data-table`.
         *
         * A synchronous throw is not a rejected promise: it never reaches the
         * `.catch` below, it escapes this loader, it escapes the effect that
         * calls it, and the studio replaces the whole board with *Error loading
         * control*. The `typeof … === 'function'` guard above passes, because
         * the method genuinely exists — existing is not working.
         */
        return (): Promise<Lane[]> =>
            new Promise<unknown>((resolve) => resolve(context.utils.getEntityMetadata(entity, [column])))
                .then((metadata: unknown) => {
                    const lanes = optionLanes(metadata, column);

                    if (lanes.length === 0) {
                        /*
                         * Loud, and printing the *shape* rather than the whole
                         * object.
                         *
                         * The fallback is invisible — one lane looks the same
                         * whether the feature is off, the call failed, or the
                         * search missed — and the first version of this warning
                         * dumped the metadata object, which a console renders
                         * collapsed and which nobody can paste anywhere useful.
                         * The keys and their types are what the next version of
                         * optionLanes() has to be written from.
                         */
                        /*
                         * Two dumps, because the top level alone was not enough
                         * the first time this fired: the interesting key sat
                         * past the truncation, among ninety-odd others.
                         *
                         * The second line probes `Attributes` by name, which is
                         * the whole question — whether the collection is
                         * reachable and what it looks like inside.
                         */
                        const attributes = (metadata as { Attributes?: unknown } | null)?.Attributes;

                        console.warn(
                            `KanbanBoard: read metadata for ${entity}.${column} but found no option set in it. ` +
                            'Falling back to lanes derived from the loaded records. Set the Lanes property to ' +
                            'list them explicitly.\n\nShape returned:\n' +
                            describeShape(metadata) +
                            '\n\nmetadata.Attributes:\n' +
                            describeShape(attributes),
                        );
                    }

                    return lanes;
                })
                .catch((error: unknown) => {
                    console.warn(
                        `KanbanBoard: could not read metadata for ${entity}.${column}. ` +
                        'Falling back to lanes derived from the loaded records.',
                        error,
                    );

                    return [];
                });
    }

    /**
     * The override if the maker set one, otherwise whatever the cards show.
     *
     * A card whose pending lane is not among the declared lanes would vanish
     * mid-move, so the unassigned lane is appended from the cards either way.
     */
    private lanes(
        context: ComponentFramework.Context<IInputs>,
        cards: Card[],
        getString: (id: string) => string,
    ): Lane[] {
        const spec = (context.parameters.lanes.raw ?? '').trim();

        /*
         * The lanes that can be worked out *synchronously*: the maker's
         * override if there is one, otherwise the values the loaded cards
         * happen to have.
         *
         * The option set is the better answer and cannot be had from here — it
         * arrives from a promise, so the component fetches it through
         * `loadLanes` and prefers it over this once it lands. What this returns
         * is the floor: what a canvas app gets permanently, and what any host
         * shows for the moment before the metadata call comes back.
         */
        const declared = spec !== '' ? parseLanes(spec) : deriveLanes(cards);

        return withUnassigned(declared, cards, getString('KanbanBoard_Unassigned'));
    }

    /**
     * Move a card, optimistically.
     *
     * The order matters and is not incidental. The override goes in and the
     * output is notified *before* the write is sent, so the card lands where it
     * was dropped and a form can observe the intent even on a host where the
     * write fails. The `.catch()` is what makes that honest: it takes the
     * override back out, so the card returns to the lane the record is actually
     * in rather than sitting somewhere it never went.
     *
     * `pcf-tag-list` has no `.catch()` at all and a failed write there surfaces
     * only as the dataset not changing — survivable for a chip that vanishes
     * and reappears, not for a card that has visibly moved.
     *
     * **No `refresh()` afterwards, since 0.4.1.** Through 0.4.0 one ran from
     * `finally`, either way — and a refresh restarts the view at its first
     * page, so every card **Load more** had brought in vanished on each move
     * (found on the form, 2026-09-29). It was there for two reasons, and
     * neither needs it now: a landed move is already on screen through the
     * override, which retires at the next fetch that agrees (and the totals
     * re-ask on their own); and a refused move — which changes no output, so
     * the platform brings no render — is put back by the component, which
     * learns the outcome from the promise this returns.
     */
    private moveCard(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        recordId: string,
        toValue: number,
    ): Promise<MoveOutcome> {
        const status = this.roleColumn(dataset, ROLES.status);
        const title = this.roleColumn(dataset, ROLES.title);
        const record = dataset.records[recordId];

        // The component hides the move affordances without a writable host, so
        // reaching here is a caller error rather than a user action — but the
        // check is the one that matters, since it is what stands between an
        // absent API and a TypeError in a promise nobody is awaiting.
        if (!status || !record || !this.canWrite(context, dataset)) {
            return Promise.resolve({ ok: false, message: null });
        }

        // Dropping a card back where it started is not a write. Read as a
        // lane number — the record's own answer is the string "3".
        const current = this.pending.get(recordId) ?? laneValue(record.getValue(status.name));

        if (current === toValue) {
            return Promise.resolve({ ok: true, message: null });
        }

        // Read now, not in the catch: by the time a rejection arrives the
        // record may be gone from a refreshed dataset, and a failure message
        // that cannot name the card is most of the way to useless.
        const label = title ? record.getFormattedValue(title.name) : recordId;

        this.pending.set(recordId, toValue);
        this.moving.add(recordId);
        this.moveError = null;
        this.movedRecordId = recordId;
        this.notifyOutputChanged();

        /*
         * **What is sent depends on the lane column.** On a Status Reason
         * board a move across states sends the state beside the reason — the
         * server refuses a bare reason from the other state (measured, T4) —
         * so the states are read first. On any other column this resolves to
         * `[]` at once and the payload is the one column, as before.
         */
        const from = current;

        return Promise.all([
            this.statesFor(context, dataset.getTargetEntityType(), status.name),
            this.rulesFor(context, dataset.getTargetEntityType(), status.name),
        ])
            .then(([options, rules]) => {
                const to = options.find((lane) => lane.value === toValue)
                    ?? { value: toValue, label: '', color: null, state: null, defaultStatus: null, next: null };
                const source = options.find((lane) => lane.value === from);

                /*
                 * The board draws a disallowed lane as closed and leaves it
                 * out of the Move menu; this is the same rule, once more,
                 * before anything is sent — so no path to `write` can send a
                 * move the table's transitions forbid, whether or not the
                 * server would have caught it (it catches only a change of
                 * state, measured).
                 */
                if (!allowsMove(rules, typeof from === 'number' ? from : null, toValue)) {
                    throw new Error(context.resources.getString('KanbanBoard_NotAllowed')
                        .replace('{0}', source?.label ?? String(from))
                        .replace('{1}', to.label || String(toValue)));
                }

                return this.write(context, dataset, record, status.name, recordId, movePayload(status.name, source, to));
            })
            .then(
                (): MoveOutcome => ({ ok: true, message: null }),
                (error: unknown): MoveOutcome => {
                    this.pending.delete(recordId);
                    // Before the announcement, not only in the `finally`: a
                    // host that does render on it must not draw the card as
                    // still moving.
                    this.moving.delete(recordId);
                    this.failedMoves += 1;
                    this.moveError = `${context.resources
                        .getString('KanbanBoard_MoveFailed')
                        .replace('{0}', label)} ${this.describe(error)}`;
                    this.notifyOutputChanged();

                    return { ok: false, message: this.moveError };
                },
            )
            .finally(() => {
                this.moving.delete(recordId);
            });
    }

    /**
     * The write itself, by whichever route this record allows.
     *
     * **Two routes, chosen per record.** `record.isEditable(column)` decides:
     * `true` and the value goes through `setValue` + `save()` on the record —
     * no feature, no prompt, and the only route a canvas app has; `false`, or
     * a record with no write half at all, and it goes through
     * `webAPI.updateRecord` where that exists. The second route is not
     * legacy: `isEditable` answers `false` for `statuscode`, which is the
     * column a board is most often grouped by, and a plain Web API update
     * writes it.
     *
     * **`Promise.resolve().then(...)` rather than chaining off `setValue`.**
     * It returns `undefined`, so `record.setValue(...).then(...)` is `.then`
     * on nothing — a `TypeError` thrown synchronously, outside every
     * `.catch`. Starting from a resolved promise turns a synchronous throw
     * inside the callback into a rejection, which is what `moveCard` is
     * equipped to handle. `refresh()` follows either route, from `moveCard`'s
     * `finally`: a resolved `save()` is Dataverse accepting the write, and
     * nothing re-reads until something asks.
     */
    private write(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        record: unknown,
        column: string,
        recordId: string,
        payload: Record<string, number>,
    ): Promise<unknown> {
        const editable = editableRecord(record);
        const api = context.webAPI;
        const value = payload[column];
        const viaApi = (): Promise<unknown> =>
            typeof api?.updateRecord === 'function'
                ? api.updateRecord(dataset.getTargetEntityType(), recordId, payload)
                : Promise.reject(new Error(context.resources.getString('KanbanBoard_ReadOnly')));

        // A pair — a state beside its reason — is one Web API update. The
        // record route stages one column, and both status columns answer
        // `isEditable` false on a form anyway (T7).
        if (!editable || Object.keys(payload).length !== 1) {
            return viaApi();
        }

        return Promise.resolve()
            // `=== true` rather than truthiness: a host returning the Promise
            // the platform does would otherwise read as editable everywhere.
            .then(() => editable.isEditable(column))
            .then((allowed) => {
                if (allowed !== true) {
                    return viaApi();
                }

                editable.setValue(column, value);

                return editable.save();
            });
    }

    /**
     * The lane column's options with their states — for writes, not for
     * drawing. `[]` for any column but the two status ones, where no pair is
     * ever sent, and `[]` wherever the metadata cannot be read: the move then
     * goes bare, as it did before 0.4.0.
     *
     * The executor form for the same reason as `laneLoader`: canvas publishes
     * `getEntityMetadata` and throws from the call.
     */
    /**
     * The Status Reason transitions in force, reason → the reasons it may
     * move to — `{}` wherever none bind: any other column, a table that does
     * not enforce them, a host that cannot say.
     *
     * `EnforceStateTransitions` is read, not inferred: measured, every reason
     * carried its `TransitionData` while the flag answered `false`, and then
     * nothing was refused. It is not on anything `getEntityMetadata` was seen
     * to return, so it is one same-origin `EntityDefinitions` read per table,
     * cached for the life of the control.
     */
    private rulesFor(
        context: ComponentFramework.Context<IInputs>,
        entity: string,
        column: string,
    ): Promise<Record<string, number[]>> {
        if (column !== STATUS_REASON) {
            return Promise.resolve({});
        }

        const clientUrl = clientUrlOf(context);

        if (!this.enforced) {
            this.enforced = clientUrl === null
                ? Promise.resolve(false)
                : readMetadata<{ EnforceStateTransitions?: unknown }>(
                    clientUrl,
                    `EntityDefinitions(LogicalName='${encodeURIComponent(entity)}')?$select=EnforceStateTransitions`,
                )
                    .then((body) => body.EnforceStateTransitions === true)
                    .catch(() => false);
        }

        return Promise.all([this.statesFor(context, entity, column), this.enforced])
            .then(([lanes, enforced]) => transitionRules(lanes, enforced));
    }

    private statesFor(
        context: ComponentFramework.Context<IInputs>,
        entity: string,
        column: string,
    ): Promise<Lane[]> {
        if (column !== STATUS_REASON && column !== STATUS) {
            return Promise.resolve([]);
        }

        const key = `${entity}:${column}`;
        const cached = this.states.get(key);

        if (cached) {
            return cached;
        }

        const read = new Promise<unknown>((resolve) => resolve(context.utils.getEntityMetadata(entity, [column])))
            .then((metadata) => optionLanes(metadata, column))
            .catch(() => [] as Lane[]);

        this.states.set(key, read);

        return read;
    }

    /**
     * The server route for lane totals, as a key and a loader — or `null`
     * where it is withheld and the board totals the cards it has.
     *
     * Handed to the component rather than resolved here, the rule this board
     * learned first: an answer stored on the instance cannot repaint a virtual
     * control. `key` holds everything the answer depends on, **the board's
     * content included**, so a move that lands, a refresh or a Load more asks
     * again and a stale answer for an old key is dropped.
     *
     * Withheld — the number would be wrong rather than missing — on a host
     * that is not model-driven (canvas publishes `webAPI` and refuses it),
     * with no view to read (`getViewId()` is `undefined` on canvas), or with a
     * runtime filter FetchXML cannot spell.
     */
    private totalsRoute(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        status: Column,
        value: Column | null,
        cards: Card[],
    ): { key: string; load: () => Promise<TotalsAnswer | null> } | null {
        const api = (context as { webAPI?: WebApiReader }).webAPI;
        const clientUrl = clientUrlOf(context);
        const viewId = (dataset as { getViewId?: () => unknown }).getViewId?.();

        if (!api || clientUrl === null || typeof viewId !== 'string' || viewId === '') {
            return null;
        }

        const filter = filterToFetchXml(dataset.filtering?.getFilter?.() as Filter | null | undefined);

        if (!filter.translatable) {
            return null;
        }

        const entity = dataset.getTargetEntityType();
        const parent = this.parentReading(context, dataset, entity, clientUrl);

        return {
            key: [
                entity,
                status.name,
                value ? value.name : '',
                viewId,
                filter.xml,
                parent ? `${parent.record.id}/${parent.explicit ?? ''}` : '',
                boardKey(cards),
            ].join('~'),
            load: () => loadTotals({
                api,
                entity,
                lane: status.name,
                value: value ? value.name : null,
                viewId,
                filterXml: filter.xml,
                parent,
                primaryId: () => this.primaryIdFor(clientUrl, entity),
            }),
        };
    }

    /**
     * The subgrid's parent, for the resolver — `null` on a main grid, which
     * has no `contextInfo.entityId`. The candidates are this table's lookups
     * to the form's table, from `ManyToOneRelationships`; the rows confirm or
     * deny each one they carry.
     */
    private parentReading(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        entity: string,
        clientUrl: string,
    ): ParentReading | null {
        const parent = parentReference(context);

        if (!parent) {
            return null;
        }

        const typed = (context.parameters.parentLookup?.raw ?? '').trim().toLowerCase();
        const records = (dataset.sortedRecordIds ?? [])
            .map((id) => dataset.records[id])
            .filter((record) => Boolean(record));
        const fetched = (dataset.columns ?? []).map((column) => column.name);

        return {
            record: { entityType: parent.entityType, id: parent.id },
            explicit: typed === '' ? null : typed,
            candidates: () => this.candidatesFor(clientUrl, entity)
                .then((all) => all.filter((each) => each.target === parent.entityType).map((each) => each.column)),
            confirmed: (column) => rowsConfirm(records, column, parent.id, fetched),
        };
    }

    private candidatesFor(clientUrl: string, entity: string): Promise<{ column: string; target: string }[]> {
        if (!this.parentCandidates) {
            this.parentCandidates = readMetadata<{ value?: { ReferencingAttribute?: string; ReferencedEntity?: string }[] }>(
                clientUrl,
                `EntityDefinitions(LogicalName='${encodeURIComponent(entity)}')/ManyToOneRelationships`
                    + '?$select=ReferencingAttribute,ReferencedEntity',
            )
                .then((body) => (body.value ?? [])
                    .filter((each) => typeof each.ReferencingAttribute === 'string' && typeof each.ReferencedEntity === 'string')
                    .map((each) => ({ column: each.ReferencingAttribute as string, target: each.ReferencedEntity as string })))
                .catch(() => []);
        }

        return this.parentCandidates;
    }

    /**
     * The table's real primary key, which `count` is taken over — not always
     * `<table>id` (an activity table's is `activityid`). The guess is the
     * fallback when the read is refused.
     */
    private primaryIdFor(clientUrl: string, entity: string): Promise<string> {
        if (!this.primaryId) {
            this.primaryId = readMetadata<{ PrimaryIdAttribute?: unknown }>(
                clientUrl,
                `EntityDefinitions(LogicalName='${encodeURIComponent(entity)}')?$select=PrimaryIdAttribute`,
            )
                .then((body) => (typeof body.PrimaryIdAttribute === 'string' && body.PrimaryIdAttribute !== ''
                    ? body.PrimaryIdAttribute
                    : `${entity}id`))
                .catch(() => `${entity}id`);
        }

        return this.primaryId;
    }

    /**
     * A total as the user reads money and numbers — the platform's own
     * formatting, by the column's type. The server's formatted sum is used
     * where there is one; this is for the loaded-cards route. A host that
     * refuses the formatter gets the browser's.
     */
    private formatValue(context: ComponentFramework.Context<IInputs>, column: Column | undefined, amount: number): string {
        try {
            if (column?.dataType === 'Currency') {
                return context.formatting.formatCurrency(amount);
            }

            if (column?.dataType === 'Whole.None') {
                return context.formatting.formatInteger(amount);
            }

            return context.formatting.formatDecimal(amount);
        } catch {
            return amount.toLocaleString();
        }
    }

    /**
     * Open the quick create form for a new card in a lane, and report the row
     * it made.
     *
     * The lane is passed as a **form parameter** — the second argument, typed
     * `{ [key: string]: string }`, so the option number goes as a string —
     * which is how a quick create arrives with a column already set.
     * `createFromEntity` seeds the parent so the row lands in this subgrid; on
     * a main grid there is no parent and the option is left out.
     *
     * A dismissed form resolves `{ savedEntityReference: null }` — not `[]`,
     * not a rejection (measured by `pcf-data-table`, 2026-09-11) — so every
     * read below is optional. A saved row resolves its id braced and
     * upper-case, normalised to the spelling the other outputs use.
     * `refresh()` is what puts the new card on the board.
     */
    private createCard(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        laneValue: number,
    ): void {
        const open = formOpener(context);
        const status = this.roleColumn(dataset, ROLES.status);

        if (!open || !status) {
            return;
        }

        const parent = parentReference(context);
        const options: Record<string, unknown> = {
            entityName: dataset.getTargetEntityType(),
            useQuickCreateForm: true,
        };

        if (parent) {
            options.createFromEntity = { entityType: parent.entityType, id: parent.id };
        }

        void Promise.resolve()
            .then(() => open(options, { [status.name]: String(laneValue) }))
            .then((result) => {
                const saved = (result as { savedEntityReference?: { id?: unknown }[] | null } | undefined)
                    ?.savedEntityReference;
                const id = bareGuid(saved?.[0]?.id);

                if (id === null) {
                    return;
                }

                this.createdRecordId = id;
                this.notifyOutputChanged();
                dataset.refresh();
            })
            .catch((error: unknown) => {
                console.warn('[KanbanBoard] create failed', error);
            });
    }

    /**
     * A rejected `updateRecord` is typed as `unknown` and is not reliably an
     * `Error` — the platform rejects with its own shape. Take a message where
     * there is one and stringify otherwise, rather than printing
     * `[object Object]` at the user.
     */
    private describe(error: unknown): string {
        if (typeof error === 'object' && error !== null && 'message' in error) {
            return String((error as { message: unknown }).message);
        }

        return String(error);
    }

    /**
     * `loadNextPage()` with **no argument**, which is the whole difference.
     *
     * The type definition says it returns results for the loaded page range, so
     * `sortedRecordIds` accumulates 1..N and the board grows. A table has to
     * pass `true` and then repair what the platform ignores; a board wants
     * exactly what the bare call already does, and the card you were reading
     * stays where it was.
     *
     * No local accumulator: a copy of the records would be a second source of
     * truth that a refresh silently invalidates.
     */
    private loadMore(dataset: DataSet): void {
        if (!dataset.paging.hasNextPage) {
            return;
        }

        dataset.paging.loadNextPage();
    }

    /**
     * Notify before opening, so the output is observable even on a host where
     * `openDatasetItem` does nothing — which is the canvas case.
     *
     * It takes an EntityReference, and `getNamedReference()` is the only way to
     * build one; there is no id-based overload.
     */
    private openRecord(dataset: DataSet, id: string): void {
        const record = dataset.records[id];

        if (!record) {
            return;
        }

        this.openedRecordId = id;
        this.notifyOutputChanged();
        dataset.openDatasetItem(record.getNamedReference());
    }
}
