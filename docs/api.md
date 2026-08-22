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

Left empty, the board asks the platform for the choice column's options and
shows every lane, in the order the option set defines — including lanes nothing
is in yet. That is the default because it needs no configuration and is what a
board should do.

Where that call is unavailable — canvas apps, which have no
`context.utils` — the lanes fall back to the distinct values present in the
loaded records, ordered by value. That cannot show an empty lane.

Set the property to fix both the set and the order yourself:

```text
1=New,2=Active,3=Resolved
```

Each entry is an option value, `=`, and the label to show. The order is yours,
not numeric. Entries whose left side is not a whole number are ignored, so a
malformed lane is dropped rather than collecting every unparsed card into one
heap.

A lane can carry its own colour, as a hex value at the end of the label:

```text
1=New #6b7280,2=Active #e8d33a,3=Resolved #22a14a
```

Declaring the lanes replaces the option set as their source, and the colours
live on the option set — so without this, setting **Lanes** would silently cost
the colours, and a canvas app could never have any, since the option set cannot
be read there at all.

The colour is taken only from the end of a label and only when it is a complete
`#rgb` or `#rrggbb`. So `Blocked #2` keeps its label whole. A label that really
does end in a hex-shaped word — `Build #abc` — would lose it; rename the lane if
that happens.

## Lane colours

When the lanes come from the option set, each carries the colour Dataverse holds
for that option, shown as a bar above the lane header. **Lane colours** turns
that off.

There is no colour to show when the lanes came from anywhere else — a canvas
app, or the **Lanes** property — and the bar is simply absent. A colour is only
ever decoration here: the lane is named in its header, so nothing is carried by
the colour alone.
