# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

## What it does

Binds a view, groups its records into lanes by a choice column, and writes the
new value back through `webAPI.updateRecord` when a card is dragged. It is the
first control in this collection that writes from a dataset, and the decision
that shaped the implementation is that the write is **optimistic**: the card
moves the instant it is dropped, and the control carries the bookkeeping needed
to take that back if the write is refused.

## What was verified

Run locally on Windows, 2026-08-22:

- `npm run check`, `npm run lint`, `npm run build` — all clean.
- **Bundle: 12,190 bytes**, from the msbuild production pack. This is the
  shipping figure — the one to quote.
- The development bundle `npm run build` writes is **43.3 KiB**, about **3.6×**
  larger. Measured after deleting `obj/`, `out/`, `Solution/obj/` and
  `Solution/bin/`, because the pack is incremental and will otherwise report
  both packs complete while leaving whatever `npm run build` last wrote in
  `out/`. Confirmed by looking: the packed bundle opens
  `var pcf_tools_…;(()=>{"use strict"…` with a license-reference header and no
  webpack development banner.

  Worth noting against the skill's "roughly double": 3.6× here. A virtual
  control externalises React and Fluent, so what remains is almost entirely this
  control's own code and the development wrapper is a proportionally larger
  share of it. One measurement, not a correction.
- Solution pack: `Solution.zip` 11,659 bytes and `Solution_managed.zip` 11,659
  bytes — the same size, different contents (verified by checksum).
- **No `release.artifacts` block is needed.** msbuild names the unmanaged zip
  after the project file, so it lands as `Solution.zip`, matching neither of the
  hub's default globs. The template's `release.yml` finds it by glob — every
  `*.zip` that is not `*_managed.zip` — and renames it to
  `Solution_unmanaged.zip`, which does match. That rename is project-name
  agnostic, so nothing here has to be declared.
- `npm run check` validates `demo.bundle` and `demo.styles` once `out/` exists.
  Confirmed by breaking the path on purpose: with
  `out/controls/PCFHub.KanbanBoard/bundle.js` the check names the namespace
  prefix as the mistake and refuses. The correct path is the constructor alone.
- Every CSS class the component uses has a rule, and every rule has a user
  (cross-checked mechanically, not by reading).
- Both demo presets spell out all four manifest inputs, with no unknown keys and
  exactly one `isDefault`.

## What was not verified

Everything below needs a real model-driven form, and none of it can be settled
from this repository.

- **That `column.name` on an aliased property-set column is usable as the Web
  API attribute name in `updateRecord`.** This is the load-bearing assumption of
  the whole control: the write is
  `updateRecord(entityType, id, { [statusColumn.name]: value })`. If the name a
  dataset column reports is not the attribute logical name, the write fails and
  the fallback is a plain text input naming the column explicitly — the same
  escape hatch the lanes already have.
- **That a choice column's `getValue()` returns the option's numeric value.**
  The type union includes `number` and everything else about the design follows
  from it.
- **That the optimistic override reconciles rather than accumulating.**
- **That a refused write rolls the card back.** The demo harness's Web API mock
  resolves, so the rollback path has never executed.

## WebAPI must be `required="false"`, or canvas apps get a blank space

The finding that changed the manifest.

Dataverse-dependent APIs including the Web API are [not available to code
components in canvas apps][limits]. The tempting reading is that `context.webAPI`
is simply absent there and a control checks for it. That is true only with
`required="false"`.

With `required="true"`, the [documented behaviour][uses-feature] on a host that
does not support the feature is a design-time warning and **component load
failure at runtime**. Not a degraded board — no board. A control that is 90%
useful without its write would have rendered nothing at all in canvas, and the
symptom (a blank space) points nowhere near the cause (one XML attribute).

So the manifest declares `required="false"` and `index.ts` feature-detects
`context.webAPI?.updateRecord`, which is deliberately narrower than the type:
`context.webAPI` is typed as always present, and that is a claim about the type
definitions rather than about the host.

Custom pages are the exception worth knowing: they have runtime Web API support,
but the studio preview reports *Method not implemented*, so the control looks
broken in authoring and works once published.

[limits]: https://learn.microsoft.com/power-apps/developer/component-framework/limitations
[uses-feature]: https://learn.microsoft.com/power-apps/developer/component-framework/manifest-schema-reference/uses-feature

## An optimistic write needs three things, not one

`pcf-tag-list` writes and has no `.catch()` anywhere: a failed create or delete
surfaces only as the dataset not changing. That is survivable for a chip that
vanishes and reappears. It is not survivable for a card that has visibly moved
lane, because the board is then asserting something about the data that is not
true.

What that costs, in full:

1. **An override map.** `pending` holds record id to the lane value this control
   asserted. Cards are placed from it in preference to the data.
