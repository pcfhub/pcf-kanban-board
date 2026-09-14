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
import { Card, Lane, boardKey, cardsInLane, matchesQuery, withUnassigned } from './lanes';

export interface IProps {
    cards: Card[];
    lanes: Lane[];
    hasStatus: boolean;
    hasTitle: boolean;
    /** False on a host with neither a writable record nor a WebAPI, where a move cannot be written. */
    canMove: boolean;
    /** False where the maker turned it off, or the host has no `navigation.openForm` — canvas, the demo. */
    canCreate: boolean;
    /** Whether the search box is rendered at all. */
    showSearch: boolean;
    moving: string[];
    moveError: string | null;
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
    onMove: (recordId: string, toValue: number) => void;
    /** Open the quick create form with the lane's option preselected. */
    onCreate: (laneValue: number) => void;
    onOpenRecord: (id: string) => void;
    onLoadMore: () => void;
}

/**
 * Where this component thinks each card is, over the top of what props say.
 *
 * On a real form the overlay is redundant: the platform re-renders after
 * `notifyOutputChanged()` and the control has already applied its own pending
 * move, so the card arrives in the new lane. PCFHub's demo harness does not —
 * it posts outputs to the parent window and rebuilds the DataSet on every
 * render — so a board that placed cards straight from props would look dead in
 * the published demo: every drag accepted, nothing moving.
 *
 * `pcf-data-table` needs the same trick for selection and documents it the same
 * way. The resync key is the board's *content*, not its identity: every
 * `updateView` hands down freshly built card objects.
 */
function useOptimisticLanes(
    cards: Card[],
): [Record<string, number>, (id: string, lane: number) => void] {
    const [overlay, setOverlay] = React.useState<Record<string, number>>({});
    const key = boardKey(cards);

    React.useEffect(() => {
        setOverlay({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const place = React.useCallback((id: string, lane: number): void => {
        setOverlay((current) => ({ ...current, [id]: lane }));
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

export function KanbanBoardControl(props: IProps): React.ReactElement | null {
    const { cards, getString, laneWidth } = props;
    const [overlay, place] = useOptimisticLanes(cards);
    const fromOptions = useOptionLanes(props.lanesKey, props.loadLanes);

    /*
     * The search text lives here and nowhere else. A virtual control cannot
     * push a repaint from outside React — `notifyOutputChanged()` announces
     * outputs, and typing changes none — so state that has to repaint on
     * every keystroke has to be React's. Same rule as `useOptionLanes`.
     */
    const [query, setQuery] = React.useState('');
    const searching = query.trim() !== '';

    const placed = React.useMemo(
        () => cards.map((card) => (card.id in overlay ? { ...card, lane: overlay[card.id] } : card)),
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
    const lanes = fromOptions
        ? withUnassigned(fromOptions, placed, props.unassignedLabel)
        : props.lanes;

    const move = (recordId: string, toValue: number): void => {
        place(recordId, toValue);
        props.onMove(recordId, toValue);
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
            {props.moveError !== null && (
                <p className="KanbanBoard-error" role="alert">
                    {props.moveError}
                </p>
            )}

            {empty && <p className="KanbanBoard-message">{emptyMessage}</p>}

            {props.showSearch && !empty && (
                <div className="KanbanBoard-toolbar">
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
                </div>
            )}

            {/*
                tabIndex and role are for the scrolling, not decoration. A div
                with overflow is not focusable by default, so a keyboard user
                has no way to reach lanes past the edge — and a bare div with
                aria-label exposes no name at all without a role to hang it on.
            */}
            <div
                className="KanbanBoard-lanes"
                role="group"
                aria-label={props.title}
                tabIndex={0}
            >
                {lanes.map((lane) => (
                    <LaneColumn
                        key={String(lane.value)}
                        {...props}
                        lane={lane}
                        cards={cardsInLane(shown, lane)}
                        total={cardsInLane(placed, lane).length}
                        searching={searching}
                        width={laneWidth}
                        onDrop={move}
                    />
                ))}
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
    /** The cards to draw — every card in the lane, or the ones matching the search. */
    cards: Card[];
    /** Every card in the lane, whatever the search says. */
    total: number;
    searching: boolean;
    width: number;
    onDrop: (recordId: string, toValue: number) => void;
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
    const droppable = lane.value !== null && !props.disabled && props.canMove;

    /*
     * The count reads "2 of 5" while a search narrows the lane and "5" the rest
     * of the time. The unassigned lane takes no new card, for the reason it
     * takes no drop: a card with no lane is not something to create on purpose.
     */
    const count = props.searching
        ? getString('KanbanBoard_MatchCount').replace('{0}', String(cards.length)).replace('{1}', String(props.total))
        : String(props.total);
    const creatable = lane.value !== null && !props.disabled && props.canCreate;

    return (
        <section
            className={over ? 'KanbanBoard-lane is-over' : 'KanbanBoard-lane'}
            style={{ width: `${props.width}px` }}
            aria-label={`${lane.label}, ${getString('KanbanBoard_CardCount').replace('{0}', count)}`}
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

                const id = event.dataTransfer.getData('text/plain');

                if (droppable && id !== '' && lane.value !== null) {
                    props.onDrop(id, lane.value);
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
            {props.laneColors && lane.color && (
                <div
                    className="KanbanBoard-laneAccent"
                    style={{ backgroundColor: lane.color }}
                    aria-hidden="true"
                />
            )}

            <header className="KanbanBoard-laneHeader">
                <span className="KanbanBoard-laneLabel">{lane.label}</span>
                <span className="KanbanBoard-laneCount">{count}</span>
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

            <ul className="KanbanBoard-cards">
                {cards.map((card) => (
                    <CardItem key={card.id} card={card} {...props} />
                ))}
            </ul>
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
    const targets = lanes.filter((lane) => lane.value !== null && lane.value !== card.lane);

    return (
        <li
            className={busy ? 'KanbanBoard-card is-moving' : 'KanbanBoard-card'}
            draggable={!props.disabled && props.canMove}
            onDragStart={(event): void => {
                event.dataTransfer.setData('text/plain', card.id);
                event.dataTransfer.effectAllowed = 'move';
            }}
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
                            {targets.length === 0 ? (
                                /*
                                    An empty popover is a dead end: the button
                                    responds, nothing is listed, and nothing
                                    says why. Name the cause and the fix
                                    instead, disabled so it reads as an
                                    explanation rather than an action.
                                */
                                <MenuItem disabled>{getString("KanbanBoard_NoTargets")}</MenuItem>
                            ) : (
                                targets.map((lane) => (
                                    <MenuItem
                                        key={String(lane.value)}
                                        onClick={(): void => props.onDrop(card.id, lane.value as number)}
                                    >
                                        {lane.label}
                                    </MenuItem>
                                ))
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
