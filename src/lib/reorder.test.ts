import { describe, expect, it } from "vitest";
import { hasSameMembers, moveArrayItem, normalizeTitle, toPosition } from "./reorder";

describe("reorder helpers", () => {
  it("creates stable sparse positions", () => {
    expect([0, 1, 2, 9].map(toPosition)).toEqual([1000, 2000, 3000, 10000]);
  });

  it("checks membership without requiring the same order", () => {
    expect(hasSameMembers(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(hasSameMembers(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(hasSameMembers(["a", "b"], ["a", "c"])).toBe(false);
    expect(hasSameMembers(["a", "a"], ["a", "b"])).toBe(false);
  });

  it("moves an item without mutating the input", () => {
    const source = ["a", "b", "c"];

    expect(moveArrayItem(source, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveArrayItem(source, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveArrayItem(source, 1, 1)).toEqual(source);
    expect(moveArrayItem(source, -1, 1)).toEqual(source);
    expect(moveArrayItem(source, 1, 3)).toEqual(source);
    expect(source).toEqual(["a", "b", "c"]);
  });

  it("normalizes user-entered titles", () => {
    const formData = new FormData();
    formData.set("title", "  Review   launch  ");

    expect(normalizeTitle(formData.get("title"))).toBe("Review launch");
    expect(normalizeTitle("   ", "New card")).toBe("New card");
    expect(normalizeTitle("\n\tLong     title with   spaces\t")).toBe("Long title with spaces");
  });
});
