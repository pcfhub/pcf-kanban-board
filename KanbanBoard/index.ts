import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { KanbanBoardControl, IProps } from './components/KanbanBoardControl';
import {
    Card,
    Lane,
    ROLES,
    deriveLanes,
    describeShape,
    laneValue,
    optionLanes,
    parseLanes,
    withUnassigned,
} from './components/lanes';

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Column = ComponentFramework.PropertyHelper.DataSetApi.Column;

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
 * **This control writes.** Moving a card calls `webAPI.updateRecord`, and the
 * card moves on screen before the write resolves — nobody waits a round trip to
 * see a drag land. That optimism has to be paid for: `pending` holds the moves
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

    private moveError: string | null = null;

    public init(
        _context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        // No container: a virtual control never receives one.
        this.notifyOutputChanged = notifyOutputChanged;
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

        const props: IProps = {
            cards,
            lanes: this.lanes(context, cards, getString),
            hasStatus: status !== undefined,
            hasTitle: title !== undefined,
            canMove: this.canWrite(context),
            moving: [...this.moving],
            moveError: this.moveError,
            loading: dataset.loading,
            error: dataset.error,
            errorMessage: dataset.errorMessage,
            hasNextPage: dataset.paging.hasNextPage,
            laneWidth: Math.max(160, Math.trunc(context.parameters.laneWidth.raw ?? 280)),
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
            onMove: (recordId: string, toValue: number): void =>
                this.moveCard(context, dataset, recordId, toValue),
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
     * Whether this host can be written to at all.
     *
     * WebAPI is a Dataverse-dependent API and is absent in canvas apps. The
     * manifest declares it `required="false"` precisely so the host leaves it
     * out rather than refusing to load the component — see the comment there —
     * which makes checking for it here the other half of that decision, not a
     * defensive flourish.
     *
     * `context.webAPI` is typed as always present, so the optional access is
     * deliberately narrower than the type: a required member is a claim about
     * the type definitions, not about the host.
     */
    private canWrite(context: ComponentFramework.Context<IInputs>): boolean {
        return typeof context.webAPI?.updateRecord === 'function';
    }

    /** Ask for a new page size, but only when it actually changed. See the note above. */
    private applyPageSize(context: ComponentFramework.Context<IInputs>, dataset: DataSet): void {
        const raw = context.parameters.pageSize.raw ?? 50;
        const wanted = Math.min(Math.max(Math.trunc(raw), 1), MAX_PAGE_SIZE);

        if (wanted === this.appliedPageSize) {
            return;
        }

        this.appliedPageSize = wanted;
        dataset.paging.setPageSize(wanted);
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

            if (record.getValue(status.name) === wanted) {
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

        return (): Promise<Lane[]> =>
            context.utils
                .getEntityMetadata(entity, [column])
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
     * `refresh()` runs either way, from `finally`. On success it is what
     * eventually retires the override; on failure it repaints from data that
     * never changed, which costs a fetch and removes any doubt about what the
     * board is showing.
     */
    private moveCard(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        recordId: string,
        toValue: number,
    ): void {
        const status = this.roleColumn(dataset, ROLES.status);
        const title = this.roleColumn(dataset, ROLES.title);
        const record = dataset.records[recordId];

        // The component hides the move affordances without a writable host, so
        // reaching here is a caller error rather than a user action — but the
        // check is the one that matters, since it is what stands between an
        // absent API and a TypeError in a promise nobody is awaiting.
        if (!status || !record || !this.canWrite(context)) {
            return;
        }

        // Dropping a card back where it started is not a write.
        const current = this.pending.get(recordId) ?? record.getValue(status.name);

        if (current === toValue) {
            return;
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

        void context.webAPI
            .updateRecord(dataset.getTargetEntityType(), recordId, { [status.name]: toValue })
            .catch((error: unknown) => {
                this.pending.delete(recordId);
                this.moveError = `${context.resources
                    .getString('KanbanBoard_MoveFailed')
                    .replace('{0}', label)} ${this.describe(error)}`;
                this.notifyOutputChanged();
            })
            .finally(() => {
                this.moving.delete(recordId);
                dataset.refresh();
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
