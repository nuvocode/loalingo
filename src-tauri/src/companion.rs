//! Phone companion (docs/MOBILE.md): a small HTTP server on 127.0.0.1 that `tailscale serve` hands to the
//! learner's own devices. The phone gets the app's UI, its database, whisper and Ollama; the desktop keeps the data.
//! SQL goes through the desktop webview (`companion-sql` event → `companion_reply`), so the database keeps one
//! connection, one writer and its migrations.
use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, LazyLock, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tauri_plugin_http::reqwest;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub const PORT: u16 = 1430;
const OLLAMA: &str = "http://127.0.0.1:11434"; // ponytail: the default address; read the AI setting if someone moves Ollama
const SQL_TIMEOUT: Duration = Duration::from_secs(30);

type Reply = Result<serde_json::Value, String>;
type Res = Response<Box<dyn Read + Send>>;

static SERVER: Mutex<Option<Arc<Server>>> = Mutex::new(None);
static PENDING: LazyLock<Mutex<HashMap<u64, mpsc::Sender<Reply>>>> = LazyLock::new(Default::default);
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Tailscale on this machine: installed (its CLI runs), signed in, and this machine's tailnet name.
#[derive(serde::Serialize)]
pub struct Status {
    installed: bool,
    running: bool,
    host: Option<String>,
}

const SERVE_PORT: &str = "--https=8443"; // 443 is often taken by the learner's own serve rules; never touch it
const SERVE_WAIT: Duration = Duration::from_secs(10);

// The Mac app's CLI lives inside its bundle; a bare `tailscale` on PATH is often missing or broken there.
// That binary is also the GUI: started from another app (no terminal) it tries to open the GUI and fails
// with "CLIError error 3" unless told to act as the CLI.
fn tailscale() -> std::process::Command {
    const MAC: &str = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
    let mut c = std::process::Command::new(if std::path::Path::new(MAC).exists() { MAC } else { "tailscale" });
    c.env("TAILSCALE_BE_CLI", "1");
    c
}

#[tauri::command(async)]
pub fn companion_status() -> Status {
    let Ok(out) = tailscale().args(["status", "--json"]).output() else {
        return Status { installed: false, running: false, host: None };
    };
    // Signed out or the app quit: the JSON is missing or says NeedsLogin/Stopped.
    let j: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap_or_default();
    let host = j["Self"]["DNSName"].as_str().map(|h| h.trim_end_matches('.').to_string()).filter(|h| !h.is_empty());
    Status { installed: true, running: j["BackendState"] == "Running" && host.is_some(), host }
}

