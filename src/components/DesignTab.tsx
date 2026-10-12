import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as git from "../lib/git";
import { changedLineNumbers, textLines } from "../lib/diff-lines";

const MarkdownPreviewEditor = lazy(() => import("./MarkdownPreviewEditor"));

type FileNode = { name: string; path: string; isDirectory: boolean; children?: FileNode[] };
type WorkspaceStatus = { branch?: string; modified: string[]; created: string[]; deleted: string[] };
const emptyStatus: WorkspaceStatus = { modified: [], created: [], deleted: [] };
const desktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const RECENT_KEY = "ktt-document-workspaces";

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === "string").slice(0, 6) : [];
  } catch { return []; }
}

function nameOf(path: string) { return path.split(/[\\/]/).filter(Boolean).pop() || path; }
function parentOf(path: string) { return path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))); }
function joinPath(parent: string, name: string) { return `${parent.replace(/[\\/]$/, "")}/${name}`; }
function hasNode(nodes: FileNode[], path: string): boolean { return nodes.some((node) => node.path === path || hasNode(node.children || [], path)); }

export default function DesignTab({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [recentPaths, setRecentPaths] = useState<string[]>(readRecent);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editorMode, setEditorMode] = useState<"content" | "preview">("preview");
  const [savedContent, setSavedContent] = useState<string | null>("");
  const [saveState, setSaveState] = useState("Đã lưu");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<WorkspaceStatus>(emptyStatus);
  const [showClone, setShowClone] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneFolder, setCloneFolder] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [changeFile, setChangeFile] = useState<string | null>(null);
  const [versions, setVersions] = useState<git.FileVersions | null>(null);
  const [diffContent, setDiffContent] = useState("");
  const [showSend, setShowSend] = useState(false);
  const [message, setMessage] = useState("");
  const diffRequest = useRef(0);

  const changes = useMemo(() => [
    ...sourceStatus.created.map((path) => ({ path, label: "Mới" })),
    ...sourceStatus.modified.map((path) => ({ path, label: "Đã sửa" })),
    ...sourceStatus.deleted.map((path) => ({ path, label: "Đã xóa" })),
  ], [sourceStatus]);
  const isDirty = selectedFile !== null && (savedContent === null || content !== savedContent);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  async function refresh(path: string) {
    const [nextTree, nextStatus] = await Promise.all([git.readWorkspaceTree(path), git.gitStatus(path)]);
    setTree(nextTree as FileNode[]);
    setSourceStatus(nextStatus as WorkspaceStatus);
  }

  useEffect(() => {
    if (!workspacePath) return;
    void refresh(workspacePath).catch(() => setNotice("Không thể đọc thư mục tài liệu."));
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath) return;
    const refreshChanges = () => {
      if (document.visibilityState === "visible") {
        void git.gitStatus(workspacePath).then((status) => setSourceStatus(status as WorkspaceStatus)).catch(() => undefined);
      }
    };
    window.addEventListener("focus", refreshChanges);
    const timer = window.setInterval(refreshChanges, 5000);
    return () => { window.removeEventListener("focus", refreshChanges); window.clearInterval(timer); };
  }, [workspacePath]);

  async function saveDocument(file: string, text: string) {
    if (!workspacePath) return false;
    setSaveState("Đang lưu…");
    try {
      await git.writeFile(file, workspacePath, text);
      setSavedContent(text);
      setSaveState("Đã lưu");
      await refresh(workspacePath);
      return true;
    } catch {
      setSaveState("Lưu thất bại");
      setNotice("Không thể lưu tài liệu. Hãy kiểm tra quyền ghi trong thư mục.");
      return false;
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s" || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      if (workspacePath && selectedFile && isDirty) void saveDocument(selectedFile, content);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [workspacePath, selectedFile, content, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function confirmDiscard() {
    return !isDirty || window.confirm("Tài liệu có thay đổi chưa lưu. Bỏ các thay đổi này?");
  }

  async function openWorkspace(path: string) {
    if (!confirmDiscard()) return;
    if (!(await git.hasGitRepo(path))) return setNotice("Thư mục này chưa được kết nối với kho tài liệu.");
    setWorkspacePath(path);
    setSelectedFile(null);
    setActiveFolder(path);
    setContent("");
    setSavedContent("");
    setSourceStatus(emptyStatus);
    setShowChanges(false);
    setChangeFile(null);
    diffRequest.current += 1;
    setNotice(null);
    setShowMenu(false);
    const next = [path, ...recentPaths.filter((item) => item !== path)].slice(0, 6);
    setRecentPaths(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  async function pickWorkspace() {
    if (!desktop) return setNotice("Hãy mở ứng dụng desktop để chọn thư mục tài liệu.");
    try {
      const path = await open({ directory: true, multiple: false, title: "Mở thư mục tài liệu" });
      if (!path) return;
      await openWorkspace(path);
    } catch { setNotice("Không thể mở thư mục tài liệu."); }
  }

  async function chooseCloneFolder() {
    if (!desktop) return setNotice("Hãy mở ứng dụng desktop để tải kho tài liệu.");
    const path = await open({ directory: true, multiple: false, title: "Chọn nơi lưu tài liệu" });
    if (path) setCloneFolder(path);
  }

  async function cloneWorkspace() {
    if (!cloneUrl.trim() || !cloneFolder) return setNotice("Nhập địa chỉ kho tài liệu và chọn thư mục lưu.");
    if (!confirmDiscard()) return;
    const repoName = cloneUrl.trim().split(/[/:]/).pop()?.replace(/\.git$/, "") || "tai-lieu";
    setBusy(true);
    setNotice(null);
    try {
      const path = await git.gitClone(cloneUrl.trim(), joinPath(cloneFolder, repoName));
      await openWorkspace(path);
      setShowClone(false);
      setCloneUrl("");
      setCloneFolder("");
      setNotice("Đã tải kho tài liệu.");
    } catch { setNotice("Không thể tải kho tài liệu. Kiểm tra địa chỉ, kết nối và quyền truy cập."); }
    finally { setBusy(false); }
  }

  async function openFile(path: string) {
    if (!workspacePath || path === selectedFile) return;
    if (!confirmDiscard()) return;
    try {
      const text = await git.readFile(path, workspacePath);
      setSelectedFile(path);
      setActiveFolder(parentOf(path));
      setContent(text);
      setSavedContent(text);
      setSaveState("Đã lưu");
      setShowChanges(false);
      setNotice(null);
    } catch { setNotice("Không thể mở tài liệu này."); }
  }

  async function createDocument() {
    if (!workspacePath) return;
    if (!confirmDiscard()) return;
    const name = window.prompt("Tên tài liệu mới", "tai-lieu-moi.md")?.trim();
    if (!name) return;
    if (!/^[^/\\]+\.md$/i.test(name) || name === ".md") return setNotice("Tên tài liệu phải kết thúc bằng .md.");
    const folder = activeFolder || workspacePath;
    const path = joinPath(folder, name);
    if (hasNode(tree, path)) return setNotice("Tài liệu này đã tồn tại. Hãy chọn tên khác.");
    setSelectedFile(path);
    setContent("");
    setSavedContent(null);
    setSaveState("Chưa lưu");
    setShowChanges(false);
    setNotice(null);
  }

  async function updateFromRepository() {
    if (!workspacePath) return;
    if (isDirty) return setNotice("Hãy lưu tài liệu bằng Ctrl+S trước khi cập nhật từ kho.");
    setBusy(true);
    try {
      const result = await git.gitPull(workspacePath);
      await refresh(workspacePath);
      if (selectedFile && savedContent === content) {
        const latest = await git.readFile(selectedFile, workspacePath);
        setContent(latest);
        setSavedContent(latest);
      }
      setNotice(result.message || "Đã cập nhật tài liệu.");
    } catch { setNotice("Không thể cập nhật. Kiểm tra kết nối và các thay đổi đang có."); }
    finally { setBusy(false); setShowMenu(false); }
  }

  async function showDiff(path: string) {
    if (!workspacePath) return;
    const request = ++diffRequest.current;
    setShowChanges(true);
    setChangeFile(path);
    setVersions(null);
    setDiffContent("");
    try {
      const [nextVersions, patch] = await Promise.all([git.gitFileVersions(workspacePath, path), git.gitDiff(workspacePath, path).catch(() => "")]);
      if (request !== diffRequest.current) return;
      setVersions(nextVersions);
      setDiffContent(patch);
    } catch { if (request === diffRequest.current) setNotice("Không thể xem nội dung thay đổi."); }
  }

  async function restoreFile(path: string) {
    if (!workspacePath || !confirmDiscard() || !window.confirm(`Hoàn tác mọi thay đổi của ${nameOf(path)} về bản trước?`)) return;
    diffRequest.current += 1;
    try {
      await git.gitRestoreFile(workspacePath, path);
      await refresh(workspacePath);
      if (selectedFile && (selectedFile === path || selectedFile.endsWith(`/${path}`))) {
        try {
          const text = await git.readFile(selectedFile, workspacePath);
          setContent(text); setSavedContent(text); setSaveState("Đã lưu");
        } catch {
          setSelectedFile(null); setContent(""); setSavedContent("");
        }
      }
      setNotice("Đã hoàn tác thay đổi.");
      setShowChanges(false);
      setChangeFile(null);
      setVersions(null);
    } catch { setNotice("Không thể hoàn tác tài liệu này."); }
  }

  async function sendChanges() {
    if (!workspacePath || !message.trim()) return setNotice("Nhập mô tả thay đổi trước khi gửi.");
    if (isDirty) return setNotice("Hãy lưu tài liệu bằng Ctrl+S trước khi gửi thay đổi.");
    setBusy(true);
    try {
      await git.gitAddCommitPush(workspacePath, message.trim());
      await refresh(workspacePath);
      setShowSend(false);
      setMessage("");
      setNotice("Đã gửi thay đổi lên kho chung.");
    } catch { setNotice("Không thể gửi thay đổi. Kiểm tra kết nối và quyền truy cập."); }
    finally { setBusy(false); }
  }

  function renderNode(node: FileNode, depth = 0): React.ReactNode {
    if (!node.isDirectory && !node.name.toLowerCase().endsWith(".md")) return null;
    const selected = node.path === selectedFile || (node.isDirectory && node.path === activeFolder);
    return <div key={node.path}>
      <button type="button" className={`workspace-tree-row ${selected ? "is-selected" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => node.isDirectory ? setActiveFolder(node.path) : void openFile(node.path)}
        title={node.path}>
        <span className="workspace-tree-icon">{node.isDirectory ? "▾" : "▤"}</span>
        <span className="truncate">{node.name}</span>
      </button>
      {node.children?.map((child) => renderNode(child, depth + 1))}
    </div>;
  }

  const relativePath = selectedFile && workspacePath ? selectedFile.replace(`${workspacePath}/`, "") : "";
  const activeChange = changes.find((item) => item.path === changeFile);
  const highlights = versions ? changedLineNumbers(diffContent, versions.beforeExists, versions.afterExists, versions.before, versions.after) : null;

  return <section className="workspace-shell">
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-heading">
        <span className="workspace-eyebrow">TÀI LIỆU</span>
        {workspacePath && <div className="workspace-heading-actions">
          <button className="workspace-icon-button" title="Tạo tài liệu" aria-label="Tạo tài liệu" onClick={() => void createDocument()}>+</button>
          <button className="workspace-icon-button" title="Thêm thao tác" aria-label="Thêm thao tác" onClick={() => setShowMenu(!showMenu)}>⋯</button>
          {showMenu && <div className="workspace-menu">
            <button onClick={() => void pickWorkspace()}>Mở thư mục khác</button>
            <button onClick={() => { setShowClone(true); setShowMenu(false); }}>Tải kho tài liệu</button>
            <button onClick={() => void updateFromRepository()}>Cập nhật từ kho</button>
            {recentPaths.filter((path) => path !== workspacePath).length > 0 && <div className="workspace-menu-divider" />}
            {recentPaths.filter((path) => path !== workspacePath).map((path) => <button key={path} title={path} onClick={() => void openWorkspace(path)}>Mở lại: {nameOf(path)}</button>)}
          </div>}
        </div>}
      </div>
      {!workspacePath ? <div className="workspace-empty-sidebar">
        <p>Chọn thư mục tài liệu để bắt đầu.</p>
        <button className="workspace-action-primary" onClick={() => void pickWorkspace()}>Mở thư mục</button>
        <button className="workspace-action-plain" onClick={() => setShowClone(true)}>Tải kho tài liệu</button>
        {recentPaths.length > 0 && <div className="workspace-recent">
          <div className="workspace-section-heading">ĐÃ MỞ GẦN ĐÂY</div>
          {recentPaths.map((path) => <button key={path} title={path} onClick={() => void openWorkspace(path)}><strong>{nameOf(path)}</strong><small>{path}</small></button>)}
        </div>}
      </div> : <>
        <div className="workspace-root" title={workspacePath}>{nameOf(workspacePath)}</div>
        <div className="workspace-explorer">
          {tree.length ? tree.map((node) => renderNode(node)) : <p className="workspace-muted px-3 py-2">Chưa có tài liệu Markdown.</p>}
        </div>
        <div className="workspace-changes">
          <div className="workspace-section-heading workspace-changes-heading"><button onClick={() => { setShowChanges(true); void refresh(workspacePath).catch(() => setNotice("Không thể tải thay đổi.")); }}>THAY ĐỔI ({changes.length})</button><button title="Làm mới thay đổi" aria-label="Làm mới thay đổi" onClick={() => void refresh(workspacePath).catch(() => setNotice("Không thể tải thay đổi."))}>↻</button></div>
          {changes.map(({ path, label }) => <button key={`${label}:${path}`} className={`workspace-change-row ${changeFile === path && showChanges ? "is-selected" : ""}`} onClick={() => void showDiff(path)} title={path}>
            <span className={label === "Mới" ? "text-emerald-400" : label === "Đã xóa" ? "text-amber-400" : "text-sky-400"}>●</span>
            <span className="truncate">{nameOf(path)}</span>
            <span className="workspace-change-label">{label}</span>
          </button>)}
          {changes.length > 0 && <button className="workspace-send-button" onClick={() => setShowSend(true)}>Gửi thay đổi</button>}
        </div>
      </>}
      {workspacePath && <div className="workspace-sidebar-footer"><span className="text-emerald-400">●</span> Đã kết nối{sourceStatus.branch ? ` · ${sourceStatus.branch}` : ""}</div>}
    </aside>

    <main className="workspace-main">
      <div className="workspace-editor-header">
        <div className="min-w-0">
          <div className="workspace-breadcrumb">{showChanges ? "THAY ĐỔI" : relativePath ? relativePath.split("/").slice(0, -1).join(" / ") || nameOf(workspacePath || "") : "THIẾT KẾ"}</div>
          <div className="workspace-document-title">{showChanges ? changeFile ? nameOf(changeFile) : "Các thay đổi" : selectedFile ? nameOf(selectedFile) : "Tài liệu"}</div>
        </div>
        {showChanges ? <button className="workspace-action-plain" onClick={() => setShowChanges(false)}>Trở về tài liệu</button> : selectedFile && <div className="workspace-editor-actions">
          <div className="workspace-view-switch" role="group" aria-label="Chế độ xem tài liệu">
            <button type="button" className={editorMode === "content" ? "is-active" : ""} aria-pressed={editorMode === "content"} onClick={() => setEditorMode("content")}>Nội dung</button>
            <button type="button" className={editorMode === "preview" ? "is-active" : ""} aria-pressed={editorMode === "preview"} onClick={() => setEditorMode("preview")}>Xem trước</button>
          </div>
          <span className={`workspace-save-state ${saveState === "Lưu thất bại" ? "text-amber-400" : ""}`}>{saveState === "Lưu thất bại" ? saveState : isDirty ? "Chưa lưu · Ctrl+S" : saveState}</span>
        </div>}
      </div>
      {showChanges ? <div className="workspace-review">
        {changeFile && versions ? <>
          <div className="workspace-review-toolbar"><span>{activeChange?.label || "Thay đổi"} · {changeFile}</span><button onClick={() => void restoreFile(changeFile)}>Hoàn tác file</button></div>
          <div className="workspace-compare">
            <div><div className="workspace-compare-title">TRƯỚC</div><pre>{versions.beforeExists ? textLines(versions.before).map((line, index) => <span key={index} data-line={index + 1} className={highlights?.before.has(index + 1) ? "is-removed" : ""}>{line || " "}</span>) : "Tệp chưa có trong kho"}</pre></div>
            <div><div className="workspace-compare-title">SAU</div><pre>{versions.afterExists ? textLines(versions.after).map((line, index) => <span key={index} data-line={index + 1} className={highlights?.after.has(index + 1) ? "is-added" : ""}>{line || " "}</span>) : "Tệp đã bị xóa"}</pre></div>
          </div>
          {diffContent && <details className="workspace-patch"><summary>Xem chi tiết dòng thay đổi</summary><pre>{diffContent.split("\n").map((line, index) => <span key={index} className={line.startsWith("+") && !line.startsWith("+++") ? "is-added" : line.startsWith("-") && !line.startsWith("---") ? "is-removed" : ""}>{line}{"\n"}</span>)}</pre></details>}
        </> : <div className="workspace-empty-editor"><h2>{changeFile ? "Đang tải thay đổi…" : "Chọn một file trong mục Thay đổi"}</h2></div>}
      </div> : selectedFile ? editorMode === "content"
        ? <textarea className="workspace-editor" value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} aria-label={`Nội dung Markdown của ${nameOf(selectedFile)}`} />
        : <Suspense fallback={<div className="workspace-preview-loading">Đang mở bản xem trước…</div>}><MarkdownPreviewEditor key={selectedFile} markdown={content} onChange={setContent} /></Suspense>
        : <div className="workspace-empty-editor"><div className="workspace-empty-mark">▤</div><h2>{workspacePath ? "Chọn tài liệu để chỉnh sửa" : "Không gian tài liệu"}</h2><p>{workspacePath ? "Mở tài liệu từ danh sách bên trái hoặc tạo tài liệu mới." : "Mở một thư mục tài liệu để bắt đầu làm việc."}</p></div>}
      {notice && <div className="workspace-notice" role="status"><span>{notice}</span><button aria-label="Đóng thông báo" onClick={() => setNotice(null)}>×</button></div>}
    </main>

    {showClone && <div className="workspace-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setShowClone(false); }}>
      <div className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="clone-title">
        <h2 id="clone-title">Tải kho tài liệu</h2>
        <p className="workspace-muted mb-5">Nhập địa chỉ kho tài liệu trên Azure DevOps và chọn nơi lưu trên máy.</p>
        <label>Địa chỉ kho tài liệu<input className="workspace-field" value={cloneUrl} onChange={(e) => setCloneUrl(e.target.value)} placeholder="https://dev.azure.com/..." autoFocus /></label>
        <label className="mt-4">Thư mục lưu<div className="workspace-folder-picker"><input className="workspace-field" value={cloneFolder} readOnly placeholder="Chưa chọn thư mục" /><button onClick={() => void chooseCloneFolder()}>Chọn…</button></div></label>
        {notice && <p className="workspace-dialog-notice" role="status">{notice}</p>}
        <div className="workspace-modal-actions"><button onClick={() => setShowClone(false)} disabled={busy}>Hủy</button><button className="workspace-action-primary" onClick={() => void cloneWorkspace()} disabled={busy}>{busy ? "Đang tải…" : "Tải kho tài liệu"}</button></div>
      </div>
    </div>}

    {showSend && <div className="workspace-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setShowSend(false); }}>
      <div className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="send-title">
        <h2 id="send-title">Gửi thay đổi</h2><p className="workspace-muted mb-4">{changes.length} tài liệu sẽ được gửi lên kho chung.</p>
        <div className="workspace-send-list">{changes.map(({ path, label }) => <div key={`${label}:${path}`}><span className="truncate">{path}</span><small>{label}</small></div>)}</div>
        <label className="mt-4">Mô tả thay đổi<input className="workspace-field" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ví dụ: Cập nhật quy trình đặt lịch" autoFocus /></label>
        {notice && <p className="workspace-dialog-notice" role="status">{notice}</p>}
        <div className="workspace-modal-actions"><button onClick={() => setShowSend(false)} disabled={busy}>Hủy</button><button className="workspace-action-primary" onClick={() => void sendChanges()} disabled={busy}>{busy ? "Đang gửi…" : "Gửi thay đổi"}</button></div>
      </div>
    </div>}
  </section>;
}
