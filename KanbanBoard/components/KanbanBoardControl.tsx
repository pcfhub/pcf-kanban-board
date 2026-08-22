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
import { Card, Lane, boardKey, cardsInLane } from './lanes';

export interface IProps {
    cards: Card[];
    lanes: Lane[];
    hasStatus: boolean;
    hasTitle: boolean;
    /** False on a host with no WebAPI — canvas — where a move cannot be written. */
    canMove: boolean;
    moving: string[];
    moveError: string | null;
    loading: boolean;
    error: boolean;
    errorMessage: string;
    hasNextPage: boolean;
    laneWidth: number;
    openOnCardClick: boolean;
    visible: boolean;
    disabled: boolean;
    isRTL: boolean;
    theme?: Record<string, string>;
    title: string;
    getString: (id: string) => string;
    onMove: (recordId: string, toValue: number) => void;
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

export function KanbanBoardControl(props: IProps): React.ReactElement | null {
    const { cards, lanes, getString, laneWidth } = props;
    const [overlay, place] = useOptimisticLanes(cards);

    const placed = React.useMemo(
        () => cards.map((card) => (card.id in overlay ? { ...card, lane: overlay[card.id] } : card)),
        [cards, overlay],
    );

    const move = (recordId: string, toValue: number): void => {
        place(recordId, toValue);
        props.onMove(recordId, toValue);
    };

    const frame = (content: React.ReactElement): React.ReactElement => (
        <FluentProvider theme={props.theme ?? webLightTheme} dir={props.isRTL ? 'rtl' : 'ltr'}>
            <div className="KanbanBoard">{content}</div>
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

    if (placed.length === 0) {
        return frame(
            <p className="KanbanBoard-message">
                {props.loading ? getString('KanbanBoard_Loading') : getString('KanbanBoard_Empty')}
            </p>,
        );
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

            <div className="KanbanBoard-lanes" aria-label={props.title}>
                {lanes.map((lane) => (
                    <LaneColumn
                        key={String(lane.value)}
                        {...props}
                        lane={lane}
                        cards={cardsInLane(placed, lane)}
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
    cards: Card[];
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

    return (
        <section
            className={over ? 'KanbanBoard-lane is-over' : 'KanbanBoard-lane'}
            style={{ width: `${props.width}px` }}
            aria-label={`${lane.label}, ${getString('KanbanBoard_CardCount').replace('{0}', String(cards.length))}`}
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
            <header className="KanbanBoard-laneHeader">
                <span className="KanbanBoard-laneLabel">{lane.label}</span>
                <span className="KanbanBoard-laneCount">{cards.length}</span>
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
