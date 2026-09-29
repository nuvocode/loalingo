# Dalga 2 / B — Veri konumu, kilit, yedekleme Implementation Plan

**Goal:** Veritabanı kullanıcının seçtiği klasörde (`location.json` → `dataDir`) açılır; aynı anda tek cihaz yazar (kilit dosyası); günlük yedek alınır; Ayarlar'da Veri bölümü klasörü değiştirir, dışa/içe aktarır.

**Architecture:**
- `src/datarules.ts` (yeni, saf, testli): `lockVerdict()`, `dailyName()`, `backupsToPrune()`, `sqliteUrl()`.
- `src/datadir.ts` (yeni, yalnız Tauri): Rust komutlarını çağırır; `openDataDir()` açılış sırasını yürütür (konum → erişim → kilit → `Database.load`), günlük yedek, kilit nabzı, klasör değiştirme / dışa / içe aktarma; `DataDirError`, `LockedError`.
- `src/db.ts`: `tauriDb()` `openDataDir()`'i kullanır; migration öncesi yedek `<dataDir>/backups/`'a gider; açılış sonrası günlük yedek.
- `src/store.tsx` / `src/App.tsx`: `BootError.kind` += `"unreachable" | "locked"`; aynı ekran, düğmeli.
- `src/screens/DataSettings.tsx` (yeni): `DataSection` + modal. `Settings.tsx`'e yalnız import + tek satır (Güncellemeler'den önce).
- `src-tauri/src/data.rs` (yeni): `data_location`, `set_data_dir`, `dir_ok`, `file_exists`, `lock_read`, `lock_write`, `lock_remove`, `backups_list`, `backups_remove`, `install_db`, `copy_file`. Çıkışta kilit silinir. Cihaz adı `scutil --get ComputerName` / `hostname` (yalnız std).
- `tauri-plugin-dialog` + `@tauri-apps/plugin-dialog`, izinler `dialog:allow-open`, `dialog:allow-save`.

## Tasks

1. Plan (bu dosya) — commit.
2. Saf kurallar + testler (`src/datarules.ts`, `src/datarules.test.ts`) — commit.
3. Rust komutları + dialog eklentisi + izinler — `cargo check` — commit.
4. Açılış: `datadir.ts`, `db.ts`, `store.tsx`, `App.tsx`, metinler — commit.
5. Ayarlar > Veri: `DataSettings.tsx`, `Settings.tsx` tek satır, metinler — commit.

Her görevden sonra: `pnpm test`, `pnpm -s tsc --noEmit -p .`, `cargo check` (src-tauri).

## Notlar

- tauri-plugin-sql 2.5 yolu `PathBuf::push` ile birleştirir: mutlak yol olduğu gibi kalır. sqlx dosya adını yüzde-çözer → `%`, `?`, `#` kodlanır.
- `VACUUM INTO` hedef varsa hata verir → dışa aktarma önce `backups/` içine geçici dosya yazar, sonra kopyalar.
- İçe aktarma / "oraya kopyala": `install_db` hedefteki `loalingo.db` (+ `-wal`, `-shm`) dosyalarını `backups/replaced-<ts>.db*` olarak kenara alır, sonra yeni dosyayı yerleştirir. İçe aktarmada önce havuz kapatılır.
- Başka cihaz yazarken kilit el değiştirirse nabız bunu görür ve "Verilerin <cihaz> üzerinde açık" ekranına geçer.
- Tarayıcı önizlemesi (sql.js): Veri satırı devre dışı, kilit/yedek yok.
