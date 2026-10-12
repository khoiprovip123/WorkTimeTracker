#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
  image::Image,
  tray::TrayIconBuilder,
  Manager,
};
use std::{fs, path::{Component, Path, PathBuf}, process::Command};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode { name: String, path: String, is_directory: bool, children: Vec<FileNode> }

fn repository(path: &str) -> Result<PathBuf, String> {
  let root = fs::canonicalize(path).map_err(|e| e.to_string())?;
  if !root.join(".git").exists() { return Err("Thư mục này chưa được kết nối với kho tài liệu.".into()); }
  Ok(root)
}

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
  let output = Command::new("git").arg("-C").arg(root).args(args).output().map_err(|e| e.to_string())?;
  if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).trim().to_string()) }
  else { Err(String::from_utf8_lossy(&output.stderr).trim().to_string()) }
}

fn tree(root: &Path, dir: &Path) -> Result<Vec<FileNode>, String> {
  let mut nodes = Vec::new();
  for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if entry.file_name() == ".git" || path.is_symlink() { continue; }
    let is_directory = path.is_dir();
    nodes.push(FileNode {
      name: entry.file_name().to_string_lossy().to_string(),
      path: path.to_string_lossy().to_string(),
      is_directory,
      children: if is_directory { tree(root, &path)? } else { Vec::new() },
    });
  }
  nodes.sort_by(|a,b| b.is_directory.cmp(&a.is_directory).then_with(|| a.name.cmp(&b.name)));
  let _ = root;
  Ok(nodes)
}

#[tauri::command]
fn git_has_repo(path: String) -> bool { repository(&path).is_ok() }

#[tauri::command]
fn read_workspace_tree(path: String) -> Result<Vec<FileNode>, String> {
  let root = repository(&path)?;
  tree(&root, &root)
}

#[tauri::command]
fn read_file(path: String, workspace_path: String) -> Result<String, String> {
  let root = repository(&workspace_path)?;
  let file = fs::canonicalize(path).map_err(|e| e.to_string())?;
  if !file.starts_with(root) || !file.is_file() { return Err("Tệp không thuộc Workspace.".into()); }
  fs::read_to_string(file).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, workspace_path: String, content: String) -> Result<(), String> {
  let root = repository(&workspace_path)?;
  let file = PathBuf::from(path);
  let parent = fs::canonicalize(file.parent().ok_or("Đường dẫn không hợp lệ.")?).map_err(|e| e.to_string())?;
  if !parent.starts_with(&root) || file.extension().and_then(|s| s.to_str()) != Some("md") { return Err("Chỉ lưu tệp Markdown trong Workspace.".into()); }
  fs::write(file, content).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct GitStatus { branch: String, modified: Vec<String>, created: Vec<String>, deleted: Vec<String> }

fn relative_file(file: &str) -> Result<&Path, String> {
  let path = Path::new(file);
  if path.is_absolute() || path.components().any(|part| !matches!(part, Component::Normal(_))) {
    return Err("Đường dẫn tài liệu không hợp lệ.".into());
  }
  Ok(path)
}

fn git_output(root: &Path, args: &[&str]) -> Result<std::process::Output, String> {
  Command::new("git").arg("-C").arg(root).args(args).output().map_err(|e| e.to_string())
}

#[tauri::command]
fn git_status(path: String) -> Result<GitStatus, String> {
  let root = repository(&path)?;
  let branch = git(&root, &["branch", "--show-current"])?;
  let output = git_output(&root, &["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
  if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).trim().to_string()); }
  let (mut modified, mut created, mut deleted) = (Vec::new(), Vec::new(), Vec::new());
  let fields: Vec<&[u8]> = output.stdout.split(|byte| *byte == 0).collect();
  let mut index = 0;
  while index < fields.len() {
    let line = fields[index];
    index += 1;
    if line.len() < 4 { continue; }
    let code = &line[..2];
    let name = String::from_utf8_lossy(&line[3..]).to_string();
    if code.contains(&b'R') || code.contains(&b'C') { index += 1; }
    if code.contains(&b'D') { deleted.push(name); }
    else if code == b"??" || code.contains(&b'A') { created.push(name); }
    else { modified.push(name); }
  }
  Ok(GitStatus { branch, modified, created, deleted })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileVersions { before: String, after: String, before_exists: bool, after_exists: bool }

#[tauri::command]
fn git_file_versions(path: String, file: String) -> Result<FileVersions, String> {
  let root = repository(&path)?;
  let relative = relative_file(&file)?;
  let spec = format!("HEAD:{}", relative.to_string_lossy().replace('\\', "/"));
  let before_output = git_output(&root, &["show", &spec])?;
  let before_exists = before_output.status.success();
  let absolute = root.join(relative);
  let after_exists = absolute.is_file();
  if after_exists {
    let canonical = fs::canonicalize(&absolute).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&root) { return Err("Tệp không thuộc Workspace.".into()); }
  }
  Ok(FileVersions {
    before: if before_exists { String::from_utf8_lossy(&before_output.stdout).to_string() } else { String::new() },
    after: if after_exists { fs::read_to_string(absolute).map_err(|e| e.to_string())? } else { String::new() },
    before_exists,
    after_exists,
  })
}

