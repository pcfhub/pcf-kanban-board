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

    /** The account a subgrid of work items sits under, and one it does not. */
    var CONTOSO = 'a0000000-0000-4000-8000-00000000c0de';
    var ELSEWHERE = 'a0000000-0000-4000-8000-0000000e15e0';

    function card(id, title, status, assignee, badge, estimate, account) {
        return {
            id: id,
            values: {
                // The real column names — what getValue() takes.
                new_stage: status,
                new_summary: title,
                new_owner: assignee,
                new_priority: badge,
                new_estimate: estimate,
                new_account: { id: { guid: account || CONTOSO }, etn: 'account', name: account === ELSEWHERE ? 'Fabrikam' : 'Contoso' },
                name: title,
            },
        };
    }

    return {
        targetEntityType: 'new_workitem',
        title: 'Active work items',

        /*
         * The view, as `getViewId()` names it and `savedquery` describes it
         * (0.4.0's lane totals rewrite it). Attributes, an order and a
         * link-entity with an attribute of its own, all of which an aggregate
         * has to strip or the server refuses it; no filter, so the loaded rows
         * and the view agree and a total can be asserted exactly.
         */
        viewId: '00000000-0000-0000-0000-0000000b0a4d',
        views: {
            '00000000-0000-0000-0000-0000000b0a4d': {
                table: 'savedquery',
                name: 'Active work items',
                fetchxml: '<fetch version="1.0" mapping="logical"><entity name="new_workitem">'
                    + '<attribute name="new_summary"/><order attribute="new_summary" descending="false"/>'
                    + '<attribute name="new_stage"/><attribute name="new_estimate"/><attribute name="new_workitemid"/>'
                    + '<link-entity name="account" from="accountid" to="new_account" link-type="outer" alias="a"><attribute name="name"/></link-entity>'
                    + '</entity></fetch>',
            },
        },

        /*
         * The one lookup to account — what a subgrid under an account relates
         * its rows by, and what the lane totals' parent resolver finds.
         */
        relationships: [
            { column: 'new_account', target: 'account', navigationProperty: 'new_account' },
        ],

        /*
         * What `utils.getEntityMetadata('new_workitem', ['new_stage'])` carries
         * for the lane column, in the rig's measured shape: the descriptor
         * array, maker's order, with `Color` only where the option has one.
         * Lane 4 has no card in `records`, so a board that shows it read the
         * option set rather than the cards.
         */
        metadata: {
            new_stage: {
                shape: 'descriptor',
                options: [
                    { value: 1, label: 'New', color: '#0f6cbd' },
                    { value: 2, label: 'Active', color: '#e8d33a' },
                    { value: 3, label: 'Resolved' },
                    { value: 4, label: 'Blocked', color: '#c50f1f' },
                ],
            },
        },

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
            {
                // 0.4.0: the Lane total role. Money, as the probe's was.
                name: 'new_estimate',
                displayName: 'Estimate',
                dataType: 'Currency',
                alias: 'valueField',
                order: 4,
                visualSizeFactor: 90,
            },
            {
                // In the view so the loaded rows can confirm the parent lookup.
                name: 'new_account',
                displayName: 'Account',
                dataType: 'Lookup.Simple',
                alias: 'new_account',
                order: 5,
                visualSizeFactor: 120,
                isHidden: true,
            },
        ],

        records: [
            // w2's estimate is blank: a blank is not a zero, so lane 1 sums to 1500 over two cards.
            card('w1', 'Rewrite the import validator', 1, 'A. Okafor', 'High', 1500),
            card('w2', 'Chase the missing invoices', 1, 'B. Lindqvist', '', null),
            card('w3', 'Migrate the staging environment', 2, 'A. Okafor', 'Medium', 2250),
            card('w4', 'Draft the renewal terms', 2, null, null, 800),
            card('w5', 'Close out the Q3 audit findings and file the summary', 3, 'C. Moreau', 'Low', 400),
            // No status at all: a choice column is nullable, and the card still
            // has to land somewhere rather than disappear off the board.
            card('w6', 'Triage inbound support mail', null, 'B. Lindqvist', 'High', 100),
            // Another account's. A subgrid under Contoso never loads it; the
            // view alone would count it — the 10-for-3 the probe measured.
            card('w7', 'Renew the Fabrikam support contract', 2, 'C. Moreau', 'High', 9000, ELSEWHERE),
        ],

        /** The two accounts, for a suite that sets `contextInfo` and `relationshipFilter`. */
        accounts: { contoso: CONTOSO, elsewhere: ELSEWHERE },
    };
});
