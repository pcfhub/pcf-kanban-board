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
3. Bind the column roles under the control's properties. **Lane column**
   and **Card title** are required; **Assignee**, **Badge** and **Lane total**
   are optional.
4. Save and publish.
:::

## Binding the column roles

The roles are the control's own names for the parts of a card. Each one is
bound to a column in *your* table — the control never assumes a schema name.

| Role | Bind it to | Required |
| --- | --- | --- |
| Lane column | The choice column — or **Status Reason** — that decides which lane a card is in | Yes |
| Card title | The column shown as the card's headline | Yes |
| Assignee | A **text** column shown under the title, such as a contact or an owner name | No |
| Badge | A short **text** value shown as a chip, such as a priority or category | No |
| Lane total | A **number or currency** column added up for each lane, such as an estimated value | No |
| Swimlane column | A **choice, Yes/No, Owner or lookup** column that splits the board into rows, such as a priority or the owner | No |

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

A column bound to a role is fetched whether or not the view selects it — the
platform adds it to the query — so a role does not have to be one of the
view's columns. It is still worth putting the Lane column in the view, so the
grid the board replaces shows it too.

The view's own column order, widths and hidden flags are ignored — a board has
no columns to lay out. What the view *does* control is which records appear and
what order the cards sit in within each lane.

## Swimlanes

Bind **Swimlane column** and the board becomes a grid: the lanes stay across
the top, with their counts, totals and limits, and each value of the column
gets a row underneath, with a cell per lane. A row's header folds it shut and
says how many cards it holds.

| Bound to | The rows | A card dropped into another row |
| --- | --- | --- |
| A choice | Every option, from the option set — including ones no card is in | Writes the option, through the record or the Web API like the lane |
| A Yes/No | Its two labels | Writes Yes or No |
| Owner | Each user and team that owns a card on the board | Assigns the record to that user or team, through the Web API |
| A lookup | Each record the cards point at | Points the card at that record, through the Web API |

A card whose column is blank sits in an *(empty)* row first, which takes no
card. When a card changes lane and row in one drop, both are written in one
update. The Move menu lists the rows after the lanes, for the keyboard.

**Owner rows need Assign.** Before offering them, the board asks whether the
user's security roles allow Assign on the table at any depth; a user whose
roles allow none sees the rows but cannot drop into another. Dataverse still
decides each assignment — it refuses one to a user who cannot read the table,
and the card goes back with the reason.

## Sorting the cards

**Sort cards by** orders the cards inside every lane and row by one column:
`createdon desc`, `cr123_estimate desc`, `cr123_title`. The column has to be
one the board loads — in the view, or bound to a role — because a model-driven
form ignores a sort on any other column without saying so. Empty keeps the
view's own order.

**Show sort menu** adds a column picker and a direction button above the
lanes, so each user can choose. Their choice is kept in their browser for that
table and view, and outranks **Sort cards by** there. It is off by default, so
a board that upgrades looks as it did. Sorting reloads the view from its first
page, as the grid's own column headers do.

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

## Lane totals

Bind **Lane total** to a number or currency column and each lane shows the sum
of that column under its name — the pipeline's value by stage. A line above the
lanes says what the sums are over:

::image{src=media/screenshot-totals.png alt="A board with five cards of nine loaded: the line above the lanes reads Totals: all 9 records in the view, each lane shows its sum under its name, and Active reads 2 of 3 and Resolved 0 of 2 where Dataverse counted more cards than are loaded, with Load more below" zoom}

| The line reads | Where the sums come from |
| --- | --- |
| *Totals: all 12 records in the view* | Dataverse, over every record the view means — cards not loaded yet included |
| *Totals: the 50 cards loaded so far* | The cards on the board, while **Load more** still has more |
| *Totals: the 7 cards on the board* | The cards on the board, and there are no more to load |

