# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

## 0.5.0 — swimlanes and a sort menu

Picked by the 10 Oct 2026 demand survey (the twenty-first run): Kanban was #3
by hub downloads (23), its own limitations page said *"No swimlanes, no
sorting, no selection"*, PowerKanban has swimlanes, and the hub had no hit for
"swimlane". Decided with the user the same day:

- **Swimlanes: Choice + Owner, writable.** A sixth role, `swimlaneField`
  (Choice, Yes/No, Owner, lookup), draws one row per value; dropping a card
  into another row writes that column — a Choice or Yes/No by the lane's two
  routes, Owner and a lookup by the Web API's `@odata.bind`.
- **Sort: a user sort menu**, applied through the view's own server sort
  (`dataset.sorting`) so *Load more* stays in order, remembered per browser
  per view, with a maker property for the default. Off by default: a new
  feature arrives switched off.

Selection stays out of scope.

### The 0.4.8 probe

A throwaway build: 0.4.3 plus `probe.ts` and the `swimlaneField` role (which
0.5.0 keeps), no feature code. `window.__pcfKanbanProbe.help()` lists the
calls; the bundle carries `kanban-probe-0.4.8`. Numbered below 0.5.0 because
Dataverse ignores a re-import at the same number.

**Needs on the environment first:** on the Accounts form's `cll_task`
subgrid, bind **Swimlane column** to a Choice (add one, e.g. *Priority*, if
`cll_task` has none) for P2 and P5; a second board — or a rebind — on
**Owner** for P1; at least one task owned by a **team** (P1, P3); a user
without Assign on `cll_task` for the refusal half of P6, if one is to hand;
a canvas app with the board for P9. The lane stays on Status Reason.

| | Question | Decides | Measured |
| --- | --- | --- | --- |
| P1 | `getValue`/`getFormattedValue` of an **Owner** column on a dataset record — a user row and a team row: shape, `etn`, braces and case of the id | the Owner row key | **An object, both kinds**: `{ etn: "systemuser", id: { guid: "eea5fa1a-…" }, name: "Charles Llamas" }` and `{ etn: "team", id: { guid: "e8d840ff-…" }, name: "Owner Users" }` — the GUID bare and lower-case under `id.guid`; `getFormattedValue` is the name |
| P2 | The raw value of a **Choice** and of a **Yes/No** column on a record (chart-view measured a Choice as the string `"1"`) | the row key for Choice and Yes/No | **Strings, both.** A Choice is `"858010000"` with its label formatted ("Todo"); a Yes/No is `"1"` / `"0"` with its labels ("Urgent" / "Normal"); a Yes/No never set is `null` with a `null` formatted value — a third row, not *No* |
| P3 | `write(id, { "ownerid@odata.bind": "/systemusers(<id>)" })`, then `/teams(<id>)`: accepted? What reads back? | Owner rows writable at all | **A team: accepted** (386 ms), read back `_ownerid_value` = the team with `lookuplogicalname: "team"`. **A user without read on the table: refused** — `errorCode 2147746457`, `title` "Assignee does not hold the required read privilege or access.", while `message` is the **unfilled template** "Assignee {2}(Id = {3}) is missing {0} privilege on {1} entity(OTC={4})…" — show the title. The user-to-user success case was not asked (the only other user lacks read) |
| P4 | One payload: `statecode` + `statuscode` + `ownerid@odata.bind` (a drop into another lane *and* another row) | one write or two | **One write, accepted** (1,081 ms): `{ statecode: 0, statuscode: 1, "ownerid@odata.bind": "/teams(…)" }` from Inactive/Charles read back Active/Owner Users |
| P5 | `stage(id, { <lane>: n, <choice>: m })`: `setValue` on both, one `save()` | a Choice row move with no Web API | **Works for columns in the dataset.** `cll_status` (Choice, `isEditable` true) alone: saved in 597 ms. `cll_urgent: true` (a boolean) + `cll_status` together, both in the dataset: one `save()`, 584 ms, both persisted. `getValue` keeps the old value until the refresh. **Two traps:** a column **not** in the dataset answers `isEditable` false and its `setValue` is **dropped silently** — the save resolves and writes the rest; and **`ownerid` answers `isEditable` true, yet `setValue` with the record's own `{ etn, id: { guid }, name }` shape stages null and the save is refused** — `2147746307` "Attribute: ownerid cannot be set to NULL". Owner (and lookup) rows go through the Web API only |
| P6 | `hasEntityPrivilege(table, 5, depth)` beside Write (3), from `dump()`; a user without Assign through `write()` — the refusal | whether Owner rows are drop targets | **Callable, with `Utility` declared**; Assign (5), Write (3), Share (6), AppendTo (8) all `true` at depths 0–3 for a System Administrator. A caller *without* Assign not measured (no such user to hand); the refusal measured is the assignee's (P3) |
| P7 | `sort(column, dir)` (in place + `refresh()`) and `sortAssign` (assignment) on a subgrid and a main grid: is the order applied; does `more()` continue in it; does a main grid's own sort change for the user? | the sort route | **Subgrid: in place + `refresh()` is applied by the server**, the page resets to the first 4, and `loadNextPage()` continues in the new order. **Assignment (`dataset.sorting = [...]`) does not take** — the next pass still holds the previous array, order unchanged. **A Choice sorts by its label**, not its value: descending put Todo, then On Hold. The view's own sort arrives as `[{ name: "cll_title", sortDirection: 0 }]`. Main grid not asked |
| P8 | `sort("createdon", 1)` and a role column with `order: -1`: applied, ignored or thrown? `disableSorting` per column, from `dump()` | what the menu may list | **A column outside the dataset is ignored silently**: `createdon` ascending and descending both returned the view's own order (title ascending) with no error, while `dataset.sorting` went on reporting `createdon`. **A role column outside the view is sortable**: `cll_urgent` (`order: -1`) descending put the Urgent cards first. View columns carry `isHidden: false, disableSorting: false`; the off-view role column carries **neither key**. `getFormattedValue` of a column outside the dataset is `null` |
| P9 | `dump()` and `sort()` in a **canvas** app | whether canvas gets the menu | **The sort works in canvas, and differs from a form in four ways** — see *The canvas run* below |

