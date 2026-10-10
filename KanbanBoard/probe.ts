/*
 * THE 0.4.8 PROBE. Delete this file, and its import in index.ts, before 0.5.0.
 *
 * A throwaway build that asks the live form what 0.5.0 — swimlanes and a sort
 * menu — rests on, before a line of either exists. An answer that goes the
 * wrong way removes the feature that depends on it. Every answer goes into
 * SPEC.md as *Measured*, with the date.
 *
 * `window.__pcfKanbanProbe.help()` lists the calls. The last-mounted board owns
 * the global, so probe one board at a time. The bundle carries
 * `kanban-probe-0.4.8`, which is how to confirm the page runs this build.
 *
 * The questions, and the 0.5.0 feature each decides:
 *
 *   P1  An Owner column on a dataset record — systemuser and team rows:
 *       `getValue` shape, `etn`, braces and case of the id, `getFormattedValue`.
 *       → the key an Owner swimlane row is grouped by.
 *   P2  A Choice and a Yes/No column on a record: `getValue` raw (a number, the
 *       string "1" as chart-view measured, a boolean?), `getFormattedValue`.
 *       → the key a Choice / Yes-No row is grouped by.
 *   P3  `updateRecord(t, id, { 'ownerid@odata.bind': '/systemusers(<id>)' })`,
 *       then `/teams(<id>)`: accepted? What reads back?
 *       → whether an Owner row is a drop target at all.
 *   P4  One payload carrying `statecode` + `statuscode` + `ownerid@odata.bind`
 *       (a card dropped into another lane *and* another row).
 *       → one write or two.
 *   P5  The record route: `setValue` on the lane column and on a second
 *       Choice, then one `save()`.
 *       → a Choice row move with no Web API, as a 0.4.x lane move does.
 *   P6  `utils.hasEntityPrivilege(table, 5 /* Assign *\/, depth)`: callable, and
 *       its answers by depth beside Write (3). A user without Assign, through
 *       `write()`: the server's refusal.
 *       → whether Owner rows are offered as drop targets.
 *   P7  `dataset.sorting` replaced in place, then `refresh()`, on a subgrid and
 *       a main grid: is the order applied, does Load more continue in it, and
 *       does a main grid's own sort change for the user? `sortAssign` asks the
 *       same with `dataset.sorting = [...]` (the skill marks it unverified).
 *       → the sort route.
 *   P8  Sorting by a column **not in the view** (`createdon`, a role column with
 *       `order: -1`): applied, ignored, or thrown? `disableSorting` on the
 *       view's columns, read in `dump()`.
 *       → which columns the sort menu may list.
 *   P9  `dataset.sorting` in a **canvas** app: present, and does `sort()` change
 *       the order there?
 *       → whether canvas gets the menu.
 */

import { IInputs } from './generated/ManifestTypes';
import { ROLES } from './components/lanes';

type DataSet = ComponentFramework.PropertyTypes.DataSet;

interface LooseRecord {
    getValue: (name: string) => unknown;
    getFormattedValue: (name: string) => string;
    setValue?: (name: string, value: unknown) => unknown;
    save?: () => Promise<unknown>;
    isEditable?: (name: string) => Promise<boolean> | boolean;
}

interface LooseApi {
    retrieveRecord(entity: string, id: string, options?: string): Promise<Record<string, unknown>>;
    retrieveMultipleRecords(entity: string, options?: string): Promise<{ entities?: Record<string, unknown>[] }>;
    updateRecord(entity: string, id: string, data: Record<string, unknown>): Promise<unknown>;
}

interface SortStatus {
    name: string;
    sortDirection: number;
}

const TAG = '[KanbanProbe 0.4.8]';
const BUILD = 'kanban-probe-0.4.8';
const SWIMLANE = 'swimlaneField';

/** Everything a rejection carries, own and inherited, without `[object Object]`. */
function whole(error: unknown): unknown {
    if (typeof error !== 'object' || error === null) {
        return error;
    }

    const out: Record<string, unknown> = {};

    for (const key of Object.getOwnPropertyNames(error)) {
        out[key] = (error as Record<string, unknown>)[key];
    }

    return out;
}

const bare = (id: unknown): string => String(id ?? '').replace(/[{}]/g, '').toLowerCase();

export class Probe {
    private context: ComponentFramework.Context<IInputs> | null = null;
    private updateViews = 0;
    private published = false;

    /** How many more `updateView` passes print the order — set by sort() and more(). */
    private watch = 0;
    private watchColumn = '';

