#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  tauri::Builder::default()
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
