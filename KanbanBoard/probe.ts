/*
 * THE 0.2.2 PROBE. Delete this file, and its import in index.ts, before 0.3.0.
 *
 * A throwaway build whose only job is to ask the live form the questions
 * 0.3.0 rests on, before a line of 0.3.0 exists. The rule: an answer that goes
 * the wrong way removes the feature that depends on it — it is not worked
 * around. Every answer goes into SPEC.md as *Measured*, with the date.
 *
 * Passive part: logs once, on the first `updateView` that carries records.
 * Active part: `window.__kanbanProbe` — call from the console on the form and
 * paste the output back.
 *
 * The questions, and the 0.3.0 feature each one decides:
 *
 *   Q1  Does a record from a property-set dataset carry `setValue`, `save`,
 *       `isEditable`? And what does `isEditable(<status column>)` answer?
 *       → moving a card through the record instead of `webAPI.updateRecord`,
 *         which is what makes a canvas board writable and drops the prompt.
 *   Q2  Does `setValue(status.name, <int>)` + `save()` commit? Read back
 *       through the Web API, not trusted from a resolved promise.
 *       → the same feature; `status.name` (not `alias`) is the name to write.
 *   Q3  After a resolved `save()`, does an `updateView` arrive on its own, or
 *       only after `refresh()`? Watched for 15 s, not 4.
 *       → whether the override retires without an explicit refresh.
 *   Q4  Does `openForm({ useQuickCreateForm: true, … }, { [status.name]: "2" })`
 *       open the quick create with the lane preselected? As a string; and as
 *       a number, in case the platform wants the other.
 *       → the "+" button in a lane header.
 *   Q5  What does `metadata.Attributes.get(column).OptionSet` look like?
 *       → settles the SPEC's oldest open question; the walk stays either way.
 *   Q6  What is `mode.contextInfo` on this subgrid?
 *       → whether `createFromEntity` can be seeded for the quick create.
 */

import { IInputs } from './generated/ManifestTypes';
import { ROLES, describeShape } from './components/lanes';

type DataSet = ComponentFramework.PropertyTypes.DataSet;

interface LooseRecord {
    setValue?: (name: string, value: unknown) => unknown;
    save?: () => Promise<unknown>;
    isEditable?: (name: string) => Promise<boolean> | boolean;
    isDirty?: () => Promise<boolean> | boolean;
    getValue: (name: string) => unknown;
}

const TAG = '[KanbanProbe 0.2.2]';

export class Probe {
    private loggedOnce = false;
    private updateViews = 0;
    private context: ComponentFramework.Context<IInputs> | null = null;

    /** Called from `updateView`. Passive: one dump, then a counter. */
    public observe(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
        this.updateViews += 1;

        const dataset = context.parameters.records;
        const ids = dataset.sortedRecordIds ?? [];

        if (this.loggedOnce || ids.length === 0) {
            return;
        }

        this.loggedOnce = true;

        const status = (dataset.columns ?? []).find((column) => column.alias === ROLES.status);
        const first = dataset.records[ids[0]] as unknown as LooseRecord;

        // Q1 — the write half, and what isEditable answers for the lane column.
        console.log(TAG, 'Q1 record methods', {
            setValue: typeof first.setValue,
            save: typeof first.save,
            isEditable: typeof first.isEditable,
            isDirty: typeof first.isDirty,
            statusColumn: status ? { name: status.name, alias: status.alias, dataType: status.dataType } : null,
        });

        if (status && typeof first.isEditable === 'function') {
            const answer = first.isEditable(status.name);

            console.log(TAG, 'Q1 isEditable returned', answer instanceof Promise ? 'a Promise' : typeof answer);
            void Promise.resolve(answer).then((editable) => {
                console.log(TAG, 'Q1 isEditable(' + status.name + ') =', editable);
            });
        }

        // Q6 — the parent, for createFromEntity.
        console.log(TAG, 'Q6 mode.contextInfo', (context.mode as { contextInfo?: unknown }).contextInfo);

        // Q5 — the option set's real shape, whether or not the walk finds it.
        const utils = context.utils as { getEntityMetadata?: (e: string, a: string[]) => Promise<unknown> } | undefined;

        if (status && typeof utils?.getEntityMetadata === 'function') {
            void utils.getEntityMetadata(dataset.getTargetEntityType(), [status.name]).then((metadata) => {
                const attributes = (metadata as { Attributes?: { get?: (n: string) => unknown } }).Attributes;
                const attribute = typeof attributes?.get === 'function' ? attributes.get(status.name) : undefined;
                const optionSet = (attribute as { OptionSet?: unknown } | undefined)?.OptionSet;

                console.log(TAG, 'Q5 Attributes.get(' + status.name + ') shape:\n' + describeShape(attribute));
                console.log(TAG, 'Q5 …OptionSet shape:\n' + describeShape(optionSet));
            }, (error) => console.log(TAG, 'Q5 getEntityMetadata rejected', error));
        }

        (window as unknown as { __kanbanProbe: unknown }).__kanbanProbe = {
            move: (recordId: string, value: number) => this.move(recordId, value),
            create: (laneValue: number, asNumber = false) => this.create(laneValue, asNumber),
            help: () =>
                console.log(
                    TAG,
                    'move(recordId, laneValue) → Q2/Q3. create(laneValue) → Q4 as a string; create(laneValue, true) → as a number.',
                ),
        };

        console.log(TAG, 'ready — window.__kanbanProbe.help()');
    }

