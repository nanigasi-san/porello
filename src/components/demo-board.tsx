"use client";

import { useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Search, X } from "lucide-react";

type DemoCard = {
  id: string;
  title: string;
  description: string;
};

type DemoList = {
  id: string;
  title: string;
  cards: DemoCard[];
};

const initialLists: DemoList[] = [
  {
    id: "backlog",
    title: "Backlog",
    cards: [
      { id: "card-1", title: "Discord OAuthの環境変数を設定", description: "本番URLのcallbackをDiscord Developer Portalに追加します。" },
      { id: "card-2", title: "最初のボードを作る", description: "プロジェクト単位でボードを分けます。" },
      { id: "card-3", title: "優先度を見直す", description: "今週やるものだけをDoingへ移します。" },
    ],
  },
  {
    id: "doing",
    title: "Doing",
    cards: [
      { id: "card-4", title: "カード詳細を書く", description: "説明欄に受け入れ条件やメモを残します。" },
      { id: "card-5", title: "レビュー待ちを減らす", description: "小さなタスクに分けて流れを止めないようにします。" },
    ],
  },
  {
    id: "done",
    title: "Done",
    cards: [{ id: "card-6", title: "ボードの構成を決める", description: "Backlog / Doing / Doneの3列で始めます。" }],
  },
];

const cardDragId = (id: string) => `demo-card:${id}`;

function findListByCard(lists: DemoList[], cardId: string) {
  return lists.find((list) => list.cards.some((card) => card.id === cardId));
}

function SortableDemoCard({ card, onOpen }: { card: DemoCard; onOpen: (card: DemoCard) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDragId(card.id),
  });

  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      className={`w-full rounded-md border border-[#e4e7ec] bg-white p-3 text-left text-sm shadow-sm transition hover:border-[#b8ded9] hover:shadow ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical size={15} className="mt-0.5 shrink-0 text-[#98a2b3]" />
        <div className="min-w-0">
          <div className="break-words font-medium leading-5 text-[#101828]">{card.title}</div>
          <div className="mt-2 line-clamp-2 text-xs leading-5 text-[#667085]">{card.description}</div>
        </div>
      </div>
    </button>
  );
}

export function DemoBoard() {
  const [lists, setLists] = useState(initialLists);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<DemoCard | null>(null);
  const [activeCard, setActiveCard] = useState<DemoCard | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const totalCards = lists.reduce((sum, list) => sum + list.cards.length, 0);
  const visibleLists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return lists;
    }

    return lists.map((list) => ({
      ...list,
      cards: list.cards.filter((card) => `${card.title} ${card.description}`.toLowerCase().includes(normalizedQuery)),
    }));
  }, [lists, query]);

  function handleDragStart(event: DragStartEvent) {
    const cardId = String(event.active.id).replace("demo-card:", "");
    setActiveCard(lists.flatMap((list) => list.cards).find((card) => card.id === cardId) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const activeId = String(event.active.id).replace("demo-card:", "");
    const overId = event.over ? String(event.over.id).replace("demo-card:", "") : null;

    if (!overId || activeId === overId) {
      return;
    }

    setLists((current) => {
      const list = findListByCard(current, activeId);
      if (!list || !list.cards.some((card) => card.id === overId)) {
        return current;
      }

      const oldIndex = list.cards.findIndex((card) => card.id === activeId);
      const newIndex = list.cards.findIndex((card) => card.id === overId);
      return current.map((candidate) =>
        candidate.id === list.id ? { ...candidate, cards: arrayMove(candidate.cards, oldIndex, newIndex) } : candidate,
      );
    });
  }

  return (
    <section className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b border-[#d8dee9]/80 bg-white/70 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="mb-1 text-sm font-medium text-[#0f766e]">保存されないデモボード</p>
            <h1 className="text-2xl font-semibold text-[#101828]">Launch plan</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#667085]">
              <span className="rounded-md bg-[#eef6f5] px-2 py-1 text-[#0f766e]">{lists.length} リスト</span>
              <span className="rounded-md bg-[#f2f4f7] px-2 py-1">{totalCards} カード</span>
              <span>同じリスト内でドラッグできます</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[#d8dee9] bg-white px-3 shadow-sm">
            <Search size={16} className="text-[#667085]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="カード検索"
              className="h-11 w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-[#98a2b3] sm:w-64"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7]"
                aria-label="検索をクリア"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="min-h-0 flex-1 overflow-x-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl gap-4">
            {visibleLists.map((list) => (
              <section
                key={list.id}
                className="flex h-[calc(100vh-12.5rem)] w-[20rem] shrink-0 flex-col rounded-lg border border-[#d8dee9] bg-[#f2f4f7] shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-[#d8dee9] p-3">
                  <h2 className="text-sm font-semibold text-[#101828]">{list.title}</h2>
                  <span className="rounded bg-white px-2 py-1 text-xs text-[#667085]">{list.cards.length}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <SortableContext items={list.cards.map((card) => cardDragId(card.id))} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {list.cards.map((card) => (
                        <SortableDemoCard key={card.id} card={card} onOpen={setSelectedCard} />
                      ))}
                      {list.cards.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#cbd5e1] bg-white/70 p-4 text-center text-sm text-[#667085]">
                          一致するカードはありません
                        </div>
                      ) : null}
                    </div>
                  </SortableContext>
                </div>
                <div className="border-t border-[#d8dee9] p-3">
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[#b8c2d0] bg-white px-3 py-2 text-sm font-medium text-[#667085]">
                    <Plus size={16} />
                    本番ではここから追加
                  </button>
                </div>
              </section>
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeCard ? (
            <div className="w-72 rounded-md border border-[#b8ded9] bg-white p-3 text-sm font-medium text-[#101828] shadow-xl">
              {activeCard.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedCard ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#101828]/45 px-4 py-8" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-lg border border-[#d8dee9] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-[#667085]">カード詳細</p>
                <h2 className="text-lg font-semibold text-[#101828]">{selectedCard.title}</h2>
              </div>
              <button
                onClick={() => setSelectedCard(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#101828]"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#475467]">{selectedCard.description}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