    /** Called from `updateView`. Keeps the latest context and publishes the global once. */
    public observe(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
        this.updateViews += 1;

        if (this.watch > 0) {
            this.watch -= 1;
            this.order(this.watchColumn, `updateView #${this.updateViews}`);
        }

        if (this.published) {
            return;
        }

        this.published = true;

        (window as unknown as { __pcfKanbanProbe: unknown }).__pcfKanbanProbe = {
            build: BUILD,
            dump: () => this.dump(),
            values: (column: string, count?: number) => this.values(column, count ?? 6),
            owners: () => this.owners(),
            write: (id: string, payload: Record<string, unknown>) => this.write(id, payload),
            read: (id: string, columns: string) => this.readBack(id, columns.split(',').map((c) => c.trim()), 'now'),
            stage: (id: string, values: Record<string, unknown>) => this.stage(id, values),
            sort: (column: string, direction?: number) => this.sort(column, direction ?? 0, false),
            sortAssign: (column: string, direction?: number) => this.sort(column, direction ?? 0, true),
            unsort: () => this.unsort(),
            more: () => this.more(),
            order: (column?: string) => this.order(column ?? this.watchColumn, 'asked'),
            help: () =>
                console.log(
                    TAG,
                    '\n dump()                               P1/P2 (role columns), P6, P7/P8 state, P9 host — no writes'
                        + '\n values("cll_priority")               P1/P2 — getValue / getFormattedValue of any column, first rows'
                        + '\n owners()                             ids of a few users and teams, for P3'
                        + '\n write(id, { "ownerid@odata.bind": "/teams(<id>)" })   P3/P4/P6 — one Web API update, read back'
                        + '\n read(id, "statuscode,_ownerid_value") the server\'s values'
                        + '\n stage(id, { cll_priority: 2, statuscode: 1 })          P5 — setValue each, one save(), read back'
                        + '\n sort("createdon", 1)                 P7/P8/P9 — replace dataset.sorting in place, refresh(); 0 asc, 1 desc'
                        + '\n sortAssign("createdon", 1)           P7 — the same by assigning dataset.sorting = [...]'
                        + '\n more()                               P7 — loadNextPage(), then the order'
                        + '\n unsort()                             empty dataset.sorting, refresh()'
                        + '\n order("createdon")                   the loaded order now',
                ),
        };

        console.log(TAG, 'ready — window.__pcfKanbanProbe.help()');
    }

    private get dataset(): DataSet | null {
        return this.context ? this.context.parameters.records : null;
    }

    private get api(): LooseApi | null {
        const api = this.context?.webAPI as unknown as LooseApi | undefined;

        return api && typeof api.retrieveRecord === 'function' ? api : null;
    }

    private record(id: string): LooseRecord | null {
        const dataset = this.dataset;
        const key = (dataset?.sortedRecordIds ?? []).find((candidate) => bare(candidate) === bare(id));

        return dataset && key ? (dataset.records[key] as unknown as LooseRecord) : null;
    }

    private clientUrl(): string | null {
        try {
            const page = (this.context as unknown as { page?: { getClientUrl?: () => string } }).page;

            return page?.getClientUrl ? page.getClientUrl() : null;
        } catch (error) {
            return `throws: ${String((error as Error)?.message ?? error)}`;
        }
    }