**Answered 2026-10-10** on the test environment's account form, Adventure
Works (sample), the `cll_task` subgrid: lane Status Reason, the swimlane bound
in turn to `cll_status` (Choice), a new `cll_urgent` (Yes/No, 4 Yes, 4 No, 8
never set) and `ownerid`; page size 4, 16 tasks. Bound with `ppdev form control
bind`; **each rebind needed the browser's caches cleared** (`caches.keys()` →
delete all) before the form showed it — a reload alone served the old
binding. What it decides:

- **Row keys:** a Choice or Yes/No row is the raw string (`"858010000"`,
  `"1"`), labelled by the formatted value; `null` is its own *(empty)* row. An
  Owner/lookup row is `id.guid` with `etn` beside it, labelled by `name`.
- **Writes:** a Choice/Yes-No row change rides the lane's record route when the
  record allows it (both columns staged, one save); the swimlane column is a
  role, so it is always in the dataset. **An Owner/lookup row change is always
  Web API** — the record route stages null — and a diagonal drop is one
  `updateRecord` carrying the state pair and the bind.
- **Refusals:** read `title` when `message` holds `{0}`-style placeholders.
- **Sort menu:** list only `dataset.columns` (view columns and role columns),
  never an arbitrary column; mutate `dataset.sorting` in place, then
  `refresh()`. A Choice sorts by label, which the menu should say nothing
  about — it is what the grid does too.

#### The canvas run, 2026-10-10

A test canvas app, *Kanban Probe*, in the test environment's dev solution:
one tablet screen, the board at 1366×768 over `cll_task` (Studio offers two
tables named *Tasks*; the custom one arrived as `Tasks_1`), roles set as
text properties (`statusField = "statuscode"`, `swimlaneField =
"cll_status"`, …), published. The app runs in a cross-origin frame, so the
probe was driven with Playwright (`frame.evaluate`) on the published player,
not from the browser pane. What canvas hands over, against the form:

| | Form (subgrid) | Canvas |
| --- | --- | --- |
| A Choice's `getValue` | the string `"858010003"` | **the number** `858010003` |
| First page | the subgrid's size (4) | **1 card** — `pageSize: 1`, the host's default; `totalResultCount` 23, the whole table |
| `getViewId()` | the view's id | `undefined` |
| Columns | the view's, roles among them | each role **twice** — once by alias with `order: -1`, once as an Items column — and an **unbound optional role arrives as a column** `{ name: null, alias: "valueField", dataType: "SingleLine.Text" }`. Found by alias, the 0.4.x board reads it as bound: the published board printed *"Totals: the 1 cards loaded so far"* with no Lane total column set |
| Sort in place + `refresh()` | applied | applied; Load more follows it |
| Sort by assignment (`dataset.sorting = [...]`) | **ignored** | **applied** (title descending took) |
| A Choice sorted descending | by **label** (Todo, On Hold…) | by **value** (Cancelled 858010005, Done 858010004, In Review…) |
| Sort by a column outside the dataset (`createdon`) | ignored silently | **applied**, and `getFormattedValue("createdon")` answers — with epoch milliseconds (`"1790708505000"`), not a date |
| `context.webAPI` | works | **present, every method throws** `PCFNonImplementedError: updateRecord: Method not implemented.` |
| `page.getClientUrl()` | the org URL | throws *Method not implemented.* |
| `utils.hasEntityPrivilege` | answers | throws *Method not implemented.* |
| `utils.getEntityMetadata` | answers | throws — and Studio shows it to the maker as a red banner, *"getEntityMetadata: Method not implemented."*, even though the control catches it |
| Record write half | `isEditable` + `setValue` (returns `undefined`) + `save()` | **no `isEditable`**; `setValue` returns a WinJS promise-like and `getValue` shows the staged value at once; `save()` resolves with a circular host object |
| A text column through the record | writes | **writes** — `cll_title` changed on the server, and was put back the same way |
| A Choice through the record | writes | **never**: a number, the string, `{ Value }` and the label each stage `null` (`getValue` answers `null` after `setValue`), and the save bumps `modifiedon` without changing the value |

Also on the canvas mount: one React warning, *"React.createElement: type is
invalid … got: undefined"* — some component the board renders does not exist
in the canvas host's platform library. The board drew; which component is
not yet known.

What it decides for 0.5.0:

- **Canvas stays read-only for moves** — a lane and a swimlane are both
  Choice/Owner columns, and canvas can write neither (no Web API, Choice
  through the record stages null). The docs' "read-only, in practice" is now
  measured, not assumed.
- **The sort menu works in canvas**, and there it can list any column of the
  table; the in-place route works on both hosts, so the control uses that one.
- **Row keys normalise a Choice from a number or a string.**
- **An unbound role is a column with `name: null` in canvas** — `roleColumn`
  must treat that as unbound (a 0.4.x defect: the totals caption shows on
  every canvas board).
- **Model-driven-only APIs are detected by calling them**, not by `typeof`:
  `webAPI` exists in canvas and throws at the call — the rule the control
  already applies to `openForm`.

### What was built

The probe's answers, written in: a Swimlane column role (Choice, Yes/No,
Owner, lookup); rows from the cards, and a Choice's from its option set; a
row move written beside the lane in one write — the record route when every
column is a dataset column that answers `isEditable` true, the Web API
otherwise, and always for a bind; Owner rows gated on Assign (5) at any
depth, offered where the question cannot be asked; a refusal's `title` where
its `message` is a `{n}` template; **Sort cards by** applied once per table
and view from `updateView`, a sort menu (off by default) kept per table and
view in `localStorage`, both mutating `dataset.sorting` in place and
refreshing, offering only the dataset's named, sortable, visible columns,
with the column named beside two labels that read the same; `roleColumn`
reading a nameless column as unset. 126 assertions; the Owner bind and the
nameless role mutation-checked.

Found while building, not by the probe: the preview's first look at the demo
board had no lane colours, caption or currency sums. The rig was not at
fault — the screenshot was taken before the board's metadata and aggregate
answered; with time to load, both were right. A screenshot of an
asynchronous control is a claim about a moment.

### The walkthrough, on 0.5.0 (2026-10-10)

On the test environment's account form, the `cll_task` subgrid, lane Status
Reason, page size 4, bound with `ppdev` (swimlane `ownerid`, `showSort`
true), browser caches cleared after the rebind.

