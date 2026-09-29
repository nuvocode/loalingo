use tauri::Manager;

/// User-installed courses (DECISIONS B3): `<app data>/courses/*.yml`, returned as (file name, text).
/// The folder is created on first call so users can find where to drop files.
#[tauri::command]
fn list_user_courses(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("courses");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if matches!(path.extension().and_then(|e| e.to_str()), Some("yml" | "yaml")) {
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            out.push((name, std::fs::read_to_string(&path).map_err(|e| e.to_string())?));
        }
    }
    Ok(out)
}

/// API keys live in the OS keychain (DECISIONS A6), never in SQLite.
fn secret_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.nuvocode.loalingo", key).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    match secret_entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// `None` deletes the key.
#[tauri::command]
fn secret_set(key: String, value: Option<String>) -> Result<(), String> {
    let entry = secret_entry(&key)?;
    match value {
        Some(v) => entry.set_password(&v).map_err(|e| e.to_string()),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![list_user_courses, secret_get, secret_set])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
