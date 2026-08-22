---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

<!--
  Do not link to the release assets by hand. The hub serves the managed and
  unmanaged downloads for the version the reader is viewing, and a hard-coded
  link goes stale on the next release.
-->

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

- A Dataverse environment. The board binds a view, so there is nothing to show
  without one.
- A **choice column** on the table to group by. The lanes are its options.
- For canvas apps and custom pages, the environment feature **Power Apps
  component framework for canvas apps** must be on: *Admin centre* →
  *Environments* → *Settings* → *Product* → *Features*. It is already on for
  model-driven apps.

## The permission prompt

Importing the solution asks the maker to consent to the control using the **Web
API**. That is the move: dropping a card into another lane calls the Web API to
update the record's choice column, running as the signed-in user and subject to
their privileges.

Nothing else is requested — no device access, no external services, and no
metadata calls.

:::callout{type=info}
Consenting is not the same as granting access. A user who cannot update the
record through any other route cannot update it by dragging a card either; the
write is refused and the card returns to the lane it came from.
:::

## Upgrading

Import the newer managed solution over the older one and publish. The solution's
unique name does not change between releases, so an import upgrades in place
rather than installing a second copy.

Canvas apps are the exception: a canvas app holds its own copy of the control,
so after importing, open each app that uses the board, accept the **Update code
components** prompt, then save and publish.
