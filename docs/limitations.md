---
title: Limitations
description: What Kanban Board does not do.
order: 7
---

# Limitations

## Cards cannot be moved in a canvas app

Moving a card writes through the Web API, and Dataverse-dependent APIs including
the Web API are [not available to code components in canvas apps][limits]. The
board renders and groups normally there; the drag handles and the *Move to…*
menu are simply not shown.

The control declares the feature as `required="false"` on purpose. Declared
`required="true"`, the documented behaviour on a host that lacks the feature is
not a graceful degradation but **component load failure at runtime** — a blank
space where the board should be. Read-only is the better failure.

Moves work in model-driven apps, and in custom pages once published.

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
