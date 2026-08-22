---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## Every card is in the Unassigned lane

The **Lane column** role is bound to something that is not a choice column, or
to a column the view does not select.

The lanes are an option set's options and a move writes an option's numeric
value, so the control only groups by a value it recognises as one. A text column
holding the word *Active* is not an option, and the board will not invent a lane
it has no way to write back to.

## A card will not move

Working through the likely causes in order:

1. **There is only one lane, so there is nowhere to move it to.** The board
   looks fine — cards render, the ⋯ menu opens — and the menu lists nothing.

   On a model-driven form this should not happen: the board reads the choice
   column's options and shows every lane. If it does, the metadata call did not
   answer, and the board fell back to deriving lanes from the records it loaded
   — which on a view where every record shares a status is exactly one lane.

   In a **canvas app** it is expected, because the metadata call does not exist
   there. Cards cannot be moved in canvas either way.

   The fix in both cases is to declare the lanes yourself:

   ```text
   1=New,2=Active,3=Resolved
   ```

   The menu says this too, in place of an empty list.
2. **The app is a canvas app.** Cards cannot be moved there at all, and the drag
   handles are not shown. See [Canvas apps](canvas.md).
3. **It is a custom page in the studio preview.** Moves report *Method not
   implemented* until the page is published.
4. **The user lacks write access to the record.** The move runs as the signed-in
   user. The card returns to its lane and a message appears above the board.
5. **The card is already in that lane.** Dropping a card where it started is not
   a write.

## Why is there no lane for one of my choice options?

In a model-driven app there should be: the board reads the column's option set,
so an option nothing is set to still gets a lane. If one is missing, either the
metadata call did not answer and the board is deriving lanes from the records
instead, or the **Lanes** property is set and does not list that option —
setting it fixes the lanes completely, so an option left out of it has no lane
by design.

In a canvas app the metadata call does not exist, so lanes are always derived.
See [Examples](examples.md).

## Can I reorder cards inside a lane?

No. A drop changes which lane a card is in and nothing else. Card order within a
lane is the view's order, so sort the view to control it.

## Can I group by something other than a choice column?

No. Grouping and writing are the same operation here, and an option value is
what the control knows how to write. Grouping by an owner or a date would mean
writing a lookup or a date from a drag, which is a different control.

## Does it work on a phone?

The board renders, and the lanes scroll sideways. Dragging with touch is
unreliable across mobile browsers, so the **Move to…** menu on each card is the
dependable path there — it is the same menu that makes the board usable from a
keyboard.

## Why does the control ask for Web API permission?

Because moving a card writes to Dataverse. That is the only permission it asks
for; there is no device access, no external service, and no metadata call. See
[Installation](installation.md).

## Can I use it without letting anyone move cards?

Not by a property. On a form where the records are read-only to the user, the
moves fail and roll back, which is worse than not offering them. A canvas app is
read-only by nature, and a model-driven form where the whole control is disabled
also hides the move affordances.

## What happens if two people move the same card?

The last write wins, which is Dataverse's behaviour rather than the control's.
Each board refreshes after its own move and will show the other person's change
the next time it reads the view.