    private async dump(): Promise<void> {
        const dataset = this.dataset;
        const context = this.context;

        if (!dataset || !context) {
            console.log(TAG, 'no context yet');

            return;
        }

        const entity = dataset.getTargetEntityType();

        // P9 — which host this is.
        console.log(TAG, 'P9 host', { entity, clientUrl: this.clientUrl(), webAPI: this.api !== null, build: BUILD });

        // P8 — every column the dataset carries, with its sort flags.
        console.log(TAG, 'P8 columns', JSON.stringify((dataset.columns ?? []).map((column) => ({
            name: column.name,
            alias: column.alias,
            dataType: column.dataType,
            order: column.order,
            isHidden: (column as { isHidden?: unknown }).isHidden,
            disableSorting: (column as { disableSorting?: unknown }).disableSorting,
        }))));

        // P7 — the sort and paging as they stand.
        const sorting = (dataset as unknown as { sorting?: unknown }).sorting;

        console.log(TAG, 'P7 dataset.sorting', Array.isArray(sorting) ? JSON.stringify(sorting) : `not an array: ${typeof sorting}`);
        console.log(TAG, 'P7 getViewId()', JSON.stringify((dataset as unknown as { getViewId?: () => unknown }).getViewId?.()));
        console.log(TAG, 'P7 paging', {
            loaded: (dataset.sortedRecordIds ?? []).length,
            totalResultCount: dataset.paging.totalResultCount,
            hasNextPage: dataset.paging.hasNextPage,
            pageSize: dataset.paging.pageSize,
        });

        // P1/P2 — the swimlane role, whatever it is bound to, and ownerid when loaded.
        const swimlane = (dataset.columns ?? []).find((column) => column.alias === SWIMLANE);

        if (swimlane) {
            console.log(TAG, `P1/P2 swimlane role bound to ${swimlane.name} (${swimlane.dataType})`);
            this.values(swimlane.name, 6);
        } else {
            console.log(TAG, 'P1/P2 swimlane role not bound — bind it, or call values(column)');
        }

        if ((dataset.columns ?? []).some((column) => column.name === 'ownerid') && swimlane?.name !== 'ownerid') {
            this.values('ownerid', 6);
        }

        // P6 — Write (3) and Assign (5) by depth.
        const utils = context.utils as unknown as {
            hasEntityPrivilege?: (entity: string, type: number, depth: number) => unknown;
        };

        if (typeof utils?.hasEntityPrivilege !== 'function') {
            console.log(TAG, 'P6 no utils.hasEntityPrivilege here');
        } else {
            const matrix: Record<string, unknown> = {};

            for (const [label, type] of [['Write', 3], ['Assign', 5], ['Share', 6], ['AppendTo', 8]] as const) {
                for (const depth of [0, 1, 2, 3]) {
                    try {
                        matrix[`${label}(${type}) depth ${depth}`] = utils.hasEntityPrivilege(entity, type, depth);
                    } catch (error) {
                        matrix[`${label}(${type}) depth ${depth}`] = `throws: ${String((error as Error)?.message ?? error)}`;
                    }
                }
            }

            console.log(TAG, 'P6 hasEntityPrivilege', JSON.stringify(matrix));
        }

        console.log(TAG, 'updateViews so far', this.updateViews);
    }

    /** P1/P2: what a column's value looks like on the first rows. */
    private values(column: string, count: number): void {
        const dataset = this.dataset;

        if (!dataset) {
            return;
        }

        const rows = (dataset.sortedRecordIds ?? []).slice(0, count).map((id) => {
            const record = dataset.records[id] as unknown as LooseRecord;
            let raw: unknown;
            let formatted: unknown;

            try {
                raw = record.getValue(column);
            } catch (error) {
                raw = `throws: ${String((error as Error)?.message ?? error)}`;
            }

            try {
                formatted = record.getFormattedValue(column);
            } catch (error) {
                formatted = `throws: ${String((error as Error)?.message ?? error)}`;
            }

            return {
                id,
                typeof: raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw,
                raw: JSON.stringify(raw),
                keys: raw && typeof raw === 'object' ? Object.keys(raw) : null,
                formatted,
            };
        });

        console.log(TAG, `P1/P2 values of ${column}`, JSON.stringify(rows, null, 1));
    }

    /** Ids of a few enabled users and teams, so P3 has something to bind. */
    private async owners(): Promise<void> {
        const api = this.api;

        if (!api) {
            console.log(TAG, 'owners: no webAPI');

            return;
        }

        try {
            const users = await api.retrieveMultipleRecords('systemuser', '?$select=fullname&$filter=isdisabled eq false and accessmode eq 0&$top=6');

            console.log(TAG, 'users', JSON.stringify((users.entities ?? []).map((u) => [u.systemuserid, u.fullname])));
        } catch (error) {
            console.log(TAG, 'users refused', whole(error));
        }

        try {
            const teams = await api.retrieveMultipleRecords('team', '?$select=name,teamtype&$top=6');

            console.log(TAG, 'teams', JSON.stringify((teams.entities ?? []).map((t) => [t.teamid, t.name, t.teamtype])));
        } catch (error) {
            console.log(TAG, 'teams refused', whole(error));
        }
    }

    /** The columns a payload touches, as the server spells them on a read. */
    private readColumns(payload: Record<string, unknown>): string[] {
        return Object.keys(payload).map((key) => {
            const bind = /^(.+)@odata\.bind$/.exec(key);

            return bind ? `_${bind[1]}_value` : key;
        });
    }

    /** P3/P4/P6: one Web API update with exactly the payload given, read back either side. */
    private async write(id: string, payload: Record<string, unknown>): Promise<void> {
        const dataset = this.dataset;
        const api = this.api;

        if (!dataset || !api) {
            console.log(TAG, 'write cannot run: no dataset or no webAPI');

            return;
        }

        const entity = dataset.getTargetEntityType();
        const columns = this.readColumns(payload);

        await this.readBack(id, columns, 'before');
        console.log(TAG, 'write', entity, bare(id), JSON.stringify(payload));

        const started = performance.now();

        try {
            const result = await api.updateRecord(entity, bare(id), payload);

            console.log(TAG, `write resolved in ${Math.round(performance.now() - started)} ms`, JSON.stringify(result));
        } catch (error) {
            console.log(TAG, 'write refused', whole(error));
        }

        await this.readBack(id, columns, 'after');
    }