| | What | Result |
| --- | --- | --- |
| W1 | 0.5.0 runs, Owner rows draw, the sort menu shows the view's own sort | **Passed** — no probe in the bundle; rows *Charles Llamas 3* and *Owner Users 1* from the four loaded cards; lanes and colours from the option set; the menu on *Title* (the view's `cll_title` ascending), "Status (cll_status)" and "Status (statecode)" told apart |
| W2 | A card moved to a team's row from its Move menu | **Passed** — read back owned by *Owner Users*, its reason unchanged, no error; the board placed it in the team's row |
| W3 | A drop into another lane **and** another row (a drag, dispatched as DOM drag events with a real `DataTransfer` — the pane cannot start an HTML5 drag) | **Passed** — Cancelled → Active (state 0, reason 1) and reassigned to the team, at one `modifiedon` |
| W4 | Title descending from the menu, then Load more | **Passed** — Deploy, Create ×3 on page one, then 12, 11, 10, 09: the server's order (`[` before letters), kept across the page; stored as `pcfhub-kanban-sort:cll_task:<view id>` |
| W5 | A reload | **Passed** — the board came back sorted by Title descending, from the stored choice |
| W6 | An assignment the server refuses (the assignee cannot read the table) | **Not reachable on a board** — a row exists only for an owner of a loaded card, who can read the table. Covered by P3 (the message) and the suite (the title shown) |
| W7 | The canvas test app, updated to 0.5.0 in Studio, *Show sort menu* on, *Sort cards by* `cll_title desc`, published; read with Playwright inside the player's frame | **Passed** — the player served 0.5.0 (50,229 bytes, the sort's storage key in it); **no totals caption** (0.4.x printed one over the nameless `valueField`); the `cll_status` rows draw; `cll_title desc` applied on load; the direction button flipped it to ascending and Load more continued in it; no Move menu and nothing draggable; the menu lists no column twice though canvas hands each role over twice |

Two things the canvas walkthrough cost, both about the tools, not the
control: **Studio reopened the app read-only** for about twenty minutes —
each reopen started a session while the last one still held the edit lock —
and **the player kept serving the first published build** after the new one
was published, because the saved Playwright session carried the player's
`localStorage`, which pins the app version (the bundle URL said
`20261010T202615Z`, the first publish). With the session's cookies only, the
new build came at once.

The React warning on the canvas mount (*"type is invalid … got: undefined"*)
is still there on 0.5.0; it was there on 0.4.8, and the board draws. Still
under *Not verified*.

## 0.4.3 — a refused card is usable again

Found on a model-driven sub-grid on 2026-10-07 (Service Desk, tickets by
status), where a business rule refuses a ticket set to Resolved with no
resolution. The move was refused and the card put back, as designed — and
the card stayed greyed out as "Moving…" with its Move button disabled, until
the form was reloaded. Measured on 0.4.1.

The control kept the cards with a write in flight in a set and **copied** it
into the props at each render. A refusal changes no output, so a form calls
`updateView` for the move's start and never again: the copy made at that
render still held the card. Through 0.4.0 a `refresh()` followed every move,
which should have brought the render that cleared it; that reading comes from
the code, and 0.4.0 was not run again.

The props now carry a function that reads the live set, and the component
re-renders itself when the move settles, so nothing waits on the host. Two
smoke checks hold it: the card is moving while the write is in flight, and
has stopped once the write is refused, **in the props of the render the
move's start brought**, with no settle in between. On the same form after
the fix: the refusal's text shows, the card is back in its lane, not greyed,
and its Move button works.

