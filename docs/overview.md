---
title: Overview
description: What Kanban Board does, and when to reach for it.
order: 1
---

# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

::image{src=media/screenshot-board.png alt="A sprint board: a search box above four lanes, each headed by its option, a count and a + button, with cards showing a title, an assignee and a priority badge" zoom}

Bind it to a view, tell it which column holds the status and which holds the
card title, and every record becomes a card in the lane matching its choice
value. Dragging a card to another lane writes the new value back to Dataverse;
the **+** in a lane header opens the quick create form with that lane already
chosen; the search box narrows the board to the cards that match.

## Why this one

- **It writes.** Most board-shaped controls render a view and leave the update
  to a flow or a form script. This one writes the lane column itself — through
  the record where the platform lets it, through the Web API where it does not
  — so moving a card is the whole interaction rather than the first half of one.
- **It adds.** The **+** in a lane header opens the table's quick create form
  with that lane's option already set, and the new card appears on the board
  when the form saves. A board you can move cards across but not add to sends
  people back to the grid for the one thing a board is for.
- **It searches.** The box above the lanes narrows every lane to the cards
  whose title, assignee or badge contain what was typed, and says how many
  matched — *2 of 9* — while the lanes stay where they are.
- **The move is optimistic, and honest about it.** The card lands where you
  dropped it immediately rather than after a round trip — and if the write is
  refused, it goes back to the lane it came from and says so. A card sitting in
  a lane its record is not in is the failure worth designing against.
- **It works without a mouse.** Every card carries a *Move to…* menu, because
  HTML5 drag-and-drop has no keyboard equivalent and a board that only supports
  dragging cannot be operated from the keyboard at all.

## What it works with

:::callout{type=info}
**Model-driven apps: fully supported.** The board renders and cards can be
moved.

**Canvas apps: read-only, in practice.** The board renders, groups and
searches. A move needs either the Web API — which
[canvas apps do not offer code components][limits] — or a record the host lets
the control save; whether a canvas dataset hands over the second is not
something this control has seen, so expect no drag handles and no *Move to…*
menu there. The **+** is never shown in canvas: there is no quick create form
to open.

**Custom pages: moves work in the published app.** Custom pages have runtime
Web API support, but the studio preview reports *Method not implemented* — the
error can be dismissed, and the board behaves correctly once the page is
published.
:::

[limits]: https://learn.microsoft.com/power-apps/developer/component-framework/limitations

The control declares `WebAPI` as `required="false"` precisely so that a host
without it leaves the board read-only rather than refusing to load it. See
[Limitations](limitations.md) for what that means in practice.
