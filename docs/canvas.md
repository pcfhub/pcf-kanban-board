---
title: Canvas apps
description: Adding Kanban Board to a canvas app or custom page.
order: 3
---

# Canvas apps

:::callout{type=warning}
**Cards cannot be moved in a canvas app.** The board renders, groups and scrolls
normally, but the drag handles and the *Move to…* menu are not shown — moving a
card writes through the Web API, and Dataverse-dependent APIs including the Web
API are [not available to code components in canvas apps][limits].

This is a platform limitation, not a configuration mistake. There is no property
that turns it on.
:::

[limits]: https://learn.microsoft.com/power-apps/developer/component-framework/limitations

Use the board in a canvas app when you want to *show* work grouped by status.
If users need to change the status, the board cannot be the thing they change it
with — `movedRecordId` never fires here, so there is no event to hang a patch
on. Put the editing somewhere else on the screen, or move it to a custom page,
where the board's own move works.

## Adding it

:::steps
1. In the app, select **Insert** → **Get more components** → **Code** and add
   **Kanban Board**.
2. Insert it onto the screen and set **Records** to a Dataverse data source.
3. Bind **Lane column** and **Card title**; **Assignee** and **Badge** are
   optional.
:::

The environment needs the *Power Apps component framework for canvas apps*
feature enabled before code components appear at all. See
[Installation](installation.md).

## Custom pages are the middle ground

A custom page in a model-driven app is authored like a canvas app but runs with
model-driven capabilities, and **moves do work there** — with one wrinkle worth
knowing before you conclude the control is broken:

:::callout{type=info}
In the custom page **studio preview**, a move reports *Method not implemented*.
Dismiss it and publish the page: Web API calls have runtime support in a
published custom page, and the board behaves correctly there.
:::

## What differs from a model-driven form

| | Canvas | Model-driven |
| --- | --- | --- |
| Cards render and group | Yes | Yes |
| Cards can be moved | No | Yes |
| `movedRecordId` output | Never set | Set on each move |
| Opening a card | No form to open; `openedRecordId` still updates | Opens the record |
| Column metadata | Absent — the board does not use it | Present |

Opening a card is the other call with no canvas equivalent. The control notifies
`openedRecordId` before asking the platform to open the record, so a canvas app
can still react to the click — for example by navigating to a screen of your own
— even though nothing opens by itself.
