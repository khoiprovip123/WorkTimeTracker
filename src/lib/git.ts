import { invoke } from "@tauri-apps/api/core";

// Lightweight git helpers for the Design workspace UI.
// This module wraps Tauri commands (invoke) when available, and falls back to no-op in web/dev.

export async function hasGitRepo(path: string): Promise<boolean> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("git_has_repo", { path });
  }
  return false;
}

export async function gitClone(
  url: string,
  destPath?: string,
): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("git_clone_repo", { url, destPath });
  }
  throw new Error("Clone only available on desktop build");
}

export async function readWorkspaceTree(path: string): Promise<any> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("read_workspace_tree", { path });
  }
  return [];
}

export async function readFile(path: string, workspacePath: string): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("read_file", { path, workspacePath });
  }
  throw new Error("readFile only available on desktop build");
}

export async function writeFile(path: string, workspacePath: string, content: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("write_file", { path, workspacePath, content });
  }
  throw new Error("writeFile only available on desktop build");
}

export async function gitStatus(path: string): Promise<any> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("git_status", { path });
  }
  return { modified: [], created: [], deleted: [] };
}

export async function gitDiff(path: string, file: string): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("git_diff_file", { path, file });
  }
  return "";
}

export type FileVersions = {
  before: string;
  after: string;
  beforeExists: boolean;
  afterExists: boolean;
};

export async function gitFileVersions(path: string, file: string): Promise<FileVersions> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return invoke<FileVersions>("git_file_versions", { path, file });
  }
  throw new Error("Chỉ xem được thay đổi trong ứng dụng desktop.");
}

export async function gitAddCommitPush(
  path: string,
  message: string,
): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("git_commit_push", { path, message });
  }
  throw new Error("git operations only available on desktop build");
}

export async function gitPull(
  path: string,
): Promise<{ success: boolean; message?: string }> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("git_pull", { path });
  }
  return {
    success: false,
    message: "git pull only available on desktop build",
  };
}

export async function gitRestoreFile(
  path: string,
  file: string,
): Promise<{ success: boolean; message?: string }> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // @ts-ignore
    return await invoke("git_restore_file", { path, file });
  }
  return {
    success: false,
    message: "git restore only available on desktop build",
  };
}
