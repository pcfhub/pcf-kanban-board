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

## The lane column must be a choice column, Status Reason or Status

The lanes are an option set's options and a move writes an option's numeric
value. Bound to a text column, every card shows as *Unassigned*: a label is not
an option number, and the control will not invent a lane it has no way to write
back.

**Status Reason and Status** are choice columns of their own kind, and the board
writes them the way Dataverse accepts: a move to a reason of the other status
sends the status too, and a Status board sends the status's default reason.
Closing a record that needs its own action — resolving a case, winning or
losing an opportunity — is not something an update can do; Dataverse refuses
the move and the card goes back with its message.

A view filtered to active records drops a card the moment it is moved to an
inactive status: it has left the view. Bind a view that shows both if the
inactive lanes should keep their cards.

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

## Lane totals are sums of one column

**Lane total** adds up one number or currency column per lane — a sum, not an
average, a minimum or a count of something else — and a lane's record count
comes with it. A blank value adds nothing, and a lane whose every value is
blank shows a dash, not a zero.

The sums come from Dataverse over every record the view means where the board
can ask, and from the cards on the board where it cannot, with the line above
the lanes saying which. It cannot ask:

- **in a canvas app**, which has no Web API for a code component, and no view
  to read — nor on PCFHub's demo;
- **on a subgrid whose relationship it cannot settle** — two lookups to the
  form's table and neither in the view; set **Parent lookup**;
- **over a view it cannot read**, or a filter FetchXML cannot express;
- **past Dataverse's own ceiling** for an aggregate (50,000 records), where the
  query is refused.

**The search box does not narrow the totals.** It narrows the cards on the
board; the totals stay the view's. The grid's own quick find, on a main grid, is
invisible to the control in the same way.

The totals are asked for again whenever the cards change — a move that lands,
a refresh, **Load more** — which is one query per change, over the whole view.

## Lane limits mark a lane, they do not close it

**Lane limits** turns a lane's count to the warning colour when it holds more
cards than its limit. A card can still be dropped into it: the board would be
the only thing enforcing a rule that forms, flows and imports never see. The
count is Dataverse's where the totals come from Dataverse, so a lane can be
over its limit before all of its cards are loaded.

## Status Reason transitions are honoured where the table enforces them

When a table has status reason transitions **enabled**, a lane the dragged
card's reason may not move to is closed while it is dragged, and missing from
the card's **Move to…** menu — the same choices the form's own dropdown gives.
Transitions that are defined but not enabled are ignored, as Dataverse ignores
them.

This goes further than Dataverse does on an update: it refuses a disallowed
move only when the status changes, and lets a disallowed reason within one
status through. The board refuses both, so a board and a form agree.

## Card values are shown as the platform formatted them

Card titles, assignees and badges are read as formatted strings. The one number
the board reads as a number is **Lane total**, to add it up; it cannot
right-align a currency on a card or colour a card by a numeric threshold.

## Moving a card cannot be undone by the control

A move is a write, and there is no undo. The board's own rollback happens only
when the write *fails* — a successful move is a change to the record like any
other, and reversing it means moving the card back.

## Large views load a page at a time

The board loads more rather than paging, and the **Load more** button appears
while the platform reports further records. There is no virtualisation: a board
with several thousand cards loaded will render several thousand DOM nodes.

Moving a card keeps every card **Load more** has brought in (from 0.4.1; before
it, each move started the board again at its first page). **Adding a card with
the + still does**: the new card has to be fetched, and a fetch of the view
starts at its first page. Press **Load more** again to bring the rest back.