The first is the normal case on a form. The board asks Dataverse for one total
per lane, over the view's own definition, and asks again whenever the cards
change — a move that lands, a refresh, **Load more**. Where Dataverse has
counted more cards in a lane than are loaded, the count reads *1 of 3*.

A blank value is not a zero: a card with no value adds nothing, and a lane whose
every card is blank shows a dash.

### On a subgrid: Parent lookup

A subgrid lists only the records related to the form's record, and that
relationship is applied by the platform where the control cannot see it. So to
total the same records the subgrid shows, the board works out which lookup on
the table points at the form's record — the only one there is, or the one every
loaded card points through — and adds it to the question it asks.

When it cannot tell — two lookups to the same table, and the view carrying
neither — it totals the loaded cards instead, and says so in the browser's
console. Set **Parent lookup** to the lookup's logical name
(`parentcustomerid`, `cll_account`) to settle it, or to `none` for a subgrid
that is not related to the record at all.

## Lane limits

**Lane limits** caps how many cards a lane should hold: `858010001=5,2=3` — a
lane's option value, then its limit. The lane's count then reads *4 / 5*, and a
lane over its limit shows the count in the warning colour.

::image{src=media/screenshot-limits.png alt="Lane limits on the board: New reads 3 / 3, at its limit, and Active reads 3 / 2 in the warning colour, over its limit, while every lane still shows its total" zoom}

It is a warning, not a lock. A card can still be dropped into a full lane,
because the board would be the only thing enforcing a rule that people editing
the record on a form, flows and imports never see. The count used is the same
one the totals use — every record in the view where Dataverse has answered.

## The command bar

The subgrid's command bar, view selector and quick find are all off. The
control does not report a selection, so the ribbon's buttons would have nothing
to act on, and its layout depends on the four bound roles rather than on
whatever columns a different view would bring.

## Adding cards

Each lane header carries a **+** that opens the table's quick create form with
the lane's option already chosen — the value is passed to the form as a field
value, so the form opens filled in rather than blank. On a subgrid the parent
record is passed too, so the new card lands in this view. When the form saves,
the board refreshes and the card appears in its lane; when it is dismissed,
nothing changes.

The table needs a quick create form for this to be quick: without one the
platform opens the main form instead. **Allow adding cards** turns the button
off for a board that should only move what already exists.

## How a move is written

A dropped card writes its lane column one of two ways, chosen per record:

- **Through the record**, where the platform reports the lane column as
  editable for it — the same route an editable grid takes, needing no declared
  feature and no install-time permission.
- **Through the Web API**, where it does not. `statuscode` is the common case:
  the platform reports it read-only on the record even though it is a choice
  column, and a plain update writes it. This is why the control still declares
  `WebAPI` — as `required="false"`, so a host without it loads the board
  read-only rather than refusing it.

**A Status Reason board moves the status too.** Each status reason belongs to
a status — *In Progress* to *Active*, *Cancelled* to *Inactive* — and
Dataverse refuses a reason from the other status on its own rather than
changing the status to match. So a card moved from an Active reason to an
Inactive one writes both, the way the form's own *Deactivate* does; a move
between two reasons of the same status writes the reason alone. A board grouped
by **Status** itself writes the status with its default reason.

**Status reason transitions are honoured.** Where the table has them enabled,
a lane the card's reason may not move to is closed while the card is dragged and
left out of its **Move to…** menu — the choices the form's dropdown would give.
Nothing needs configuring: the board reads the transitions with the lanes.

Either way the card lands where it was dropped before the write returns, and
returns to its lane with a message if the write is refused.

## Reacting to a move

Three outputs are available to the form. The first two update *before* the
platform call they describe, so a form can observe the intent even when the
call fails; the third updates only once the quick create has saved.

| Output | Set when |
| --- | --- |
| `movedRecordId` | A card is dropped into a different lane |
| `openedRecordId` | A card's title is clicked |
| `createdRecordId` | The quick create form opened from a lane's **+** saves |

The control writes the status column itself — a form handler is for reacting to
the move, not for performing it.
