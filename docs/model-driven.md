---
title: Model-driven apps
description: Adding Kanban Board to a form.
order: 4
---

# Model-driven apps

This is the host the control was built for: the board renders and cards can be
moved.

:::steps
1. Open the form in the form designer and add a **subgrid** for the table you
   want to show, choosing the view whose records should become cards.
2. With the subgrid selected, open **Components** → **Get more components** and
   add **Kanban Board**, then switch the control to it for Web, Tablet and
   Phone.
3. Bind the four column roles under the control's properties. **Lane column**
   and **Card title** are required; **Assignee** and **Badge** are optional.
4. Save and publish.
:::

## Binding the column roles

The roles are the control's own names for the parts of a card. Each one is
bound to a column in *your* table — the control never assumes a schema name.

| Role | Bind it to | Required |
| --- | --- | --- |
| Lane column | The choice column that decides which lane a card is in | Yes |
| Card title | The column shown as the card's headline | Yes |
| Assignee | A column shown under the title, usually an owner or contact | No |
| Badge | A short value shown as a chip, such as a priority | No |

:::callout{type=warning}
**Lane column must be a choice column.** The lanes are that column's options,
and a move writes the option's numeric value. Bound to a text column the board
shows every card as *Unassigned*, because a text value is not an option number
and the control will not invent one it cannot write back.
:::

## Which columns the view needs

The four roles are read through the view, so **every column you bind must be in
the view**. A role bound to a column the view does not select arrives empty, and
the board treats a missing Lane column the same as an unbound one.

The view's own column order, widths and hidden flags are ignored — a board has
no columns to lay out. What the view *does* control is which records appear and
what order the cards sit in within each lane.

## The command bar

The subgrid's command bar, view selector and quick find are all off. The
control does not report a selection, so the ribbon's buttons would have nothing
to act on, and its layout depends on the four bound roles rather than on
whatever columns a different view would bring.

## Reacting to a move

Two outputs are available to the form. Both update *before* the platform call
they describe, so a form can observe the intent even when the call fails.

| Output | Set when |
| --- | --- |
| `movedRecordId` | A card is dropped into a different lane |
| `openedRecordId` | A card's title is clicked |

The control writes the status column itself — a form handler is for reacting to
the move, not for performing it.
