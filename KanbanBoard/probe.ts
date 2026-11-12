/*
 * THE 0.5.4 PROBE. Delete this file, and its import in index.ts, before 0.6.0.
 *
 * A throwaway build that asks the live form what 0.6.0 — cards in your own
 * order, and many at once — rests on, before a line of either exists. An
 * answer that goes the wrong way removes the feature that depends on it.
 * Every answer goes into SPEC.md as *Measured*, with the date.
 *
 * `window.__pcfKanbanProbe.help()` lists the calls. Each call **returns** its
 * answer as well as logging it, so it can be read from a console or a script.
 * The last-mounted board owns the global. The bundle carries
 * `kanban-probe-0.5.4`, which is how to confirm the page runs this build.
 *
 *   Q1  The order role bound to a column outside the view: in
 *       `dataset.columns`, with what `order`; `getValue` and
 *       `getFormattedValue` of a set and an unset value.        → dump()
 *   Q2  A sort on it in place + refresh(): nulls first? Load more after it.
 *                                                                → sort(), more()
 *   Q3  The rank alone through the record: isEditable, setValue, save, the
 *       read-back; getValue after the save and after loadNextPage. → stage(), more()
 *   Q4  A Choice lane and the rank in one save.                  → stage()
 *   Q5  The state pair and the rank in one updateRecord.         → write()
 *   Q6  The column's range: getEntityMetadata and the attribute definition.
 *                                                                → range()
 *   Q7  A value past the maximum, through the record and the Web API: how it
 *       is refused, and whether the record keeps it.             → refuse(), write()
 *   Q8  setSelectedRecordIds with no command bar: updateView, survival
 *       through refresh() and loadNextPage(), the form's grid API. → select(), selected()
 *   Q9  openForm (quick create) with the lane and the rank as parameters.
 *                                                                → create()
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
    updateRecord(entity: string, id: string, data: Record<string, unknown>): Promise<unknown>;
}

interface SortStatus {
    name: string;
    sortDirection: number;
}

const TAG = '[KanbanProbe 0.5.4]';
const BUILD = 'kanban-probe-0.5.4';

/** Everything a rejection carries, own and inherited, without `[object Object]`. */
function whole(error: unknown): unknown {
    if (typeof error !== 'object' || error === null) {
        return error;
    }

    const out: Record<string, unknown> = {};

    for (const key of Object.getOwnPropertyNames(error)) {
        const value = (error as Record<string, unknown>)[key];

        out[key] = typeof value === 'function' ? 'function' : value;
    }

    return out;
}

