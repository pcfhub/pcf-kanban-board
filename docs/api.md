---
title: API reference
description: Properties, column roles and outputs, generated from the control manifest.
order: 5
---

# API reference

<!--
  Do not write the property tables by hand.

  `props-table` renders from what the hub parsed out of
  ControlManifest.Input.xml at the release being viewed, so it cannot drift from
  the control. A hand-written table is wrong the first time somebody adds a
  property and forgets this file, and a reader has no way to tell.

  kind: input | bound | output | dataset | dataset_column
  Omit `kind` to render every property in one table.

  There is no `kind=bound` section: a dataset control binds a collection, not a
  column. `kind=dataset_column` *is* here, because this control declares
  property-set roles — it is the section that documents them, and without it the
  roles are described nowhere.
-->

## Input properties

::props-table{kind=input}

## Dataset

::props-table{kind=dataset}

## Column roles

The board assigns meaning to specific columns rather than rendering whatever the
view supplies, so each role below is bound to a column in your own table.

::props-table{kind=dataset_column}

:::callout{type=warning}
**Every column bound to a role must be in the view.** The roles are read through
the dataset, so a role bound to a column the view does not select arrives empty.
:::

**Lane column** must be a choice column. Its options are the lanes, and moving a
card writes the option's numeric value — so a role bound to a text column leaves
every card *Unassigned* rather than grouping by the text.

## Outputs

::props-table{kind=output}

Both outputs are set **before** the platform call they describe, so a form can
observe the intent even on a host where the call does nothing. `movedRecordId`
is set when the move is attempted, not when it succeeds; if the write is
refused, the card returns to its original lane and the output still names it.

## The lanes property

Left empty, the lanes are the distinct values present in the loaded records,
ordered by option value. That is right most of the time and has one thing it
cannot do: show a lane no record is currently in.

Set it to fix both the set and the order:

```text
1=New,2=Active,3=Resolved
```

Each entry is an option value, `=`, and the label to show. The order is yours,
not numeric. Entries whose left side is not a whole number are ignored, so a
malformed lane is dropped rather than collecting every unparsed card into one
heap.
