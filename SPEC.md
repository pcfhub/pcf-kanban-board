# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

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
| Q2 | `setValue(status.name, int)` + `save()` commits, read back through the Web API | The record route writes the right column | *pending* |
| Q3 | An `updateView` arrives after `save()` without `refresh()`, or only with it | Whether the `refresh()` in `finally` is load-bearing | *pending* |
| Q4 | `openForm({ useQuickCreateForm }, { [status.name]: "2" })` opens with the lane chosen; string vs number | The + | *pending* |
| Q5 | The shape of `Attributes.get(column).OptionSet` | The oldest *Not verified* entry below | **Measured** — see *Where the option set lives* below |
| Q6 | `mode.contextInfo` on this subgrid | `createFromEntity` on the + | **Present** — `{ entityTypeName: "account", entityId: "7de84297-…" (unbraced, lower-case), entityRecordName: "Adventure Works (sample)" }` |

Q1, Q5 and Q6 answered 2026-09-14 from the passive dump on the Accounts
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

- **That `column.name` on an aliased property-set column is the name
  `record.setValue` wants**, as it is the name `getValue` takes. Q2 of the
  0.2.2 probe. The Web API half of the same question — that it is the
  attribute logical name `updateRecord` wants — is what 0.2.x has relied on
  since it went onto the Accounts form, and no move there has been written
  down as measured either; Q2 reads the value back and settles both.
- **That a canvas app's dataset records carry the write half at all.** The
  route needs no feature, and the template's rig hands canvas the same records
  as model-driven — but nobody has bound this board in a canvas app and looked.
  The docs say "read-only, in practice" for that reason.
- **That a form parameter preselects a choice column on a quick create, and
  that it wants a string.** Q4. The typings say string; the platform has not
  been asked.
- **That a table with no quick create form falls back to the main form** with
  the parameter still applied. Documented behaviour of `openForm`, not
  observed here.
- **That a choice column's `getValue()` returns the option's numeric value.**
  The type union includes `number`, and the lane derivation follows from it.
- **That the optimistic override reconciles rather than accumulating** across a
  refresh, and that a record leaving a filtered view retires its override.
- **That a refused write rolls the card back.** Never executed anywhere: the
  demo harness's mock resolves, and no real environment has refused one yet.
- **That the canvas lookup-JSON behaviour above is real.** Read from
  documentation; nobody has put a lookup role on this board and looked.
- ~~Where in `EntityMetadata` the option set actually lives.~~ Measured
  2026-09-14; see *Where the option set lives* above. The walk stays because
  it reads both shapes, not because the shape is unknown.