Not measured: the drag itself (the browser automation used here could not
start an HTML5 drag; every move went through the card's Move menu), and a
refusal in a canvas app. 0.4.2 was a first attempt that cleared the set
before the announcement; it changed nothing on the form and was never
released.

**Seeing a new build on a form.** The app serves the control's bundle from a
service-worker cache named `WebResources`. After an import, a reload and
even a `fetch` with `cache: 'reload'` returned the previous bundle while
Dataverse already held the new one. Deleting the control's entries from
`caches` (or a new private window) brought it.

## 0.4.1 — a move keeps what Load more brought in

Found on the form right after the 0.4.0 walkthrough (2026-09-29): Load more
two or three times, move a card from the last page, and the board fell back
to its first page — the card had landed, and every card past page one
vanished until Load more was pressed again. Older than 0.4.0: `moveCard`
ended with `dataset.refresh()` since the board first wrote, and **a refresh
starts the view again at page one**. The rig kept the loaded range across a
refresh, so no suite could see it; it resets now (`_template` `d1b1de3`).

**No refresh after a move.** It did two jobs, and each has another route:

- *Showing a landed move* — the override already holds the card in its new
  lane until a fetch agrees, and the totals re-ask on a count of landings the
  board keeps (which also covers the second move of the same card, whose
  unchanged output brings no render).
- *Putting a refused card back* — a refusal changes no output, so the
  platform brings no render; the 0.3.5 fix leaned on the refresh's. Now
  `moveCard` resolves `{ ok, message }` and the board puts the card back,
  shows the sentence and clears *Moving…* from its own state.

The quick create keeps its refresh — a new card has to be fetched — and
`docs/limitations.md` says so.

| | Look at | Right way | Measured |
| --- | --- | --- | --- |
| W12 | Page size 4, Load more until every card is on the board, then drag a card from the last page to another lane | Lands, **every card stays on the board**, the lane totals follow || **Passed** 2026-09-29 |
| W13 | The same card, moved again to a third lane | Lands; the totals follow again (no output changed — the board's own count re-asks) || **Passed** 2026-09-29 |
| W14 | A refusal from Dataverse: Lane column = **Status**, transitions enabled, Load more until all are loaded, then drag a card whose reason is **Active** to Inactive. The board sends `{ statecode: 1, statuscode: 2 }`; Active may not go to Inactive, so the server refuses (2147807246, T6) — a Status board has no transition rules of its own to stop it first | The card goes back with the sentence, *Moving…* clears, the loaded cards stay || **Passed** 2026-09-29 |
| W15 | The same card, dragged to Inactive again | Goes back again — no output changed, so no host render; the board's own || **Passed** 2026-09-29 |
| W16 | **+** on a lane, save the quick create | The new card appears; the board is back at its first page (documented) || **Passed** 2026-09-29 |

## 0.4.0 — lane totals, status transitions, soft lane limits

Picked by the 29 Sep 2026 demand survey: Kanban was the only control whose hub
downloads moved (8 → 11), and the two boards it is compared with each have
what this one lacks: `PCF-pipeline-kanban` sums a currency column per lane
("pipeline value by stage"), and PowerKanban honours Status Reason
transitions. Decided with the user the same day: totals come from the
**server** (the view's own FetchXML as an aggregate, grouped by the lane
column) with the loaded cards as the fallback and a caption saying which;
a per-lane limit is a **soft** warning, never a refused drop; the aggregate
code is lifted into `_template` rather than copied a third time.

### The 0.3.6 probe

Built 2026-09-29, a throwaway build with `probe.ts` and no feature code:
`window.__pcfKanbanProbe` — `dump()` for everything that needs no write,
`agg(column)` for the aggregate, `write(id, payload)` for one Web API
update read back. Confirm the page runs it: the bundle carries
`kanban-probe-0.3.6`.

**Needs on the environment first:** a board bound to **Status Reason** on
`cll_task` (T1 says whether the designer allows it); at least two reasons in
each state; *Status reason transitions* defined with one transition left
out, and enforcement on; a Currency or Decimal column on `cll_task` with
values, for A2.

| | Question | Decides | Measured |
| --- | --- | --- | --- |
| T1 | Can the Lane role bind Status Reason, or Status? | Whether transitions exist at all | **Yes, Status Reason** — the designer offered it; the column arrived `{ name: "statuscode", alias: "statusField", dataType: "OptionSet" }` on `cll_task`. Status (`statecode`) not tried |
| T2 | `attributeDescriptor.OptionSet` for `statuscode`: `State`? `TransitionData` as what? | Where a reason's state and next reasons are read | **Both present.** `statuscode` options: `{ Label, Value, State, TransitionData, IsHidden }` — `State` a number, **no `Color` key**; `TransitionData` `null` on all three (none defined). `statecode` options: `{ Label, Value, DefaultStatus, TransitionData, InvariantName, IsHidden }`. `EntityDefinitions` agrees: `State` per option, `Color: null`, `TransitionData: null`. **Second run (0.3.7, transitions defined):** the descriptor's `TransitionData` is a **parsed array of the allowed target reasons** — Active `[858010001, 858010002]`, In Progress `[2, 858010002, 1]`, Inactive `[1]`, Cancelled `[1]` — while `EntityDefinitions` carries the documented XML string (`<allowedtransitions><allowedtransition sourcestatusid tostatusid/>…`). The reasons now carry `Color: "#0000ff"`, all four, after the column was edited |
| T3 | *Enforce transitions* readable from the entity descriptor, or only `EntityDefinitions`? | Greying lanes only where the platform enforces | **Half.** `EntityDefinitions(…)?$select=EnforceStateTransitions` answers `false` (none defined on `cll_task`). The entity descriptor has 64 keys, three matching transition/enforce/state — printed collapsed, names not read yet. **Second run:** still `false` with transitions defined — Learn says it is `true` once transitions are *applied*, and that defined transitions are kept but not applied while *Enable Status Reason Transitions* is unticked; 66 descriptor keys, the three still unexpanded |
| T4 | `updateRecord({ statuscode })` into the other state: inferred or refused? | Whether the write pairs the state | **Refused — the state is not inferred.** From `{statecode: 1, statuscode: 2}`, `{ statuscode: 858010001 }` (an Active reason) rejected `{ errorCode: 2147779592, title: "State code or status code is invalid.", message: "State code is invalid or state code is valid but status code is invalid for a specified state code." }` — the platform's own console named it better: *858010001 is not a valid status code for state code cll_TaskState.Inactive*. Within one state, `{ statuscode }` alone is accepted (1 → 858010001, both State 0) |
| T5 | `updateRecord({ statecode, statuscode })` together | The paired write | **Accepted** — `{ statecode: 1, statuscode: 2 }` from `{0, 1}` resolved `{ id, entityType }`, read back `{1, 2}` |
| T6 | A transition outside `TransitionData`, enforced: refused? The message | Whether the server is the guard and the board only hints | **Half, 2026-09-29, with `EnforceStateTransitions` `false`:** both disallowed moves were **accepted** — Active → Inactive as the pair `{1, 2}`, and Inactive → Cancelled within the state as `{ statuscode: 858010002 }` — and a card dragged Active → Inactive on the board landed and stayed. A bare Active reason from Inactive was refused again, the T4 refusal, not a transition's. **Third run, *Enable Status Reason Transitions* ticked and published: the server enforces a transition only where the state changes.** Active → Inactive `{1, 2}` (disallowed) **refused** — `{ errorCode: 2147807246, title: "", message: "Action could not be taken for few records before of status reason transition restrictions." }`, the platform's console *"Entity: cll_Task does not have valid status code"* — while Active → Cancelled `{1, 858010002}` (allowed) and Cancelled → Active were accepted; **Cancelled → Inactive `{ statuscode: 2 }` (disallowed, same state) was accepted.** On the board, the refused drag came back under *"… could not be moved, and was put back. Action could not be taken…"* — the rollback, working |
| T7 | `isEditable` for statecode, statuscode, the lane; statecode's `getValue` off-view | The route per column | **Both `false`** — `isEditable("statecode")`, `isEditable("statuscode")` (the lane); `getValue` `"0"` and `"1"`, strings. Both were in the view, so off-view not asked |
| A1 | `getViewId()`, the view FetchXML readable | The server route at all | **Yes** — `"0920e970-…"`, read from `savedquery`. `getFilter()` `null`; loaded 3, `totalResultCount` 3, `pageSize` 4 |
| A2 | Aggregate grouped by the lane + sum + count: row shapes | Reading totals | **As Data Table measured.** One row per lane: `g0` the **number** `1` (the record says `"1"`) with `FormattedValue` "Active"; a Money sum `m0` the number `25` with "$25.00"; `n` 10. Every alias carries `AttributeName` |
| A3 | The subgrid's relationship resolved; count against loaded and `totalResultCount` | The parent condition, or withholding | **Resolved, and it matters.** One candidate, `cll_account`, loaded, 3 of 3 rows pointing at the record. Without it `n` = **10** (the table); with it **3** = loaded = `totalResultCount` |

**First run answered 2026-09-29** on the Accounts form's Kanban subgrid,
bound to `cll_task.statuscode` (Active 1 and In Progress 858010001 in state
0, Inactive 2 in state 1), with a new Currency column `cll_estimatedvalue`.
What it decides:

- **A move across states sends both columns**: `{ statecode: <the target
  reason's State>, statuscode }`, the state read off the descriptor option
  `getEntityMetadata` already returns — no new call, no new feature. Within a
  state, `statuscode` alone, as today. A `statecode` board sends
  `{ statecode, statuscode: DefaultStatus }`, on the same measured shape.
- **The server's refusal of a bare cross-state reason is unreadable**
  ("State code is invalid or…"), which is one more reason never to send it.
- **Lane totals take the Data Table route unchanged**, parent resolver
  included: without the condition the total counted the whole table (10 for
  3). The aggregate's group value is a number and the record's a string —
  `readGroupValue` already joins them.
- **A Status Reason board has no lane colours** unless **Lanes** sets them:
  the reasons carry no `Color` at all.

One oddity to keep: `dump()` printed the view's FetchXML with **no**
`<filter>`, and `agg()` a minute later sent `statecode eq 0` from the same
view — so the view was re-saved between the two (adding the column), and the
designer added its default filter. The rewrite carried it, as it should.

Still open: **T6** (transitions defined and enforced) and T3's descriptor key
names — a second run once `cll_task` has transitions.

### The walkthrough, on 0.4.0

0.3.7 carried the probe and the first look; T6 was answered on it
(2026-09-29), the transitions were built on the answer, and the probe is
gone. **0.4.0 is the walkthrough build** — tagged only after W1–W11, and
0.4.1 if anything is fixed. On the Accounts form: the Status Reason board on
`cll_task`, **Lane total** = `cll_estimatedvalue`, the fifteen tasks
(three plus the twelve `[Kanban test]` ones), transitions enabled as for T6.
Changes since 0.3.7 are the transitions (W9–W11); W2 was seen on 0.3.7.

| | Look at | Right way | Measured |
| --- | --- | --- | --- |
| W1 | The line above the lanes, and each lane's sum | *Totals: all 15 records in the view*; sums as the grid would add them; no `KanbanBoard:` warning in the console || **Passed** 2026-09-29 |
| W2 | Move a card Active → In Progress → Inactive, then back to Active | Each lands and stays; the status changes with it (the pair) | **0.3.7:** Active → Inactive by drag landed and stayed, before enforcement was on; **passed** on 0.4.0, 2026-09-29 |
| W3 | Move a card Active → In Progress | Lands; the update carried `statuscode` alone (network tab) || **Passed** 2026-09-29 |
| W4 | The sums after W2 | Moved with the card, without a reload || **Passed** 2026-09-29 |
| W5 | **Lane limits** `858010001=1`, two cards In Progress | Count reads *2 / 1* in the warning colour; the second card still landed || **Passed** 2026-09-29 |
| W6 | **Page size** 4 | Lanes with unloaded cards read *1 of 5*-style; the caption still says all 15; **Load more** grows them || **Passed** 2026-09-29 |
| W7 | Lane total unbound, Lane limits empty | No totals, no caption, no aggregate request || **Passed** 2026-09-29 |
| W8 | A Status board (Lane column = Status) | A move to Inactive writes `statecode` 1 with its default reason || **Passed** 2026-09-29 |
| W9 | Drag an **Active** card | Inactive is drawn closed and takes no drop; In Progress and Cancelled stay open || **Passed** 2026-09-29 |
| W10 | The **Move to…** menu on an Active card, then on a Cancelled one | Active: In Progress, Cancelled — no Inactive. Cancelled: Active only || **Passed** 2026-09-29 |
| W11 | Transitions **disabled** (untick Enable, publish), reload | Every lane open again, every lane in the menu || **Passed** 2026-09-29 |

## 0.3.0 — the second write route, search, and the +

Picked by the 14 Sep 2026 demand survey: Kanban is named in every "most
requested PCF" write-up, and the two boards people point at (PowerKanban,
Resco's) have a search and a way to add a card that this one did not. The
third change closes the oldest line in `docs/limitations.md` — "cards cannot
be moved in a canvas app" — as far as it can be closed without a canvas app
to measure on.

**A move now has two routes, chosen per record.** `record.isEditable(column)`
decides: `true`, and the value goes `setValue` → `save()` on the record —
no `<uses-feature>`, no install-time prompt, and the route that exists where
`webAPI` does not; `false`, or no write half on the record at all, and it
goes `webAPI.updateRecord` as before. The second route is not a fallback for
old hosts: `isEditable` answers `false` for `statuscode` while the column
reports `OptionSet` (measured on a real subgrid by `pcf-data-table`,
2026-09-11), and `statuscode` is the column a board is most often grouped by.
Deleting `WebAPI` would have broken exactly those boards.

Everything the record route rests on was measured by `pcf-data-table` before
this release and is written up in the skill (*Writing from a dataset
control*): `setValue` returns `undefined`, `isEditable` is a Promise,
`save()` resolving is not the dataset re-reading. What it did **not** measure
is the same call from a dataset with `property-set` roles — whether
`setValue` wants the column's `name` there, as `getValue` does — and that is
Q1/Q2 of the 0.2.2 probe below.

**The + passes the lane as a form parameter.** `openForm(options, parameters)`
— the second argument, typed `{ [key: string]: string }`, so the option
number goes as a string. `createFromEntity` is seeded from
`mode.contextInfo` where a parent exists. The resolve shapes are
`pcf-data-table`'s measurements; whether the parameter *preselects* a choice
column on a quick create is Q4.

**Search is client-side, and says so.** `matchesQuery` in `lanes.ts` is a
substring over title, assignee and badge. `setFilter` was the alternative and
was rejected: a fetch per keystroke, a refresh that drops the optimistic
overlay each time, and a board that loads more rather than turning pages is
already working on a set the reader chose. The count reads "2 of 9", and per
lane "1 of 3", so a narrowed lane never looks like an empty one.

### The 0.2.2 probe

Sent 2026-09-14, a throwaway build with `probe.ts` and no feature code. The
rule: an answer that goes the wrong way removes the feature that depends on
it. The questions, and what each decides:

| | Question | Decides | Measured |
| --- | --- | --- | --- |
| Q1 | The record carries `setValue`/`save`/`isEditable`; what `isEditable(status.name)` answers | The record route exists on this shape | **Yes** — all four present (`isDirty` too), `isEditable` returned a Promise, `isEditable("cll_status")` = `true`. The role column arrived as `{ name: "cll_status", alias: "statusField", dataType: "OptionSet" }` |
| Q2 | `setValue(status.name, int)` + `save()` commits, read back through the Web API | The record route writes the right column | **Yes** — `setValue("cll_status", 858010001)` returned `undefined` (+4 ms), `save()` resolved `{ etn: "cll_task", id: { guid: "991e0dc8-…" } }` at +438 ms, and `retrieveRecord` read back `858010001` at +513 ms. `name`, not `alias`, on a property-set column |
| Q3 | An `updateView` arrives after `save()` without `refresh()`, or only with it | Whether the `refresh()` in `finally` is load-bearing | **One arrives on its own — carrying the old value.** In the 15 s after `save()`, one `updateView` and `getValue` still `858010000`; after `refresh()`, one more and `858010001`. So `refresh()` is what re-reads, and an override retired on "a repaint came" would snap the card back |
| Q4 | `openForm({ useQuickCreateForm }, { [status.name]: "2" })` opens with the lane chosen; string vs number | The + | **Yes, both** — the quick create for `cll_task` opened with Status set to the lane, from `"858010002"` and from `858010002` alike; dismissed, it resolved `{ savedEntityReference: null }`. The platform **appended `recordSetQueryKey` to the options object** it was handed |
| Q5 | The shape of `Attributes.get(column).OptionSet` | The oldest *Not verified* entry below | **Measured** — see *Where the option set lives* below |
| Q6 | `mode.contextInfo` on this subgrid | `createFromEntity` on the + | **Present** — `{ entityTypeName: "account", entityId: "7de84297-…" (unbraced, lower-case), entityRecordName: "Adventure Works (sample)" }` |

**All six answered 2026-09-14, nothing cut.** Q2–Q4 by active calls on the
Accounts form's Kanban subgrid (`cll_task.cll_status`, a card moved from
lane 858010000 to 858010001 and read back through the Web API). Q1, Q5 and Q6 answered the same day from the passive dump on the Accounts
form's Kanban subgrid (`cll_account.cll_status`). Q2–Q4 need the active calls.
Fill the last column in from the console output before tagging 0.3.0. If Q2
fails, `write()` loses its first branch and the manifest comment goes back to
one route; if Q4 fails, the + goes with it.

### Where the option set lives — measured 2026-09-14

The question this repo has carried since 0.1.0, answered by the probe's
`describeShape` of `metadata.Attributes.get("cll_status")`. The attribute is a
class instance carrying the option set **three times**, in two shapes:

- `OptionSet` and `_optionSet` — **a map keyed by the option value**:
  `{ 858010000: { text, value }, … }`. No array, no `Options`, no colour.
  This is the shape `pcf-data-table` 0.4.0 measured on its own column, and
  the one `optionLanes()`'s walk finds.
- `attributeDescriptor.OptionSet` — **an array**:
  `[{ Color, Label, Value, TransitionData, IsHidden } ×6]`, in the maker's
  order. **`Color` is present here**, which is where the lane accent colours
  have been coming from; the skill's note that `Color` is "absent everywhere"
  was true of the map, not of the descriptor array.

So there was never a mystery about *whether* the options were reachable —
only that `Attributes.get(column).OptionSet.Options` names a key that does
not exist on either shape. The walk stays, because it reads both; the direct
route, if anyone wants one, is `attributeDescriptor.OptionSet` for order and
colour and `OptionSet[value].text` for a label.

### The move, timed

`setValue` +4 ms, `save()` resolved +438 ms, the Web API holding the value
+513 ms — and the dataset the control reads from still holding the *old*
value through the one `updateView` that arrived unasked in the next fifteen
seconds. That pass is the trap: a control that retired its override on "an
`updateView` came after the save" would put the card back in its old lane
for the length of a fetch and then move it forward again. `reconcile()`
compares against the record's value and keeps the override until it agrees,
which is what makes the platform's unasked pass harmless. The `refresh()`
in `finally` is what produces the pass that agrees.

Two id spellings, on the same page: the grid's `getId()` hands back
`{991E0DC8-…}`, braced and upper-case; `dataset.records` is keyed
`991e0dc8-…`, unbraced and lower-case. The first probe call passed the
grid's spelling and found no record.

### What the rig had to learn

**Each host gets its own rows now.** `record.save()` commits into the row and
the next fetch applies it — and the rig's rows were the fixture's own objects,
shared by every host a suite creates. A test that moved `w1` to lane 3 left
`w1` in lane 3 for the rest of the file, so "move `w1` to 3" became a no-op
that passed as "a refused write put it back", and seven assertions failed in a
pattern that pointed at the control. The template's dataset rig has the same
`reread()` and the same shared rows; it is fixed there in the same pass.

**`navigation.openForm` logs both arguments.** The template's stub logged the
options only, which would certify a + that opens a blank form. Fixed in both.

**A mutation that trips a lint rule is not a mutation.** `!editable || editable`
hit `no-constant-condition`; `pcf-scripts` printed the error, emitted no
bundle, exited 0, and the suite failed at "bundle registered a control" — which
reads as a broken build rather than as an unmeasured mutation. The skill
already says this; it is still worth watching for. `allowed !== undefined` was
the mutation that was actually seen: the bundle hash changed and six
assertions failed.

## What the build disagreed with

**`WebAPI` had to become `required="false"`, or the control would not load in a
canvas app at all.** The tempting reading of the canvas limitation is that
`context.webAPI` is simply absent and a control checks for it. That is true only
with `required="false"`; with `required="true"`, the documented behaviour on a
host lacking the feature is a design-time warning and *component load failure at
runtime*. Not a degraded board — no board, from a control that reads a view
perfectly well without its write, with a symptom (blank space) pointing nowhere
near its cause (one XML attribute).

So the manifest declares it optional and `index.ts` feature-detects
`context.webAPI?.updateRecord`, which is deliberately narrower than the type:
`context.webAPI` is typed as always present, and that is a claim about the type
definitions rather than about the host.

→ Promoted to the skill: `control-patterns.md`, *Feature usage*.

## A board cannot scroll sideways on CSS alone

`overflow-x: auto` needs a definite width to scroll inside, and whether it has
one depends on a host this control does not control.

Measured in a browser across six host shapes, four 280px lanes in a 700px
viewport:

| Host | CSS only | With `allocatedWidth` ceiling |
| --- | --- | --- |
| block, flex row, grid | scrolls | scrolls |
| `fit-content`, `inline-block`, `table` | **clipped** | scrolls |

The three that fail are the shrink-to-fit shapes. They take their width *from*
their content, so `width: 100%` and `max-width: 100%` resolve against a number
the board itself produced — a circle, constraining nothing. The lanes extend,
an ancestor clips them, and no scrollbar ever appears.

Nothing written inside the control can break that circle, which is why two CSS
fixes in a row did not: `min-width: 0` addressed a flex trap that only applies
on the main axis and was inert here, and `max-width: 100%` was the circular
one. The way out is a number from outside it —
`context.mode.trackContainerResize(true)` in `init`, then
`context.mode.allocatedWidth` as a pixel ceiling on the root.

`trackContainerResize` is what populates `allocatedWidth` at all; without the
call it is not provided. Guard the value: `-1` means no limit and `0` means not
yet laid out, and neither is a width to pin anything to.

→ Promoted to the skill: `control-patterns.md`, *Scrolling wider than the
container*, plus two review-checklist items.

## Reading the option set: what has actually been tried

Three attempts, and the sequence is the point — each looked obviously right.

1. **Walk own properties for `Attributes` → `OptionSet` → `Options`.** Found
   nothing. `getEntityMetadata` resolves with a class instance whose own
   enumerable properties are private fields; `Object.keys` and `Object.values`
   do not enumerate prototype getters, so the public API was invisible.
2. **Walk own properties *and* prototype accessors, searching for anything
   shaped like an option set.** Works. This is what ships.
3. **Read `metadata.Attributes.get(column).OptionSet.Options` directly**, on the
   reasoning that a search is expensive and the shape was now understood.
   Found nothing on a real form, while (2) had just worked against the same
   object. Reverted.

The lesson is narrower than "searching is safer". It is that the *only* level
anyone has observed is the top one, and every attempt to infer the levels below
it has been wrong. (3) was made with that written down as the risk, and it was
still made — so the walk is now load-bearing until someone dumps
`metadata.Attributes` and sees what is in it.

## The lane default was wrong, and why

The first version derived lanes only from the values present in the loaded
records, with the `lanes` property as the escape hatch. The metadata call was
rejected on the grounds that it costs a second install-time permission prompt
and does not exist in canvas.

The second half of that was wrong, and it is the half the decision rested on.
`WebAPI` does not exist in canvas either, so the board is read-only there
whatever this control does — a lane nobody can move a card into is decoration.
Declining `Utility` bought canvas nothing and cost model-driven the behaviour
that makes a board a board.

What it looked like in practice, on a real form: every task in one status, so
one derived lane, so no drop target and a move menu that opened empty. Not an
edge case — that is what a board looks like before anyone has moved anything.

Now: the option set where it can be read, derived lanes where it cannot, and
`lanes` as an override for a subset or a custom order. `Utility` is declared
`required="false"` for the same reason `WebAPI` is — a host that lacks it should
leave it absent, not refuse to load the component.

**And the first attempt at that still showed one lane on a real form**, which is
worth recording because the cause was not the metadata call.

`getEntityMetadata` is asynchronous and `updateView` is not, so the answer was
stored on the control instance and `notifyOutputChanged()` was called to get a
repaint. That does not repaint. The call announces that *outputs* changed — and
fetching lanes changes no output — so the platform has no reason to call
`updateView` again. The lanes arrived and nothing rendered them.

**A virtual control cannot push a render from outside React.** The fix is to
stop trying: `index.ts` hands the component a `loadLanes` function instead of a
result, and the component holds the answer in `useState`, where a repaint has no
precondition. `pcf-data-table` mirrors its selection in React for the same
underlying reason, described there as a harness quirk — it is more general than
that.

The fallback is also no longer silent. A metadata call that rejects, or returns
a shape `optionLanes()` does not recognise, now warns to the console naming the
entity and column, because "one lane" looks identical whether the feature is off,
the call failed, or the traversal missed.

## What getEntityMetadata actually resolves with

Not a plain object. It is a **class instance**: its own enumerable properties
are private fields, and the public API is getters on the prototype.

Observed on a real form, `getEntityMetadata("cll_task", ["cll_status"])`:

```text
{ _entityDescriptor: { Initialized, Id, EntityLogicalName, EntitySetName,
                       PrimaryIdAttribute, ObjectTypeCode, …+50 },
  _entityType: string, _attributes: [string ×1], _activityTypeMask: number,
  _autoRouteToOwnerQueue: boolean, …+38 }
```

Two things to take from that. `_attributes` holds the column **names that were
asked for**, not their metadata — so the `attributes` argument is a request, not
a result. And `Attributes`, the public collection, does not appear at all,
because `Object.keys` and `Object.values` do not enumerate prototype getters.

That is what defeated two attempts at reading the option set. Walking the object
found the private fields, missed the public API entirely, and concluded the
entity had no attributes — while `metadata.Attributes` would have returned the
collection perfectly well, since property *access* traverses the prototype chain
even though enumeration does not.

So any code that goes looking through `EntityMetadata` has to walk prototype
accessors, not just own properties, and guard each read because a getter runs
code. `optionLanes()` does; the two versions before it did not.

→ Promoted to the skill: `control-patterns.md`, *Context APIs and their limits*.

## Platform behaviour worth knowing

**A lookup column inside a dataset returns JSON in canvas.** Read from the
`DataSet` API reference, not observed: in canvas apps a lookup included in the
dataset retrieves the whole referred record, and `getFormattedValue` returns a
JSON string where model-driven returns the display name. This board renders
`getFormattedValue` straight onto the card, so a `Lookup.Owner` assignee role
would read "Dana Whitfield" on a form and print `{"id":…}` on every card in
canvas. That is why `assigneeField` and `badgeField` are `SingleLine.Text`
despite an owner lookup being what a card actually wants to show.

→ Promoted to the skill: `control-patterns.md`, *Canvas vs model-driven*.

**An optimistic write costs three things, not one** — an override map, a
reconcile step that retires overrides when refreshed data agrees rather than
when the promise resolves, and a rollback. `pcf-tag-list` has no `.catch()` at
all, which is survivable for a chip that vanishes and reappears and not for a
card that has visibly moved lane.

→ Promoted to the skill: `control-patterns.md`, *Writing from a dataset control*.

## Demo

`mocked` since 2026-09-28; `limited` before that.

**Until then the demo could not show the default behaviour.** The fixture
format carried one value per column and could not describe an option set, so
derived lanes would have been titled 1, 2 and 3. Every preset set the `lanes`
override instead, which exercised the escape hatch and hid the thing a real view
does. Load more was inert as well, until pcfhub/pcfhub#51.

pcfhub/pcfhub#52 let a fixture describe its columns. `demo/records.json` now
carries a stand-in Dataverse whose `cr123_status` lists its three options, each
with a colour. It was checked with 0.3.3's published bundle against that
harness, before the push:

- *Sprint board*, Lanes empty: New, Active and Resolved, each in its option's
  colour, through `getEntityMetadata`. A move to Resolved went through
  `record.save` and a refresh, and survived a property change.
- The stand-in makes the demo a model-driven host, so each lane carries a
  **+**. It asks `openForm` for `cr123_workitem`'s quick create form.
- *Lanes set by hand* (`1=To do #0f6cbd,…`): the declared labels and colours
  win, and no metadata call is made.
- *Narrow lanes* at six a page: Resolved is on the board, empty, until Load more
  brings its two cards.

**A refused move shows since 2026-09-28.** Until then the stand-in accepted
every write, so the rollback never ran. pcfhub/pcfhub#53 let a fixture declare
faults, and this one refuses an update setting `cr123_status` to 3, resolving a
work item, as a plugin might. A value fault rather than a column fault, so every
other move still saves.

Seeing the card come back took two more fixes, one on each side:

- **The harness did not re-render after `notifyOutputChanged()`.** With 0.3.4
  and the fault, the message appeared and the card stayed in Resolved. The
  overlay in `useOptimisticLanes` clears only when the board's content changes,
  and the render showing the pending move never came. pcfhub/pcfhub#54 added
  it. It also had to be a microtask rather than a later task, because the
  stand-in's refusal arrives within the same turn and its handler ran first.
- **0.3.5: a card refused twice in a row stayed in the refused lane.** Found on
  the #54 harness. The second move changes no output (`movedRecordId` names the
  same card), and a notify with unchanged outputs brings no `updateView` — the
  rule measured on a form above, for the lanes. So no render showed the pending
  move. After the refusal, the refreshed board read exactly as it had before the
  drop, so the content key never moved and the overlay stayed. That is a form
  bug, not only a demo one.

  0.3.5 counts refused moves in `failedMoves` and hands the count to the board,
  which clears the overlay when it changes. The refresh after a refusal always
  renders, so the count always arrives. `dev/smoke.js` asserts that the count
  rises for each refusal, the same card's included. It cannot see the overlay
  itself, which lives in a rendered component.

