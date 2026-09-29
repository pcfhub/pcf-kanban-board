/*
 * THE 0.3.6 PROBE. Delete this file, and its import in index.ts, before 0.4.0.
 *
 * A throwaway build whose only job is to ask the live form what 0.4.0 rests on
 * — lane totals from the server, and status-reason transitions — before a line
 * of either exists. An answer that goes the wrong way removes the feature that
 * depends on it. Every answer goes into SPEC.md as *Measured*, with the date.
 *
 * Passive part: `window.__pcfKanbanProbe.dump()` logs everything that needs no
 * write. Active part: `agg(column)` and `write(id, payload)`. `help()` lists
 * them. The last-mounted board owns the global, so probe one board at a time.
 *
 * The questions, and the 0.4.0 feature each decides:
 *
 *   T1  Can the Lane role bind Status Reason (statuscode), or Status
 *       (statecode)? Read off the bound column's name and dataType.
 *       → transitions exist only on a statuscode board.
 *   T2  What `getEntityMetadata(table, ['statuscode'])` carries per option under
 *       `attributeDescriptor.OptionSet`: `State`? `TransitionData`, and as what
 *       — an XML string, a parsed list, null?
 *       → where the board reads a reason's state and its allowed next reasons.
 *   T3  Whether the table's *Enforce transitions* switch is readable from
 *       `getEntityMetadata` (the entity descriptor) or only from a same-origin
 *       `EntityDefinitions` fetch — and what the fetch says about the options.
 *       → whether a board greys out lanes only where the platform enforces.
 *   T4  `updateRecord({ statuscode })` to a reason in the *other* state: does
 *       the server infer the state, or refuse? The exact rejection.
 *   T5  `updateRecord({ statecode, statuscode })` together: accepted?
 *   T6  A transition outside `TransitionData` with enforcement on: refused? The
 *       exact rejection.
 *       → T4–T6 decide the write: pair the state, and whether the server is the
 *         guard (the board only hints) or the board has to be.
 *   T7  `isEditable` on the first record for statecode, statuscode and the lane
 *       column; whether statecode is on the record at all when not in the view.
 *
 *   A1  `getViewId()` on this board, and whether its FetchXML is readable
 *       (`savedquery`, then `userquery`).
 *   A2  An aggregate over the view grouped by the lane column, with the sum of
 *       a numeric column and a count: the raw rows, each alias's annotations,
 *       how a Choice/Status group value arrives, and a Money sum's shape.
 *   A3  The subgrid's relationship: `contextInfo`, the lookups on this table to
 *       the form's table, what the loaded rows say about each, and the count
 *       with the resolved condition against the loaded count and
 *       `paging.totalResultCount`.
 *       → A1–A3 decide the server route for lane totals, or its withholding.
 */

import { IInputs } from './generated/ManifestTypes';
import { ROLES, describeShape } from './components/lanes';

type DataSet = ComponentFramework.PropertyTypes.DataSet;

interface LooseRecord {
    isEditable?: (name: string) => Promise<boolean> | boolean;
    getValue: (name: string) => unknown;
}

interface LooseApi {
    retrieveRecord(entity: string, id: string, options?: string): Promise<Record<string, unknown>>;
    retrieveMultipleRecords(entity: string, options?: string): Promise<{ entities?: Record<string, unknown>[] }>;
    updateRecord(entity: string, id: string, data: Record<string, unknown>): Promise<unknown>;
}

