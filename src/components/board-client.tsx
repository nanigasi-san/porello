"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  GripVertical,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  createCard,
  createList,
  deleteBoard,
  deleteCard,
  deleteList,
  renameBoard,
  renameList,
  reorderCards,
  reorderLists,
  updateCard,
} from "@/app/actions";
import type { BoardView, CardView, ListView } from "@/lib/data";

type DragItem =
  | { type: "list"; id: string }
  | { type: "card"; id: string; listId: string };

const listDragId = (id: string) => `list:${id}`;
const cardDragId = (id: string) => `card:${id}`;
const listDropId = (id: string) => `list-drop:${id}`;

function parseDragId(id: string, lists: ListView[]): DragItem | null {
  if (id.startsWith("list:")) {
    return { type: "list", id: id.slice(5) };
  }

  if (id.startsWith("card:")) {
    const cardId = id.slice(5);
    const list = lists.find((candidate) => candidate.cards.some((card) => card.id === cardId));
    return list ? { type: "card", id: cardId, listId: list.id } : null;
  }

  return null;
}

function findContainerId(overId: string, lists: ListView[]) {
  if (overId.startsWith("list-drop:")) {
    return overId.slice(10);
  }

  if (overId.startsWith("card:")) {
    const cardId = overId.slice(5);
    return lists.find((list) => list.cards.some((card) => card.id === cardId))?.id ?? null;
  }

  return null;
}

function moveCardBetweenLists(lists: ListView[], cardId: string, targetListId: string, overId: string) {
  const sourceList = lists.find((list) => list.cards.some((card) => card.id === cardId));
  const targetList = lists.find((list) => list.id === targetListId);

  if (!sourceList || !targetList) {
    return lists;
  }

  const card = sourceList.cards.find((candidate) => candidate.id === cardId);

  if (!card) {
    return lists;
  }

  const sourceCards = sourceList.cards.filter((candidate) => candidate.id !== cardId);
  const targetCardsBase =
    sourceList.id === targetList.id
      ? sourceCards
      : targetList.cards.filter((candidate) => candidate.id !== cardId);

  const overCardIndex = overId.startsWith("card:")
    ? targetCardsBase.findIndex((candidate) => candidate.id === overId.slice(5))
    : -1;
  const insertIndex = overCardIndex >= 0 ? overCardIndex : targetCardsBase.length;
  const nextTargetCards = [...targetCardsBase];
  nextTargetCards.splice(insertIndex, 0, { ...card, listId: targetListId });

  return lists.map((list) => {
    if (list.id === sourceList.id && list.id === targetList.id) {
      return { ...list, cards: nextTargetCards };
    }

    if (list.id === sourceList.id) {
      return { ...list, cards: sourceCards };
    }

    if (list.id === targetList.id) {
      return { ...list, cards: nextTargetCards };
    }

    return list;
  });
}

