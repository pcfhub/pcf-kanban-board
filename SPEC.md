# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

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

`limited`, not `mocked`. The write being mocked is not the only stub: load-more
is inert on a single-page fixture, `openDatasetItem` is logged, and the lanes
have to be declared rather than derived. Four separate things a visitor would
otherwise read as bugs, so `demo.limitations` lists them rather than summarising
them in one word.

Two of those entries are admissions worth keeping visible:

- **The demo cannot show the default behaviour.** The fixture format carries one
  value per column and cannot express an option's number separately from its
  label, so derived lanes here would be titled 1, 2 and 3. Both presets set the
  `lanes` override instead — which exercises the escape hatch and hides the
  thing a real view actually does.
- **A refused move cannot be demonstrated.** The harness's WebApi mock resolves,
  so the rollback never runs. That path is the reason this control catches at
  all, and the demo is the one place you cannot see it.

→ The fixture limitation is promoted to the skill: `pcfhub-manifest.md`,
*datasetFixture*.

## Not verified

Everything here needs a real model-driven form. None of it can be settled from
this repository, and the first one is load-bearing.

- **That `column.name` on an aliased property-set column is usable as the Web
  API attribute name in `updateRecord`.** The whole control rests on
  `updateRecord(entityType, id, { [statusColumn.name]: value })`. If a dataset
  column's `name` is not the attribute logical name, every move fails. The
  fallback is a plain text input naming the column explicitly — the same escape
  hatch the lanes already have.
- **That a choice column's `getValue()` returns the option's numeric value.**
  The type union includes `number`, and the lane derivation follows from it.
- **That the optimistic override reconciles rather than accumulating** across a
  refresh, and that a record leaving a filtered view retires its override.
- **That a refused write rolls the card back.** Never executed anywhere: the
  demo harness's mock resolves, and no real environment has refused one yet.
- **That the canvas lookup-JSON behaviour above is real.** Read from
  documentation; nobody has put a lookup role on this board and looked.
- **That the option-set traversal in `optionLanes()` matches what
  `getEntityMetadata` actually returns.** `EntityMetadata` is typed
  `{ [key: string]: any }`, so the compiler checks none of it and the docs do
  not pin the shape down either. The code accepts a collection with `get()`, an
  array keyed by `LogicalName`, or a plain object, and treats a label as either
  a string or a `UserLocalizedLabel`. If every branch misses it returns `[]`
  and the board falls back to derived lanes — a smaller board, not a broken
  one — so the failure mode is safe but silent. **This is the first thing to
  check on a real form**, because it is the difference between a board that
  works out of the box and one that needs Lanes set every time.

Still open, separately: `overview.md` has no screenshot, and `media/` carries
the template's placeholder logo.