const bare = (id: unknown): string => String(id ?? '').replace(/[{}]/g, '').toLowerCase();
const said = (label: string, value: unknown): unknown => {
    console.log(TAG, label, JSON.stringify(value, null, 1));

    return value;
};
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class Probe {
    private context: ComponentFramework.Context<IInputs> | null = null;
    private updateViews = 0;
    private published = false;

    /** Called from `updateView`. Keeps the latest context and publishes the global once. */
    public observe(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
        this.updateViews += 1;

        if (this.published) {
            return;
        }

        this.published = true;

        (window as unknown as { __pcfKanbanProbe: unknown }).__pcfKanbanProbe = {
            build: BUILD,
            dump: () => this.dump(),
            values: (column: string, count?: number) => this.values(column, count ?? 8),
            order: () => this.order('asked'),
            sort: (column: string, direction?: number) => this.sort(column, direction ?? 0),
            more: () => this.more(),
            stage: (id: string, values: Record<string, unknown>) => this.stage(id, values),
            write: (id: string, payload: Record<string, unknown>) => this.write(id, payload),
            read: (id: string, columns: string) => this.readBack(id, columns.split(',').map((c) => c.trim())),
            range: (column?: string) => this.range(column),
            refuse: (id: string, value: number) => this.refuse(id, value),
            select: (ids: string[]) => this.select(ids),
            selected: (after?: 'refresh' | 'more') => this.selected(after),
            create: (lane: number, order: number) => this.create(lane, order),
            help: () =>
                console.log(
                    TAG,
                    '\n dump()                                 Q1 — columns, sort, paging, the order role\'s values'
                        + '\n values("cll_boardorder")             getValue / getFormattedValue of any column, first rows'
                        + '\n order()                                the loaded order now: title | lane | order value'
                        + '\n sort("cll_boardorder", 0)            Q2 — dataset.sorting in place, refresh(); 0 asc, 1 desc'
                        + '\n more()                                 Q2/Q3 — loadNextPage(), then the order'
                        + '\n stage(id, { cll_boardorder: 5 })     Q3/Q4 — isEditable, setValue each, one save(), read back'
                        + '\n write(id, { statecode: 0, statuscode: 1, cll_boardorder: 5 })   Q5/Q7 — one updateRecord'
                        + '\n read(id, "cll_boardorder,statuscode") the server\'s values'
                        + '\n range()                                Q6 — the order column\'s MinValue / MaxValue'
                        + '\n refuse(id, 2000000)                    Q7 — a value past the maximum through the record'
                        + '\n select([id1, id2])                     Q8 — setSelectedRecordIds, then what sees them'
                        + '\n selected("refresh" | "more")          Q8 — getSelectedRecordIds after a refresh or Load more'
                        + '\n create(laneValue, orderValue)          Q9 — quick create with both as parameters',
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

    private role(alias: string): string | null {
        const column = (this.dataset?.columns ?? []).find((each) => each.alias === alias
            && typeof each.name === 'string' && each.name !== '');

        return column ? column.name : null;
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
        } catch {
            return null;
        }
    }

    /** Wait for the platform to answer a mutator: a new updateView with loading false, or the timeout. */
    private async settle(since: number, ms = 20000): Promise<boolean> {
        const until = Date.now() + ms;

        while (Date.now() < until) {
            await pause(250);

            if (this.updateViews > since && this.dataset && !this.dataset.loading) {
                await pause(500);

                return true;
            }
        }

        return false;
    }

    private dump(): unknown {
        const dataset = this.dataset;

        if (!dataset) {
            return said('no context yet', null);
        }

        const order = this.role(ROLES.order);

        return said('Q1 dump', {
            build: BUILD,
            entity: dataset.getTargetEntityType(),
            clientUrl: this.clientUrl(),
            webAPI: this.api !== null,
            columns: (dataset.columns ?? []).map((column) => ({
                name: column.name,
                alias: column.alias,
                dataType: column.dataType,
                order: column.order,
                isHidden: (column as { isHidden?: unknown }).isHidden,
            })),
            sorting: (dataset as unknown as { sorting?: unknown }).sorting,
            viewId: (dataset as unknown as { getViewId?: () => unknown }).getViewId?.(),
            paging: {
                loaded: (dataset.sortedRecordIds ?? []).length,
                totalResultCount: dataset.paging.totalResultCount,
                hasNextPage: dataset.paging.hasNextPage,
                pageSize: dataset.paging.pageSize,
            },
            orderRole: order,
            values: order ? this.values(order, 50, true) : 'the order role is not bound',
            updateViews: this.updateViews,
        });
    }

    private values(column: string, count: number, quiet = false): unknown {
        const dataset = this.dataset;

        if (!dataset) {
            return null;
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

            return { id, typeof: raw === null ? 'null' : typeof raw, raw, formatted };
        });

        return quiet ? rows : said(`values of ${column}`, rows);
    }

    /** The loaded order: title | lane label | order value. */
    private order(when: string): unknown {
        const dataset = this.dataset;

        if (!dataset) {
            return null;
        }

        const title = this.role(ROLES.title);
        const lane = this.role(ROLES.status);
        const order = this.role(ROLES.order);
        const rows = (dataset.sortedRecordIds ?? []).map((id) => {
            const record = dataset.records[id] as unknown as LooseRecord;

            return `${title ? record.getFormattedValue(title) : id} | ${lane ? record.getFormattedValue(lane) : ''} | ${
                order ? JSON.stringify(record.getValue(order)) : '-'} | ${bare(id).slice(0, 8)}`;
        });

        return said(`order ${when}`, {
            loaded: rows.length,
            hasNextPage: dataset.paging.hasNextPage,
            sorting: (dataset as unknown as { sorting?: unknown }).sorting,
            rows,
        });
    }

    /** Q2: a one-column sort in place, refresh(), and the order once it lands. */
    private async sort(column: string, direction: number): Promise<unknown> {
        const dataset = this.dataset;
        const holder = dataset as unknown as { sorting?: SortStatus[] } | null;

        if (!dataset || !Array.isArray(holder?.sorting)) {
            return said('Q2 no dataset.sorting array', null);
        }

        holder.sorting.length = 0;
        holder.sorting.push({ name: column, sortDirection: direction });

        const since = this.updateViews;

        dataset.paging.reset();
        dataset.refresh();

        const landed = await this.settle(since);

        return { landed, ...(this.order(`after sort(${column}, ${direction})`) as object) };
    }

    /** Q2/Q3: loadNextPage, and the order once it lands. */
    private async more(): Promise<unknown> {
        const dataset = this.dataset;

        if (!dataset) {
            return null;
        }

        const since = this.updateViews;

        dataset.paging.loadNextPage();

        const landed = await this.settle(since);

        return { landed, ...(this.order('after loadNextPage()') as object) };
    }

    /** Q3/Q4: isEditable, setValue each, one save, getValue around it, the server's read-back. */
    private async stage(id: string, values: Record<string, unknown>): Promise<unknown> {
        const record = this.record(id);
        const out: Record<string, unknown> = { id: bare(id), values };

        if (!record || typeof record.setValue !== 'function' || typeof record.save !== 'function') {
            return said('Q3/Q4 no record with setValue/save for', id);
        }

        out.before = await this.readBack(id, Object.keys(values), true);

        for (const column of Object.keys(values)) {
            out[`isEditable(${column})`] = typeof record.isEditable === 'function'
                ? await Promise.resolve(record.isEditable(column))
                : 'no isEditable';
            out[`getValue(${column}) before`] = record.getValue(column);
        }

        try {
            for (const [column, value] of Object.entries(values)) {
                const returned = record.setValue(column, value);

                out[`setValue(${column}) returned`] = returned === undefined ? 'undefined' : typeof returned;
                out[`getValue(${column}) after setValue`] = record.getValue(column);
            }

            const started = performance.now();

            await record.save();
            out.save = `resolved in ${Math.round(performance.now() - started)} ms`;
        } catch (error) {
            out.save = { refused: whole(error) };
        }

        for (const column of Object.keys(values)) {
            out[`getValue(${column}) after save`] = record.getValue(column);
        }

        out.after = await this.readBack(id, Object.keys(values), true);

        return said('Q3/Q4 stage', out);
    }

    /** Q5/Q7: one updateRecord with exactly the payload given, read back either side. */
    private async write(id: string, payload: Record<string, unknown>): Promise<unknown> {
        const dataset = this.dataset;
        const api = this.api;

        if (!dataset || !api) {
            return said('write cannot run: no dataset or no webAPI', null);
        }

        const columns = Object.keys(payload);
        const out: Record<string, unknown> = { id: bare(id), payload };

        out.before = await this.readBack(id, columns, true);

        const started = performance.now();

        try {
            await api.updateRecord(dataset.getTargetEntityType(), bare(id), payload);
            out.write = `resolved in ${Math.round(performance.now() - started)} ms`;
        } catch (error) {
            out.write = { refused: whole(error) };
        }

        out.after = await this.readBack(id, columns, true);

        return said('Q5/Q7 write', out);
    }

    private async readBack(id: string, columns: string[], quiet = false): Promise<unknown> {
        const dataset = this.dataset;
        const api = this.api;

        if (!dataset || !api || columns.length === 0) {
            return null;
        }

        try {
            const row = await api.retrieveRecord(dataset.getTargetEntityType(), bare(id), `?$select=${columns.join(',')}`);
            const picked = Object.fromEntries(columns.map((column) => [column, row[column]]));

            return quiet ? picked : said('read', picked);
        } catch (error) {
            return { refused: whole(error) };
        }
    }

    /** Q6: what the platform says about the order column's range. */
    private async range(column?: string): Promise<unknown> {
        const dataset = this.dataset;
        const name = column ?? this.role(ROLES.order);
        const out: Record<string, unknown> = { column: name };

        if (!dataset || !name || !this.context) {
            return said('Q6 no order column', null);
        }

        const entity = dataset.getTargetEntityType();

        try {
            const metadata = await new Promise<unknown>((resolve) => resolve(this.context?.utils.getEntityMetadata(entity, [name])));
            const attributes = (metadata as { Attributes?: unknown })?.Attributes as
                { get?: (n: string) => unknown; _collection?: Record<string, unknown> } | undefined;
            const node = attributes?.get?.(name) ?? attributes?._collection?.[name];

            out.getEntityMetadata = node && typeof node === 'object'
                ? Object.fromEntries(Object.entries(node as Record<string, unknown>)
                    .filter(([key]) => /min|max|value|type|format|precision/i.test(key))
                    .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value]))
                : { found: false, attributesKeys: attributes ? Object.keys(attributes) : null };
        } catch (error) {
            out.getEntityMetadata = { threw: whole(error) };
        }

        const clientUrl = this.clientUrl();

        if (clientUrl) {
            try {
                const response = await fetch(`${clientUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')`
                    + `/Attributes(LogicalName='${name}')/Microsoft.Dynamics.CRM.IntegerAttributeMetadata`
                    + '?$select=MinValue,MaxValue,Format', {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });

                out.definition = { status: response.status, body: await response.json() };
            } catch (error) {
                out.definition = { threw: whole(error) };
            }
        }

        return said('Q6 range', out);
    }

    /** Q7: a value past the maximum through the record — and what the record keeps after. */
    private async refuse(id: string, value: number): Promise<unknown> {
        const record = this.record(id);
        const order = this.role(ROLES.order);
        const out: Record<string, unknown> = { id: bare(id), value };

        if (!record || !order || typeof record.setValue !== 'function' || typeof record.save !== 'function') {
            return said('Q7 no record or no order role', null);
        }

        const original = record.getValue(order);

        out.original = original;

        try {
            record.setValue(order, value);
            out.setValue = 'returned';
        } catch (error) {
            out.setValue = { threw: whole(error) };
        }

        out['getValue after setValue'] = record.getValue(order);

        try {
            await record.save();
            out.save = 'resolved';
        } catch (error) {
            out.save = { refused: whole(error) };
        }

        out['getValue after the refusal'] = record.getValue(order);
        out['server after the refusal'] = await this.readBack(id, [order], true);

        // Nothing new staged: does a second save send the refused value again?
        try {
            await record.save();
            out['second save, nothing staged'] = 'resolved';
        } catch (error) {
            out['second save, nothing staged'] = { refused: whole(error) };
        }

        // The write-back Data Table 0.9.0 does (its R5).
        try {
            record.setValue(order, original);
            await record.save();
            out['write the original back'] = 'resolved';
        } catch (error) {
            out['write the original back'] = { refused: whole(error) };
        }

        out['getValue at the end'] = record.getValue(order);
        out['server at the end'] = await this.readBack(id, [order], true);

        return said('Q7 refuse', out);
    }

    /** Q8: set a selection with no command bar, then look at everything that might see it. */
    private async select(ids: string[]): Promise<unknown> {
        const dataset = this.dataset;

        if (!dataset) {
            return null;
        }

        const keys = ids.map((id) => (dataset.sortedRecordIds ?? []).find((each) => bare(each) === bare(id)) ?? id);
        const since = this.updateViews;
        const out: Record<string, unknown> = { asked: keys };

        try {
            dataset.setSelectedRecordIds(keys);
            out.set = 'returned';
        } catch (error) {
            out.set = { threw: whole(error) };
        }

        await pause(2000);
        out.updateViewsSince = this.updateViews - since;
        out.getSelectedRecordIds = dataset.getSelectedRecordIds();
        out.grids = this.grids();

        return said('Q8 select', out);
    }

    /** Q8: the selection after a refresh or a Load more. */
    private async selected(after?: 'refresh' | 'more'): Promise<unknown> {
        const dataset = this.dataset;

        if (!dataset) {
            return null;
        }

        const out: Record<string, unknown> = { before: dataset.getSelectedRecordIds() };

        if (after) {
            const since = this.updateViews;

            if (after === 'more') {
                dataset.paging.loadNextPage();
            } else {
                dataset.refresh();
            }

            out.landed = await this.settle(since);
        }

        out.after = this.dataset?.getSelectedRecordIds();
        out.grids = this.grids();

        return said(`Q8 selected (${after ?? 'now'})`, out);
    }

    /** Every subgrid control on the form, with what its grid API calls selected. */
    private grids(): unknown {
        const xrm = (globalThis as { Xrm?: { Page?: { ui?: { controls?: { get?: () => unknown[] } } } } }).Xrm;
        const controls = xrm?.Page?.ui?.controls?.get?.() ?? [];

        return (controls as {
            getControlType?: () => string;
            getName?: () => string;
            getGrid?: () => { getSelectedRows?: () => { getLength?: () => number; get?: () => unknown[] } };
        }[])
            .filter((control) => control.getControlType?.() === 'subgrid')
            .map((control) => {
                try {
                    const rows = control.getGrid?.()?.getSelectedRows?.();
                    const list = (rows?.get?.() ?? []) as { getData?: () => { getEntity?: () => { getId?: () => string } } }[];

                    return {
                        name: control.getName?.(),
                        selected: rows?.getLength?.(),
                        ids: list.map((row) => bare(row.getData?.()?.getEntity?.()?.getId?.())),
                    };
                } catch (error) {
                    return { name: control.getName?.(), threw: String((error as Error)?.message ?? error) };
                }
            });
    }

    /** Q9: the quick create with the lane and the rank as parameters, and the created task's rank. */
    private async create(lane: number, order: number): Promise<unknown> {
        const dataset = this.dataset;
        const laneColumn = this.role(ROLES.status);
        const orderColumn = this.role(ROLES.order);
        const navigation = this.context?.navigation as unknown as
            { openForm?: (options: Record<string, unknown>, parameters?: Record<string, string>) => Promise<unknown> } | undefined;

        if (!dataset || !laneColumn || !orderColumn || typeof navigation?.openForm !== 'function') {
            return said('Q9 cannot run', { laneColumn, orderColumn });
        }

        const parameters = { [laneColumn]: String(lane), [orderColumn]: String(order) };
        const out: Record<string, unknown> = { parameters };

        try {
            const result = await navigation.openForm(
                { entityName: dataset.getTargetEntityType(), useQuickCreateForm: true },
                parameters,
            );

            out.result = result;

            const saved = (result as { savedEntityReference?: { id?: string }[] } | null)?.savedEntityReference;
            const created = Array.isArray(saved) ? saved[0]?.id : undefined;

            if (created) {
                out.created = await this.readBack(created, [laneColumn, orderColumn], true);
            }
        } catch (error) {
            out.result = { threw: whole(error) };
        }

        return said('Q9 create', out);
    }
}
