// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StrictMode } from "react";
import MarkdownPreviewEditor from "./MarkdownPreviewEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Markdown preview lifecycle", () => {
  it("mounts in StrictMode and replaces external Markdown without calling an unmounted editor", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onChange = vi.fn();

    await act(async () => {
      root?.render(<StrictMode><MarkdownPreviewEditor markdown={"# Tài liệu\n\nNội dung"} onChange={onChange} /></StrictMode>);
    });
    expect(container.querySelector(".tiptap h1")?.textContent).toBe("Tài liệu");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(<StrictMode><MarkdownPreviewEditor markdown={"# Tài liệu mới\n\nNội dung khác"} onChange={onChange} /></StrictMode>);
    });
    expect(container.querySelector(".tiptap h1")?.textContent).toBe("Tài liệu mới");
    expect(onChange).not.toHaveBeenCalled();
  });
});
