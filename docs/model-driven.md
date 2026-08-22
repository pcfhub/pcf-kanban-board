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
| Assignee | A **text** column shown under the title, such as a contact or an owner name | No |
| Badge | A short **text** value shown as a chip, such as a priority or category | No |

:::callout{type=warning}
**Lane column must be a choice column.** The lanes are that column's options,
and a move writes the option's numeric value. Bound to a text column the board
shows every card as *Unassigned*, because a text value is not an option number
and the control will not invent one it cannot write back.
:::

:::callout{type=warning}
**Assignee and Badge are text columns.** Both are typed `SingleLine.Text`, so a
lookup like `ownerid` or a choice like `prioritycode` will not appear in the
picker for them. To show an owner on the card, bind a text column that carries
the name.

That is a deliberate limit rather than an oversight. A lookup role would be
model-driven only, and in a canvas app a lookup read through the dataset returns
**JSON** rather than a display name — so the same board that reads correctly on
a form would print `{"id":…}` on every card. Keeping these roles text is what
lets the read-only canvas board stay readable.
:::

## Which columns the view needs

The four roles are read through the view, so **every column you bind must be in
the view**. A role bound to a column the view does not select arrives empty, and
the board treats a missing Lane column the same as an unbound one.

The view's own column order, widths and hidden flags are ignored — a board has
no columns to lay out. What the view *does* control is which records appear and
what order the cards sit in within each lane.

## Where the lanes come from

By default the board reads the **Lane column**'s option set through
`context.utils.getEntityMetadata` and shows every option as a lane, in the
order the option set defines. Nothing needs configuring, and a lane nothing is
in yet still appears — which is what makes a new board usable before anyone has
moved a card.

Set the **Lanes** property when you want fewer lanes than the column has, a
different order, or labels of your own. It fixes the set completely: an option
left out of it gets no lane.

Each lane also shows its option’s **colour** as a bar above the header. Dataverse
assigns those colours automatically when a choice is created, so they are
usually present whether or not anyone picked them — turn **Lane colours** off if
they are noise rather than meaning.

Setting **Lanes** yourself replaces the option set as the source, so the colours
go with it unless you declare them: `1=New #6b7280,2=Active #e8d33a`.

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