Checked with the 0.3.5 build on the #54 harness, *Sprint board*, before the
push:

- Rework refused into Resolved twice running, and Audit likewise after a move
  to Active: each returned to its lane, under "Rework the onboarding email
  sequence could not be moved, and was put back. Only a team lead can resolve a
  work item.";
- Audit's move to Active landed and stayed.

**The check found a bug in 0.3.3, fixed in 0.3.4: the Move menu never offered
an empty lane.** The lane columns render from the option set once it lands, but
each `LaneColumn` spread `{...props}`, so the `lanes` a card's menu filtered was
`props.lanes`. That is the synchronous set `index.ts` derives from the cards,
and it holds only lanes some card is in. On a real form, a card could be dragged
into an empty lane but not moved there from its menu, which is the keyboard
route and the dependable one on a phone (`docs/faq.md`).

0.3.4 passes the rendered `lanes` to `LaneColumn` explicitly. It was checked on
the hub's harness with the new fixture and *Narrow lanes* before Load more:

- 0.3.3's published bundle offered Rework's card *Active* only;
- the 0.3.4 build offered *Active* and *Resolved*, and the move into the empty
  lane landed ("Resolved, 1 cards").

`npm run smoke` cannot see this. The option-set lanes arrive through a
`useEffect`, and the rig drives `index.ts`'s props, never a rendered
component.

