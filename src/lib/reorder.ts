export const POSITION_STEP = 1000;

export function toPosition(index: number) {
  return (index + 1) * POSITION_STEP;
}

export function hasSameMembers(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const counts = new Map<string, number>();
  left.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));

  for (const id of right) {
    const count = counts.get(id);

    if (!count) {
      return false;
    }

    if (count === 1) {
      counts.delete(id);
    } else {
      counts.set(id, count - 1);
    }
  }

  return counts.size === 0;
}

export function moveArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return [...items];
  }

  const copy = [...items];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}

export function normalizeTitle(value: FormDataEntryValue | null, fallback = "Untitled") {
  const title = String(value ?? "").trim().replace(/\s+/g, " ");
  return title.length > 0 ? title : fallback;
}
