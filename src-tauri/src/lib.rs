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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![list_user_courses, secret_get, secret_set, stt_ready, transcribe])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, event| {
            if let tauri::RunEvent::Exit = event {
                release_stt();
            }
        });
}

/// ggml-metal asserts at process exit if a model is still loaded (SIGABRT → "quit unexpectedly"); free it first.
fn release_stt() {
    if let Ok(mut g) = STT.lock() {
        g.take();
    }
}
