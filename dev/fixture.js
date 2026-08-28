/*
 * The view the dev harness binds: columns and records, chosen for the edges.
 *
 * **`name` and `alias` differ on every column, and that is the point.** `alias`
 * is the property-set's role name from the manifest — `statusField`,
 * `titleField`, `assigneeField`, `badgeField` — and it is fixed. `name` is the
 * column the maker pointed that role at, and it is what `getValue()` and
 * `getFormattedValue()` take. A fixture setting both to the same string passes
 * whichever the control reads, so it would certify a control looking up
 * `getValue('statusField')` — which finds nothing on a real form and puts every
 * card in the same lane.
 *
 * Also here on purpose:
 *
 *   - **a record with no status**, because a choice column is nullable and the
 *     card has to go somewhere rather than vanish;
 *   - **a record with no assignee**, which is the KanbanBoard_Unassigned path;
 *   - **an empty string and a null in the badge column**, the two values that
 *     catch a renderer treating falsy as absent;
 *   - **a lane with no cards at all** (value 4), because an empty lane still
 *     has to be a drop target — a board that renders only the lanes it has
 *     cards for cannot accept the first card into an empty one;
 *   - **a title long enough to overflow**, because nobody finds out until a
 *     customer types one.
 *
 * Loaded by `harness.html` in a browser and by `smoke.js` in Node, so it
 * assigns both ways and depends on neither.
 */

(function (root, factory) {
    'use strict';

    var fixture = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = fixture;
    }

    if (root) {
        root.__pcfFixture = fixture;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    function card(id, title, status, assignee, badge) {
        return {
            id: id,
            values: {
                // The real column names — what getValue() takes.
                new_stage: status,
                new_summary: title,
                new_owner: assignee,
                new_priority: badge,
                name: title,
            },
        };
    }

    return {
        targetEntityType: 'new_workitem',
        title: 'Active work items',

        /*
         * `order` is not the array order: a view hands its columns over in
         * whatever order it likes and carries the intended position in `order`.
         */
        columns: [
            {
                name: 'new_summary',
                displayName: 'Summary',
                dataType: 'SingleLine.Text',
                alias: 'titleField',
                order: 0,
                visualSizeFactor: 200,
                isPrimary: true,
            },
            {
                name: 'new_stage',
                displayName: 'Stage',
                dataType: 'OptionSet',
                alias: 'statusField',
                order: 1,
                visualSizeFactor: 100,
            },
            {
                name: 'new_owner',
                displayName: 'Owner',
                dataType: 'SingleLine.Text',
                alias: 'assigneeField',
                order: 2,
                visualSizeFactor: 120,
            },
            {
                name: 'new_priority',
                displayName: 'Priority',
                dataType: 'SingleLine.Text',
                alias: 'badgeField',
                order: 3,
                visualSizeFactor: 80,
            },
        ],

        records: [
            card('w1', 'Rewrite the import validator', 1, 'A. Okafor', 'High'),
            card('w2', 'Chase the missing invoices', 1, 'B. Lindqvist', ''),
            card('w3', 'Migrate the staging environment', 2, 'A. Okafor', 'Medium'),
            card('w4', 'Draft the renewal terms', 2, null, null),
            card('w5', 'Close out the Q3 audit findings and file the summary', 3, 'C. Moreau', 'Low'),
            // No status at all: a choice column is nullable, and the card still
            // has to land somewhere rather than disappear off the board.
            card('w6', 'Triage inbound support mail', null, 'B. Lindqvist', 'High'),
        ],
    };
});
