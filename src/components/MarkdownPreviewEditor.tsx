import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";

type Props = {
  markdown: string;
  onChange: (markdown: string) => void;
};

const extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TableKit,
  Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
];

export default function MarkdownPreviewEditor({ markdown, onChange }: Props) {
  const [inTable, setInTable] = useState(false);
  const editor = useEditor({
    extensions,
    content: markdown,
    contentType: "markdown",
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });

  // A pull or file reload can replace the current file while this view stays open.
  // Updating without an editor event keeps the original Markdown untouched until edited.
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      // Tiptap may expose an editor before EditorContent mounts (and briefly
      // during React StrictMode cleanup); its commandManager is then unavailable.
      if (!editor.isDestroyed && editor.getMarkdown() !== markdown) {
        editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
      }
    };
    editor.on("mount", sync);
    sync();
    return () => { editor.off("mount", sync); };
  }, [editor, markdown]);

  useEffect(() => {
    if (!editor) return;
    const update = () => { if (!editor.isDestroyed) setInTable(editor.isActive("table")); };
    editor.on("selectionUpdate", update);
    editor.on("mount", update);
    update();
    return () => { editor.off("selectionUpdate", update); editor.off("mount", update); };
  }, [editor]);

  if (!editor) return <div className="workspace-preview-loading">Đang mở bản xem trước…</div>;

  return <div className="workspace-preview-scroll">
    <div className="workspace-preview-paper">
      <div className="workspace-format-toolbar" role="toolbar" aria-label="Định dạng tài liệu">
        <button type="button" title="Tiêu đề lớn" aria-label="Tiêu đề lớn" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
        <button type="button" title="Tiêu đề nhỏ" aria-label="Tiêu đề nhỏ" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <span className="workspace-toolbar-separator" />
        <button type="button" title="In đậm" aria-label="In đậm" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" title="In nghiêng" aria-label="In nghiêng" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <span className="workspace-toolbar-separator" />
        <button type="button" title="Danh sách" aria-label="Danh sách" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()}>☷</button>
        <button type="button" title="Danh sách đánh số" aria-label="Danh sách đánh số" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</button>
        <button type="button" title="Chèn bảng" aria-label="Chèn bảng" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()}>▦</button>
        {inTable && <>
          <span className="workspace-toolbar-separator" />
          <button type="button" title="Thêm hàng" aria-label="Thêm hàng" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>+ hàng</button>
          <button type="button" title="Thêm cột" aria-label="Thêm cột" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>+ cột</button>
        </>}
      </div>
      <EditorContent editor={editor} className="workspace-rich-editor" aria-label="Bản xem trước có thể chỉnh sửa" />
    </div>
  </div>;
}