2. **A reconcile step.** Overrides retire in `updateView` when the refreshed
   record reports the asserted value — *not* when the promise resolves. A
   resolved `updateRecord` means Dataverse accepted the write, not that the
   dataset has re-read it; clearing on resolve drops the override while the old
   value is still on screen and the card visibly jumps back and then forward.
   An override also retires when the record leaves the view entirely, which is
   what happens on a filtered view when the card is moved out of it. Without
   that second case the map grows for the lifetime of the control, and every
   entry in it is a card being placed from memory rather than from data.
3. **A rollback.** The `.catch()` removes the override so the card returns to
   the lane the record is actually in, and names the failure above the board.
   The card's title is read *before* the write is sent, because by the time a
   rejection arrives the record may be gone from a refreshed dataset and a
   failure message that cannot name the card is most of the way to useless.

## The demo fixture cannot express a choice

The fixture format carries **one value per column**, so there is no way to say
that a record's status is option `2` *and* that option `2` is called "Active".
`getFormattedValue` has nothing to return but the value itself.

Two consequences, both live in this repo:

- `laneValue()` accepts an integer-valued string as well as a number. On a real
  host this is dead code — a choice column's raw value is a number — but without
  it, a fixture written with numbers that the harness stringifies would put
  every card in *Unassigned*, and the published demo would misrepresent the
  control. It stays narrow on purpose: `"Active"` still parses to `null`,
  because a role bound to a text column should look unbound rather than invent
  lanes it cannot write back.
- Both demo presets set the **Lanes** override, or the lanes would be titled 1,
  2 and 3. So the derive-from-data default — the behaviour a real view uses, and
  the reason lanes are derived rather than read through `Utility` — is the one
  thing the demo cannot show. It is listed in `demo.limitations`.

## A lookup read through a dataset returns JSON in canvas

Why `assigneeField` and `badgeField` are `SingleLine.Text` rather than
`Lookup.Owner` and `OptionSet`, which is what a card actually wants to show.

`ownerid` is bindable in principle: the schema reference lists `Lookup.Owner`
as a valid `property-set` type — "a single reference to either a team or a user
record". Two things make it the wrong choice here.

Lookup types are model-driven only; the framework's own lookup sample says so
outright. And the `DataSet` reference gives the deciding detail, under *Lookup
columns*: in **canvas apps**, a lookup included in the dataset retrieves the
whole referred record, and `getFormattedValue` **returns the JSON string** while
`getValue` returns the JSON object.

This board renders `record.getFormattedValue(assignee.name)` straight onto the
card. So a lookup role would read "Dana Whitfield" on a form and print a JSON
blob on every card in canvas — clamped to one ellipsised line by the badge and
assignee CSS, which would look like a rendering bug rather than a type mismatch.

The whole `required="false"` decision was about degrading to a readable
read-only board in canvas. Typing an optional decorative role as a lookup would
undo that for the sake of the one host it already works on. Text columns keep
both hosts honest; a maker who needs the live owner is asking for a
model-driven-only feature that this role should not quietly become.

**Not verified:** that canvas JSON shape, or that `Lookup.Owner` binds at all.
Both are read from the documentation, not observed.

## Roles are found by alias and read by name

Not discovered here — `pcf-tag-list` paid for this one — but repeated because
this is only the second control in the collection to declare `property-set`
roles, and the generated types give no help at all: `records` types as a bare
`DataSet` and the roles are invisible to TypeScript.

`column.alias` carries the manifest role name. `column.name` carries the maker's
schema name. Find by `alias`, read by `name`. The lookup is made once, in
`roleColumn()`, rather than spelled out at each call site.

`demo/records.json` uses realistic names that differ from the aliases
(`cr123_status` / `statusField`) specifically so the inversion fails in the demo
rather than only against a real view. A fixture where the two are equal passes
whichever way round the code is written, which is exactly how that bug shipped
once already.

## Bare `loadNextPage()` is the right call for a board

A table passes `loadNextPage(true)` and then repairs what the platform ignores,
because `loadOnlyNewPage` is documented, typed and not honoured. A board wants
the behaviour the bare call already has: `sortedRecordIds` accumulates, the
board grows, and the card you were reading stays where it was.

So this control never slices `sortedRecordIds`, never tracks a page number, and
reads `hasNextPage` only to decide whether to offer **Load more**. The paging
repair that most of `_template`'s dataset variant exists to perform is simply
not needed here — which is the clearest illustration of the template's own
warning that a dataset control which is not a table replaces most of `index.ts`
rather than adjusting it.

## Cards with no status get a lane rather than disappearing

Dropping them would be the tidier board and a silent loss of records the maker
can see in the view. The *Unassigned* lane is not a drop target: writing `null`
back to a choice column is a different intention from moving a card, and not one
a drag should be able to express by accident. Cards can be dragged out of it.

## Keyboard parity is not optional here

HTML5 drag-and-drop has no keyboard equivalent, so a drag-only board cannot be
operated from a keyboard at all — not "is awkward", cannot. Every card carries a
*Move to…* menu that calls the same handler as a drop. It also turns out to be
the dependable path on touch, where dragging is unreliable across mobile
browsers.