    private async readBack(id: string, columns: string[], when: string): Promise<void> {
        const dataset = this.dataset;
        const api = this.api;

        if (!dataset || !api || columns.length === 0) {
            return;
        }

        try {
            const row = await api.retrieveRecord(dataset.getTargetEntityType(), bare(id), `?$select=${columns.join(',')}`);

            console.log(TAG, `read ${when}`, JSON.stringify(row));
        } catch (error) {
            console.log(TAG, `read ${when} refused`, whole(error));
        }
    }

    /** P5: the record route with several staged columns and one save. */
    private async stage(id: string, values: Record<string, unknown>): Promise<void> {
        const record = this.record(id);

        if (!record || typeof record.setValue !== 'function' || typeof record.save !== 'function') {
            console.log(TAG, 'P5 no record with setValue/save for', id);

            return;
        }

        for (const column of Object.keys(values)) {
            const editable = typeof record.isEditable === 'function' ? await Promise.resolve(record.isEditable(column)) : 'no isEditable';

            console.log(TAG, `P5 isEditable(${column}) =`, editable, '; before', JSON.stringify(record.getValue(column)));
        }

        try {
            for (const [column, value] of Object.entries(values)) {
                const returned = record.setValue(column, value);

                console.log(TAG, `P5 setValue(${column}, ${JSON.stringify(value)}) returned`, returned, '; now', JSON.stringify(record.getValue(column)));
            }

            const started = performance.now();
            const saved = await record.save();

            console.log(TAG, `P5 save resolved in ${Math.round(performance.now() - started)} ms`, JSON.stringify(saved));
        } catch (error) {
            console.log(TAG, 'P5 refused', whole(error));
        }

        await this.readBack(id, Object.keys(values), 'after save');
    }

    /** P7/P8/P9: a one-column sort, then the order on the next few passes. */
    private sort(column: string, direction: number, assign: boolean): void {
        const dataset = this.dataset;

        if (!dataset) {
            return;
        }

        const holder = dataset as unknown as { sorting?: SortStatus[] };
        const wanted: SortStatus = { name: column, sortDirection: direction };

        this.order(column, 'before');

        try {
            if (assign) {
                holder.sorting = [wanted];
            } else if (Array.isArray(holder.sorting)) {
                holder.sorting.length = 0;
                holder.sorting.push(wanted);
            } else {
                console.log(TAG, 'P7 dataset.sorting is not an array:', typeof holder.sorting);

                return;
            }

            console.log(TAG, `P7 sorting now (${assign ? 'assigned' : 'in place'})`, JSON.stringify(holder.sorting));
            this.watch = 4;
            this.watchColumn = column;
            dataset.refresh();
            console.log(TAG, 'P7 refresh() returned');
        } catch (error) {
            console.log(TAG, 'P7/P8 sort threw', whole(error));
        }
    }

    private unsort(): void {
        const dataset = this.dataset;
        const holder = dataset as unknown as { sorting?: SortStatus[] } | null;

        if (!dataset || !Array.isArray(holder?.sorting)) {
            return;
        }

        holder.sorting.length = 0;
        this.watch = 3;
        dataset.refresh();
    }

    private more(): void {
        const dataset = this.dataset;

        if (!dataset) {
            return;
        }

        console.log(TAG, 'P7 loadNextPage(), hasNextPage was', dataset.paging.hasNextPage);
        this.watch = 3;
        dataset.paging.loadNextPage();
    }

    /** The loaded order: title, and the sort column's formatted value. */
    private order(column: string, when: string): void {
        const dataset = this.dataset;

        if (!dataset) {
            return;
        }

        const title = (dataset.columns ?? []).find((c) => c.alias === ROLES.title);
        const ids = dataset.sortedRecordIds ?? [];
        const rows = ids.map((id) => {
            const record = dataset.records[id] as unknown as LooseRecord;
            let value: unknown = '';

            if (column !== '') {
                try {
                    value = record.getFormattedValue(column);
                } catch (error) {
                    value = `throws: ${String((error as Error)?.message ?? error)}`;
                }
            }

            return `${title ? record.getFormattedValue(title.name) : id} | ${String(value)}`;
        });

        console.log(TAG, `order ${when} (${ids.length} loaded, sorting ${JSON.stringify((dataset as unknown as { sorting?: unknown }).sorting)}, loading ${dataset.loading})`, rows);
    }
}
