---
title: Examples
description: Worked configurations of Kanban Board.
order: 6
---

# Examples

## A sprint board on a work item subgrid

The default shape: a view of open work items, grouped by status.

| Property | Value |
| --- | --- |
| Lane column | `statuscode` |
| Card title | `subject` |
| Assignee | `cr123_ownername` |
| Badge | `category` |
| Lanes | *(empty — derived from the data)* |
| Lane width | `280` |
| Open on card click | On |

Leaving **Lanes** empty is right here: an active sprint has records in every
status, so every lane has something to derive from.

Note that **Assignee** and **Badge** are text columns, not `ownerid` and
`prioritycode`. Both roles are typed `SingleLine.Text` and a lookup or choice
column will not appear in the picker for them — see
[Model-driven apps](model-driven.md) for why.

## Making an empty lane visible

The same board, on a view that is often empty at one end — nothing is *Resolved*
at the start of a sprint, so that lane disappears exactly when a team most wants
to see it waiting.

| Property | Value |
| --- | --- |
| Lanes | `1=New,2=Active,3=Resolved` |

The values are the option set's numeric values, and the order is the one you
write rather than the numeric one. Find the values in *Tables* → your table →
*Columns* → the choice column, or in the choice's own definition under
*Choices*.

:::callout{type=info}
Setting **Lanes** fixes the set of lanes completely. A record whose status is
not one of the values listed shows in the *Unassigned* lane rather than creating
a lane of its own — which is usually what you want, and is worth knowing before
you add a fifth option to the choice and wonder where those cards went.
:::

## A compact board in a form section

For a board sharing a form tab rather than owning a page.

| Property | Value |
| --- | --- |
| Lane width | `200` |
| Open on card click | Off |
| Assignee | *(unbound)* |

Turning **Open on card click** off makes the title plain text. The card can
still be moved; it simply stops being a link to somewhere else, which is the
right trade when the record is already open on the same form.

## A read-only board in a canvas app

No configuration difference — the same properties, on a canvas screen.

The board renders, groups and scrolls, and the cards cannot be moved. See
[Canvas apps](canvas.md) for why, and for the custom-page option if moves are
needed.

## Reacting to a move on a form

`movedRecordId` is set as the move is attempted. A form handler on it can log
the change, notify someone, or refresh another control — but it should not
perform the update, because the control has already done that.

Note the ordering: the output fires *before* the write resolves, so a handler
reacting to it is reacting to the intent. If the write is then refused, the card
returns to its lane and the message appears above the board — but the output
has already fired and is not retracted.