    /** Q2 + Q3: write through the record, read back through the Web API, watch for a repaint. */
    private move(recordId: string, value: number): void {
        const context = this.context;

        if (!context) {
            return;
        }

        const dataset: DataSet = context.parameters.records;
        const status = (dataset.columns ?? []).find((column) => column.alias === ROLES.status);
        const record = dataset.records[recordId] as unknown as LooseRecord | undefined;

        if (!status || !record || typeof record.setValue !== 'function' || typeof record.save !== 'function') {
            console.log(TAG, 'Q2 cannot run: no status column, no record, or no write half', { status: Boolean(status), record: Boolean(record) });

            return;
        }

        const entity = dataset.getTargetEntityType();
        const before = record.getValue(status.name);
        const started = Date.now();
        const since = (): string => `+${Date.now() - started}ms`;

        console.log(TAG, 'Q2 before', { before, writing: value, column: status.name });

        Promise.resolve()
            .then(() => {
                const returned = record.setValue!(status.name, value);

                console.log(TAG, 'Q2 setValue returned', returned === undefined ? 'undefined' : typeof returned, since());
            })
            .then(() => record.save!())
            .then((resolved) => {
                console.log(TAG, 'Q2 save resolved', resolved, since());

                const viewsAtSave = this.updateViews;

                // Q3: does a repaint arrive on its own?
                window.setTimeout(() => {
                    console.log(TAG, 'Q3 updateViews in the 15 s after save, before refresh():', this.updateViews - viewsAtSave);
                    console.log(TAG, 'Q3 dataset value now (no refresh):', dataset.records[recordId]?.getValue(status.name));

                    const viewsAtRefresh = this.updateViews;

                    dataset.refresh();

                    window.setTimeout(() => {
                        console.log(TAG, 'Q3 updateViews in the 15 s after refresh():', this.updateViews - viewsAtRefresh);
                        console.log(TAG, 'Q3 dataset value after refresh:', context.parameters.records.records[recordId]?.getValue(status.name));
                    }, 15000);
                }, 15000);

                // Q2 read back — the Web API, not the resolved promise.
                const api = context.webAPI as { retrieveRecord?: (e: string, id: string, q: string) => Promise<Record<string, unknown>> } | undefined;

                if (typeof api?.retrieveRecord === 'function') {
                    return api.retrieveRecord(entity, recordId, `?$select=${status.name}`).then((row) => {
                        console.log(TAG, 'Q2 read back', { [status.name]: row[status.name] }, since());
                    });
                }

                console.log(TAG, 'Q2 no webAPI.retrieveRecord to read back with');

                return undefined;
            })
            .catch((error: unknown) => {
                console.log(TAG, 'Q2 FAILED', error, since());
            });
    }

    /** Q4: the quick create, with the lane passed as a form parameter. */
    private create(laneValue: number, asNumber: boolean): void {
        const context = this.context;

        if (!context) {
            return;
        }

        const dataset: DataSet = context.parameters.records;
        const status = (dataset.columns ?? []).find((column) => column.alias === ROLES.status);
        const navigation = context.navigation as { openForm?: (o: unknown, p?: unknown) => Promise<unknown> } | undefined;

        if (!status || typeof navigation?.openForm !== 'function') {
            console.log(TAG, 'Q4 cannot run', { status: Boolean(status), openForm: typeof navigation?.openForm });

            return;
        }

        const info = (context.mode as { contextInfo?: { entityTypeName?: string; entityId?: string } }).contextInfo;
        const options: Record<string, unknown> = { entityName: dataset.getTargetEntityType(), useQuickCreateForm: true };

        if (info?.entityTypeName && info.entityId) {
            options.createFromEntity = { entityType: info.entityTypeName, id: info.entityId };
        }

        const parameters = { [status.name]: asNumber ? laneValue : String(laneValue) };

        console.log(TAG, 'Q4 openForm', options, parameters);

        navigation
            .openForm(options, parameters)
            .then((result) => console.log(TAG, 'Q4 resolved', result))
            .catch((error: unknown) => console.log(TAG, 'Q4 REJECTED', error));
    }
}