const TAG = '[KanbanProbe 0.3.7]';
const BUILD = 'kanban-probe-0.3.7';

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
            agg: (column: string, parent?: string) => this.aggregate(column, parent),
            write: (id: string, payload: Record<string, unknown>) => this.write(id, payload),
            read: (id: string) => this.readBack(id),
            help: () =>
                console.log(
                    TAG,
                    '\n dump()                       T1–T3, T7, A1 — no writes' +
                        '\n agg("cll_amount")            A2/A3 — sum that column per lane, with and without the parent condition' +
                        '\n agg("cll_amount", "col")     A3 — force the parent lookup column' +
                        '\n write(id, { statuscode: n }) T4–T6 — one Web API update, then read back' +
                        '\n read(id)                     statecode and statuscode as the server has them',
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

    private clientUrl(): string | null {
        try {
            const page = (this.context as unknown as { page?: { getClientUrl?: () => string } }).page;

            return page?.getClientUrl ? page.getClientUrl() : null;
        } catch {
            return null;
        }
    }

    private async metadataFetch(path: string): Promise<unknown> {
        const base = this.clientUrl();

        if (!base) {
            return 'no client url';
        }

        const response = await fetch(`${base}/api/data/v9.2/${path}`, {
            headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
            credentials: 'same-origin',
        });

        return { status: response.status, body: await response.json().catch(() => null) };
    }

    private async dump(): Promise<void> {
        const dataset = this.dataset;
        const context = this.context;

        if (!dataset || !context) {
            console.log(TAG, 'no context yet');

            return;
        }

        const entity = dataset.getTargetEntityType();
        const lane = (dataset.columns ?? []).find((column) => column.alias === ROLES.status);
        const ids = dataset.sortedRecordIds ?? [];

        // T1
        console.log(TAG, 'T1 lane column', lane ? { name: lane.name, alias: lane.alias, dataType: lane.dataType } : null, 'on', entity);

        // T2 + T3 (descriptor)
        const utils = context.utils as unknown as { getEntityMetadata?: (e: string, a: string[]) => Promise<unknown> } | undefined;

        if (typeof utils?.getEntityMetadata === 'function') {
            try {
                const columns = ['statuscode', 'statecode', ...(lane ? [lane.name] : [])];
                const metadata = (await utils.getEntityMetadata(entity, columns)) as {
                    Attributes?: { get?: (n: string) => unknown };
                    _entityDescriptor?: Record<string, unknown>;
                };

                for (const column of ['statuscode', 'statecode']) {
                    const node = metadata.Attributes?.get?.(column) as { attributeDescriptor?: { OptionSet?: unknown[] } } | undefined;
                    const options = node?.attributeDescriptor?.OptionSet;

                    console.log(TAG, `T2 ${column} descriptor option keys`, Array.isArray(options) && options[0] ? Object.keys(options[0] as object) : describeShape(node));
                    console.log(TAG, `T2 ${column} descriptor options`, JSON.stringify(options ?? null));
                }

                const descriptor = metadata._entityDescriptor ?? {};
                const interesting = Object.keys(descriptor).filter((key) => /transition|enforce|state/i.test(key));

                console.log(TAG, 'T3 entity descriptor keys matching transition/enforce/state', interesting.map((key) => [key, descriptor[key]]));
                console.log(TAG, 'T3 entity descriptor has', Object.keys(descriptor).length, 'keys');
            } catch (error) {
                console.log(TAG, 'T2/T3 getEntityMetadata refused', whole(error));
            }
        } else {
            console.log(TAG, 'T2/T3 no utils.getEntityMetadata here');
        }

        // T3 (EntityDefinitions)
        console.log(TAG, 'T3 EntityDefinitions EnforceStateTransitions',
            JSON.stringify(await this.metadataFetch(`EntityDefinitions(LogicalName='${entity}')?$select=LogicalName,EnforceStateTransitions`)));
        console.log(TAG, 'T3 EntityDefinitions statuscode options',
            JSON.stringify(await this.metadataFetch(
                `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet`,
            )));

        // T7
        const first = ids[0] ? (dataset.records[ids[0]] as unknown as LooseRecord) : null;

        if (first && typeof first.isEditable === 'function') {
            for (const column of ['statecode', 'statuscode', ...(lane ? [lane.name] : [])]) {
                console.log(TAG, `T7 isEditable(${column}) =`, await Promise.resolve(first.isEditable(column)), '; getValue =', JSON.stringify(first.getValue(column)));
            }
        } else {
            console.log(TAG, 'T7 no first record with isEditable', { rows: ids.length });
        }

        // A1
        const viewId = (dataset as unknown as { getViewId?: () => unknown }).getViewId?.();

        console.log(TAG, 'A1 getViewId()', JSON.stringify(viewId));
        console.log(TAG, 'A1 view FetchXML', await this.viewXml(typeof viewId === 'string' ? viewId : ''));
        console.log(TAG, 'A1 paging', { loaded: ids.length, totalResultCount: dataset.paging.totalResultCount, hasNextPage: dataset.paging.hasNextPage, pageSize: dataset.paging.pageSize });
        console.log(TAG, 'A1 getFilter()', JSON.stringify(dataset.filtering.getFilter()));
        console.log(TAG, 'A3 contextInfo', JSON.stringify((context.mode as unknown as { contextInfo?: unknown }).contextInfo));
        console.log(TAG, 'build', BUILD, 'updateViews so far', this.updateViews);
    }

    private async viewXml(viewId: string): Promise<string | null> {
        const api = this.api;

        if (!api || viewId === '') {
            return null;
        }

        for (const table of ['savedquery', 'userquery']) {
            try {
                const row = await api.retrieveRecord(table, viewId, '?$select=fetchxml');

                if (typeof row.fetchxml === 'string') {
                    return `${table}: ${row.fetchxml}`;
                }
            } catch (error) {
                console.log(TAG, `A1 ${table} refused`, whole(error));
            }
        }

        return null;
    }

    /** A2 + A3: the lane aggregate, sent both without and with the resolved parent condition. */
    private async aggregate(sumColumn: string, forcedParent?: string): Promise<void> {
        const dataset = this.dataset;
        const context = this.context;
        const api = this.api;

        if (!dataset || !context || !api) {
            console.log(TAG, 'A2 cannot run: no dataset or no webAPI');

            return;
        }

        const entity = dataset.getTargetEntityType();
        const lane = (dataset.columns ?? []).find((column) => column.alias === ROLES.status);

        if (!lane) {
            console.log(TAG, 'A2 no lane column bound');

            return;
        }

        const viewId = String((dataset as unknown as { getViewId?: () => unknown }).getViewId?.() ?? '');
        const view = await this.viewXml(viewId);
        const viewBody = view ? view.slice(view.indexOf(':') + 2) : null;

        // The Data Table / Chart View rewrite, inline and unrefined: strip, group, sum, count.
        const stripped = viewBody
            ?.replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<attribute\b[^>]*\/>/g, '')
            .replace(/<attribute\b[^>]*>[\s\S]*?<\/attribute>/g, '')
            .replace(/<all-attributes\s*\/>/g, '')
            .replace(/<order\b[^>]*\/>/g, '')
            .replace(/<order\b[^>]*>[\s\S]*?<\/order>/g, '');
        const open = stripped ? /<entity\b[^>]*>/.exec(stripped) : null;
        const inner = stripped && open ? stripped.slice(open.index + open[0].length, stripped.lastIndexOf('</entity>')) : '';
        const primaryId = `${entity}id`;
        const attributes = `<attribute name='${lane.name}' groupby='true' alias='g0'/>`
            + (sumColumn ? `<attribute name='${sumColumn}' aggregate='sum' alias='m0'/>` : '')
            + `<attribute name='${primaryId}' aggregate='count' alias='n'/>`;
        const build = (condition: string): string =>
            `<fetch aggregate='true'><entity name='${entity}'>${attributes}${inner}${condition}</entity></fetch>`;

        const send = async (label: string, xml: string): Promise<void> => {
            console.log(TAG, `${label} query`, xml);

            try {
                const result = await api.retrieveMultipleRecords(entity, `?fetchXml=${xml}`);

                console.log(TAG, `${label} rows`, JSON.stringify(result.entities ?? []));
            } catch (error) {
                console.log(TAG, `${label} refused`, whole(error));
            }
        };

        await send('A2 without parent', build(''));

        // A3: the parent.
        const info = (context.mode as unknown as { contextInfo?: { entityTypeName?: string; entityId?: string } }).contextInfo;

        if (!info?.entityId || !info.entityTypeName) {
            console.log(TAG, 'A3 no contextInfo.entityId — a main grid, nothing to resolve');

            return;
        }

        let candidates: string[] = [];

        if (forcedParent) {
            candidates = [forcedParent];
        } else {
            const answer = (await this.metadataFetch(
                `EntityDefinitions(LogicalName='${entity}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity`,
            )) as { body?: { value?: { ReferencingAttribute: string; ReferencedEntity: string }[] } };

            candidates = (answer.body?.value ?? [])
                .filter((relationship) => relationship.ReferencedEntity === info.entityTypeName)
                .map((relationship) => relationship.ReferencingAttribute);
        }

        const loadedColumns = (dataset.columns ?? []).map((column) => column.name);
        const ids = dataset.sortedRecordIds ?? [];

        console.log(TAG, 'A3 candidates', candidates, 'loaded columns', loadedColumns);

        for (const column of candidates) {
            const loaded = loadedColumns.indexOf(column) !== -1;
            const points = ids.map((id) => {
                const raw = (dataset.records[id] as unknown as LooseRecord).getValue(column) as { id?: { guid?: string } | string } | null;
                const guid = raw && typeof raw === 'object' ? (typeof raw.id === 'object' ? raw.id?.guid : raw.id) : raw;

                return bare(guid) === bare(info.entityId);
            });

            console.log(TAG, `A3 ${column}: loaded=${loaded}, rows pointing at the record ${points.filter(Boolean).length}/${ids.length}`);
            await send(`A3 with ${column}`, build(`<filter type='and'><condition attribute='${column}' operator='eq' value='${bare(info.entityId)}'/></filter>`));
        }

        console.log(TAG, 'A3 loaded', ids.length, 'totalResultCount', dataset.paging.totalResultCount, 'hasNextPage', dataset.paging.hasNextPage);
    }

    /** T4–T6: one Web API update with exactly the payload given, then the server's answer. */
    private async write(id: string, payload: Record<string, unknown>): Promise<void> {
        const dataset = this.dataset;
        const api = this.api;

        if (!dataset || !api) {
            console.log(TAG, 'write cannot run: no dataset or no webAPI');

            return;
        }

        const entity = dataset.getTargetEntityType();

        await this.readBack(id, 'before');
        console.log(TAG, 'write', entity, bare(id), JSON.stringify(payload));

        try {
            const result = await api.updateRecord(entity, bare(id), payload);

            console.log(TAG, 'write resolved', JSON.stringify(result));
        } catch (error) {
            console.log(TAG, 'write refused', whole(error));
        }

        await this.readBack(id, 'after');
    }

    private async readBack(id: string, when = 'now'): Promise<void> {
        const dataset = this.dataset;
        const api = this.api;

        if (!dataset || !api) {
            return;
        }

        try {
            const row = await api.retrieveRecord(dataset.getTargetEntityType(), bare(id), '?$select=statecode,statuscode');

            console.log(TAG, `read ${when}`, { statecode: row.statecode, statuscode: row.statuscode });
        } catch (error) {
            console.log(TAG, `read ${when} refused`, whole(error));
        }
    }
}
