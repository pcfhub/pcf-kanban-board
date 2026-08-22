# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

[![Build](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-kanban-board/actions/workflows/release.yml)

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

Every card also carries a **Move to…** menu. HTML5 drag-and-drop has no keyboard
equivalent, so a board that only supported dragging could not be operated
without a mouse at all.

## Properties

Bind the dataset to a view, then bind the four column roles. **Lane column** and
**Card title** are required; every column bound to a role must be in the view.

| Role | `property-set` | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| Lane column | `statusField` | OptionSet | **yes** | The choice column that decides the lane. Its options are the lanes, and a move writes one. |
| Card title | `titleField` | SingleLine.Text | **yes** | The card headline, and the name used when a move fails. |
| Assignee | `assigneeField` | SingleLine.Text | no | A second line under the title. Text, not a lookup — see below. |
| Badge | `badgeField` | SingleLine.Text | no | A short value shown as a chip. |

The first column is what a maker sees in the property pane; the second is the
name in the manifest, which is what a column carries in `alias` and what the
code looks it up by.

| Property | Type | Default | What it controls |
| --- | --- | --- | --- |
| `lanes` | SingleLine.Text | — | `1=New,2=Active,3=Resolved`. Overrides the option set: fixes the lanes and their order, and an option left out gets no lane. Required in canvas apps. |
| `laneWidth` | Whole.None | `280` | Lane width in pixels. Floors at 160. |
| `laneColors` | TwoOptions | `true` | Show each lane's option colour as a bar. No effect where the lanes did not come from the option set. |
| `openOnCardClick` | TwoOptions | `true` | Card titles open the record. The move menu stays either way. |
| `pageSize` | Whole.None | `50` | Records per fetch. The board loads more rather than paging; the platform clamps large values. |

| Output | Type | Set when |
| --- | --- | --- |
| `movedRecordId` | SingleLine.Text | A card is dropped into another lane |
| `openedRecordId` | SingleLine.Text | A card title is clicked |

Both outputs are set **before** the platform call they describe, so a form can
observe the intent even where the call does nothing — the canvas case for
opening a record, and the failure case for a move.

Notes that do not fit a table:

- **Assignee and Badge are text columns.** A lookup such as `ownerid` cannot be
  bound. In canvas, a lookup read through a dataset returns JSON rather than a
  display name, so a lookup role would print `{"id":…}` on every card there.
- **React and Fluent come from the platform**, not the bundle —
  `control-type="virtual"` with `<platform-library>` entries. The shipping
  bundle is 16 KB.
- **Localised into five languages**: English (1033), Spanish (3082), French
  (1036), German (1031) and Japanese (1041).
- **Two permissions** are requested at install: `WebAPI` to write a move, and
  `Utility` to read the option set. Both are optional features, so a host
  without them loads the control anyway.

## On the hub

`demo.fidelity` is **`limited`**, and there are five separate reasons rather
than one — which is why it is not `mocked`.

The write is mocked: the harness has no environment to update, so a card moves
because the control places it optimistically and nothing is written. A *refused*
move cannot be shown at all, because the mock resolves — and that rollback is
the reason this control catches at all, so the one path most worth seeing is the
one the demo cannot reach.

Lane colours never appear, and the lanes are declared rather than derived: a
fixture record carries one value per column with no metadata behind it, so there
is no option set to read a colour or a label from. Both presets therefore set
`lanes` explicitly, which means the demo also cannot show the default behaviour
— reading the lanes from the column — that a real board uses.

Load more never appears either; the harness puts every record on one page.

Two presets: **Sprint board**, nine work items across three lanes with one not
yet triaged, and **Narrow lanes, read-only cards**, the shape for a form section
rather than a full page.

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