/// Runs a `tailscale serve` command. A tailnet that hasn't allowed Serve yet prints an approval link and waits
/// for it, so after a while the command is stopped and its output (with the link) becomes the error.
fn serve(args: &[&str]) -> Result<(), String> {
    use std::process::Stdio;
    let mut child = tailscale().arg("serve").args(args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    let start = std::time::Instant::now();
    let done = loop {
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            break Some(st);
        }
        if start.elapsed() > SERVE_WAIT {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let mut msg = String::new();
    let _ = child.stdout.take().map(|mut o| o.read_to_string(&mut msg));
    let _ = child.stderr.take().map(|mut e| e.read_to_string(&mut msg));
    match done {
        Some(st) if st.success() => Ok(()),
        _ => Err(msg.trim().to_string()),
    }
}

/// Settings → "Use on phone": starts the server and points `tailscale serve` at it (or takes both down).
/// On: the phone's address and its QR code as SVG.
#[tauri::command(async)]
pub fn companion_set(app: tauri::AppHandle, on: bool) -> Result<Option<(String, String)>, String> {
    run_server(app, on)?;
    let local = format!("http://127.0.0.1:{PORT}");
    if !on {
        let _ = serve(&[SERVE_PORT, "off"]); // already gone or Tailscale removed: nothing to undo
        return Ok(None);
    }
    serve(&["--bg", SERVE_PORT, &local])?;
    let host = companion_status().host.ok_or("Tailscale is not signed in")?;
    let url = format!("https://{host}:8443");
    let qr = qrcode::QrCode::new(&url).map_err(|e| e.to_string())?;
    let svg = qr.render::<qrcode::render::svg::Color>().min_dimensions(220, 220).quiet_zone(true).build();
    Ok(Some((url, svg)))
}

fn run_server(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    let mut slot = SERVER.lock().map_err(|e| e.to_string())?;
    // Already running: a webview reload asks again, and rebinding the port before the old socket closes fails.
    if on == slot.is_some() {
        return Ok(());
    }
    if let Some(s) = slot.take() {
        s.unblock();
    }
    if on {
        let server = Arc::new(Server::http(("127.0.0.1", PORT)).map_err(|e| e.to_string())?);
        let s = server.clone();
        std::thread::spawn(move || {
            for req in s.incoming_requests() {
                let app = app.clone();
                std::thread::spawn(move || handle(&app, req));
            }
        });
        *slot = Some(server);
    }
    Ok(())
}

/// The webview's answer to one `companion-sql` event.
#[tauri::command]
pub fn companion_reply(id: u64, ok: bool, value: serde_json::Value) {
    if let Some(tx) = PENDING.lock().ok().and_then(|mut p| p.remove(&id)) {
        let _ = tx.send(if ok { Ok(value) } else { Err(value.as_str().unwrap_or("SQL error").to_string()) });
    }
}

fn header<'a>(req: &'a Request, name: &'static str) -> Option<&'a str> {
    req.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str())
}

fn reply(status: u16, ctype: &str, body: Vec<u8>) -> Res {
    let len = body.len();
    Response::new(StatusCode(status), vec![Header::from_bytes("Content-Type", ctype).unwrap()], Box::new(Cursor::new(body)), Some(len), None)
}
fn text(status: u16, msg: impl Into<String>) -> Res {
    reply(status, "text/plain; charset=utf-8", msg.into().into_bytes())
}

/// Only the tailnet name or this machine. A web page that rebinds its own domain to 127.0.0.1 sends its own Host.
fn host_ok(req: &Request) -> bool {
    let host = header(req, "Host").unwrap_or("");
    let name = host.rsplit_once(':').map_or(host, |(n, _)| n);
    name == "127.0.0.1" || name == "localhost" || name.ends_with(".ts.net")
}

fn handle(app: &tauri::AppHandle, mut req: Request) {
    if !host_ok(&req) {
        let _ = req.respond(text(403, "Forbidden host"));
        return;
    }
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    // A custom header forces a CORS preflight this server never answers, so other sites' pages can't post here.
    let api = path == "/sql" || path == "/transcribe";
    if api && (header(&req, "X-Sprigo").is_none() || *req.method() != Method::Post) {
        let _ = req.respond(text(403, "Forbidden"));
        return;
    }
    let res = match path.as_str() {
        "/sql" => sql(app, &mut req),
        "/transcribe" => transcribe(app, &mut req, &url),
        p if p.starts_with("/ollama/") => return forward(req, &format!("{OLLAMA}{}", &url["/ollama".len()..])),
        _ if tauri::is_dev() => match &app.config().build.dev_url {
            Some(dev) => return forward(req, &format!("{}{}", dev.as_str().trim_end_matches('/'), url)),
            None => text(404, "No dev server"),
        },
        _ => asset(app, &path),
    };
    let _ = req.respond(res);
}

fn body(req: &mut Request) -> Result<Vec<u8>, String> {
    let mut b = Vec::new();
    req.as_reader().read_to_end(&mut b).map_err(|e| e.to_string())?;
    Ok(b)
}

/// `{kind: "select" | "execute", sql, args}` → the same result the desktop's own database call returns.
fn sql(app: &tauri::AppHandle, req: &mut Request) -> Res {
    let mut run = || -> Reply {
        let q: serde_json::Value = serde_json::from_slice(&body(req)?).map_err(|e| e.to_string())?;
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel();
        PENDING.lock().map_err(|e| e.to_string())?.insert(id, tx);
        let sent = app.emit_to("main", "companion-sql", serde_json::json!({ "id": id, "kind": q["kind"], "sql": q["sql"], "args": q["args"], "take": q["take"] }));
        let got = sent.map_err(|e| e.to_string()).and_then(|_| rx.recv_timeout(SQL_TIMEOUT).map_err(|_| "The desktop app did not answer".to_string()));
        PENDING.lock().map_err(|e| e.to_string())?.remove(&id);
        got?
    };
    match run() {
        Ok(v) => reply(200, "application/json", v.to_string().into_bytes()),
        Err(e) => text(500, e),
    }
}

/// Body: mono f32 little-endian PCM at 16 kHz; `?lang=` the course language.
fn transcribe(app: &tauri::AppHandle, req: &mut Request, url: &str) -> Res {
    let lang = url.split_once("lang=").map_or("en", |(_, l)| l.split('&').next().unwrap_or("en")).to_string();
    let mut run = || -> Result<String, String> {
        let model = crate::stt_model(app).ok_or("Speech model is missing from this build")?;
        let bytes = body(req)?;
        let samples: Vec<f32> = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
        crate::whisper_text(&model, &samples, &lang)
    };
    match run() {
        Ok(t) => text(200, t),
        Err(e) => text(500, e),
    }
}

fn asset(app: &tauri::AppHandle, path: &str) -> Res {
    let file = if path == "/" { "/index.html" } else { path };
    match app.asset_resolver().get(file.to_string()) {
        Some(a) => reply(200, &a.mime_type, a.bytes),
        None => text(404, "Not found"),
    }
}

/// Proxies to Ollama (or the dev server) and streams the answer back as it comes, so tutor replies stay streamed
/// (SPR-13). Written by hand because tiny_http buffers chunked bodies.
fn forward(mut req: Request, to: &str) {
    let res = (|| -> Result<reqwest::blocking::Response, String> {
        let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes()).map_err(|e| e.to_string())?;
        let ctype = header(&req, "Content-Type").map(str::to_string);
        let b = body(&mut req)?;
        // Ollama refuses origins it doesn't know: send none, like the desktop's own requests.
        let mut out = reqwest::blocking::Client::builder().timeout(None).build().map_err(|e| e.to_string())?.request(method, to).body(b);
        if let Some(c) = ctype {
            out = out.header("Content-Type", c);
        }
        out.send().map_err(|e| e.to_string())
    })();
    let mut r = match res {
        Ok(r) => r,
        Err(e) => {
            let _ = req.respond(text(502, e));
            return;
        }
    };
    let ctype = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("application/octet-stream").to_string();
    let mut w = req.into_writer();
    let head = format!("HTTP/1.1 {}\r\nContent-Type: {ctype}\r\nCache-Control: no-store\r\nTransfer-Encoding: chunked\r\n\r\n", r.status());
    if w.write_all(head.as_bytes()).is_err() {
        return;
    }
    let mut buf = [0u8; 8192];
    while let Ok(n) = r.read(&mut buf) {
        if n == 0 {
            break;
        }
        // One chunk per read, flushed at once: a token from Ollama must not wait for the next one.
        let sent = write!(w, "{n:x}\r\n").and_then(|_| w.write_all(&buf[..n])).and_then(|_| w.write_all(b"\r\n")).and_then(|_| w.flush());
        if sent.is_err() {
            return;
        }
    }
    let _ = w.write_all(b"0\r\n\r\n").and_then(|_| w.flush());
}

/// Stops the server on exit so the port is free for the next launch.
pub fn stop() {
    if let Ok(mut s) = SERVER.lock() {
        if let Some(s) = s.take() {
            s.unblock();
        }
    }
}
