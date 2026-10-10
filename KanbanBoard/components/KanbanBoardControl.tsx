import * as React from 'react';
import {
    Button,
    FluentProvider,
    Menu,
    MenuItem,
    MenuList,
    MenuPopover,
    MenuTrigger,
    webLightTheme,
} from '@fluentui/react-components';
import {
    Card,
    Lane,
    LaneTotal,
    boardKey,
    cardsInLane,
    allowsMove,
    laneKey,
    matchesQuery,
    totalsFromCards,
    withUnassigned,
} from './lanes';
import { TotalsAnswer } from '../data/totals';
import { Row, SortChoice, SortOption, cardsInCell } from './swimlanes';

/**
 * How a move ended, as the entry point reports it — so the board can put a
 * refused card back and re-ask its totals without a platform render, which a
 * refusal never brings and which a landed move no longer asks for (0.4.1).
 */
export interface MoveOutcome {
    ok: boolean;
    /** The sentence to show when it was refused, or `null`. */
    message: string | null;
}

export interface IProps {
    cards: Card[];
    /** Whether a Lane total column is bound, so each lane shows a sum and the board a caption. */
    hasValue: boolean;
    /** The soft limits, lane value → most cards. A lane over its limit is marked; nothing is refused. */
    limits: Record<string, number>;
    /** Whether totals are wanted at all — a Lane total column, or a limit to count against. */
    totalsWanted: boolean;
    /**
     * The server route for lane totals, or `null` where it is withheld and the
     * board totals the cards it has. See `totalsRoute` in index.ts.
     */
    totals: { key: string; load: () => Promise<TotalsAnswer | null> } | null;
    /** A loaded-cards sum, formatted as the platform formats the column's type. */
    formatValue: (amount: number) => string;
    lanes: Lane[];
    hasStatus: boolean;
    hasTitle: boolean;
    /** False on a host with neither a writable record nor a WebAPI, where a move cannot be written. */
    canMove: boolean;
    /** False where the maker turned it off, or the host has no `navigation.openForm` — canvas, the demo. */
    canCreate: boolean;
    /** Whether the search box is rendered at all. */
    showSearch: boolean;
    /** Whether the control has a write in flight for this card. Asked at render time: see `index.ts`. */
    isMoving: (recordId: string) => boolean;
    moveError: string | null;
    /** How many moves have been refused, so the board drops a refused card's placement. */
    failedMoves: number;
    loading: boolean;
    error: boolean;
    errorMessage: string;
    hasNextPage: boolean;
    laneWidth: number;
    /**
     * Pixels the host says the control may occupy, or `null` when it will not
     * say. Pins the board's width so the lane row has something definite to
     * scroll inside — see the note in `init`.
     */
    allocatedWidth: number | null;
    /** Whether to show each lane's option colour. Off hides it everywhere. */
    laneColors: boolean;
    openOnCardClick: boolean;
    visible: boolean;
    disabled: boolean;
    isRTL: boolean;
    theme?: Record<string, string>;
    title: string;
    getString: (id: string) => string;
    /** Label for the lane holding cards with no status value. */
    unassignedLabel: string;
    /** Identifies the option set being read, so the fetch re-runs only when it changes. */
    lanesKey: string;
    /**
     * Fetches the lanes from the status column's option set, or `null` when
     * there is nothing to fetch — the maker set an override, or the host has no
     * `context.utils` (canvas).
     */
    loadLanes: (() => Promise<Lane[]>) | null;
    /**
     * The Status Reason transitions in force — reason → the reasons it may
     * move to, `{}` where none bind — or `null` on any other lane column.
     * A disallowed lane is closed while a card is dragged, and missing from
     * that card's Move menu, as the form's own dropdown would be.
     */
    loadRules: (() => Promise<Record<string, number[]>>) | null;
    /**
     * 0.5.0: the rows, or `null` with no Swimlane column — the board is then
     * exactly 0.4.x. The synchronous set, from the loaded cards; a Choice's
     * option set replaces it once `loadRows` answers.
     */
    rows: Row[] | null;
    /** Identifies the swimlane column being read, so its options re-read only when it changes. */
    rowsKey: string;
    /** A Choice swimlane's rows from its option set, or `null` where there is nothing to read. */
    loadRows: (() => Promise<Row[]>) | null;
    /**
     * Whether a card may change rows: a writable host and, for Owner, the
     * Assign privilege. False keeps every card in its row; lanes still move.
     */
    rowsWritable: boolean;
    /** Whether the sort menu is drawn. */
    showSort: boolean;
    /** The columns the sort menu offers — the dataset's own. */
    sortOptions: SortOption[];
    /** The sort in force, or `null` for the view's own order. */
    sort: SortChoice | null;
    onSort: (choice: SortChoice | null) => void;
    /**
     * Write a move; resolves with how it ended, never rejects. `toValue`
     * `null` keeps the lane; `toRow` absent keeps the row.
     */
    onMove: (recordId: string, toValue: number | null, toRow?: Row) => Promise<MoveOutcome>;
    /** Open the quick create form with the lane's option preselected. */
    onCreate: (laneValue: number) => void;
    onOpenRecord: (id: string) => void;
    onLoadMore: () => void;
}

