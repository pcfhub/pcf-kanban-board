---
title: Limitations
description: What Kanban Board does not do.
order: 7
---

# Limitations

## Cards cannot be moved in a canvas app, in practice

A move is written one of two ways: through the record — `setValue` and
`save`, which needs no declared feature — where the platform reports the lane
column as editable for that record, and through the Web API otherwise. Canvas
apps offer code components neither the Web API
([not available there][limits]) nor, as far as this control has seen, a record
it can save, so the board renders and groups normally there and the drag
handles and the *Move to…* menu are simply not shown.

The control declares `WebAPI` as `required="false"` on purpose. Declared
`required="true"`, the documented behaviour on a host that lacks the feature is
not a graceful degradation but **component load failure at runtime** — a blank
space where the board should be. Read-only is the better failure.

Moves work in model-driven apps, and in custom pages once published.

## Adding a card needs a model-driven app

The **+** in a lane header opens the table's quick create form, and there is
one to open only in a model-driven app. Elsewhere — a canvas app, PCFHub's
demo — the button is not shown rather than disabled. The table also has to
*have* a quick create form: with none, the platform opens the main form
instead, which still works but is not quick.

The lane is passed to the form as a field value, so it arrives already chosen.
The other columns are the form's own business — the board sets nothing else.

## Search covers the cards already loaded

The search box narrows what is on the board; it does not query Dataverse. A
board loads more rather than turning pages, so cards past the last **Load
more** are not searched until they are loaded. It matches the title, assignee
and badge — the three things printed on a card — and nothing that is not.

[limits]: https://learn.microsoft.com/power-apps/developer/component-framework/limitations

## The lane column must be a choice column

The lanes are an option set's options and a move writes an option's numeric
value. Bound to a text column, every card shows as *Unassigned*: a label is not
an option number, and the control will not invent a lane it has no way to write
back.

## In a canvas app, a lane with no cards does not appear

In a model-driven app the board reads the choice column's options and shows
every lane, including the ones nothing is in yet. That call —
`context.utils.getEntityMetadata` — is Dataverse-dependent and absent in canvas
apps, so a canvas board falls back to deriving lanes from the records it loaded
and an empty lane has nothing to derive from.

It costs a canvas app nothing it had: without the Web API the board is read-only
there anyway, and a lane no card can be moved into is decoration.

Set the **Lanes** property to declare lanes explicitly if you need them in
canvas, or to fix their order and hide options the board should not offer.

## Lane colours come from the option set, or from you

With **Lanes** left empty on a model-driven board, each lane shows the colour
Dataverse holds for that option, with nothing to configure. Those colours are
assigned automatically when a choice is created, which is why they can be
switched off rather than only on.

Everywhere else — a canvas app, or a board with **Lanes** set — the option set
is not the source of the lanes, so there is no colour to read from it. Declare
one per lane instead:

```text
1=New #6b7280,2=Active #e8d33a
```

What the control cannot do is choose colours for you. There is no palette and no
default assignment: a lane is either given a colour or shows no bar.

## No swimlanes, no sorting, no selection

Cards sit in one dimension of grouping, in whatever order the view returns them.
There is no second axis, no in-lane reordering, and no way to reorder cards by
dragging within a lane — a drop only ever changes which lane a card is in.

The control also reports no selection, which is why the subgrid's command bar is
off: there would be nothing for its buttons to act on.

## Every value is shown as the platform formatted it

Card titles, assignees and badges are read as formatted strings, so the board
never sees a number as a number. It cannot right-align a currency or colour a
card by a numeric threshold.

## Moving a card cannot be undone by the control

A move is a write, and there is no undo. The board's own rollback happens only
when the write *fails* — a successful move is a change to the record like any
other, and reversing it means moving the card back.

## Large views load a page at a time

The board loads more rather than paging, and the **Load more** button appears
while the platform reports further records. There is no virtualisation: a board
with several thousand cards loaded will render several thousand DOM nodes.