function BoardMenu({ board }: { board: BoardView }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d8dee9] bg-white text-[#475467] shadow-sm transition hover:border-[#a8b2c1] hover:text-[#101828]"
        aria-label="ボードメニュー"
        title="ボードメニュー"
      >
        <MoreHorizontal size={18} />
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-20 w-72 rounded-lg border border-[#d8dee9] bg-white p-3 shadow-xl">
          <form action={renameBoard.bind(null, board.id)} className="space-y-2">
            <label className="text-xs font-semibold uppercase text-[#667085]">ボード名</label>
            <input
              name="title"
              defaultValue={board.title}
              maxLength={120}
              className="w-full rounded-md border border-[#d8dee9] px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
            />
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]">
              <Save size={15} />
              保存
            </button>
          </form>
          <form action={deleteBoard.bind(null, board.id)} className="mt-3 border-t border-[#eef1f6] pt-3">
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-sm font-semibold text-[#b42318] transition hover:bg-[#fee4e2]">
              <Trash2 size={15} />
              ボードを削除
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ListDropZone({ listId, children }: { listId: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: listDropId(listId) });

  return (
    <div ref={setNodeRef} className="flex min-h-8 flex-col gap-2">
      {children}
    </div>
  );
}

function SortableCard({
  card,
  onOpen,
  dragDisabled,
}: {
  card: CardView;
  onOpen: (card: CardView) => void;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDragId(card.id),
    data: { type: "card", cardId: card.id },
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      className={`w-full rounded-md border border-[#e4e7ec] bg-white p-3 text-left text-sm shadow-sm transition hover:border-[#b8ded9] hover:shadow ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical size={15} className={`mt-0.5 shrink-0 ${dragDisabled ? "text-[#d0d5dd]" : "text-[#98a2b3]"}`} />
        <div className="min-w-0">
          <div className="break-words font-medium leading-5 text-[#101828]">{card.title}</div>
          {card.description ? (
            <div className="mt-2 line-clamp-2 text-xs leading-5 text-[#667085]">{card.description}</div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function SortableList({
  list,
  onOpenCard,
  dragDisabled,
}: {
  list: ListView;
  onOpenCard: (card: CardView) => void;
  dragDisabled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listDragId(list.id),
    data: { type: "list", listId: list.id },
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`flex h-[calc(100vh-12.5rem)] w-[20rem] shrink-0 flex-col rounded-lg border border-[#d8dee9] bg-[#f2f4f7] shadow-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-2 border-b border-[#d8dee9] p-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#667085] transition hover:bg-white hover:text-[#101828]"
          aria-label="リストを移動"
          title="リストを移動"
        >
          <GripVertical size={17} />
        </button>
        <form action={renameList.bind(null, list.id)} className="min-w-0 flex-1">
          <input
            name="title"
            defaultValue={list.title}
            maxLength={120}
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[#101828] outline-none transition focus:border-[#0f766e] focus:bg-white"
            aria-label="リスト名"
          />
        </form>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((value) => !value)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#667085] transition hover:bg-white hover:text-[#101828]"
            aria-label="リストメニュー"
            title="リストメニュー"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <form
              action={deleteList.bind(null, list.id)}
              className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-[#d8dee9] bg-white p-2 shadow-xl"
            >
              <button className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#b42318] transition hover:bg-[#fff1f1]">
                <Trash2 size={15} />
                削除
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <SortableContext items={list.cards.map((card) => cardDragId(card.id))} strategy={verticalListSortingStrategy}>
          <ListDropZone listId={list.id}>
            {list.cards.map((card) => (
              <SortableCard key={card.id} card={card} onOpen={onOpenCard} dragDisabled={dragDisabled} />
            ))}
          </ListDropZone>
        </SortableContext>
      </div>

      <form action={createCard.bind(null, list.id)} className="border-t border-[#d8dee9] p-3">
        <div className="flex gap-2">
          <input
            name="title"
            placeholder="カードを追加"
            maxLength={180}
            className="min-w-0 flex-1 rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#0f766e]"
          />
          <button className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0f766e] text-white transition hover:bg-[#115e59]">
            <Plus size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

function CardDialog({
  card,
  onClose,
}: {
  card: CardView;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#101828]/45 px-4 py-8" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-lg border border-[#d8dee9] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#eef1f6] px-5 py-4">
          <h2 className="text-base font-semibold text-[#101828]">カード詳細</h2>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#101828]"
            aria-label="閉じる"
            title="閉じる"
          >
            <X size={18} />
          </button>
        </div>
        <form action={updateCard.bind(null, card.id)} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-[#667085]">タイトル</label>
            <input
              name="title"
              defaultValue={card.title}
              maxLength={180}
              className="w-full rounded-md border border-[#d8dee9] px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-[#667085]">説明</label>
            <textarea
              name="description"
              defaultValue={card.description}
              rows={8}
              className="w-full resize-none rounded-md border border-[#d8dee9] px-3 py-2 text-sm leading-6 outline-none focus:border-[#0f766e]"
              placeholder="メモ、受け入れ条件、リンクなど"
            />
          </div>
          <div className="flex flex-col-reverse justify-between gap-3 border-t border-[#eef1f6] pt-4 sm:flex-row sm:items-center">
            <button
              formAction={deleteCard.bind(null, card.id)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#fecaca] bg-[#fff7f7] px-4 py-2 text-sm font-semibold text-[#b42318] transition hover:bg-[#fee4e2]"
            >
              <Trash2 size={16} />
              削除
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]">
              <Save size={16} />
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CommandPalette({
  open,
  cards,
  lists,
  onClose,
  onOpenCard,
}: {
  open: boolean;
  cards: CardView[];
  lists: ListView[];
  onClose: () => void;
  onOpenCard: (card: CardView) => void;
}) {
  const [query, setQuery] = useState("");

  if (!open) {
    return null;
  }

  const filteredCards = cards.filter((card) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return `${card.title} ${card.description}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#101828]/35 px-4 pt-24" role="dialog" aria-modal="true">
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-[#d8dee9] bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#eef1f6] px-4 py-3">
          <Search size={18} className="shrink-0 text-[#667085]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="カードを検索"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none placeholder:text-[#98a2b3]"
          />
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#101828]"
            aria-label="閉じる"
          >
            <X size={17} />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {filteredCards.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[#667085]">一致するカードはありません。</div>
          ) : (
            filteredCards.map((card) => {
              const list = lists.find((candidate) => candidate.id === card.listId);
              return (
                <button
                  key={card.id}
                  onClick={() => {
                    onOpenCard(card);
                    onClose();
                  }}
                  className="block w-full rounded-md px-3 py-3 text-left transition hover:bg-[#f8fafc]"
                >
                  <div className="text-sm font-medium text-[#101828]">{card.title}</div>
                  <div className="mt-1 text-xs text-[#667085]">{list?.title ?? "List"}</div>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-[#eef1f6] px-4 py-2 text-xs text-[#98a2b3]">
          Ctrl/Cmd + K で開閉
        </div>
      </div>
    </div>
  );
}

export function BoardClient({ board }: { board: BoardView }) {
  const [lists, setLists] = useState(board.lists);
  const [activeItem, setActiveItem] = useState<DragItem | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardView | null>(null);
  const [cardFilter, setCardFilter] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeCard = useMemo(() => {
    if (activeItem?.type !== "card") {
      return null;
    }

    return lists.flatMap((list) => list.cards).find((card) => card.id === activeItem.id) ?? null;
  }, [activeItem, lists]);

  const activeList = useMemo(() => {
    if (activeItem?.type !== "list") {
      return null;
    }

    return lists.find((list) => list.id === activeItem.id) ?? null;
  }, [activeItem, lists]);

  const allCards = useMemo(() => lists.flatMap((list) => list.cards), [lists]);
  const isFiltering = cardFilter.trim().length > 0;
  const visibleLists = useMemo(() => {
    const query = cardFilter.trim().toLowerCase();

    if (!query) {
      return lists;
    }

    return lists.map((list) => ({
      ...list,
      cards: list.cards.filter((card) => `${card.title} ${card.description}`.toLowerCase().includes(query)),
    }));
  }, [cardFilter, lists]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCommandKey = event.metaKey || event.ctrlKey;
      if (isCommandKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function persistCardOrder(nextLists: ListView[]) {
    startTransition(() => {
      void reorderCards(
        board.id,
        nextLists.map((list) => ({
          listId: list.id,
          cardIds: list.cards.map((card) => card.id),
        })),
      );
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const item = parseDragId(String(event.active.id), lists);
    setActiveItem(item);
  }

  function handleDragOver(event: DragOverEvent) {
    const active = parseDragId(String(event.active.id), lists);

    if (active?.type !== "card" || !event.over) {
      return;
    }

    const overId = String(event.over.id);
    const targetListId = findContainerId(overId, lists);

    if (!targetListId) {
      return;
    }

    setLists((current) => moveCardBetweenLists(current, active.id, targetListId, overId));
  }

  function handleDragEnd(event: DragEndEvent) {
    const active = parseDragId(String(event.active.id), lists);
    const overId = event.over ? String(event.over.id) : null;
    setActiveItem(null);

    if (!active || !overId) {
      return;
    }

    if (active.type === "list" && overId.startsWith("list:")) {
      const oldIndex = lists.findIndex((list) => list.id === active.id);
      const newIndex = lists.findIndex((list) => list.id === overId.slice(5));

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return;
      }

      const nextLists = arrayMove(lists, oldIndex, newIndex);
      setLists(nextLists);
      startTransition(() => {
        void reorderLists(
          board.id,
          nextLists.map((list) => list.id),
        );
      });
      return;
    }

    if (active.type === "card") {
      persistCardOrder(lists);
    }
  }

  return (
    <section className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b border-[#d8dee9]/80 bg-white/70 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <Link href="/boards" className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-[#667085] hover:text-[#0f766e]">
              <ArrowLeft size={16} />
              ボード一覧
            </Link>
            <h1 className="truncate text-2xl font-semibold text-[#101828]">{board.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
              <span className="rounded-md bg-[#eef6f5] px-2 py-1 text-[#0f766e]">{lists.length} リスト</span>
              <span className="rounded-md bg-[#f2f4f7] px-2 py-1">{allCards.length} カード</span>
              {isFiltering ? <span>フィルタ中は並べ替えを停止します</span> : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2 rounded-lg border border-[#d8dee9] bg-white px-3 shadow-sm">
              <Search size={16} className="text-[#667085]" />
              <input
                value={cardFilter}
                onChange={(event) => setCardFilter(event.target.value)}
                placeholder="カード検索"
                className="h-11 w-40 border-0 bg-transparent text-sm outline-none placeholder:text-[#98a2b3] sm:w-56"
              />
              {cardFilter ? (
                <button
                  onClick={() => setCardFilter("")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7]"
                  aria-label="検索をクリア"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <button
              onClick={() => setCommandOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#d8dee9] bg-white px-3 text-sm font-medium text-[#475467] shadow-sm transition hover:border-[#a8b2c1] hover:text-[#101828]"
            >
              <Search size={16} />
              Command
              <span className="rounded bg-[#f2f4f7] px-1.5 py-0.5 font-mono text-[11px] text-[#667085]">K</span>
            </button>
            <form action={createList.bind(null, board.id)} className="flex gap-2 rounded-lg border border-[#d8dee9] bg-white p-2 shadow-sm">
              <input
                name="title"
                placeholder="新しいリスト"
                maxLength={120}
                className="min-w-0 rounded-md border border-transparent bg-[#f8fafc] px-3 py-2 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#0f766e] focus:bg-white"
              />
              <button className="inline-flex items-center gap-2 rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]">
                <Plus size={17} />
                追加
              </button>
            </form>
            <BoardMenu board={board} />
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="min-h-0 flex-1 overflow-x-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl gap-4">
            <SortableContext items={visibleLists.map((list) => listDragId(list.id))} strategy={horizontalListSortingStrategy}>
              {visibleLists.map((list) => (
                <SortableList key={list.id} list={list} onOpenCard={setSelectedCard} dragDisabled={isFiltering} />
              ))}
            </SortableContext>
            {lists.length === 0 ? (
              <div className="grid h-[calc(100vh-12.5rem)] min-w-80 flex-1 place-items-center rounded-lg border border-dashed border-[#cbd5e1] bg-white/70 p-8 text-center">
                <div>
                  <h2 className="text-lg font-semibold text-[#101828]">リストを追加</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#667085]">
                    上部の入力欄から、最初のリストを作成してください。
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <DragOverlay>
          {activeCard ? (
            <div className="w-72 rounded-md border border-[#b8ded9] bg-white p-3 text-sm font-medium text-[#101828] shadow-xl">
              {activeCard.title}
            </div>
          ) : null}
          {activeList ? (
            <div className="h-28 w-80 rounded-lg border border-[#b8ded9] bg-[#f2f4f7] p-3 font-semibold text-[#101828] shadow-xl">
              {activeList.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CommandPalette
        open={commandOpen}
        cards={allCards}
        lists={lists}
        onClose={() => setCommandOpen(false)}
        onOpenCard={setSelectedCard}
      />
      {selectedCard ? <CardDialog card={selectedCard} onClose={() => setSelectedCard(null)} /> : null}
    </section>
  );
}