→ The fixture limitation was promoted to the skill (`pcfhub-manifest.md`,
*datasetFixture*). It is lifted now, and the skill should say so.

## Not verified

Everything here needs a real model-driven form. None of it can be settled from
this repository, and the first one is load-bearing.

- ~~That `column.name` on an aliased property-set column is the name
  `record.setValue` wants.~~ Measured, Q2: `cll_status` staged and saved,
  read back from the Web API. The Web API route on the same column is what
  0.2.x relied on; the same read-back covers it.
- ~~That a canvas app's dataset records carry the write half at all.~~
  Measured 2026-10-10 (*The canvas run*): they do — `setValue` + `save()`
  write a text column — but a Choice stages `null` in every shape tried, so
  a move still cannot be made in canvas.
- **The React warning on the canvas mount** — which component the board
  renders that the canvas host's platform library lacks.
- **0.5.0, from the 0.4.8 probe (2026-10-10):** the sort on a **main grid**, and
  whether it changes the grid's own sort for the user (P7); a caller **without**
  Assign — what `hasEntityPrivilege(…, 5, …)` answers and what the server
  refuses (P6); a user-to-user reassignment that succeeds (P3 had only a user
  without read on the table).
- ~~That a form parameter preselects a choice column on a quick create, and
  that it wants a string.~~ Measured: a string works, and so does a number.
  The control keeps the string, which is what the typings declare.