/**
 * Where this component thinks each card is, over the top of what props say.
 *
 * The platform re-renders after `notifyOutputChanged()` only when an output
 * changed. A move changes `movedRecordId` — unless it is the card that moved
 * last, and then no render comes until the write settles and the dataset
 * refreshes. The control's own pending move reaches the board only through a
 * render, so without this a second move of the same card would sit still for
 * a round trip.
 *
 * The overlay clears when the board's *content* changes — every `updateView`
 * hands down freshly built card objects, so identity says nothing — **or when
 * a move is refused.** A refusal alone changes no content: the card never left
 * its lane in the data, so the refreshed board reads exactly as it did before
 * the drop. When the refused card was also the last one moved, no render ever
 * showed its pending move either, and the overlay kept it in the lane it was
 * refused. `failedMoves` is the signal that survives both; the refresh after a
 * refusal always renders.
 */
type Placement = { lane: number | null; row?: Card['row'] };

function useOptimisticLanes(
    cards: Card[],
    failedMoves: number,
): [Record<string, Placement>, (id: string, placement: Placement) => void] {
    const [overlay, setOverlay] = React.useState<Record<string, Placement>>({});
    const key = boardKey(cards);

    React.useEffect(() => {
        setOverlay({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, failedMoves]);

    const place = React.useCallback((id: string, placement: Placement): void => {
        setOverlay((current) => ({ ...current, [id]: placement }));
    }, []);

    return [overlay, place];
}

/**
 * The lanes read from the option set, once they arrive.
 *
 * Held in React rather than on the control instance, because the fetch is
 * asynchronous and `updateView` is not. Storing the answer outside React and
 * calling `notifyOutputChanged()` does not repaint: that announces changed
 * *outputs*, and fetching lanes changes none, so the platform never calls
 * `updateView` again and the lanes never appear. `setState` has no such
 * condition.
 *
 * Keyed on `lanesKey` — the entity and column — so switching view refetches and
 * a re-render does not.
 */
function useOptionLanes(
    lanesKey: string,
    loadLanes: (() => Promise<Lane[]>) | null,
): Lane[] | null {
    const [fetched, setFetched] = React.useState<Lane[] | null>(null);

    React.useEffect(() => {
        setFetched(null);

        if (!loadLanes) {
            return undefined;
        }

        let alive = true;

        void loadLanes().then((lanes) => {
            // An empty result means the traversal found no option set, and
            // derived lanes are a better board than none. index.ts has already
            // warned about it.
            if (alive && lanes.length > 0) {
                setFetched(lanes);
            }
        });

        // A view switched mid-flight must not be repainted by the old answer.
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lanesKey]);

    return fetched;
}

/** A Choice swimlane's rows from its option set, held in React for the reason the option lanes are. */
function useOptionRows(rowsKey: string, loadRows: (() => Promise<Row[]>) | null): Row[] | null {
    const [fetched, setFetched] = React.useState<Row[] | null>(null);

    React.useEffect(() => {
        setFetched(null);

        if (!loadRows) {
            return undefined;
        }

        let alive = true;

        void loadRows().then((rows) => {
            if (alive && rows.length > 0) {
                setFetched(rows);
            }
        });

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowsKey]);

    return fetched;
}

/**
 * The server's lane totals, held in React for the reason the option lanes
 * are: the query is asynchronous and `updateView` is not.
 *
 * `settled` is false until the first answer for the route arrives, so the
 * board does not caption loaded-card totals as final for the moment before
 * the server's replace them. A later key — a move landed, a refresh — keeps
 * the previous answer on screen until the new one comes, rather than
 * flickering to the loaded cards and back. An answer of `null` is the route
 * declining, and the loaded cards are then the totals, captioned so.
 */
function useServerTotals(
    route: { key: string; load: () => Promise<TotalsAnswer | null> } | null,
): { answer: TotalsAnswer | null; settled: boolean } {
    const [state, setState] = React.useState<{ answer: TotalsAnswer | null; settled: boolean }>({
        answer: null,
        settled: false,
    });
    const key = route ? route.key : '';

    React.useEffect(() => {
        if (!route) {
            setState({ answer: null, settled: true });

            return undefined;
        }

        let alive = true;

        void route.load().then((answer) => {
            if (alive) {
                setState({ answer, settled: true });
            }
        });

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return state;
}

/**
 * The transitions in force, held in React for the reason the option lanes
 * are, keyed the same way. `null` until they arrive — and until then every
 * lane is open, which is what the board did before it knew of them; the
 * entry point checks the rule again before it writes.
 */
function useTransitionRules(
    lanesKey: string,
    loadRules: (() => Promise<Record<string, number[]>>) | null,
): Record<string, number[]> | null {
    const [rules, setRules] = React.useState<Record<string, number[]> | null>(null);

    React.useEffect(() => {
        setRules(null);

        if (!loadRules) {
            return undefined;
        }

        let alive = true;

        void loadRules().then((answer) => {
            if (alive) {
                setRules(answer);
            }
        });

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lanesKey]);

    return rules;
}

/** The card being dragged: its lane and its row's key — what each drop target judges itself against. */
type Dragging = { lane: number | null; row: string | null };

/** A row's key as React and the fold state hold it: `''` for the empty row. */
const rowId = (key: string | null): string => key ?? '';

export function KanbanBoardControl(props: IProps): React.ReactElement | null {
    const { cards, getString, laneWidth } = props;
    const [overlay, place] = useOptimisticLanes(cards, props.failedMoves);
    const fromOptions = useOptionLanes(props.lanesKey, props.loadLanes);
    const rowOptions = useOptionRows(props.rowsKey, props.loadRows);
    /* The rows folded shut, by key (`''` for the empty row). React state: folding changes no output. */
    const [collapsed, setCollapsed] = React.useState<string[]>([]);
    /*
     * Moves this board has seen land. The totals' route key carries the
     * board's content, which a landed move changes through the platform's
     * render — except the second move of the same card, whose output is
     * unchanged and so brings none. Counting landings here re-asks either way,
     * and only once the write is in, so the server counts it (0.4.1).
     */
    const [landed, setLanded] = React.useState(0);
    const route = props.totalsWanted && props.totals
        ? { key: `${props.totals.key}#${landed}`, load: props.totals.load }
        : null;
    const server = useServerTotals(route);

    /* Cards with a write in flight, and the last refusal — the board's own, see MoveOutcome. */
    const [busy, setBusy] = React.useState<string[]>([]);
    const [refusal, setRefusal] = React.useState<string | null>(null);
    const rules = useTransitionRules(props.lanesKey, props.loadRules);

    /*
     * The card being dragged, so a lane can say whether it would take it —
     * `dataTransfer` cannot be read during `dragover`, only on the drop.
     */
    const [dragging, setDragging] = React.useState<Dragging | undefined>(undefined);

    /*
     * The search text lives here and nowhere else. A virtual control cannot
     * push a repaint from outside React — `notifyOutputChanged()` announces
     * outputs, and typing changes none — so state that has to repaint on
     * every keystroke has to be React's. Same rule as `useOptionLanes`.
     */
    const [query, setQuery] = React.useState('');
    const searching = query.trim() !== '';

    const placed = React.useMemo(
        () => cards.map((card) => (card.id in overlay
            ? { ...card, lane: overlay[card.id].lane, ...(overlay[card.id].row ? { row: overlay[card.id].row } : {}) }
            : card)),
        [cards, overlay],
    );

    // What the lanes show. The lanes themselves come from every card, so a
    // search never hides a drop target — only the cards in it.
    const shown = React.useMemo(
        () => (searching ? placed.filter((card) => matchesQuery(card, query)) : placed),
        [placed, query, searching],
    );

    // The option set when it answered, otherwise whatever index.ts could work
    // out synchronously — the maker's override, or lanes derived from the cards.
    const drawn = fromOptions
        ? withUnassigned(fromOptions, placed, props.unassignedLabel)
        : props.lanes;

    /*
     * The unassigned lane also appears when the **server** counted cards in
     * it that are not loaded yet — otherwise their total has nowhere to be
     * shown, and the lanes' totals no longer add up to the caption's number.
     */
    const lanes = server.answer && server.answer.byLane[''] && !drawn.some((lane) => lane.value === null)
        ? [{ value: null, label: props.unassignedLabel, color: null, state: null, defaultStatus: null, next: null }, ...drawn]
        : drawn;

    // The option set's rows where it answered, otherwise the cards'.
    const rows = props.rows === null ? null : rowOptions ?? props.rows;

    // The sort in force stays selectable even when the view sorts by a column the menu does not list.
    const sortChoices = props.sort && !props.sortOptions.some((option) => option.name === props.sort?.name)
        ? [...props.sortOptions, { name: props.sort.name, label: props.sort.name }]
        : props.sortOptions;

    /*
     * Lane totals: the server's where it answered, the placed cards'
     * otherwise — placed, so a card dropped a moment ago counts in its new
     * lane on the loaded route. The server's catch up on the next key.
     */
    const fromCards = React.useMemo(() => totalsFromCards(placed), [placed]);
    const totalOf = (lane: Lane): LaneTotal => {
        const key = laneKey(lane.value);

        if (server.answer) {
            return server.answer.byLane[key] ?? { count: 0, sum: null, label: null };
        }

        return fromCards.get(key) ?? { count: 0, sum: null, label: null };
    };

    /*
     * The caption is not decoration: it is the only thing that keeps a sum
     * over the loaded cards from reading as the view's. Nothing is claimed
     * until the server route has answered or declined.
     */
    const caption = !props.hasValue || !server.settled
        ? null
        : server.answer
            ? getString('KanbanBoard_TotalsView').replace('{0}', String(server.answer.records))
            : getString(props.hasNextPage ? 'KanbanBoard_TotalsLoaded' : 'KanbanBoard_TotalsBoard')
                .replace('{0}', String(placed.length));

    /*
     * What every LaneColumn is handed, whatever its mode. **The lanes on
     * screen, not `props.lanes`**: the spread hands down the synchronous set
     * index.ts derives from the cards, which holds only lanes some card is in,
     * and each card's Move menu filters this. Until 0.3.4 it filtered that
     * one, so once the option set landed an empty lane was a drop target and
     * never a menu entry (found by the hub's demo, 2026-09-28).
     */
    const laneProps = (lane: Lane): Omit<ILaneProps, 'cards' | 'total'> => ({
        ...props,
        lanes,
        rows,
        moving: [...placed.filter((card) => props.isMoving(card.id)).map((card) => card.id), ...busy],
        lane,
        laneTotal: props.totalsWanted ? totalOf(lane) : null,
        limit: lane.value === null ? null : props.limits[String(lane.value)] ?? null,
        rules,
        dragging,
        onDragCard: setDragging,
        searching,
        width: laneWidth,
        onDrop: move,
    });

    const move = (recordId: string, toValue: number | null, toRow?: Row): void => {
        // Where the card is on screen now — what a refusal puts it back to.
        const card = placed.find((each) => each.id === recordId);
        const from: Placement = { lane: card?.lane ?? null, ...(card?.row ? { row: card.row } : {}) };

        place(recordId, { lane: toValue ?? from.lane, ...(toRow ? { row: toRow } : from.row ? { row: from.row } : {}) });
        setRefusal(null);
        setBusy((current) => [...current, recordId]);

        void props.onMove(recordId, toValue, toRow).then((outcome) => {
            setBusy((current) => current.filter((id) => id !== recordId));

            if (outcome.ok) {
                setLanded((count) => count + 1);

                return;
            }

            place(recordId, from);
            setRefusal(outcome.message);
        });
    };

    /*
     * The width the host allocated, applied as a ceiling.
     *
     * CSS alone cannot do this. A host that sizes itself to its content takes
     * its width *from* this board, so `max-width: 100%` resolves against a
     * number the board produced and constrains nothing — the lanes extend, an
     * ancestor clips them, and no scrollbar ever appears. A pixel ceiling from
     * the platform is outside that circle.
     */
    const frame = (content: React.ReactElement): React.ReactElement => (
        <FluentProvider theme={props.theme ?? webLightTheme} dir={props.isRTL ? 'rtl' : 'ltr'}>
            <div
                className="KanbanBoard"
                style={props.allocatedWidth ? { maxWidth: `${props.allocatedWidth}px` } : undefined}
            >
                {content}
            </div>
        </FluentProvider>
    );

    /*
     * The order of these is the whole of the empty-state logic.
     *
     * `loading` is true on the first updateView, before any records arrive, so
     * rendering the empty state here would flash "No records" on every load.
     * The unbound-role messages come first because they are actionable and
     * permanent: no amount of waiting fixes an unbound Lane column.
     */
    if (!props.visible) {
        return null;
    }

    if (props.error) {
        return frame(
            <p className="KanbanBoard-message" role="alert">
                {props.errorMessage || getString('KanbanBoard_Error')}
            </p>,
        );
    }

    if (!props.hasStatus) {
        return frame(<p className="KanbanBoard-message">{getString('KanbanBoard_NoStatus')}</p>);
    }

    if (!props.hasTitle) {
        return frame(<p className="KanbanBoard-message">{getString('KanbanBoard_NoTitle')}</p>);
    }

    /*
     * An empty view is still a board when a card can be added to it: the lanes
     * are drawn so each one's "+" is reachable, and the message sits above
     * them. Without a create route there is nothing to do with empty lanes, so
     * the message stands alone as before.
     */
    const empty = placed.length === 0;
    const emptyMessage = props.loading ? getString('KanbanBoard_Loading') : getString('KanbanBoard_Empty');

    if (empty && (!props.canCreate || props.loading || lanes.length === 0)) {
        return frame(<p className="KanbanBoard-message">{emptyMessage}</p>);
    }

    if (lanes.length === 0) {
        return frame(<p className="KanbanBoard-message">{getString('KanbanBoard_NoLanes')}</p>);
    }

    return frame(
        <>
            {(refusal ?? props.moveError) !== null && (
                <p className="KanbanBoard-error" role="alert">
                    {refusal ?? props.moveError}
                </p>
            )}

            {empty && <p className="KanbanBoard-message">{emptyMessage}</p>}

            {caption !== null && !empty && <p className="KanbanBoard-caption">{caption}</p>}

            {(props.showSearch || props.showSort) && !empty && (
                <div className="KanbanBoard-toolbar">
                    {props.showSearch && (
                        <>
                            {/*
                                A native search input rather than Fluent's: the
                                platform's Fluent build carries no icon set, and a
                                search box's affordances — the type, the clear
                                button — are the browser's own. Styled from the same
                                tokens as the rest, so it sits on a form like a field.
                            */}
                            <input
                                type="search"
                                className="KanbanBoard-search"
                                value={query}
                                placeholder={getString('KanbanBoard_Search')}
                                aria-label={getString('KanbanBoard_Search')}
                                disabled={props.disabled}
                                onChange={(event): void => setQuery(event.target.value)}
                            />
                            {/*
                                aria-live so a screen reader hears the count change as
                                the query narrows; polite, because it changes on every
                                keystroke.
                            */}
                            <span className="KanbanBoard-searchCount" aria-live="polite">
                                {searching
                                    ? getString('KanbanBoard_MatchCount')
                                        .replace('{0}', String(shown.length))
                                        .replace('{1}', String(placed.length))
                                    : ''}
                            </span>
                        </>
                    )}

                    {/*
                        0.5.0: the sort, as a native select and a direction
                        button — the search box's reasoning: a field's own
                        affordances, no Fluent component the canvas host might
                        lack. The first entry is the view's own order.
                    */}
                    {props.showSort && (
                        <span className="KanbanBoard-sort">
                            <select
                                className="KanbanBoard-sortSelect"
                                aria-label={getString('KanbanBoard_Sort')}
                                value={props.sort?.name ?? ''}
                                disabled={props.disabled || props.loading}
                                onChange={(event): void => props.onSort(event.target.value === ''
                                    ? null
                                    : { name: event.target.value, direction: props.sort?.direction ?? 0 })}
                            >
                                <option value="">{getString('KanbanBoard_SortViewOrder')}</option>
                                {sortChoices.map((option) => (
                                    <option key={option.name} value={option.name}>{option.label}</option>
                                ))}
                            </select>
                            {props.sort && (
                                <button
                                    type="button"
                                    className="KanbanBoard-sortDirection"
                                    disabled={props.disabled || props.loading}
                                    aria-label={getString(props.sort.direction === 1 ? 'KanbanBoard_SortDescending' : 'KanbanBoard_SortAscending')}
                                    title={getString(props.sort.direction === 1 ? 'KanbanBoard_SortDescending' : 'KanbanBoard_SortAscending')}
                                    onClick={(): void => {
                                        if (props.sort) {
                                            props.onSort({ name: props.sort.name, direction: props.sort.direction === 1 ? 0 : 1 });
                                        }
                                    }}
                                >
                                    <span aria-hidden="true">{props.sort.direction === 1 ? '↓' : '↑'}</span>
                                </button>
                            )}
                        </span>
                    )}
                </div>
            )}

            {/*
                tabIndex and role are for the scrolling, not decoration. A div
                with overflow is not focusable by default, so a keyboard user
                has no way to reach lanes past the edge — and a bare div with
                aria-label exposes no name at all without a role to hang it on.
            */}
            <div
                className={rows ? 'KanbanBoard-lanes is-grid' : 'KanbanBoard-lanes'}
                role="group"
                aria-label={props.title}
                tabIndex={0}
            >
                {!rows && lanes.map((lane) => (
                    <LaneColumn
                        key={String(lane.value)}
                        {...laneProps(lane)}
                        cards={cardsInLane(shown, lane)}
                        total={cardsInLane(placed, lane).length}
                    />
                ))}

                {/*
                    0.5.0: with a Swimlane column, the lane headers once, then
                    one row per value with a cell per lane. Totals and limits
                    stay on the lane headers — they are the lane's, over every
                    row — and each row says how many cards it holds.
                */}
                {rows && (
                    <div className="KanbanBoard-gridHead">
                        {lanes.map((lane) => (
                            <LaneColumn
                                key={String(lane.value)}
                                {...laneProps(lane)}
                                mode="head"
                                cards={[]}
                                total={cardsInLane(placed, lane).length}
                            />
                        ))}
                    </div>
                )}

                {rows && rows.map((row) => {
                    const open = collapsed.indexOf(rowId(row.key)) === -1;
                    const inRow = placed.filter((card) => (card.row ? card.row.key : null) === row.key).length;
                    const shownInRow = shown.filter((card) => (card.row ? card.row.key : null) === row.key).length;
                    const count = searching
                        ? getString('KanbanBoard_MatchCount').replace('{0}', String(shownInRow)).replace('{1}', String(inRow))
                        : String(inRow);

                    return (
                        <section
                            key={rowId(row.key)}
                            className="KanbanBoard-row"
                            aria-label={getString('KanbanBoard_RowCount').replace('{0}', count).replace('{1}', row.label)}
                        >
                            {/*
                                A real button that folds the row: aria-expanded
                                says which way it is, and a folded row keeps its
                                count so nothing it holds goes unmentioned.
                            */}
                            <button
                                type="button"
                                className="KanbanBoard-rowHeader"
                                aria-expanded={open}
                                onClick={(): void => setCollapsed((current) => (open
                                    ? [...current, rowId(row.key)]
                                    : current.filter((key) => key !== rowId(row.key))))}
                            >
                                <span className="KanbanBoard-rowChevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                                <span className="KanbanBoard-rowLabel">{row.label}</span>
                                <span className="KanbanBoard-rowCount">{count}</span>
                            </button>

                            {open && (
                                <div className="KanbanBoard-rowCells">
                                    {lanes.map((lane) => (
                                        <LaneColumn
                                            key={String(lane.value)}
                                            {...laneProps(lane)}
                                            mode="cell"
                                            row={row}
                                            cards={cardsInCell(shown, lane, row)}
                                            total={cardsInCell(placed, lane, row).length}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {props.hasNextPage && (
                <div className="KanbanBoard-footer">
                    <Button
                        appearance="secondary"
                        disabled={props.disabled || props.loading}
                        onClick={props.onLoadMore}
                    >
                        {getString('KanbanBoard_LoadMore')}
                    </Button>
                </div>
            )}
        </>,
    );
}

interface ILaneProps extends IProps {
    lane: Lane;
    /** The cards with a move in flight: the control's and the ones this board started. */
    moving: string[];
    /** The cards to draw — every card in the lane, or the ones matching the search. */
    cards: Card[];
    /** Every card in the lane, whatever the search says. */
    total: number;
    /** The lane's count and sum — the server's, or the loaded cards' — or `null` when no totals are wanted. */
    laneTotal: LaneTotal | null;
    /** The lane's soft limit, or `null`. */
    limit: number | null;
    /** The transitions in force, or `null` — see `loadRules`. */
    rules: Record<string, number[]> | null;
    /** The lane and row of the card being dragged; `undefined` when nothing is. */
    dragging: Dragging | undefined;
    onDragCard: (dragging: Dragging | undefined) => void;
    searching: boolean;
    width: number;
    onDrop: (recordId: string, toValue: number | null, toRow?: Row) => void;
    /**
     * 0.5.0. `full` (the default) is a 0.4.x lane. With swimlanes a lane is
     * drawn twice over: `head` — its header and totals, once, above the
     * rows, taking no drop — and `cell` — one row's cards in it, the drop
     * target, with no header of its own.
     */
    mode?: 'full' | 'head' | 'cell';
    /** The row a `cell` belongs to. */
    row?: Row;
}

function LaneColumn(props: ILaneProps): React.ReactElement {
    const { lane, cards, getString } = props;
    const [over, setOver] = React.useState(false);

    /*
     * The unassigned lane is not a drop target.
     *
     * Writing `null` back to a choice column is a different intention from
     * moving a card, and not one a drag should be able to express by accident.
     * Cards can be dragged *out* of it.
     */
    /*
     * A lane the dragged card's reason may not move to is closed: it takes
     * no drop and says so while the drag lasts. The form's own dropdown
     * would not offer it, and the server catches only the ones that change
     * the state (measured) — so the board is the guard for the rest.
     */
    const mode = props.mode ?? 'full';
    const dragging = props.dragging;
    /*
     * A cell in another row is closed too when the card cannot change rows —
     * Owner without Assign — and the empty row never takes a card from
     * another: writing nothing into a column is not a move.
     */
    const rowClosed = mode === 'cell' && dragging !== undefined && props.row !== undefined
        && props.row.key !== dragging.row && (!props.rowsWritable || props.row.key === null);
    const closed = dragging !== undefined && (!allowsMove(props.rules, dragging.lane, lane.value) || rowClosed);
    const droppable = mode !== 'head' && lane.value !== null && !props.disabled && props.canMove && !closed;

    /*
     * The count reads "2 of 5" while a search narrows the lane and "5" the rest
     * of the time. The unassigned lane takes no new card, for the reason it
     * takes no drop: a card with no lane is not something to create on purpose.
     */
    /*
     * A limit is counted against the lane's total — the server's count of
     * the whole view where it answered, not the cards loaded so far — and a
     * lane over it is marked, never closed: a soft limit, by decision.
     */
    const limitCount = props.laneTotal ? props.laneTotal.count : props.total;
    const overLimit = props.limit !== null && limitCount > props.limit;
    /*
     * Where the server counted more than is loaded, the count says so —
     * "1 of 3", the search's own wording for "shown of all" — or a lane
     * reading "1" sits above a total over three cards. Found in the preview
     * on a paged main grid, 2026-09-29.
     */
    const count = props.searching
        ? getString('KanbanBoard_MatchCount').replace('{0}', String(cards.length)).replace('{1}', String(props.total))
        : props.limit !== null
            ? `${limitCount} / ${props.limit}`
            : limitCount > props.total
                ? getString('KanbanBoard_MatchCount').replace('{0}', String(props.total)).replace('{1}', String(limitCount))
                : String(props.total);
    const spoken = overLimit
        ? getString('KanbanBoard_OverLimit').replace('{0}', String(limitCount)).replace('{1}', String(props.limit))
        : count;
    const sum = props.hasValue && props.laneTotal
        ? props.laneTotal.label ?? (props.laneTotal.sum !== null ? props.formatValue(props.laneTotal.sum) : '—')
        : null;
    const creatable = lane.value !== null && !props.disabled && props.canCreate;

    return (
        <section
            className={['KanbanBoard-lane', mode === 'full' ? '' : `is-${mode}`, over ? 'is-over' : '', closed ? 'is-closed' : '']
                .filter(Boolean).join(' ')}
            aria-disabled={closed || undefined}
            style={{ width: `${props.width}px` }}
            aria-label={mode === 'cell' && props.row
                ? `${lane.label}, ${props.row.label}, ${getString('KanbanBoard_CardCount').replace('{0}', String(cards.length))}`
                : `${lane.label}, ${getString('KanbanBoard_CardCount').replace('{0}', spoken)}${
                    // A lane with nothing to add up draws "—"; spoken, it would be "Total dash".
                    sum !== null && sum !== '—' ? `, ${getString('KanbanBoard_LaneTotal').replace('{0}', sum)}` : ''
                }`}
            onDragOver={(event): void => {
                if (!droppable) {
                    return;
                }

                // Without preventDefault the browser refuses the drop, which
                // reads as the board ignoring the gesture.
                event.preventDefault();
                setOver(true);
            }}
            onDragLeave={(): void => setOver(false)}
            onDrop={(event): void => {
                event.preventDefault();
                setOver(false);
                // The card's own dragend can be lost when the drop re-renders
                // it into another lane, which would leave lanes closed.
                props.onDragCard(undefined);

                const id = event.dataTransfer.getData('text/plain');

                if (droppable && id !== '' && lane.value !== null) {
                    props.onDrop(id, lane.value, mode === 'cell' ? props.row : undefined);
                }
            }}
        >
            {/*
                The option's colour, as a bar above the header rather than
                behind it.

                Nothing is written on it, so an arbitrary colour can never make
                text unreadable — which matters because Dataverse assigns these
                colours automatically when a choice is created, so most of them
                were never chosen by anyone. Decoration is the honest weight to
                give a value nobody picked.

                aria-hidden because the lane already has its name in the header:
                the colour repeats what the label says, and announcing it again
                is noise.
            */}
            {mode !== 'cell' && props.laneColors && lane.color && (
                <div
                    className="KanbanBoard-laneAccent"
                    style={{ backgroundColor: lane.color }}
                    aria-hidden="true"
                />
            )}

            {mode !== 'cell' && (
            <header className="KanbanBoard-laneHeader">
                <span className="KanbanBoard-laneLabel">{lane.label}</span>
                <span
                    className={overLimit ? 'KanbanBoard-laneCount is-over' : 'KanbanBoard-laneCount'}
                    title={overLimit ? spoken : undefined}
                >
                    {count}
                </span>
                {/*
                    Hidden rather than disabled where nothing can create — the
                    same reasoning as the move menu: a permanently greyed
                    button invites the reader to work out what they configured
                    wrongly, when the answer is that this host has no form to
                    open.
                */}
                {creatable && (
                    <Button
                        appearance="subtle"
                        size="small"
                        className="KanbanBoard-laneAdd"
                        aria-label={getString('KanbanBoard_AddCard').replace('{0}', lane.label)}
                        onClick={(): void => props.onCreate(lane.value as number)}
                    >
                        +
                    </Button>
                )}
            </header>
            )}

            {/*
                The lane's total, under its name. aria-hidden: the section's
                own label already says it, and a screen reader hearing it
                twice per lane hears noise.
            */}
            {mode !== 'cell' && sum !== null && (
                <div className="KanbanBoard-laneTotal" aria-hidden="true">
                    {sum}
                </div>
            )}

            {mode !== 'head' && (
                <ul className="KanbanBoard-cards">
                    {cards.map((card) => (
                        <CardItem key={card.id} card={card} {...props} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function CardItem(props: ILaneProps & { card: Card }): React.ReactElement {
    const { card, lanes, getString } = props;
    const busy = props.moving.indexOf(card.id) >= 0;

    /*
     * Where this card could go: every lane except the unassigned one and the
     * one it is already in.
     *
     * This is empty more often than it looks. Lanes are derived from the values
     * present in the loaded records, so a view where every record shares a
     * status produces exactly one lane — and then there is nowhere to move to,
     * for any card on the board.
     */
    const targets = lanes.filter((lane) => lane.value !== null && lane.value !== card.lane
        // …and one the table's transitions allow, as the form's dropdown would.
        && allowsMove(props.rules, card.lane, lane.value));

    /*
     * 0.5.0: the rows this card could go to, the keyboard route to what a
     * drag between rows does — every row but its own and the empty one, and
     * none where the card cannot change rows (Owner without Assign).
     */
    const rowTargets = props.rows && props.rowsWritable
        ? props.rows.filter((row) => row.key !== null && row.key !== (card.row ? card.row.key : null))
        : [];

    return (
        <li
            className={busy ? 'KanbanBoard-card is-moving' : 'KanbanBoard-card'}
            draggable={!props.disabled && props.canMove}
            onDragStart={(event): void => {
                event.dataTransfer.setData('text/plain', card.id);
                event.dataTransfer.effectAllowed = 'move';
                props.onDragCard({ lane: card.lane, row: card.row ? card.row.key : null });
            }}
            onDragEnd={(): void => props.onDragCard(undefined)}
        >
            <div className="KanbanBoard-cardTop">
                {/*
                    A real button, not a clickable div: opening a record has to
                    be reachable by keyboard, and drag never is.
                */}
                {props.openOnCardClick ? (
                    <button
                        type="button"
                        className="KanbanBoard-cardTitle"
                        disabled={props.disabled}
                        onClick={(): void => props.onOpenRecord(card.id)}
                    >
                        {card.title}
                    </button>
                ) : (
                    <span className="KanbanBoard-cardTitle">{card.title}</span>
                )}

                {/*
                    The keyboard path for moving a card, and the whole reason
                    this control is usable without a mouse. HTML5 drag-and-drop
                    has no keyboard equivalent, so a board that only supported
                    dragging would be unreachable for anyone using one.

                    Hidden entirely rather than disabled where the host cannot
                    write — canvas has no WebAPI. A permanently greyed menu
                    invites the reader to work out what they have configured
                    wrongly, when the answer is that this host does not do this
                    at all.
                */}
                {props.canMove && (
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <Button
                            appearance="subtle"
                            size="small"
                            disabled={props.disabled || busy}
                            aria-label={getString('KanbanBoard_MoveTo').replace('{0}', card.title)}
                        >
                            ⋯
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            {targets.length === 0 && rowTargets.length === 0 ? (
                                /*
                                    An empty popover is a dead end: the button
                                    responds, nothing is listed, and nothing
                                    says why. Name the cause and the fix
                                    instead, disabled so it reads as an
                                    explanation rather than an action.
                                */
                                <MenuItem disabled>{getString("KanbanBoard_NoTargets")}</MenuItem>
                            ) : (
                                [
                                    ...targets.map((lane) => (
                                        <MenuItem
                                            key={`lane-${String(lane.value)}`}
                                            onClick={(): void => props.onDrop(card.id, lane.value as number)}
                                        >
                                            {lane.label}
                                        </MenuItem>
                                    )),
                                    ...rowTargets.map((row) => (
                                        <MenuItem
                                            key={`row-${row.key ?? ''}`}
                                            onClick={(): void => props.onDrop(card.id, null, row)}
                                        >
                                            {getString('KanbanBoard_MoveToRow').replace('{0}', row.label)}
                                        </MenuItem>
                                    )),
                                ]
                            )}
                        </MenuList>
                    </MenuPopover>
                </Menu>
                )}
            </div>

            {card.assignee && <div className="KanbanBoard-cardAssignee">{card.assignee}</div>}
            {card.badge && <span className="KanbanBoard-cardBadge">{card.badge}</span>}
            {busy && <span className="KanbanBoard-cardBusy">{getString('KanbanBoard_Moving')}</span>}
        </li>
    );
}