#[tauri::command]
fn git_diff_file(path: String, file: String) -> Result<String, String> {
  let root = repository(&path)?;
  let relative = relative_file(&file)?.to_string_lossy().to_string();
  git(&root, &["diff", "HEAD", "--", &relative])
}

#[tauri::command]
fn git_clone_repo(url: String, dest_path: String) -> Result<String, String> {
  if !url.starts_with("https://") && !url.starts_with("ssh://") && !url.starts_with("git@") { return Err("URL kho tài liệu không hợp lệ.".into()); }
  let target = PathBuf::from(&dest_path);
  if target.exists() { return Err("Thư mục đích đã tồn tại.".into()); }
  let parent = target.parent().ok_or("Thư mục đích không hợp lệ.")?;
  if !parent.is_dir() { return Err("Thư mục lưu không tồn tại.".into()); }
  let output = Command::new("git").arg("clone").arg("--").arg(&url).arg(&target).output().map_err(|e| e.to_string())?;
  if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).trim().to_string()); }
  Ok(target.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct ActionResult { success: bool, message: String }

#[tauri::command]
fn git_pull(path: String) -> Result<ActionResult, String> {
  let root = repository(&path)?;
  let output = git(&root, &["pull", "--ff-only"])?;
  Ok(ActionResult { success: true, message: if output.contains("Already up to date") { "Tài liệu của bạn đã là phiên bản mới nhất.".into() } else { "Đã cập nhật tài liệu mới nhất.".into() } })
}

#[tauri::command]
fn git_commit_push(path: String, message: String) -> Result<(), String> {
  let root = repository(&path)?;
  if message.trim().is_empty() { return Err("Vui lòng nhập mô tả thay đổi.".into()); }
  git(&root, &["add", "-A"])?;
  git(&root, &["commit", "-m", message.trim()])?;
  git(&root, &["push"])?;
  Ok(())
}

#[tauri::command]
fn git_restore_file(path: String, file: String) -> Result<ActionResult, String> {
  let root = repository(&path)?;
  let relative = relative_file(&file)?.to_string_lossy().to_string();
  let spec = format!("HEAD:{relative}");
  let tracked_in_head = git_output(&root, &["cat-file", "-e", &spec])?.status.success();
  if tracked_in_head {
    git(&root, &["restore", "--source=HEAD", "--staged", "--worktree", "--", &relative])?;
  } else {
    let absolute = root.join(&relative);
    if absolute.exists() {
      let canonical = fs::canonicalize(&absolute).map_err(|e| e.to_string())?;
      if !canonical.starts_with(&root) || !canonical.is_file() { return Err("Tệp không thuộc Workspace.".into()); }
    }
    git(&root, &["rm", "--cached", "--ignore-unmatch", "--", &relative])?;
    if absolute.exists() { fs::remove_file(absolute).map_err(|e| e.to_string())?; }
  }
  Ok(ActionResult { success: true, message: "Đã hoàn tác file.".into() })
}

#[tauri::command]
fn set_tray_visibility(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
  if let Some(tray) = app.tray_by_id("main") {
    tray.set_visible(enabled).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn update_tray_status(app: tauri::AppHandle, title: String, tooltip: String) -> Result<(), String> {
  if let Some(tray) = app.tray_by_id("main") {
    if title.trim().is_empty() {
      tray.set_title::<&str>(None).map_err(|e| e.to_string())?;
    } else {
      tray.set_title(Some(title)).map_err(|e| e.to_string())?;
    }

    if tooltip.trim().is_empty() {
      tray.set_tooltip::<&str>(None).map_err(|e| e.to_string())?;
    } else {
      tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let tray = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/icon.png")).unwrap())
        .title("Idle")
        .tooltip("Work Time Tracker")
        .on_tray_icon_event(|tray, _event| {
          if let Some(window) = tray.app_handle().get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
          }
        })
        .build(app)?;

      let _ = tray.set_title(Some("Idle"));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![set_tray_visibility, update_tray_status, git_has_repo, read_workspace_tree, read_file, write_file, git_status, git_diff_file, git_file_versions, git_clone_repo, git_pull, git_commit_push, git_restore_file])
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:worktime.sqlite", vec![tauri_plugin_sql::Migration {
          version: 1,
          description: "init".into(),
          sql: include_str!("../../migrations/001_init.sql").into(),
          kind: tauri_plugin_sql::MigrationKind::Up,
        }])
        .build(),
    )
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod workspace_tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  #[test]
  fn detects_and_restores_all_file_changes() {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let root = std::env::temp_dir().join(format!("ktt-git-test-{stamp}"));
    fs::create_dir(&root).unwrap();
    git(&root, &["init"]).unwrap();
    git(&root, &["config", "user.name", "Workspace Test"]).unwrap();
    git(&root, &["config", "user.email", "workspace@example.invalid"]).unwrap();
    fs::write(root.join("edited.md"), "before\n").unwrap();
    fs::write(root.join("removed.md"), "removed\n").unwrap();
    git(&root, &["add", "-A"]).unwrap();
    git(&root, &["commit", "-m", "initial"]).unwrap();

    fs::write(root.join("edited.md"), "after\n").unwrap();
    fs::remove_file(root.join("removed.md")).unwrap();
    fs::write(root.join("new.md"), "new\n").unwrap();
    fs::write(root.join("tài liệu mới.md"), "chưa stage\n").unwrap();
    git(&root, &["add", "new.md"]).unwrap();
    let path = root.to_string_lossy().to_string();
    let status = git_status(path.clone()).unwrap();
    assert_eq!(status.modified, vec!["edited.md"]);
    assert_eq!(status.created.len(), 2);
    assert!(status.created.contains(&"new.md".to_string()));
    assert!(status.created.contains(&"tài liệu mới.md".to_string()));
    assert_eq!(status.deleted, vec!["removed.md"]);

    let versions = git_file_versions(path.clone(), "edited.md".into()).unwrap();
    assert_eq!(versions.before, "before\n");
    assert_eq!(versions.after, "after\n");
    let new_versions = git_file_versions(path.clone(), "new.md".into()).unwrap();
    assert!(!new_versions.before_exists);
    assert_eq!(new_versions.after, "new\n");

    for file in ["edited.md", "removed.md", "new.md", "tài liệu mới.md"] {
      git_restore_file(path.clone(), file.into()).unwrap();
    }
    let restored = git_status(path).unwrap();
    assert!(restored.modified.is_empty() && restored.created.is_empty() && restored.deleted.is_empty());
    fs::remove_dir_all(root).unwrap();
  }
}