- **`openForm` mutates its options argument.** After the call the object
  carried a `recordSetQueryKey` the control never set. `createCard` builds a
  fresh object per call so nothing here reads it back; a control that reused
  one would find the platform's key on the second call.
- **That a table with no quick create form falls back to the main form** with
  the parameter still applied. Documented behaviour of `openForm`, not
  observed here.
- ~~That a choice column's `getValue()` returns the option's numeric value.~~
  It does not: `pcf-data-table`, `pcf-chart-view` and `pcf-calendar-view` each
  measured the string `"3"` on a model-driven subgrid. The hub's harness hands it
  over the same way since pcfhub/pcfhub#52, and the board groups, moves and
  reconciles correctly on the string there.
- **That the optimistic override reconciles rather than accumulating** across a
  refresh, and that a record leaving a filtered view retires its override.
  Until 2026-09-29 it could not reconcile on a form at all: `reconcile()`
  compared `getValue()` — the string `"3"`, measured — with the number it
  asked for, so an override retired only when the record left the view, and
  a card dropped back where it started was written again through the record.
  The old rig answered a number and hid both; the template's answers the
  string, and the suite now asserts both routes. Harmless while the override
  equalled the data; a card another user moved afterwards would have stayed
  where this board last put it.
- **That a refused write rolls the card back.** Never executed anywhere: the
  demo harness's mock resolves, and no real environment has refused one yet.
- **That the canvas lookup-JSON behaviour above is real.** Read from
  documentation; nobody has put a lookup role on this board and looked.
- ~~Where in `EntityMetadata` the option set actually lives.~~ Measured
  2026-09-14; see *Where the option set lives* above. The walk stays because
  it reads both shapes, not because the shape is unknown.
