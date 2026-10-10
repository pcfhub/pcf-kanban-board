# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

> **Reference example · built with AI.** This control was written with AI (Claude) and tested on a live Dataverse form; its code has not been reviewed line by line. It is published as a worked example and is not maintained — read the source and [`SPEC.md`](SPEC.md) (what was measured on the form) before you use it. Fixes are not guaranteed.

[![Build](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/release.yml)

[![Try it live on PCFHub](https://pcfhub.dev/badges/try-it-live.svg)](https://pcfhub.dev/components/pcf-kanban-board)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-kanban-board), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Binds a Dataverse view and groups its records into lanes by a choice column.
Dragging a card into another lane writes the new option back to the record.

The subgrid this replaces can show the same rows, but it cannot show them
*arranged* by status, and changing a status through it means opening a record.
That is the whole of the difference: the board makes the status visible as
position, and moving a card is the edit.

Three decisions a reader would otherwise question.

**The lanes come from the choice column's option set, not from the data.**
Deriving them from the loaded records is cheaper and needs no permission, but it
cannot show a lane nothing is in yet — and a board whose empty columns are
missing is a board nobody can move a card *into*. So the control reads the
option set through `context.utils.getEntityMetadata`, which costs an
install-time permission prompt and is the reason there are two. The `lanes`
property overrides it when you want fewer lanes, a different order, or labels of
your own.

**The write is optimistic, and it rolls back.** The card lands where it was
dropped before the round trip finishes, because nobody waits on a drag. That
means the board briefly asserts something the data does not yet say, so the
control keeps the moves it has claimed but not seen confirmed, retires them as
refreshed data agrees, and puts a card back where it came from if the write is
refused. A card sitting in a lane its record is not in is the failure worth
designing against.

**Canvas apps get a read-only board.** The Web API and the metadata call are
both Dataverse-dependent and absent there. Both features are declared
`required="false"` rather than `required="true"` — the difference is that the
control renders and declines to move cards, instead of failing to load and
leaving a blank space whose cause is one XML attribute.

**Lane totals come from Dataverse, over the whole view.** A sum over the cards
loaded is a confident number about the wrong thing on any board with **Load
more**, so a bound Lane total is one aggregate query per board — the view's own
FetchXML, grouped by the lane — through the template's shared view-aggregate
library, related to the form's record on a subgrid the way the subgrid is.
Where that cannot be done honestly, the board adds up its cards and a line
above the lanes says so.

**Swimlanes write too (0.5.0).** A **Swimlane column** splits the board into a
row per value, and a card dropped into another row writes that column — a
choice or Yes/No the way the lane is written, Owner and a lookup through the
Web API as an `@odata.bind`, because a dataset record stages a lookup as empty
and the save is refused (measured). Lane and row change in one write. Owner
rows are offered only to a user whose roles allow Assign.

**The sort is the view's own (0.5.0).** **Sort cards by** and the optional sort
menu mutate `dataset.sorting` and refresh, so **Load more** keeps the order;
only a column the board loads is offered, because a form ignores a sort on any
other without a word.

Every card also carries a **Move to…** menu. HTML5 drag-and-drop has no keyboard
equivalent, so a board that only supported dragging could not be operated
without a mouse at all.

## Properties

Bind the dataset to a view, then bind the column roles. **Lane column** and
**Card title** are required; a column bound to a role is fetched whether or not
the view selects it.

| Role | `property-set` | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| Lane column | `statusField` | OptionSet | **yes** | The choice column that decides the lane. Its options are the lanes, and a move writes one. |
| Card title | `titleField` | SingleLine.Text | **yes** | The card headline, and the name used when a move fails. |
| Assignee | `assigneeField` | SingleLine.Text | no | A second line under the title. Text, not a lookup — see below. |
| Badge | `badgeField` | SingleLine.Text | no | A short value shown as a chip. |
| Lane total | `valueField` | Whole, Decimal, FP or Currency | no | Added up per lane and shown under its name, over the whole view where Dataverse can answer. |
| Swimlane column | `swimlaneField` | OptionSet, TwoOptions, Owner or Lookup | no | 0.5.0. A row per value; a card dropped into another row writes it. |

The first column is what a maker sees in the property pane; the second is the
name in the manifest, which is what a column carries in `alias` and what the
code looks it up by.

| Property | Type | Default | What it controls |
| --- | --- | --- | --- |
| `lanes` | SingleLine.Text | — | `1=New,2=Active,3=Resolved`. Overrides the option set: fixes the lanes and their order, and an option left out gets no lane. Required in canvas apps. |
| `laneWidth` | Whole.None | `280` | Lane width in pixels. Floors at 160. |
| `laneColors` | TwoOptions | `true` | Show each lane's option colour as a bar. No effect where the lanes did not come from the option set. |
| `openOnCardClick` | TwoOptions | `true` | Card titles open the record. The move menu stays either way. |
| `pageSize` | Whole.None | — | Records per fetch; unset, the host's own. The board loads more rather than paging; the platform clamps large values. |
| `parentLookup` | SingleLine.Text | — | On a subgrid, the lookup relating its rows to the form's record, for lane totals. Unset, found; `none` for an unrelated subgrid. |
| `laneLimits` | SingleLine.Text | — | `858010001=5,2=3` — a soft limit per lane. Over it, the count is marked; nothing is refused. |
| `sortBy` | SingleLine.Text | — | 0.5.0. `createdon desc` — the order inside every lane, by a column the board loads. Unset, the view's. |
| `showSort` | TwoOptions | `false` | 0.5.0. A sort menu for the user, kept per table and view in their browser. |

| Output | Type | Set when |
| --- | --- | --- |
| `movedRecordId` | SingleLine.Text | A card is dropped into another lane or row |
| `openedRecordId` | SingleLine.Text | A card title is clicked |
| `createdRecordId` | SingleLine.Text | The quick create opened from a lane's **+** saves |

Both outputs are set **before** the platform call they describe, so a form can
observe the intent even where the call does nothing — the canvas case for
opening a record, and the failure case for a move.

Notes that do not fit a table:

- **Assignee and Badge are text columns.** A lookup such as `ownerid` cannot be
  bound. In canvas, a lookup read through a dataset returns JSON rather than a
  display name, so a lookup role would print `{"id":…}` on every card there.
- **React and Fluent come from the platform**, not the bundle —
  `control-type="virtual"` with `<platform-library>` entries. The shipping
  bundle is 38 KB at 0.4.0 — the lane totals brought the shared view-aggregate library.
- **Localised into five languages**: English (1033), Spanish (3082), French
  (1036), German (1031) and Japanese (1041).
- **Two permissions** are requested at install: `WebAPI` to write a move and
  ask for lane totals, and `Utility` to read the option set (and each status
  reason's status). Both are optional features, so a host
  without them loads the control anyway.

## On the hub

`demo.fidelity` is **`mocked`**: the board works, against a stand-in Dataverse
rather than a real one.

It was `limited` until 2026-09-28, for three reasons, and two are gone:

- **The lanes come from the column.** `demo/records.json` carries a stand-in
  Dataverse whose Status column describes its options, with a colour each
  (pcfhub/pcfhub#52). With **Lanes** left empty the board reads them through
  `utils.getEntityMetadata`, as it does on a model-driven form: the labels,
  their order and the colours. Before that, a fixture could not describe an
  option set, so every preset had to declare its lanes.
- **A move is written and kept.** It goes through the record's `setValue` and
  `save`, into the stand-in, so it survives the next render and a property
  change.
- **A refused move rolls back.** The fixture declares a fault
  (pcfhub/pcfhub#53) refusing any move into Resolved, so the card lands, then
  returns to its lane with the reason above the board. Seeing that also needed
  the harness to re-render after `notifyOutputChanged()` (pcfhub/pcfhub#54),
  and 0.3.5, for a card refused twice in a row.

The stand-in Dataverse also makes the demo a model-driven host, so each lane
carries a **+**. It asks `navigation.openForm` for the quick create form, and
the event log names the form, since there is no form behind the demo.

**Load more works**, since pcfhub/pcfhub#51 gave the harness a view that pages.

Three presets:
- **Sprint board**: nine work items in the option set's lanes and colours, with
  one not yet triaged.
- **Lanes set by hand**: the **Lanes** property filled in, the route a canvas
  app has to take. The declared labels and colours replace the option set's.
- **Narrow lanes, read-only cards**: the shape for a form section rather than a
  full page, six cards at a time. Resolved is on the board, empty, until Load
  more brings its cards.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-kanban-board/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
```

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `KanbanBoard/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `KanbanBoard/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
