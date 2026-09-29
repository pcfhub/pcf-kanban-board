/**
 * Lane totals from the server: one aggregate over every record the view means,
 * grouped by the lane column, with a count and — when a Lane total column is
 * bound — its sum.
 *
 * The query, the parent resolver and the row reader are the template's
 * view-aggregate library (`../lib/view-aggregate`), synced by `sync-rig.mjs`;
 * this file is only what a board adds to it. Everything here is measured on
 * this control's own subgrid (SPEC.md 0.4.0, A1–A3, 2026-09-29): the view's
 * FetchXML reads from `savedquery`; the lane group arrives as a **number**
 * where the record says `"1"`; a Money sum is a number beside its formatted
 * value; and without the parent condition the count was the whole table's 10
 * under a subgrid of 3.
 *
 * Pure: no `context`. The entry point hands in the reads it can make.
 */

import { AliasPlan, GroupSpec } from '../lib/view-aggregate/types';
import { aliasPlan, parentFilterXml } from '../lib/view-aggregate/fetchXml';
import { describesPlan, toGroupReading } from '../lib/view-aggregate/rows';
import { ParentReading, resolveParentLookup, withholdsRoute } from '../lib/view-aggregate/parent';
import { loadAggregate, readViewFetchXml, Refusal, WebApiReader } from '../lib/view-aggregate/aggregate';
import { LaneTotal, laneKey } from '../components/lanes';

/** What the server said, per lane, and over how many records. */
export interface TotalsAnswer {
    byLane: Record<string, LaneTotal>;
    /** Every record the aggregate counted — the caption's number. */
    records: number;
}

/** Everything one server query needs. */
export interface TotalsRequest {
    api: WebApiReader;
    entity: string;
    /** The lane column's logical name. */
    lane: string;
    /** The Lane total column's logical name, or `null` for counts only. */
    value: string | null;
    viewId: string;
    /** The dataset's runtime filter as FetchXML, already known translatable. */
    filterXml: string;
    /** The subgrid's parent, or `null` on a main grid. */
    parent: ParentReading | null;
    /** The table's real primary key, which `count` is taken over. */
    primaryId: () => Promise<string>;
}

/** The spec and its alias plan: one group, the lane; one measure or none. */
export function totalsPlan(entity: string, lane: string, value: string | null): { spec: GroupSpec; plan: AliasPlan } {
    const spec: GroupSpec = {
        entity,
        primaryId: `${entity}id`,
        groups: [{ column: lane, kind: 'choice' }],
        measures: value ? [{ column: value, aggregate: 'sum' }] : [],
    };

    return { spec, plan: aliasPlan(spec) };
}

/**
 * The server route, run. Resolves `null` — never rejects — when the answer
 * would be wrong rather than missing, and the board then totals the cards it
 * has, with a caption that says so:
 *
 * - the parent cannot be settled (`withholdsRoute`): counting the whole view
 *   would put a larger number above the lane than the lane can hold;
 * - the server refused the query;
 * - the response does not describe the query sent.
 */
export async function loadTotals(request: TotalsRequest): Promise<TotalsAnswer | null> {
    const { spec, plan } = totalsPlan(request.entity, request.lane, request.value);

    try {
        const [resolution, primaryId] = await Promise.all([
            request.parent
                ? resolveParentLookup(request.parent)
                : Promise.resolve({ column: null, by: 'unrelated' as const, candidates: [] }),
            request.primaryId(),
        ]);

        if (request.parent && withholdsRoute(resolution)) {
            // eslint-disable-next-line no-console
            console.warn(
                'KanbanBoard: the lookup relating this subgrid to its record could not be settled ('
                + resolution.by + '; candidates: ' + (resolution.candidates.join(', ') || 'none')
                + '). Lane totals come from the loaded cards instead of the whole view, because the '
                + 'view alone would count records this board is not showing. Set the Parent lookup '
                + 'property, or "none" if this subgrid is not related to the record.',
            );

            return null;
        }

        const parentXml = resolution.column && request.parent
            ? parentFilterXml(resolution.column, request.parent.record.id)
            : '';
        const viewXml = await readViewFetchXml(request.api, request.viewId);
        const rows = await loadAggregate(request.api, {
            spec: { ...spec, primaryId },
            plan,
            viewXml,
            filterXml: parentXml + request.filterXml,
        });

        if (!describesPlan(rows, plan)) {
            // eslint-disable-next-line no-console
            console.warn('KanbanBoard: the lane totals response does not describe the query sent.');

            return null;
        }

        const byLane: Record<string, LaneTotal> = {};
        let records = 0;

        for (const row of rows) {
            const reading = toGroupReading(row, plan, '');
            const lane = reading.values[0];
            const sum = reading.measures[0];

            byLane[laneKey(typeof lane === 'number' ? lane : null)] = {
                count: reading.count,
                sum: typeof sum === 'number' ? sum : null,
                label: reading.measureLabels[0] || null,
            };
            records += reading.count;
        }

        return { byLane, records };
    } catch (error) {
        const refusal = error as Partial<Refusal>;

        // eslint-disable-next-line no-console
        console.warn('KanbanBoard: lane totals fell back to the loaded cards —', refusal.message ?? error);

        return null;
    }
}
