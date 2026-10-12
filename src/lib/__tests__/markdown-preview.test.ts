import { describe, expect, it } from "vitest";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";

const manager = new MarkdownManager({
  extensions: [StarterKit, TableKit],
  markedOptions: { gfm: true },
});

const sample = `# 00. Tổng quan Sản phẩm WION SPA (Product Overview)

---

**Mục tiêu tài liệu:** Định hướng sản phẩm

**Bao gồm:**

- Tầm nhìn sản phẩm (Product vision)
- Mục tiêu kinh doanh (Business goal / OKR)

👉 **Output:** *Tại sao làm sản phẩm này*

---

## Lịch sử cập nhật

| Phiên bản | Người thực hiện | Nội dung |
| --- | --- | --- |
| 0.1 | Đặng Thị Lan Phương | Khởi tạo |
`;

describe("Markdown preview conversion", () => {
  it("preserves the sample document's headings, lists, emphasis, rules, and table", () => {
    const parsed = manager.parse(sample);
    expect(parsed.content?.map((node) => node.type)).toContain("table");
    expect(parsed.content?.map((node) => node.type)).toContain("bulletList");
    expect(parsed.content?.filter((node) => node.type === "horizontalRule")).toHaveLength(2);

    const output = manager.serialize(parsed);
    expect(output).toContain("# 00. Tổng quan Sản phẩm WION SPA");
    expect(output).toContain("**Mục tiêu tài liệu:** Định hướng sản phẩm");
    expect(output).toContain("👉 **Output:** *Tại sao làm sản phẩm này*");
    expect(output).toContain("| 0.1");
    expect(output).toContain("Đặng Thị Lan Phương");
  });
});
