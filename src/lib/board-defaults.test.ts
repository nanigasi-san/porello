import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_TITLES } from "./board-defaults";

describe("board defaults", () => {
  it("keeps the default list order fixed", () => {
    expect(DEFAULT_LIST_TITLES).toEqual(["backlog", "todo", "doing", "in review", "done"]);
  });

  it("creates five default lists", () => {
    expect(DEFAULT_LIST_TITLES).toHaveLength(5);
  });
});
