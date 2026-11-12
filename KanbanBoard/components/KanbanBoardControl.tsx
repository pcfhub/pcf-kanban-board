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
    inRankOrder,
    laneKey,
    matchesQuery,
    totalsFromCards,
    withUnassigned,
} from './lanes';
import { TotalsAnswer } from '../data/totals';
import { Row, SortChoice, SortOption, cardsInCell } from './swimlanes';
import { useCloseWhenHidden } from '../lib/close-when-hidden/useCloseWhenHidden';
import { CEILING, FLOOR, OrderRow, PageEdges, planInsert, planNumbering } from '../lib/rank-order/plan';
import { GRID_RESTING, GridLiftState, GridSpot, liftGridKey } from '../lib/rank-order/lift';

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

/**
 * 0.6.0: one card's part of a move — its lane (absent or `null` keeps it),
 * its row (absent keeps it) and its place (absent keeps it). A drop of
 * several cards, or a place that renumbers the cards around it, is a list.
 */
export interface CardMove {
    id: string;
    lane?: number | null;
    row?: Row;
    rank?: number;
}

/** How a move of several cards ended: each settles on its own, and the refused ones are named. */
export interface MovesOutcome extends MoveOutcome {
    refused: string[];
}

/** The lowest and highest the Order column takes — its definition's MinValue and MaxValue (SPEC.md Q6). */
export interface OrderRange {
    floor: number;
    ceiling: number;
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
    /** 0.6.0: write a move of several cards, places included; resolves with the refused ones, never rejects. */
    onMoveCards: (moves: CardMove[]) => Promise<MovesOutcome>;
    /**
     * 0.6.0: the Order column, or `null` with none bound — the board is then
     * exactly 0.5.x. `inOrder` is whether the sort in force is that column
     * ascending: only then is the order on screen the order, and only then do
     * moves write places.
     */
    order: {
        column: string;
        inOrder: boolean;
        rangeKey: string;
        loadRange: (() => Promise<OrderRange>) | null;
    } | null;
    /** 0.6.0: whether cards can be selected — a checkbox on each, Ctrl/⌘- and Shift-click. Off by default. */
    selectCards: boolean;
    /** Tell the platform which cards are selected. */
    onSelect: (ids: string[]) => void;
    /** Open the quick create form with the lane's option preselected, and the new card's place when there is one. */
    onCreate: (laneValue: number, rank?: number) => void;
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
type Placement = { lane: number | null; row?: Card['row']; rank?: number | null };

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

/**
 * The Order column's range, held in React for the reason the option lanes
 * are. Until it answers — and wherever it cannot be read — 1 … 2,147,483,647,
 * which any whole-number column takes unless its maker narrowed it.
 */
function useOrderRange(rangeKey: string, loadRange: (() => Promise<OrderRange>) | null): OrderRange {
    const [range, setRange] = React.useState<OrderRange>({ floor: FLOOR, ceiling: CEILING });

    React.useEffect(() => {
        if (!loadRange) {
            return undefined;
        }

        let alive = true;

        void loadRange().then((answer) => {
            if (alive) {
                setRange(answer);
            }
        });

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rangeKey]);

    return range;
}

/**
 * The cards being dragged — one, or every selected card when a selected one
 * was picked up — with where each is now: what each drop target judges
 * itself against. `dataTransfer` cannot be read during `dragover`.
 */
type Dragging = { ids: string[]; from: { lane: number | null; row: string | null }[] };

/** A card's place for `lib/rank-order`. */
const orderRow = (card: Card): OrderRow => ({ id: card.id, value: card.rank ?? null });

/** Where a drop would put the cards: the list (a lane, or a lane's cell in a row) and the slot in it. */
type DropAt = { list: string; index: number };

/** A list's key: its lane, and its row when the board has rows. */
const listKey = (lane: number | null, row: string | null | undefined): string => `${lane ?? ''}|${row === undefined ? '*' : row ?? ''}`;

/** A unique id per board, for the grip's description — React 16 has no `useId`. */
let boards = 0;

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
            ? {
                ...card,
                lane: overlay[card.id].lane,
                ...(overlay[card.id].row ? { row: overlay[card.id].row } : {}),
                ...(overlay[card.id].rank !== undefined ? { rank: overlay[card.id].rank } : {}),
            }
            : card)),
        [cards, overlay],
    );

    /*
     * 0.6.0. `ranked`: the sort in force is the Order column, so the loaded
     * cards are the first of the whole order and a move writes places.
     * `ordering`: the user can place a card — ranked, no search narrowing
     * the board, a host that writes. The grips and the drop line need it.
     */
    const ranked = props.order !== null && props.order.inOrder;
    const ordering = ranked && !searching && props.canMove && !props.disabled;
    const range = useOrderRange(props.order ? props.order.rangeKey : '', props.order ? props.order.loadRange : null);
    const arrange = (list: Card[]): Card[] => (ranked ? inRankOrder(list) : list);

    /* The selection, the board's own (Q8: a refresh keeps only the selected cards still on its first page). */
    const [selected, setSelected] = React.useState<string[]>([]);
    const [anchor, setAnchor] = React.useState<string | null>(null);
    const selectedNow = props.selectCards ? selected.filter((id) => placed.some((card) => card.id === id)) : [];

    /* The keyboard's lifted card, the slot a drag would drop into, and what a screen reader is told. */
    const [lifted, setLifted] = React.useState<GridLiftState>(GRID_RESTING);
    const [dropAt, setDropAt] = React.useState<DropAt | null>(null);
    const [announce, setAnnounce] = React.useState('');
    const [focusGrip, setFocusGrip] = React.useState<string | null>(null);
    const [focusLanes, setFocusLanes] = React.useState(false);
    const root = React.useRef<HTMLDivElement | null>(null);

    const helpId = React.useRef(`KanbanBoard-gripHelp-${(boards += 1)}`).current;

    /*
     * A changed search or sort clears the selection: a drag of one selected
     * card takes them all, and one hidden by the search should not go with it.
     */
    React.useEffect(() => {
        if (selected.length > 0) {
            setSelected([]);
            props.onSelect([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, props.sort ? `${props.sort.name}:${props.sort.direction}` : '', ranked]);

    /*
     * The grip keeps the focus across a lift: a card carried to another lane
     * is drawn there, a new element, and the one that had the focus is gone.
     */
    React.useEffect(() => {
        const id = lifted.lifted ? lifted.id : focusGrip;

        if (id === null || !root.current) {
            return;
        }

        const grip = root.current.querySelector<HTMLElement>(`[data-grip-id="${id}"]`);

        if (grip && document.activeElement !== grip) {
            grip.focus();
        }

        if (!lifted.lifted && focusGrip !== null) {
            setFocusGrip(null);
        }
    }, [lifted, focusGrip]);

    /* A click anywhere else while a card is lifted puts it back. */
    React.useEffect(() => {
        if (!lifted.lifted) {
            return undefined;
        }

        const cancel = (event: Event): void => {
            const target = event.target as HTMLElement | null;

            if (!target || !target.closest || !target.closest(`[data-grip-id="${lifted.id}"]`)) {
                setLifted(GRID_RESTING);
            }
        };

        document.addEventListener('pointerdown', cancel, true);

        return () => document.removeEventListener('pointerdown', cancel, true);
    }, [lifted]);

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

    /* ----------------------------------------------------- 0.6.0: the order */

    /** A card's list: its lane, and its row on a board with rows. */
    const listOf = (lane: number | null, row: Card['row'] | Row | undefined): string =>
        listKey(lane, rows ? (row ? row.key : null) : undefined);

    /** Every card in a list, in the order drawn — the search aside. */
    const listCards = (lane: number | null, rowKey: string | null | undefined): Card[] =>
        arrange(placed.filter((card) => card.lane === lane && (rowKey === undefined || (card.row ? card.row.key : null) === rowKey)));

    /*
     * What the plan may use. A board loads more and never turns pages, so the
     * loaded cards are the first of the order: the top is open to the
     * column's floor, the bottom only once nothing is left to load — and the
     * span is every loaded card's, since a lane is a slice of them.
     */
    const loadedRanks = placed.map((card) => card.rank).filter((rank): rank is number => typeof rank === 'number');
    const edges: PageEdges = {
        first: true,
        last: !props.hasNextPage,
        ...(loadedRanks.length > 0 ? { min: Math.min(...loadedRanks), max: Math.max(...loadedRanks) } : {}),
        floor: range.floor,
        ceiling: range.ceiling,
    };

    /** Cards with no place yet: they sort first, and a lane holding one refuses a move. */
    const unnumbered = ranked ? placed.filter((card) => card.rank === null || card.rank === undefined).length : 0;

    /* After the numbering bar goes, the focus it had goes to the lanes, not to the page. */
    React.useEffect(() => {
        if (!focusLanes || !root.current) {
            return;
        }

        const bar = root.current.querySelector('.KanbanBoard-orderBar');

        if (!bar || !bar.contains(document.activeElement)) {
            root.current.querySelector<HTMLElement>('.KanbanBoard-lanes')?.focus();
            setFocusLanes(false);
        }
    }, [focusLanes, unnumbered]);

    /** The cards named, in the order the board draws them: lane by lane, row by row, then down each list. */
    const inBoardOrder = (ids: string[]): Card[] => {
        const laneAt = (card: Card): number => lanes.findIndex((lane) => lane.value === card.lane);
        const rowAt = (card: Card): number => (rows ? rows.findIndex((row) => row.key === (card.row ? card.row.key : null)) : 0);
        const chosen = arrange(placed.filter((card) => ids.indexOf(card.id) !== -1));

        return chosen
            .map((card, index) => ({ card, index }))
            .sort((a, b) => laneAt(a.card) - laneAt(b.card) || rowAt(a.card) - rowAt(b.card) || a.index - b.index)
            .map((each) => each.card);
    };

    /** The top of a lane for a new card: one place above its first, or nothing where that would renumber others. */
    const topOf = (lane: number): number | undefined => {
        if (!ranked) {
            return undefined;
        }

        const plan = planInsert(listCards(lane, undefined).map(orderRow), [{ id: '\u0000new', value: null }], 0, edges);

        return plan.ok && plan.writes.length === 1 ? plan.writes[0].to : undefined;
    };

    /**
     * Write placements: each card is put where it is going on screen at once,
     * and back where it was if its write is refused. The one path every move
     * takes — a drop, the keyboard, a Move, a numbering.
     */
    const apply = (moves: CardMove[]): void => {
        if (moves.length === 0) {
            return;
        }

        const before: Record<string, Placement> = {};

        for (const move of moves) {
            const card = placed.find((each) => each.id === move.id);
            const from: Placement = {
                lane: card ? card.lane : null,
                ...(card && card.row ? { row: card.row } : {}),
                ...(card && card.rank !== undefined ? { rank: card.rank } : {}),
            };

            before[move.id] = from;
            place(move.id, {
                lane: move.lane ?? from.lane,
                ...(move.row ? { row: move.row } : from.row ? { row: from.row } : {}),
                ...(move.rank !== undefined ? { rank: move.rank } : from.rank !== undefined ? { rank: from.rank } : {}),
            });
        }

        const ids = moves.map((move) => move.id);

        setRefusal(null);
        setBusy((current) => [...current, ...ids]);

        void props.onMoveCards(moves).then((outcome) => {
            setBusy((current) => current.filter((id) => ids.indexOf(id) === -1));

            if (outcome.refused.length < moves.length) {
                setLanded((count) => count + 1);
            }

            for (const id of outcome.refused) {
                place(id, before[id]);
            }

            if (!outcome.ok) {
                setRefusal(outcome.message);
            }
        });
    };

    /**
     * Move cards to a lane (`null` keeps each card's), a row (absent keeps
     * each card's) and a slot. `at` is the slot in the target list with the
     * moved cards taken out; `null` is the top — where a Move from a menu
     * lands, by decision. Places are written only while the board is in its
     * own order; anywhere else the cards keep the places they had.
     */
    const moveCards = (ids: string[], toLane: number | null, toRow: Row | undefined, at: number | null): void => {
        const block = inBoardOrder(ids);
        const moves = new Map<string, CardMove>();
        const groups = new Map<string, { lane: number | null; rowKey: string | null | undefined; cards: Card[] }>();
        const target = toLane !== null || toRow !== undefined ? listOf(toLane ?? block[0]?.lane ?? null, toRow ?? block[0]?.row) : null;
        let refusedHere: string | null = null;

        for (const card of block) {
            const lane = toLane ?? card.lane;
            const row = toRow ?? card.row;
            const move: CardMove = { id: card.id };

            if (lane !== card.lane) {
                move.lane = lane;
            }

            if (toRow && toRow.key !== (card.row ? card.row.key : null)) {
                move.row = toRow;
            }

            moves.set(card.id, move);

            const key = listOf(lane, row);
            const group = groups.get(key) ?? { lane, rowKey: rows ? (row ? row.key : null) : undefined, cards: [] };

            group.cards.push(card);
            groups.set(key, group);
        }

        if (ranked) {
            for (const [key, group] of groups) {
                const others = listCards(group.lane, group.rowKey).filter((card) => ids.indexOf(card.id) === -1);
                const slot = at !== null && (target === null || target === key) ? Math.max(0, Math.min(at, others.length)) : 0;
                const plan = planInsert(others.map(orderRow), group.cards.map(orderRow), slot, edges);

                if (plan.ok) {
                    for (const write of plan.writes) {
                        const move = moves.get(write.id) ?? { id: write.id };

                        move.rank = write.to;
                        moves.set(write.id, move);
                    }
                } else if (plan.reason !== 'noMove') {
                    refusedHere = getString(plan.reason === 'noRoom' ? 'KanbanBoard_OrderNoRoom' : 'KanbanBoard_OrderUnnumbered');
                }
            }
        }

        const effective = [...moves.values()].filter((move) => move.lane !== undefined || move.row !== undefined || move.rank !== undefined);

        if (effective.length === 0) {
            setRefusal(refusedHere);

            return;
        }

        apply(effective);

        if (refusedHere !== null && effective.every((move) => move.lane === undefined && move.row === undefined)) {
            setRefusal(refusedHere);
        }
    };

    /** Give the cards with no place one, just above the first that has one — writing only them. */
    const numberCards = (): void => {
        const rowsInOrder = inRankOrder(placed).map(orderRow);
        const last = rowsInOrder[rowsInOrder.length - 1];

        // They all sort first, so numbering only the loaded ones would drop them below the rest.
        if (props.hasNextPage && last && last.value === null) {
            setRefusal(getString('KanbanBoard_NumberMore'));

            return;
        }

        apply(planNumbering(rowsInOrder, 'unnumbered', !props.hasNextPage).writes.map((write) => ({ id: write.id, rank: write.to })));
    };

    /* ------------------------------------------------- 0.6.0: the selection */

    const select = (ids: string[], from: string | null): void => {
        setSelected(ids);
        setAnchor(from);
        props.onSelect(ids);
    };

    /** Ctrl/⌘ toggles one card; Shift adds the run from the last one picked, down its list. */
    const pick = (card: Card, range: boolean): void => {
        const isIn = selectedNow.indexOf(card.id) !== -1;

        if (range && anchor !== null) {
            const from = placed.find((each) => each.id === anchor);

            if (from && listOf(from.lane, from.row) === listOf(card.lane, card.row)) {
                const list = listCards(card.lane, rows ? (card.row ? card.row.key : null) : undefined);
                const a = list.findIndex((each) => each.id === anchor);
                const b = list.findIndex((each) => each.id === card.id);
                const run = list.slice(Math.min(a, b), Math.max(a, b) + 1).map((each) => each.id);

                select([...selectedNow.filter((id) => run.indexOf(id) === -1), ...run], anchor);

                return;
            }
        }

        select(isIn ? selectedNow.filter((id) => id !== card.id) : [...selectedNow, card.id], card.id);
    };

    /* --------------------------------------------- 0.6.0: the keyboard lift */

    /** The lanes a card can be carried across — every lane, in its own row on a board with rows. */
    const liftLayout = (card: Card): { spot: GridSpot; places: number[]; open: (column: number) => boolean; lists: Card[][] } => {
        const rowKey = rows ? (card.row ? card.row.key : null) : undefined;
        const lists = lanes.map((lane) => listCards(lane.value, rowKey));
        const column = Math.max(0, lanes.findIndex((lane) => lane.value === card.lane));

        return {
            spot: { column, index: Math.max(0, lists[column].findIndex((each) => each.id === card.id)) },
            places: lists.map((list) => list.filter((each) => each.id !== card.id).length + 1),
            open: (c: number): boolean => c === column
                || (lanes[c].value !== null && allowsMove(rules, card.lane, lanes[c].value)),
            lists,
        };
    };

    const positionText = (lane: Lane, at: number, of: number): string =>
        getString('KanbanBoard_Position').replace('{0}', lane.label).replace('{1}', String(at + 1)).replace('{2}', String(of));

    const onGripKey = (card: Card, event: React.KeyboardEvent): void => {
        const layout = liftLayout(card);
        const result = liftGridKey(
            lifted,
            { key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey },
            card.id,
            layout.spot,
            { places: layout.places, open: layout.open, rtl: props.isRTL },
        );

        if (result.handled) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (!result.event) {
            return;
        }

        const state = result.state.lifted ? result.state : lifted.lifted ? lifted : null;
        const at = state ? state.at : layout.spot;
        const lane = lanes[at.column];
        const count = layout.places[at.column];

        switch (result.event) {
            case 'lift':
                setAnnounce(getString('KanbanBoard_Lifted').replace('{0}', card.title)
                    .replace('{1}', positionText(lane, at.index, count)));
                break;
            case 'move':
            case 'edge':
                setAnnounce(positionText(lane, at.index, count));
                break;
            case 'drop':
                setAnnounce(getString('KanbanBoard_Dropped').replace('{0}', card.title)
                    .replace('{1}', positionText(lane, at.index, count)));
                setFocusGrip(card.id);
                moveCards([card.id], lane.value, undefined, at.index);
                break;
            case 'cancel':
                setAnnounce(getString('KanbanBoard_LiftCancelled').replace('{0}', card.title)
                    .replace('{1}', positionText(lanes[layout.spot.column], layout.spot.index, layout.places[layout.spot.column])));
                break;
            default:
                break;
        }

        setLifted(result.state);
    };

    /** The cards a list draws: the search's, in order, with a lifted card shown where it is being carried. */
    const listView = (lane: Lane, row: Row | undefined, source: Card[]): Card[] => {
        const list = arrange(source);

        if (!lifted.lifted) {
            return list;
        }

        const card = placed.find((each) => each.id === lifted.id);

        if (!card) {
            return list;
        }

        const without = list.filter((each) => each.id !== card.id);
        const target = lanes[lifted.at.column];
        const sameRow = !rows || !row || (card.row ? card.row.key : null) === row.key;

        if (!target || target.value !== lane.value || !sameRow) {
            return without;
        }

        return [...without.slice(0, lifted.at.index), card, ...without.slice(lifted.at.index)];
    };

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
        onDragCard: (next: Dragging | undefined): void => {
            setDragging(next);

            if (!next) {
                setDropAt(null);
            }
        },
        searching,
        width: laneWidth,
        onDrop: move,
        onDropCards: (ids: string[], toValue: number, toRow: Row | undefined, at: number | null): void =>
            moveCards(ids, toValue, toRow, ordering ? at : null),
        ordering,
        ranked,
        dropAt,
        onDropAt: setDropAt,
        listOf,
        dragFor: (card: Card): Dragging => {
            const ids = props.selectCards && selectedNow.indexOf(card.id) !== -1
                ? inBoardOrder(selectedNow).map((each) => each.id)
                : [card.id];

            return {
                ids,
                from: ids.map((id) => {
                    const each = placed.find((candidate) => candidate.id === id);

                    return { lane: each ? each.lane : null, row: each && each.row ? each.row.key : null };
                }),
            };
        },
        selected: selectedNow,
        onPick: pick,
        lifted: lifted.lifted ? lifted.id : null,
        onGripKey,
        helpId,
        onMoveWithin: (card: Card, step: number): void => {
            const list = listCards(card.lane, rows ? (card.row ? card.row.key : null) : undefined);
            const index = list.findIndex((each) => each.id === card.id);

            moveCards([card.id], null, undefined, Math.max(0, index + step));
        },
        positionOf: (card: Card): { index: number; count: number } => {
            const list = listCards(card.lane, rows ? (card.row ? card.row.key : null) : undefined);

            return { index: list.findIndex((each) => each.id === card.id), count: list.length };
        },
        topOf,
    });

    /** A single card's move from its Move menu: a lane, or a row — landing at the top while the board is in its own order. */
    const move = (recordId: string, toValue: number | null, toRow?: Row): void => {
        moveCards([recordId], toValue, toRow, null);
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
    /*
     * 0.6.0: the selection. How many, Move for all of them — to a lane every
     * one may go to — and Clear. No command bar acts on it (the manifest keeps
     * the subgrid's off, by decision); a form script can read it from the
     * subgrid's grid.
     */
    const selectionBar = selectedNow.length > 0 ? (
        <SelectionBar
            {...props}
            count={selectedNow.length}
            lanes={lanes}
            rows={rows}
            rules={rules}
            cards={placed.filter((card) => selectedNow.indexOf(card.id) !== -1)}
            onMoveTo={(toValue: number | null, toRow?: Row): void => moveCards(selectedNow, toValue, toRow, null)}
            onClear={(): void => select([], null)}
        />
    ) : null;

    const frame = (content: React.ReactElement): React.ReactElement => (
        <FluentProvider theme={props.theme ?? webLightTheme} dir={props.isRTL ? 'rtl' : 'ltr'}>
            <div
                className="KanbanBoard"
                ref={root}
                style={props.allocatedWidth ? { maxWidth: `${props.allocatedWidth}px` } : undefined}
            >
                {content}
                {/*
                    0.6.0: what the keyboard lift says — assertive, because a
                    move nobody hears the end of is worse than none. One
                    region per board, always in the tree, so a screen reader
                    has it registered before the first message.
                */}
                <div className="KanbanBoard-live" aria-live="assertive" aria-atomic="true">{announce}</div>
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

            {/*
                0.6.0: cards with no place yet. They sort first, so a lane
                holding one cannot be reordered; one button gives only them a
                place, just above the first card that has one — Data Table
                0.9.0's bar, by the same decision.
            */}
            {unnumbered > 0 && props.canMove && !props.disabled && (
                <div className="KanbanBoard-orderBar">
                    <span>{getString('KanbanBoard_UnnumberedCount').replace('{0}', String(unnumbered))}</span>
                    {/*
                        disabledFocusable rather than disabled while cards save, for the focus
                        (pcf-review) — and once every card has a place the bar goes, so the
                        press hands the focus to the board rather than to the page.
                    */}
                    <Button
                        appearance="secondary"
                        size="small"
                        disabledFocusable={busy.length > 0}
                        onClick={(): void => {
                            if (busy.length === 0) {
                                numberCards();
                                setFocusLanes(true);
                            }
                        }}
                    >
                        {getString('KanbanBoard_Number')}
                    </Button>
                </div>
            )}

            {/*
                0.6.0: the selection, on a bar of its own only where there is
                no toolbar to hold it. Measured on the form (W6): a bar that
                appeared above the lanes on the first tick moved every card
                down, and the next click landed where the checkbox had been.
            */}
            {selectionBar !== null && !(props.showSearch || props.showSort) && selectionBar}

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

                    {/* 0.6.0: the selection, in the toolbar's own row — which does not grow, so nothing moves. */}
                    {selectionBar}

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
                                <option value="">{getString(props.order ? 'KanbanBoard_SortYourOrder' : 'KanbanBoard_SortViewOrder')}</option>
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
            {/* What a grip's Space does, said once per board and pointed at by every grip. */}
            {ordering && <span id={helpId} className="KanbanBoard-live">{getString('KanbanBoard_GripHelp')}</span>}

            <div
                className={rows ? 'KanbanBoard-lanes is-grid' : 'KanbanBoard-lanes'}
                role="group"
                aria-label={props.title}
                tabIndex={0}
                onKeyDown={(event): void => {
                    // Escape lets go of a selection — once no card is lifted, where it cancels the lift.
                    if (event.key === 'Escape' && !lifted.lifted && selectedNow.length > 0) {
                        select([], null);
                    }
                }}
            >
                {!rows && lanes.map((lane) => (
                    <LaneColumn
                        key={String(lane.value)}
                        {...laneProps(lane)}
                        cards={listView(lane, undefined, cardsInLane(shown, lane))}
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
                                            cards={listView(lane, row, cardsInCell(shown, lane, row))}
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
    /** 0.6.0: a drop of these cards into this list, at this slot (`null`: the top). */
    onDropCards: (ids: string[], toValue: number, toRow: Row | undefined, at: number | null) => void;
    /** Whether the user can place a card — the grips and the drop line. */
    ordering: boolean;
    /** Whether the board is in its own order. */
    ranked: boolean;
    /** Where a drop would land, while a drag is over a list. */
    dropAt: DropAt | null;
    onDropAt: (at: DropAt | null) => void;
    /** A list's key, from its lane and row. */
    listOf: (lane: number | null, row: Card['row'] | Row | undefined) => string;
    /** What a drag of this card carries: it, or every selected card when it is one. */
    dragFor: (card: Card) => Dragging;
    /** The selected cards' ids. */
    selected: string[];
    /** Ctrl/⌘ or the checkbox: one card; Shift: the run from the last one picked. */
    onPick: (card: Card, range: boolean) => void;
    /** The card lifted from the keyboard, or `null`. */
    lifted: string | null;
    onGripKey: (card: Card, event: React.KeyboardEvent) => void;
    /** The id of the grip's description. */
    helpId: string;
    /** Move a card one place up (−1) or down (+1) in its list — the Move menu's keyboard-free route, for a phone. */
    onMoveWithin: (card: Card, step: number) => void;
    /** Where a card sits in its list. */
    positionOf: (card: Card) => { index: number; count: number };
    /** A new card's place at the top of a lane, or nothing. */
    topOf: (lane: number) => number | undefined;
}

/** 0.6.0: how many cards are selected, Move for all of them, and Clear. */
function SelectionBar(props: IProps & {
    count: number;
    rules: Record<string, number[]> | null;
    onMoveTo: (toValue: number | null, toRow?: Row) => void;
    onClear: () => void;
}): React.ReactElement {
    const { getString, count } = props;
    const [open, setOpen] = React.useState(false);
    const [button, setButton] = React.useState<HTMLElement | null>(null);

    useCloseWhenHidden(button, open, () => setOpen(false));

    // A lane every selected card may go to, and one not all of them are in already.
    const lanes = props.lanes.filter((lane) => lane.value !== null
        && props.cards.every((card) => allowsMove(props.rules, card.lane, lane.value))
        && props.cards.some((card) => card.lane !== lane.value));
    // A row not every selected card is in already (W6: both cards' own row was offered).
    const rows = props.rows && props.rowsWritable
        ? props.rows.filter((row) => row.key !== null && props.cards.some((card) => (card.row ? card.row.key : null) !== row.key))
        : [];

    return (
        <div className="KanbanBoard-selection" role="group" aria-label={getString('KanbanBoard_SelectedCount').replace('{0}', String(count))}>
            <span className="KanbanBoard-selectionCount" aria-live="polite">
                {getString('KanbanBoard_SelectedCount').replace('{0}', String(count))}
            </span>
            {props.canMove && !props.disabled && (lanes.length > 0 || rows.length > 0) && (
                <Menu open={open} onOpenChange={(_event, data): void => setOpen(data.open)}>
                    <MenuTrigger disableButtonEnhancement>
                        <Button ref={setButton} appearance="secondary" size="small">
                            {getString('KanbanBoard_MoveSelected').replace('{0}', String(count))}
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            {lanes.map((lane) => (
                                <MenuItem key={`lane-${String(lane.value)}`} onClick={(): void => props.onMoveTo(lane.value)}>
                                    {lane.label}
                                </MenuItem>
                            ))}
                            {rows.map((row) => (
                                <MenuItem key={`row-${row.key ?? ''}`} onClick={(): void => props.onMoveTo(null, row)}>
                                    {getString('KanbanBoard_MoveToRow').replace('{0}', row.label)}
                                </MenuItem>
                            ))}
                        </MenuList>
                    </MenuPopover>
                </Menu>
            )}
            <Button appearance="subtle" size="small" onClick={props.onClear}>
                {getString('KanbanBoard_ClearSelection')}
            </Button>
        </div>
    );
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
        && dragging.from.some((from) => from.row !== (props.row as Row).key)
        && (!props.rowsWritable || props.row.key === null);
    // 0.6.0: a drag of several cards is closed where any of them may not go.
    const closed = dragging !== undefined
        && (dragging.from.some((from) => !allowsMove(props.rules, from.lane, lane.value)) || rowClosed);
    const droppable = mode !== 'head' && lane.value !== null && !props.disabled && props.canMove && !closed;
    const list = props.listOf(lane.value, mode === 'cell' ? props.row : undefined);
    const cardsEl = React.useRef<HTMLUListElement | null>(null);

    /*
     * 0.6.0: the slot under the pointer — before the first card whose middle
     * it is above, among the cards not being dragged. Only while the board is
     * in its own order and nothing narrows it; otherwise a drop lands at the
     * top, as a Move does.
     */
    const slotAt = (clientY: number): number => {
        const items = cardsEl.current
            ? Array.from(cardsEl.current.querySelectorAll<HTMLElement>('[data-card-id]'))
                .filter((element) => !dragging || dragging.ids.indexOf(element.dataset.cardId ?? '') === -1)
            : [];
        const index = items.findIndex((element) => {
            const box = element.getBoundingClientRect();

            return clientY < box.top + box.height / 2;
        });

        return index === -1 ? items.length : index;
    };
    const lineAt = props.ordering && props.dropAt && props.dropAt.list === list ? props.dropAt.index : null;

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

                if (props.ordering) {
                    const index = slotAt(event.clientY);

                    if (!props.dropAt || props.dropAt.list !== list || props.dropAt.index !== index) {
                        props.onDropAt({ list, index });
                    }
                }
            }}
            onDragLeave={(): void => setOver(false)}
            onDrop={(event): void => {
                event.preventDefault();
                setOver(false);

                // Read before the drag is cleared below: what was carried, and the slot it was over.
                const id = event.dataTransfer.getData('text/plain');
                const ids = dragging ? dragging.ids : id !== '' ? [id] : [];
                const at = props.ordering ? slotAt(event.clientY) : null;

                // The card's own dragend can be lost when the drop re-renders
                // it into another lane, which would leave lanes closed.
                props.onDragCard(undefined);

                if (droppable && ids.length > 0 && lane.value !== null) {
                    props.onDropCards(ids, lane.value, mode === 'cell' ? props.row : undefined, at);
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
                        onClick={(): void => props.onCreate(lane.value as number, props.topOf(lane.value as number))}
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
                <ul className="KanbanBoard-cards" ref={cardsEl}>
                    {cards.map((card, index) => {
                        // The drop line counts only the cards not being dragged, as the slot does.
                        const before = cards.slice(0, index)
                            .filter((each) => !dragging || dragging.ids.indexOf(each.id) === -1).length;
                        const carried = dragging !== undefined && dragging.ids.indexOf(card.id) !== -1;

                        return (
                            <React.Fragment key={card.id}>
                                {lineAt === before && !carried && <li className="KanbanBoard-dropLine" aria-hidden="true" />}
                                <CardItem card={card} {...props} />
                            </React.Fragment>
                        );
                    })}
                    {lineAt !== null && lineAt >= cards.filter((each) => !dragging || dragging.ids.indexOf(each.id) === -1).length && (
                        <li className="KanbanBoard-dropLine" aria-hidden="true" />
                    )}
                </ul>
            )}
        </section>
    );
}

function CardItem(props: ILaneProps & { card: Card }): React.ReactElement {
    const { card, lanes, getString } = props;
    const busy = props.moving.indexOf(card.id) >= 0;

    /*
     * The move menu is portalled and follows its button, so a board or form
     * scrolled with it open carries it out of the lane and over the form's
     * header. Controlled so it can close once the button is out of view
     * (lib/close-when-hidden/watch.ts).
     */
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [menuButton, setMenuButton] = React.useState<HTMLElement | null>(null);

    useCloseWhenHidden(menuButton, menuOpen, () => setMenuOpen(false));

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

    /* 0.6.0: Move up and Move down — a phone's way to reorder, where there is no drag and no keyboard. */
    const position = props.ordering ? props.positionOf(card) : { index: -1, count: 0 };
    const canUp = props.ordering && position.index > 0;
    const canDown = props.ordering && position.index !== -1 && position.index < position.count - 1;
    const isSelected = props.selected.indexOf(card.id) !== -1;
    const isLifted = props.lifted === card.id;

    return (
        <li
            className={['KanbanBoard-card', busy ? 'is-moving' : '', isSelected ? 'is-selected' : '', isLifted ? 'is-lifted' : '']
                .filter(Boolean).join(' ')}
            data-card-id={card.id}
            draggable={!props.disabled && props.canMove}
            onDragStart={(event): void => {
                event.dataTransfer.setData('text/plain', card.id);
                event.dataTransfer.effectAllowed = 'move';
                props.onDragCard(props.dragFor(card));
            }}
            onDragEnd={(): void => props.onDragCard(undefined)}
            onClick={(event): void => {
                // Ctrl/⌘ or Shift on the card itself picks it, as on the title.
                const target = event.target as HTMLElement;

                if (props.selectCards && (event.ctrlKey || event.metaKey || event.shiftKey)
                    && !target.closest('button, input, a')) {
                    event.preventDefault();
                    props.onPick(card, event.shiftKey);
                }
            }}
        >
            <div className="KanbanBoard-cardTop">
                {/*
                    0.6.0: the checkbox, where the maker turned selection on.
                    A native one: the platform's Fluent build carries no icon
                    for Fluent's, and a checkbox's state and keys are the
                    browser's own. Shift with it picks the run.
                */}
                {props.selectCards && (
                    <input
                        type="checkbox"
                        className="KanbanBoard-cardSelect"
                        checked={isSelected}
                        disabled={props.disabled}
                        aria-label={getString('KanbanBoard_Select').replace('{0}', card.title)}
                        onChange={(event): void => props.onPick(card, (event.nativeEvent as MouseEvent).shiftKey === true)}
                    />
                )}

                {/*
                    0.6.0: the grip — the keyboard's way to place a card. Space
                    lifts it, the arrows carry it (Left and Right to the next
                    lane), Space drops, Escape cancels; every step is announced.
                    Drawn only while the board is in its own order and can
                    write, so it never offers what it cannot do.
                */}
                {props.ordering && (
                    <button
                        type="button"
                        className="KanbanBoard-cardGrip"
                        data-grip-id={card.id}
                        aria-label={getString('KanbanBoard_Grip').replace('{0}', card.title)}
                        aria-describedby={props.helpId}
                        // Not `disabled`: the grip just dropped is the one focused, and a disabled
                        // button drops focus to BODY (pcf-review). Its keys wait for the save instead.
                        aria-disabled={busy || undefined}
                        onKeyDown={(event): void => {
                            if (!busy) {
                                props.onGripKey(card, event);
                            }
                        }}
                    >
                        <span aria-hidden="true">⠿</span>
                    </button>
                )}

                {/*
                    A real button, not a clickable div: opening a record has to
                    be reachable by keyboard, and drag never is.
                */}
                {props.openOnCardClick ? (
                    <button
                        type="button"
                        className="KanbanBoard-cardTitle"
                        disabled={props.disabled}
                        onClick={(event): void => {
                            // With selection on, Ctrl/⌘ or Shift picks rather than opens.
                            if (props.selectCards && (event.ctrlKey || event.metaKey || event.shiftKey)) {
                                event.preventDefault();
                                event.stopPropagation();
                                props.onPick(card, event.shiftKey);

                                return;
                            }

                            props.onOpenRecord(card.id);
                        }}
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
                <Menu open={menuOpen} onOpenChange={(_event, data): void => setMenuOpen(data.open)}>
                    <MenuTrigger disableButtonEnhancement>
                        <Button
                            ref={setMenuButton}
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
                            {targets.length === 0 && rowTargets.length === 0 && !canUp && !canDown ? (
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
                                    ...(canUp ? [(
                                        <MenuItem key="up" onClick={(): void => props.onMoveWithin(card, -1)}>
                                            {getString('KanbanBoard_MoveUp')}
                                        </MenuItem>
                                    )] : []),
                                    ...(canDown ? [(
                                        <MenuItem key="down" onClick={(): void => props.onMoveWithin(card, 1)}>
                                            {getString('KanbanBoard_MoveDown')}
                                        </MenuItem>
                                    )] : []),
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
