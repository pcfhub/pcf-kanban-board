---
title: Overview
description: What Kanban Board does, and when to reach for it.
order: 1
---

# Kanban Board

A Dataverse view as a drag-and-drop board, grouped by a choice column.

Bind it to a view, tell it which column holds the status and which holds the
card title, and every record becomes a card in the lane matching its choice
value. Dragging a card to another lane writes the new value back to Dataverse.

## Why this one

- **It writes.** Most board-shaped controls render a view and leave the update
  to a flow or a form script. This one calls the Web API directly, so moving a
  card is the whole interaction rather than the first half of one.
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

**Canvas apps: read-only.** The board renders, but cards cannot be moved.
Dataverse-dependent APIs including the Web API are
[not available to code components in canvas apps][limits], so the drag handles
and the *Move to…* menu are not shown there at all.

**Custom pages: moves work in the published app.** Custom pages have runtime
Web API support, but the studio preview reports *Method not implemented* — the
error can be dismissed, and the board behaves correctly once the page is
published.
:::

[limits]: https://learn.microsoft.com/power-apps/developer/component-framework/limitations

The control declares `WebAPI` as `required="false"` precisely so that a host
without it leaves the board read-only rather than refusing to load it. See
[Limitations](limitations.md) for what that means in practice.
