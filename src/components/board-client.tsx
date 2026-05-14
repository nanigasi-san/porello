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
  CalendarClock,
  CheckSquare,
  Download,
  GripVertical,
  Link as LinkIcon,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  addCardComment,
  addChecklistItem,
  attachLabelToCard,
  createCard,
  createCardLabel,
  createList,
  deleteBoard,
  deleteCard,
  deleteCardComment,
  deleteChecklistItem,
  deleteList,
  detachLabelFromCard,
  renameBoard,
  renameList,
  reorderCards,
  reorderLists,
  updateCard,
  updateChecklistItem,
} from "@/app/actions";
import type { BoardView, CardAttachmentView, CardView, ChecklistItemView, LabelView, ListView } from "@/lib/data";

type DragItem =
  | { type: "list"; id: string }
  | { type: "card"; id: string; listId: string };

const listDragId = (id: string) => `list:${id}`;
const cardDragId = (id: string) => `card:${id}`;
const listDropId = (id: string) => `list-drop:${id}`;
const urlPattern = /(https?:\/\/[^\s<>"']+)/g;

function dateTimeInputValue(value: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function formatDueDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function userLabel(user: CardView["assignee"]) {
  return user?.name ?? user?.email ?? "Unknown user";
}

function LinkedText({ text }: { text: string }) {
  const parts = text.split(urlPattern);

  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#0f766e] underline decoration-[#99c7c2] underline-offset-2 hover:text-[#115e59]"
          >
            {part}
          </a>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

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
  if (overId === cardDragId(cardId)) {
    return lists;
  }

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

function searchableCardText(card: CardView) {
  return [
    card.title,
    card.description,
    card.assignee?.name,
    card.assignee?.email,
    ...card.labels.map((label) => label.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function BoardMenu({ board }: { board: BoardView }) {
  return (
    <details className="relative">
      <summary
        data-testid="board-menu-button"
        className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-[#d8dee9] bg-white text-[#475467] shadow-sm transition hover:border-[#a8b2c1] hover:text-[#101828] [&::-webkit-details-marker]:hidden"
        aria-label="ボードメニュー"
        title="ボードメニュー"
      >
        <MoreHorizontal size={18} />
      </summary>
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
          <button
            data-testid="delete-board-button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-sm font-semibold text-[#b42318] transition hover:bg-[#fee4e2]"
          >
            <Trash2 size={15} />
            ボードを削除
          </button>
        </form>
      </div>
    </details>
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
  const dueLabel = formatDueDate(card.dueAt);
  const completedChecklistItems = card.checklistItems.filter((item) => item.completed).length;

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
          {card.labels.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {card.labels.map((label) => (
                <span
                  key={label.id}
                  className="rounded px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#667085]">
            {dueLabel ? (
              <span className="inline-flex items-center gap-1 rounded bg-[#fff7ed] px-1.5 py-0.5 text-[#9a3412]">
                <CalendarClock size={12} />
                {dueLabel}
              </span>
            ) : null}
            {card.assignee ? (
              <span className="inline-flex items-center gap-1 rounded bg-[#eef6f5] px-1.5 py-0.5 text-[#0f766e]">
                <User size={12} />
                {userLabel(card.assignee)}
              </span>
            ) : null}
            {card.checklistItems.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <CheckSquare size={12} />
                {completedChecklistItems}/{card.checklistItems.length}
              </span>
            ) : null}
            {card.comments.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <MessageSquare size={12} />
                {card.comments.length}
              </span>
            ) : null}
            {card.attachments.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Paperclip size={12} />
                {card.attachments.length}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function SortableList({
  list,
  onOpenCard,
  onCreateCard,
  onDeleteList,
  dragDisabled,
}: {
  list: ListView;
  onOpenCard: (card: CardView) => void;
  onCreateCard: (listId: string, formData: FormData) => void;
  onDeleteList: (listId: string) => void;
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
      aria-label={`リスト ${list.title}`}
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
        <span className="mt-1 rounded bg-white px-2 py-1 text-xs text-[#667085]">{list.cards.length}</span>
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
              action={() => onDeleteList(list.id)}
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
            {list.cards.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#cbd5e1] bg-white/70 p-4 text-center text-sm text-[#667085]">
                一致するカードはありません
              </div>
            ) : null}
          </ListDropZone>
        </SortableContext>
      </div>

      <form action={onCreateCard.bind(null, list.id)} className="border-t border-[#d8dee9] p-3">
        <div className="flex gap-2">
          <input
            name="title"
            placeholder="カードを追加"
            maxLength={180}
            className="min-w-0 flex-1 rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#0f766e]"
          />
          <button
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0f766e] text-white transition hover:bg-[#115e59]"
            aria-label={`${list.title}にカードを追加`}
          >
            <Plus size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

function CardDialog({
  card,
  boardId,
  assigneeOptions,
  boardLabels,
  onClose,
  onDelete,
  onAddBoardLabel,
  onUpdateCard,
}: {
  card: CardView;
  boardId: string;
  assigneeOptions: BoardView["members"];
  boardLabels: LabelView[];
  onClose: () => void;
  onDelete: (cardId: string) => void;
  onAddBoardLabel: (label: LabelView) => void;
  onUpdateCard: (cardId: string, updater: (card: CardView) => CardView) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const completedChecklistItems = card.checklistItems.filter((item) => item.completed).length;

  async function handleUpdateCard(formData: FormData) {
    const result = await updateCard(card.id, formData);
    onUpdateCard(card.id, (current) => ({
      ...current,
      title: result.title,
      description: result.description,
      dueAt: result.dueAt,
      assigneeId: result.assigneeId,
      assignee: result.assignee,
      updatedAt: result.updatedAt,
    }));
  }

  async function handleCreateLabel(formData: FormData) {
    const label = await createCardLabel(boardId, card.id, formData);
    onAddBoardLabel(label);
    onUpdateCard(card.id, (current) =>
      current.labels.some((candidate) => candidate.id === label.id)
        ? current
        : { ...current, labels: [...current.labels, label] },
    );
  }

  async function handleToggleLabel(label: LabelView) {
    const attached = card.labels.some((candidate) => candidate.id === label.id);

    if (attached) {
      await detachLabelFromCard(card.id, label.id);
      onUpdateCard(card.id, (current) => ({
        ...current,
        labels: current.labels.filter((candidate) => candidate.id !== label.id),
      }));
      return;
    }

    const attachedLabel = await attachLabelToCard(card.id, label.id);
    onUpdateCard(card.id, (current) => ({
      ...current,
      labels: current.labels.some((candidate) => candidate.id === attachedLabel.id)
        ? current.labels
        : [...current.labels, attachedLabel],
    }));
  }

  async function handleAddChecklistItem(formData: FormData) {
    const item = await addChecklistItem(card.id, formData);

    if (!item) {
      return;
    }

    onUpdateCard(card.id, (current) => ({
      ...current,
      checklistItems: [...current.checklistItems, item],
    }));
  }

  async function handleChecklistChange(item: ChecklistItemView, completed: boolean, title = item.title) {
    onUpdateCard(card.id, (current) => ({
      ...current,
      checklistItems: current.checklistItems.map((candidate) =>
        candidate.id === item.id ? { ...candidate, title, completed } : candidate,
      ),
    }));
    const formData = new FormData();
    formData.set("title", title);
    if (completed) {
      formData.set("completed", "on");
    }
    const updated = await updateChecklistItem(item.id, formData);
    onUpdateCard(card.id, (current) => ({
      ...current,
      checklistItems: current.checklistItems.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    }));
  }

  async function handleDeleteChecklistItem(itemId: string) {
    await deleteChecklistItem(itemId);
    onUpdateCard(card.id, (current) => ({
      ...current,
      checklistItems: current.checklistItems.filter((item) => item.id !== itemId),
    }));
  }

  async function handleAddComment(formData: FormData) {
    const comment = await addCardComment(card.id, formData);

    if (!comment) {
      return;
    }

    onUpdateCard(card.id, (current) => ({
      ...current,
      comments: [...current.comments, comment],
    }));
  }

  async function handleDeleteComment(commentId: string) {
    await deleteCardComment(commentId);
    onUpdateCard(card.id, (current) => ({
      ...current,
      comments: current.comments.filter((comment) => comment.id !== commentId),
    }));
  }

  async function handleUploadAttachment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setUploading(true);
    try {
      const response = await fetch(`/api/cards/${card.id}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Attachment upload failed.");
      }

      const payload = (await response.json()) as { attachment: CardAttachmentView };
      const attachment = {
        ...payload.attachment,
        createdAt: new Date(payload.attachment.createdAt),
      };
      onUpdateCard(card.id, (current) => ({
        ...current,
        attachments: [...current.attachments, attachment],
      }));
      form.reset();
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    const response = await fetch(`/api/cards/${card.id}/attachments/${attachmentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Attachment delete failed.");
    }

    onUpdateCard(card.id, (current) => ({
      ...current,
      attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#101828]/45 px-4 py-8" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg border border-[#d8dee9] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#eef1f6] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#101828]">カード詳細</h2>
            <p className="mt-1 text-xs text-[#667085]">
              チェックリスト {completedChecklistItems}/{card.checklistItems.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#101828]"
            aria-label="閉じる"
            title="閉じる"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-4.5rem)] overflow-y-auto p-5">
          <form action={handleUpdateCard} className="space-y-4">
            <section className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_13rem]">
                <div>
                  <label htmlFor={`card-title-${card.id}`} className="mb-1.5 block text-xs font-semibold uppercase text-[#667085]">タイトル</label>
                  <input
                    id={`card-title-${card.id}`}
                    name="title"
                    defaultValue={card.title}
                    maxLength={180}
                    className="w-full rounded-md border border-[#d8dee9] px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
                  />
                </div>
                <div>
                  <label htmlFor={`card-due-${card.id}`} className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase text-[#667085]">
                    <CalendarClock size={13} />
                    締め切り
                  </label>
                  <input
                    id={`card-due-${card.id}`}
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={dateTimeInputValue(card.dueAt)}
                    className="w-full rounded-md border border-[#d8dee9] px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor={`card-assignee-${card.id}`} className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase text-[#667085]">
                  <User size={13} />
                  担当者
                </label>
                <select
                  key={`assignee-${card.id}-${card.assigneeId ?? "none"}`}
                  id={`card-assignee-${card.id}`}
                  name="assigneeId"
                  defaultValue={card.assigneeId ?? ""}
                  className="w-full rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
                >
                  <option value="">未設定</option>
                  {assigneeOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name ?? member.email ?? member.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`card-description-${card.id}`} className="mb-1.5 block text-xs font-semibold uppercase text-[#667085]">説明</label>
                <textarea
                  id={`card-description-${card.id}`}
                  name="description"
                  defaultValue={card.description}
                  rows={6}
                  className="w-full resize-none rounded-md border border-[#d8dee9] px-3 py-2 text-sm leading-6 outline-none focus:border-[#0f766e]"
                  placeholder="メモ、受け入れ条件、リンクなど"
                />
                {card.description ? (
                  <div className="mt-2 whitespace-pre-wrap rounded-md border border-[#eef1f6] bg-[#f8fafc] p-3 text-sm leading-6 text-[#475467]">
                    <LinkedText text={card.description} />
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end">
                <button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]">
                  <Save size={16} />
                  保存
                </button>
              </div>
            </section>
          </form>

          <section className="mt-6 border-t border-[#eef1f6] pt-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#101828]">
              <Tag size={16} />
              ラベル
            </h3>
            <div className="flex flex-wrap gap-2">
              {boardLabels.map((label) => {
                const attached = card.labels.some((candidate) => candidate.id === label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => void handleToggleLabel(label)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                      attached ? "border-transparent text-white" : "border-[#d8dee9] bg-white text-[#475467] hover:border-[#99c7c2]"
                    }`}
                    style={attached ? { backgroundColor: label.color } : undefined}
                  >
                    {label.name}
                  </button>
                );
              })}
              {boardLabels.length === 0 ? <span className="text-sm text-[#667085]">まだラベルがありません</span> : null}
            </div>
            <form action={handleCreateLabel} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                name="name"
                placeholder="ラベル名"
                maxLength={40}
                className="min-w-0 flex-1 rounded-md border border-[#d8dee9] px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
              />
              <input
                name="color"
                type="color"
                defaultValue="#0f766e"
                className="h-10 w-full rounded-md border border-[#d8dee9] bg-white px-2 sm:w-16"
                aria-label="ラベル色"
              />
              <button className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm font-semibold text-[#475467] transition hover:border-[#99c7c2]">
                <Plus size={15} />
                追加
              </button>
            </form>
          </section>

          <section className="mt-6 border-t border-[#eef1f6] pt-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#101828]">
              <CheckSquare size={16} />
              チェックリスト
            </h3>
            <div className="space-y-2">
              {card.checklistItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-md border border-[#eef1f6] p-2">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) => void handleChecklistChange(item, event.currentTarget.checked)}
                    className="h-4 w-4 accent-[#0f766e]"
                    aria-label={`${item.title}を完了`}
                  />
                  <input
                    defaultValue={item.title}
                    onBlur={(event) => {
                      const title = event.currentTarget.value.trim();
                      if (title && title !== item.title) {
                        void handleChecklistChange(item, item.completed, title);
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm outline-none focus:border-[#0f766e]"
                  />
                  <button
                    onClick={() => void handleDeleteChecklistItem(item.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#b42318] transition hover:bg-[#fff1f1]"
                    aria-label={`${item.title}を削除`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <form action={handleAddChecklistItem} className="mt-3 flex gap-2">
              <input
                name="title"
                placeholder="チェック項目を追加"
                maxLength={200}
                className="min-w-0 flex-1 rounded-md border border-[#d8dee9] px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
              />
              <button className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0f766e] text-white transition hover:bg-[#115e59]" aria-label="チェック項目を追加">
                <Plus size={18} />
              </button>
            </form>
          </section>

          <section className="mt-6 border-t border-[#eef1f6] pt-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#101828]">
              <MessageSquare size={16} />
              コメント
            </h3>
            <div className="space-y-3">
              {card.comments.map((comment) => (
                <div key={comment.id} className="rounded-md border border-[#eef1f6] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#667085]">
                      {comment.author?.name ?? comment.author?.email ?? "Unknown user"}
                    </span>
                    <button
                      onClick={() => void handleDeleteComment(comment.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#b42318] transition hover:bg-[#fff1f1]"
                      aria-label="コメントを削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[#475467]">{comment.body}</p>
                </div>
              ))}
            </div>
            <form action={handleAddComment} className="mt-3 space-y-2">
              <textarea
                name="body"
                rows={3}
                placeholder="コメントを追加"
                className="w-full resize-none rounded-md border border-[#d8dee9] px-3 py-2 text-sm leading-6 outline-none focus:border-[#0f766e]"
              />
              <div className="flex justify-end">
                <button className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm font-semibold text-[#475467] transition hover:border-[#99c7c2]">
                  <Plus size={15} />
                  コメント
                </button>
              </div>
            </form>
          </section>

          <section className="mt-6 border-t border-[#eef1f6] pt-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#101828]">
              <Paperclip size={16} />
              添付ファイル
            </h3>
            <div className="space-y-2">
              {card.attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded-md border border-[#eef1f6] p-2">
                  <LinkIcon size={15} className="shrink-0 text-[#667085]" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/cards/${card.id}/attachments/${attachment.id}`}
                      className="block truncate text-sm font-medium text-[#0f766e] hover:text-[#115e59]"
                    >
                      {attachment.filename}
                    </a>
                    <span className="text-xs text-[#667085]">{formatFileSize(attachment.size)}</span>
                  </div>
                  <a
                    href={`/api/cards/${card.id}/attachments/${attachment.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#101828]"
                    aria-label={`${attachment.filename}をダウンロード`}
                  >
                    <Download size={15} />
                  </a>
                  <button
                    onClick={() => void handleDeleteAttachment(attachment.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#b42318] transition hover:bg-[#fff1f1]"
                    aria-label={`${attachment.filename}を削除`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleUploadAttachment} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                name="file"
                type="file"
                className="min-w-0 flex-1 rounded-md border border-[#d8dee9] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#eef6f5] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#0f766e]"
              />
              <button
                disabled={uploading}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
              >
                <Paperclip size={15} />
                {uploading ? "アップロード中" : "アップロード"}
              </button>
            </form>
          </section>

          <div className="mt-6 flex justify-start border-t border-[#eef1f6] pt-4">
            <button
              onClick={() => onDelete(card.id)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#fecaca] bg-[#fff7f7] px-4 py-2 text-sm font-semibold text-[#b42318] transition hover:bg-[#fee4e2]"
            >
              <Trash2 size={16} />
              削除
            </button>
          </div>
        </div>
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

    return searchableCardText(card).includes(normalizedQuery);
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
          Ctrl/Cmd + K で開閉・Escで閉じる
        </div>
      </div>
    </div>
  );
}

export function BoardClient({ board }: { board: BoardView }) {
  const [lists, setLists] = useState(board.lists);
  const [boardLabels, setBoardLabels] = useState(board.labels);
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
      cards: list.cards.filter((card) => searchableCardText(card).includes(query)),
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

  function updateCardInState(cardId: string, updater: (card: CardView) => CardView) {
    let nextSelectedCard: CardView | null = null;
    setLists((current) =>
      current.map((list) => ({
        ...list,
        cards: list.cards.map((card) => {
          if (card.id !== cardId) {
            return card;
          }

          const nextCard = updater(card);
          nextSelectedCard = nextCard;
          return nextCard;
        }),
      })),
    );
    setSelectedCard((current) => {
      if (!current || current.id !== cardId) {
        return current;
      }

      return nextSelectedCard ?? updater(current);
    });
  }

  function addBoardLabel(label: LabelView) {
    setBoardLabels((current) => (current.some((candidate) => candidate.id === label.id) ? current : [...current, label]));
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

  function handleCreateList(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();

    if (!title) {
      return;
    }

    const timestamp = new Date();
    setLists((current) => [
      ...current,
      {
        id: `optimistic-list-${crypto.randomUUID()}`,
        boardId: board.id,
        title,
        position: (current.length + 1) * 1000,
        createdAt: timestamp,
        updatedAt: timestamp,
        cards: [],
      },
    ]);
    startTransition(() => {
      void (async () => {
        const createdList = await createList(board.id, formData);
        if (!createdList) {
          return;
        }

        setLists((current) =>
          current.map((list) => (list.id.startsWith("optimistic-list-") && list.title === title ? createdList : list)),
        );
      })();
    });
  }

  function handleCreateCard(listId: string, formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();

    if (!title) {
      return;
    }

    const timestamp = new Date();
    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? {
              ...list,
              cards: [
                ...list.cards,
                {
                  id: `optimistic-card-${crypto.randomUUID()}`,
                  listId,
                  title,
                  description: "",
                  dueAt: null,
                  assigneeId: null,
                  position: (list.cards.length + 1) * 1000,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  assignee: null,
                  labels: [],
                  checklistItems: [],
                  comments: [],
                  attachments: [],
                },
              ],
            }
          : list,
      ),
    );
    startTransition(() => {
      void (async () => {
        const createdCard = await createCard(listId, formData);
        if (!createdCard) {
          return;
        }

        setLists((current) =>
          current.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  cards: list.cards.map((card) =>
                    card.id.startsWith("optimistic-card-") && card.title === title ? createdCard : card,
                  ),
                }
              : list,
          ),
        );
      })();
    });
  }

  function handleDeleteList(listId: string) {
    setLists((current) => current.filter((list) => list.id !== listId));
    startTransition(() => {
      void deleteList(listId);
    });
  }

  function handleDeleteCard(cardId: string) {
    setSelectedCard(null);
    setLists((current) =>
      current.map((list) => ({
        ...list,
        cards: list.cards.filter((card) => card.id !== cardId),
      })),
    );
    startTransition(() => {
      void deleteCard(cardId);
    });
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
              カードを探す
              <span className="rounded bg-[#f2f4f7] px-1.5 py-0.5 font-mono text-[11px] text-[#667085]">Ctrl K</span>
            </button>
            <form action={handleCreateList} className="flex gap-2 rounded-lg border border-[#d8dee9] bg-white p-2 shadow-sm">
              <input
                name="title"
                placeholder="新しいリスト"
                maxLength={120}
                className="min-w-0 rounded-md border border-transparent bg-[#f8fafc] px-3 py-2 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#0f766e] focus:bg-white"
              />
              <button
                className="inline-flex items-center gap-2 rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]"
                aria-label="リストを追加"
              >
                <Plus size={17} />
                追加
              </button>
            </form>
            <BoardMenu board={board} />
          </div>
        </div>
      </div>

      <DndContext
        id={`porello-board-${board.id}`}
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
                <SortableList
                  key={list.id}
                  list={list}
                  onOpenCard={setSelectedCard}
                  onCreateCard={handleCreateCard}
                  onDeleteList={handleDeleteList}
                  dragDisabled={isFiltering}
                />
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
      {selectedCard ? (
        <CardDialog
          card={selectedCard}
          boardId={board.id}
          assigneeOptions={board.members}
          boardLabels={boardLabels}
          onClose={() => setSelectedCard(null)}
          onDelete={handleDeleteCard}
          onAddBoardLabel={addBoardLabel}
          onUpdateCard={updateCardInState}
        />
      ) : null}
    </section>
  );
}
