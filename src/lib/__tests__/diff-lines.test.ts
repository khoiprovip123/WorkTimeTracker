import { describe, expect, it } from "vitest";
import { changedLineNumbers, textLines } from "../diff-lines";

describe("document comparison", () => {
  it("marks changed lines in both columns and handles new and deleted files", () => {
    const patch = "@@ -1,3 +1,3 @@\n same\n-before\n+after\n last\n";
    const edited = changedLineNumbers(patch, true, true, "same\nbefore\nlast\n", "same\nafter\nlast\n");
    expect([...edited.before]).toEqual([2]);
    expect([...edited.after]).toEqual([2]);
    expect([...changedLineNumbers("", false, true, "", "a\nb\n").after]).toEqual([1, 2]);
    expect([...changedLineNumbers("", true, false, "a\n", "").before]).toEqual([1]);
    expect(textLines("a\nb\n")).toEqual(["a", "b"]);
  });
});
