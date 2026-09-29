use tauri::Manager;

mod data;

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

/// Speech-to-text (DECISIONS D2): whisper.cpp runs in-process (Metal on Apple silicon); the model ships inside
/// the app bundle, so nothing has to be installed or started. Loaded on first use, then kept in memory.
const STT_MODEL: &str = "resources/ggml-base-q5_1.bin";
static STT: std::sync::Mutex<Option<whisper_rs::WhisperContext>> = std::sync::Mutex::new(None);

fn stt_model(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let p = app.path().resolve(STT_MODEL, tauri::path::BaseDirectory::Resource).ok()?;
    p.exists().then_some(p)
}

#[tauri::command]
fn stt_ready(app: tauri::AppHandle) -> bool {
    stt_model(&app).is_some()
}

/// `samples`: mono f32 PCM at 16 kHz; `lang`: ISO 639-1 of the course. Runs off the main thread.
#[tauri::command]
async fn transcribe(app: tauri::AppHandle, samples: Vec<f32>, lang: String) -> Result<String, String> {
    let model = stt_model(&app).ok_or("Speech model is missing from this build")?;
    tauri::async_runtime::spawn_blocking(move || whisper_text(&model, &samples, &lang))
        .await
        .map_err(|e| e.to_string())?
}

fn whisper_text(model: &std::path::Path, samples: &[f32], lang: &str) -> Result<String, String> {
    // ponytail: one global lock, recordings are short and one learner speaks at a time
    let mut guard = STT.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let path = model.to_str().ok_or("bad model path")?;
        *guard = Some(whisper_rs::WhisperContext::new_with_params(path, Default::default()).map_err(|e| e.to_string())?);
    }
    let mut state = guard.as_ref().unwrap().create_state().map_err(|e| e.to_string())?;
    let mut params = whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(lang));
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_special(false);
    params.set_print_timestamps(false);
    params.set_no_context(true);
    params.set_single_segment(true);
    state.full(params, samples).map_err(|e| e.to_string())?;
    let text: String = state.as_iter().map(|s| s.to_string()).collect();
    Ok(text.trim().to_string())
}

#[cfg(test)]
mod tests {
    /// Needs the model: `pnpm fetch-model`, then `cargo test -- --ignored`. Speech comes from macOS `say`.
    #[test]
    #[ignore]
    fn whisper_transcribes_speech() {
        let wav = std::env::temp_dir().join("loalingo-stt-test.wav");
        let ok = std::process::Command::new("say")
            .args(["-o", wav.to_str().unwrap(), "--data-format=LEI16@16000", "Nice to meet you. How are you today?"])
            .status().unwrap().success();
        assert!(ok);
        let bytes = std::fs::read(&wav).unwrap();
        // ponytail: skip the 4 KB header region `say` writes; leading silence is harmless to whisper
        let pcm = &bytes[4096..];
        let samples: Vec<f32> = pcm.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0).collect();
        let model = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(super::STT_MODEL);
        let text = super::whisper_text(&model, &samples, "en").unwrap().to_lowercase();
        super::release_stt();
        println!("heard: {text}");
        assert!(text.contains("nice to meet you"), "{text}");
    }
}

/// Daily reminder (Settings): the check runs in the webview, so the app must stay alive to fire it.
/// While on, closing the window only hides it and the app starts hidden at login.
static KEEP_ALIVE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
const HIDDEN_ARG: &str = "--hidden";

#[tauri::command]
fn set_background(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    KEEP_ALIVE.store(on, std::sync::atomic::Ordering::Relaxed);
    let launch = app.autolaunch();
    // Skip no-op writes: enable() rewrites the LaunchAgent plist every time.
    if launch.is_enabled().unwrap_or(false) != on {
        if on { launch.enable() } else { launch.disable() }.map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::Builder::new().args([HIDDEN_ARG]).build())
        .setup(|app| {
            // The window starts invisible (tauri.conf.json); a login launch keeps it that way.
            if !std::env::args().any(|a| a == HIDDEN_ARG) {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                if KEEP_ALIVE.load(std::sync::atomic::Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![list_user_courses, secret_get, secret_set, stt_ready, transcribe, set_background,
            data::data_location, data::set_data_dir, data::dir_ok, data::file_exists, data::lock_read, data::lock_write,
            data::lock_remove, data::backups_list, data::backups_remove, data::copy_file, data::is_sqlite, data::install_db])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // Dock icon click brings a hidden window back.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { has_visible_windows: false, .. } => show_main(app),
            tauri::RunEvent::Exit => {
                release_stt();
                data::release_lock();
            }
            _ => {}
        });
}

/// ggml-metal asserts at process exit if a model is still loaded (SIGABRT → "quit unexpectedly"); free it first.
fn release_stt() {
    if let Ok(mut g) = STT.lock() {
        g.take();
    }
}
