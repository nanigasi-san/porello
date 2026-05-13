export const POSITION_STEP = 1000;

export function toPosition(index: number) {
  return (index + 1) * POSITION_STEP;
}

export function hasSameMembers(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

export function moveArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number) {
  const copy = [...items];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}

export function normalizeTitle(value: FormDataEntryValue | null, fallback = "Untitled") {
  const title = String(value ?? "").trim().replace(/\s+/g, " ");
  return title.length > 0 ? title : fallback;
}
