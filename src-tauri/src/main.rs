#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
  image::Image,
  tray::TrayIconBuilder,
  Manager,
};

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
    .invoke_handler(tauri::generate_handler![set_tray_visibility, update_tray_status])
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
