# Dalga 1 — Migration sistemi + LICENSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SQLite şemasını `PRAGMA user_version` ile sürümlenen sıralı migration'lara geçirmek, daha yeni bir şemayla karşılaşınca güvenle durmak, projeye MIT lisansı eklemek.

**Architecture:** Saf bir migration çalıştırıcısı (`src/migrate.ts`) her `SqlDb` üzerinde çalışır: Tauri'de `tauri-plugin-sql`, geliştirme önizlemesinde ve testlerde sql.js. sql.js sarmalayıcısı `src/sqljs.ts`'e taşınır ki hem `db.ts` hem testler kullansın. Migration listesi `src/migrations.ts`'te saf veri olarak durur; `v1` bugünkü şemadır.

**Tech Stack:** TypeScript, React 19, Tauri 2 (`@tauri-apps/plugin-sql`, `@tauri-apps/api/path`), sql.js 1.14, Node yerleşik test koşucusu (`node --test`, tip ayıklama ile `.ts` doğrudan çalışır).

Spec: `docs/superpowers/specs/2026-09-29-v1-roadmap-design.md` § A.

## Global Constraints

- Test komutu: `pnpm test` (= `node --test src/*.test.ts`). Tip kontrolü: `pnpm -s tsc --noEmit -p .`
- Testlerden import edilen modüller başka proje modüllerini yalnızca `import type` ile alabilir (Node tip ayıklayıcı uzantısız çalışma zamanı importlarını çözemez). Test dosyaları kaynakları `.ts` uzantısıyla import eder (ör. `./migrate.ts`).
- `tauri-plugin-sql` bağlantı havuzu kullanır: bir transaction'ın `BEGIN` … `COMMIT`'i **tek bir** `execute` çağrısında gönderilmelidir.
- Mevcut kullanıcı verisi korunur: `v1` bugünkü şemanın birebir aynısıdır ve `IF NOT EXISTS` kullanır.
- Kod stili: dosyadaki mevcut yorum yoğunluğu ve deyimler (kısa, `ponytail:` notları, tek satırlık yardımcılar).
- Kullanıcıya görünen her metin `src/locales/en.json` ve `src/locales/tr.json`'a eklenir.
- Commit mesajları İngilizce, emir kipinde; sonunda `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Dosya | Durum | Sorumluluk |
|---|---|---|
| `src/migrate.ts` | Yeni | `SqlDb` tipi, `Migration` tipi, `FutureSchemaError`, `schemaVersion()`, `runMigrations()` |
| `src/migrations.ts` | Yeni | `MIGRATIONS: Migration[]` — sıralı şema değişiklikleri (`v1` = bugünkü şema) |
| `src/sqljs.ts` | Yeni | `wrapSqlJs(db, onWrite?)` — sql.js `Database`'i `SqlDb`'ye çevirir |
| `src/migrate.test.ts` | Yeni | Çalıştırıcı + v1 testleri (sql.js, Node) |
| `src/db.ts` | Değişir | `SCHEMA` kaldırılır; açılışta `runMigrations`; Tauri'de migration öncesi `VACUUM INTO` yedeği; `browserDb` → `wrapSqlJs` |
| `src/store.tsx` | Değişir | Açılış hatasını yakalar, `bootError` durumunu sunar |
| `src/App.tsx` | Değişir | `bootError` varsa hata ekranını gösterir |
| `src/styles.css` | Değişir | `.boot-error` stilleri |
| `src/locales/en.json`, `src/locales/tr.json` | Değişir | `boot.*` metinleri |
| `LICENSE` | Yeni | MIT |
| `README.md` | Değişir | License bölümü |

---

### Task 1: Migration çalıştırıcısı, sql.js sarmalayıcısı ve v1

**Files:**
- Create: `src/migrate.ts`
- Create: `src/migrations.ts`
- Create: `src/sqljs.ts`
- Test: `src/migrate.test.ts`

**Interfaces:**
- Consumes: yok.
- Produces:
  - `src/migrate.ts`:
    - `export type SqlDb = { select<T = Record<string, any>>(sql: string, args?: unknown[]): Promise<T[]>; execute(sql: string, args?: unknown[]): Promise<{ lastInsertId?: number }> }`
    - `export type Migration = { v: number; sql: string }`
    - `export class FutureSchemaError extends Error { readonly found: number; readonly known: number }`
    - `export async function schemaVersion(db: SqlDb): Promise<number>`
    - `export async function runMigrations(db: SqlDb, migrations: Migration[], backup?: (target: number) => Promise<void>): Promise<{ from: number; to: number }>`
  - `src/migrations.ts`: `export const MIGRATIONS: Migration[]`
  - `src/sqljs.ts`: `export function wrapSqlJs(db: Database, onWrite?: () => void): SqlDb` (`Database` = `import type { Database } from "sql.js"`)

- [ ] **Step 1: Testi yaz**

`src/migrate.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { FutureSchemaError, runMigrations, schemaVersion, type Migration } from "./migrate.ts";
import { MIGRATIONS } from "./migrations.ts";
import { wrapSqlJs } from "./sqljs.ts";

const SQL = await initSqlJs();
const fresh = () => wrapSqlJs(new SQL.Database());
const tables = async (db: ReturnType<typeof fresh>) =>
  (await db.select<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);

const V1_TABLES = ["content_cache", "device_settings", "enrollments", "mistakes", "profiles", "step_progress", "words"];

test("empty database migrates to the latest version", async () => {
  const db = fresh();
  const r = await runMigrations(db, MIGRATIONS);
  const latest = Math.max(...MIGRATIONS.map((m) => m.v));
  assert.deepEqual(r, { from: 0, to: latest });
  assert.equal(await schemaVersion(db), latest);
  for (const t of V1_TABLES) assert.ok((await tables(db)).includes(t), `table ${t} exists`);
});

test("existing pre-migration database (tables, user_version 0) keeps its data", async () => {
  const db = fresh();
  await db.execute(MIGRATIONS[0].sql); // what 0.1.x created, without user_version
  await db.execute("INSERT INTO device_settings(key, value) VALUES ($1, $2)", ["k", "v"]);
  assert.equal(await schemaVersion(db), 0);
  await runMigrations(db, MIGRATIONS);
  assert.equal(await schemaVersion(db), 1);
  assert.deepEqual(await db.select("SELECT key, value FROM device_settings"), [{ key: "k", value: "v" }]);
});

test("running twice is a no-op", async () => {
  const db = fresh();
  await runMigrations(db, MIGRATIONS);
  const again = await runMigrations(db, MIGRATIONS);
  assert.equal(again.from, again.to);
});

test("pending migrations apply in order", async () => {
  const db = fresh();
  const ms: Migration[] = [
    { v: 2, sql: "INSERT INTO t(x) VALUES ('two')" },
    { v: 1, sql: "CREATE TABLE t(x TEXT)" },
  ];
  await runMigrations(db, ms);
  assert.equal(await schemaVersion(db), 2);
  assert.deepEqual(await db.select("SELECT x FROM t"), [{ x: "two" }]);
});

test("a newer schema than the app knows throws FutureSchemaError and changes nothing", async () => {
  const db = fresh();
  await db.execute("PRAGMA user_version = 99");
  await assert.rejects(runMigrations(db, MIGRATIONS), (e: unknown) => e instanceof FutureSchemaError && e.found === 99 && e.known === 1);
  assert.equal(await schemaVersion(db), 99);
  assert.deepEqual(await tables(db), []);
});

test("a failing migration rolls back and keeps the previous version", async () => {
  const db = fresh();
  const ms: Migration[] = [
    { v: 1, sql: "CREATE TABLE a(x TEXT)" },
    { v: 2, sql: "CREATE TABLE b(x TEXT); INSERT INTO nope VALUES (1)" },
  ];
  await assert.rejects(runMigrations(db, ms));
  assert.equal(await schemaVersion(db), 1);
  assert.deepEqual(await tables(db), ["a"], "table b from the failed migration is rolled back");
});

test("backup runs once before migrating a database that has tables, never for an empty one", async () => {
  const calls: number[] = [];
  const backup = async (v: number) => { calls.push(v); };
  const ms: Migration[] = [{ v: 1, sql: "CREATE TABLE a(x TEXT)" }, { v: 2, sql: "CREATE TABLE b(x TEXT)" }];

  const empty = fresh();
  await runMigrations(empty, ms, backup);
  assert.deepEqual(calls, [], "no backup for a brand-new database");

  const old = fresh();
  await runMigrations(old, ms.slice(0, 1));
  await runMigrations(old, ms, backup);
  assert.deepEqual(calls, [2], "one backup, named after the target version");

  await runMigrations(old, ms, backup);
  assert.deepEqual(calls, [2], "no backup when nothing is pending");
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `node --test src/migrate.test.ts`
Expected: FAIL — `Cannot find module '.../src/migrate.ts'`

- [ ] **Step 3: `src/migrate.ts`'i yaz**

```ts
// Schema migrations (spec A): ordered steps tracked by SQLite's `PRAGMA user_version`.
// Pure: runs on any SqlDb (tauri-plugin-sql in the app, sql.js in the dev preview and tests).

export type SqlDb = {
  select<T = Record<string, any>>(sql: string, args?: unknown[]): Promise<T[]>;
  execute(sql: string, args?: unknown[]): Promise<{ lastInsertId?: number }>;
};
export type Migration = { v: number; sql: string };

/** The database was written by a newer app. Opening it here could corrupt it, so we stop. */
export class FutureSchemaError extends Error {
  constructor(readonly found: number, readonly known: number) {
    super(`Database schema v${found} is newer than this app supports (v${known}).`);
    this.name = "FutureSchemaError";
  }
}

export async function schemaVersion(db: SqlDb) {
  const [r] = await db.select<{ user_version: number }>("PRAGMA user_version");
  return Number(r?.user_version ?? 0);
}

/** Brings the schema to the latest version. `backup(target)` runs once, before the first pending step, if the database already has tables. */
export async function runMigrations(db: SqlDb, migrations: Migration[], backup?: (target: number) => Promise<void>) {
  const from = await schemaVersion(db);
  const known = Math.max(0, ...migrations.map((m) => m.v));
  if (from > known) throw new FutureSchemaError(from, known);
  const pending = migrations.filter((m) => m.v > from).sort((a, b) => a.v - b.v);
  if (!pending.length) return { from, to: from };
  if (backup) {
    const [t] = await db.select<{ n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'");
    if (Number(t?.n) > 0) await backup(known);
  }
  for (const m of pending) {
    // One execute call = one pooled connection, so BEGIN and COMMIT must travel together.
    // ponytail: if a step fails, ROLLBACK may land on another pooled connection; the app then shows the boot error and a restart drops the half-open one.
    try {
      await db.execute(`BEGIN;\n${m.sql.trim().replace(/;$/, "")};\nPRAGMA user_version = ${m.v};\nCOMMIT;`);
    } catch (e) {
      await db.execute("ROLLBACK").catch(() => {});
      throw e;
    }
  }
  return { from, to: known };
}
```

- [ ] **Step 4: `src/migrations.ts`'i yaz** (v1, bugünkü `SCHEMA` metninin birebir kopyası; `src/db.ts:12-33`)

```ts
// Ordered schema changes (spec A). Append only: never edit a shipped step, add a new one with the next `v`.
import type { Migration } from "./migrate";

export const MIGRATIONS: Migration[] = [
  {
    v: 1, // the 0.1.x schema; IF NOT EXISTS so existing databases pass through untouched
    sql: `
CREATE TABLE IF NOT EXISTS device_settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS profiles(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, pin_hash TEXT,
  ui_lang TEXT NOT NULL, theme TEXT NOT NULL DEFAULT 'system', native_lang TEXT NOT NULL,
  active_enrollment_id INTEGER, stats TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS enrollments(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_iso TEXT NOT NULL, level TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(profile_id, course_iso));
CREATE TABLE IF NOT EXISTS step_progress(
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE, step_id TEXT NOT NULL,
  state TEXT NOT NULL, legendary INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(enrollment_id, step_id));
CREATE TABLE IF NOT EXISTS content_cache(
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE, step_id TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(enrollment_id, step_id));
CREATE TABLE IF NOT EXISTS mistakes(
  id INTEGER PRIMARY KEY, enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  item TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(enrollment_id, item));
CREATE TABLE IF NOT EXISTS words(
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE, word TEXT NOT NULL, translation TEXT NOT NULL,
  strength INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(enrollment_id, word))`,
  },
];
```

Doğrulama: `src/db.ts` içindeki `SCHEMA` ile bu metin arasında fark olmamalı:

```bash
diff <(sed -n '/^const SCHEMA = `$/,/`;$/p' src/db.ts | sed '1d;$s/`;$//') <(sed -n '/^    sql: `$/,/`,$/p' src/migrations.ts | sed '1d;$s/`,$//')
```
Expected: son satırın kapanış farkı dışında çıktı yok. (`SCHEMA`'nın son satırı `...PRIMARY KEY(enrollment_id, word))\`;` ile biter; iki metnin tablo tanımları aynı olmalı.)

- [ ] **Step 5: `src/sqljs.ts`'i yaz** (bugünkü `browserDb` içindeki sarmalayıcıdan çıkarılır)

```ts
// sql.js Database → SqlDb, shared by the dev browser preview (src/db.ts) and the Node tests.
import type { Database } from "sql.js";
import type { SqlDb } from "./migrate";

// `$1` placeholders (plugin-sql style) are named parameters to SQLite, so bind them by name.
const bind = (args: unknown[] = []) => Object.fromEntries(args.map((v, i) => [`$${i + 1}`, v ?? null])) as any;

export function wrapSqlJs(db: Database, onWrite?: () => void): SqlDb {
  return {
    async select(sql, args) {
      const st = db.prepare(sql); st.bind(bind(args));
      const rows: any[] = [];
      while (st.step()) rows.push(st.getAsObject());
      st.free();
      return rows;
    },
    async execute(sql, args) {
      // run() with params executes only the first statement; migrations are multi-statement, so exec() when unbound.
      if (args?.length) db.run(sql, bind(args)); else db.exec(sql);
      const id = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
      onWrite?.();
      return { lastInsertId: id };
    },
  };
}
```

- [ ] **Step 6: Testleri çalıştır**

Run: `node --test src/migrate.test.ts`
Expected: 7 test, hepsi PASS.

Run: `pnpm test`
Expected: tüm testler PASS (önceki 16 + 7 = 23).

Run: `pnpm -s tsc --noEmit -p .`
Expected: çıktı yok.

- [ ] **Step 7: Commit**

```bash
git add src/migrate.ts src/migrations.ts src/sqljs.ts src/migrate.test.ts
git commit -m "Add a user_version based migration runner with v1 as the current schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `db.ts`'i migration'lara bağla, migration öncesi yedek

**Files:**
- Modify: `src/db.ts:1-66` (başlık yorumu, `Row`/`Db` tipleri, `SCHEMA`, `tauriDb`, `browserDb`, `db()`)

**Interfaces:**
- Consumes: `runMigrations`, `SqlDb` (`src/migrate.ts`); `MIGRATIONS` (`src/migrations.ts`); `wrapSqlJs` (`src/sqljs.ts`).
- Produces: `db()` açılışta migration'ları çalıştırır; başarısızlıkta (ör. `FutureSchemaError`) reddedilen promise döner. Dışa açık API (`getSetting`, `listProfiles` …) değişmez.

- [ ] **Step 1: `src/db.ts` üst kısmını değiştir**

`src/db.ts` satır 1–66 arasındaki şu parçalar değişir; dosyanın geri kalanı (Types bölümünden itibaren) aynen kalır.

Başlık yorumu ve importlar:

```ts
// SQLite storage (DECISIONS A5, E4–E6). In Tauri: tauri-plugin-sql (`loalingo.db` in the app config dir).
// Schema changes live in src/migrations.ts and run on open (spec A).
// ponytail: in a plain browser (the Vite preview used during development) the same SQL runs on sql.js,
// persisted to localStorage. Never used in the shipped app.
import type { Cefr } from "./course";
import type { ThemePref } from "./theme";
import { NEW_STATS, type Stats } from "./progress";
import { runMigrations, type SqlDb } from "./migrate";
import { MIGRATIONS } from "./migrations";
import { wrapSqlJs } from "./sqljs";
export { NEW_STATS, type Stats };

type Row = Record<string, any>;
type Db = SqlDb;
```

`const SCHEMA = \`…\`;` bloğunun tamamı silinir (artık `src/migrations.ts`'te).

`tauriDb` aynen kalır; hemen altına yedek fonksiyonu eklenir:

```ts
async function tauriDb(): Promise<Db> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load("sqlite:loalingo.db");
}

/** Consistent copy of the live database next to it before a migration (VACUUM INTO works under WAL, no Rust needed). */
async function tauriBackup(d: Db, target: number) {
  const { appConfigDir, join } = await import("@tauri-apps/api/path");
  const file = await join(await appConfigDir(), `loalingo.pre-v${target}-${Date.now()}.db`);
  await d.execute(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
}
```

`browserDb` sarmalayıcıyı kullanır:

```ts
async function browserDb(): Promise<Db> {
  const [{ default: init }, { default: wasm }] = await Promise.all([import("sql.js"), import("sql.js/dist/sql-wasm.wasm?url")]);
  const SQL = await init({ locateFile: () => wasm });
  const KEY = "loalingo.devdb";
  const saved = localStorage.getItem(KEY);
  const db = new SQL.Database(saved ? Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)) : undefined);
  return wrapSqlJs(db, () => localStorage.setItem(KEY, btoa(String.fromCharCode(...db.export()))));
}
```

`db()` şema döngüsü yerine migration çalıştırır:

```ts
let dbP: Promise<Db> | null = null;
export const isTauri = "__TAURI_INTERNALS__" in window;
function db() {
  return (dbP ??= (async () => {
    const d = await (isTauri ? tauriDb() : import.meta.env.DEV ? browserDb() : Promise.reject(new Error("loalingo needs the Tauri shell")));
    await runMigrations(d, MIGRATIONS, isTauri ? (v) => tauriBackup(d, v) : undefined);
    return d;
  })());
}
```

- [ ] **Step 2: Tip kontrolü ve testler**

Run: `pnpm -s tsc --noEmit -p .`
Expected: çıktı yok.

Run: `pnpm test`
Expected: tüm testler PASS.

Run: `grep -n "SCHEMA" src/db.ts`
Expected: çıktı yok.

- [ ] **Step 3: Tarayıcı önizlemesinde mevcut dev verisinin korunduğunu doğrula**

Bu adım tarayıcı araçları olan denetleyici (controller) tarafından yapılır; subagent atlayabilir ve raporunda belirtir.

Önizlemede (`preview_start {name: "web"}`, `http://localhost:1420`) sayfayı yenile ve konsolda çalıştır:

```js
const b = Uint8Array.from(atob(localStorage.getItem("loalingo.devdb")), c => c.charCodeAt(0));
const SQL = await (await import("/node_modules/.vite/deps/sql__js.js")).default({ locateFile: () => "/node_modules/sql.js/dist/sql-wasm.wasm" });
new SQL.Database(b).exec("PRAGMA user_version")[0].values[0][0]
```
Expected: `1`. Öğren ekranı eskisi gibi mevcut profil ve ilerlemeyle açılır, konsolda hata yok.

- [ ] **Step 4: Commit**

```bash
git add src/db.ts
git commit -m "Run schema migrations on open and back up the database before migrating

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Açılış hatası ekranı

**Files:**
- Modify: `src/store.tsx` (context tipi ~satır 37, state ~satır 65, açılış effect'i ~satır 101–115, context değeri ~satır 132)
- Modify: `src/App.tsx:76` (`if (!ready) return null;` satırı)
- Modify: `src/styles.css` (dosya sonuna)
- Modify: `src/locales/en.json`, `src/locales/tr.json` (yeni `boot` bölümü)

**Interfaces:**
- Consumes: `FutureSchemaError` (`src/migrate.ts`).
- Produces: `src/store.tsx` → `export type BootError = { kind: "future" | "failed"; detail: string }`; context'te `bootError: BootError | null`.

- [ ] **Step 1: Metinleri ekle**

`src/locales/en.json` — en üst seviyeye, `"nav"` bölümünden önce:

```json
  "boot": {
    "newerTitle": "This data is from a newer version",
    "newerDesc": "Your data was saved by a newer version of loalingo. Update the app to open it. This version won't change it.",
    "failedTitle": "loalingo couldn't open your data",
    "failedDesc": "Something went wrong while opening the database. Details:"
  },
```

`src/locales/tr.json` — aynı yere:

```json
  "boot": {
    "newerTitle": "Bu veri daha yeni bir sürümden",
    "newerDesc": "Verilerin loalingo'nun daha yeni bir sürümüyle kaydedilmiş. Açmak için uygulamayı güncelle. Bu sürüm verilere dokunmaz.",
    "failedTitle": "loalingo verilerini açamadı",
    "failedDesc": "Veritabanı açılırken bir sorun oluştu. Ayrıntılar:"
  },
```

Doğrulama: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json'));JSON.parse(require('fs').readFileSync('src/locales/tr.json'));console.log('ok')"` → `ok`.

- [ ] **Step 2: `src/store.tsx`'te hatayı yakala**

Import'lara ekle:

```ts
import { FutureSchemaError } from "./migrate";
```

Context tipinin hemen üstüne:

```ts
export type BootError = { kind: "future" | "failed"; detail: string };
```

Context tipinde `ready: boolean;` satırının altına:

```ts
  bootError: BootError | null;
```

State'lerde `const [ready, setReady] = useState(false);` satırının altına:

```ts
  const [bootError, setBootError] = useState<BootError | null>(null);
```

Açılış effect'inin gövdesi try/catch içine alınır (içerik aynı kalır):

```ts
  useEffect(() => {
    (async () => {
      try {
        const cfg = await loadAiConfig();
        await activateConfig(cfg);
        setAiState(cfg);
        const { courses, errors } = await loadCourses();
        setCourses(courses); setCourseErrors(errors);
        errors.forEach((e) => console.error(e));
        // Auto sign-in to the last profile unless it is PIN-locked.
        const last = Number(await db.getSetting(LAST_PROFILE));
        const p = last ? await db.getProfile(last) : null;
        if (p && !p.pin_hash) await login(p);
        setReady(true);
      } catch (e) {
        console.error(e);
        setBootError({ kind: e instanceof FutureSchemaError ? "future" : "failed", detail: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [login]);
```

Context değerinde `ready, ai,` satırına `bootError` eklenir:

```ts
    ready, bootError, ai,
```

- [ ] **Step 3: `src/App.tsx`'te hata ekranını göster**

Import satırı `import { useApp, type Route } from "./store";` → 

```ts
import { useApp, type BootError, type Route } from "./store";
```

`NavBtn` fonksiyonunun altına:

```tsx
function BootErrorScreen({ e }: { e: BootError }) {
  const { t } = useTranslation();
  const future = e.kind === "future";
  return (
    <div className="boot-error" role="alert">
      <div className="card">
        <h3>{t(future ? "boot.newerTitle" : "boot.failedTitle")}</h3>
        <p className="muted">{t(future ? "boot.newerDesc" : "boot.failedDesc")}</p>
        {!future && <pre className="boot-detail">{e.detail}</pre>}
      </div>
    </div>
  );
}
```

`App` içinde `useApp()` destructuring'ine `bootError` eklenir ve `if (!ready) return null;` satırı şöyle olur:

```tsx
  if (bootError) return <BootErrorScreen e={bootError} />;
  if (!ready) return null;
```

- [ ] **Step 4: Stil**

`src/styles.css` sonuna:

```css
/* startup failure (newer schema, unreadable database) */
.boot-error{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.boot-error .card{max-width:440px;padding:24px}
.boot-error h3{margin-bottom:8px}
.boot-detail{margin-top:12px;font-size:12px;white-space:pre-wrap;word-break:break-word;color:var(--text-muted)}
```

- [ ] **Step 5: Tip kontrolü ve testler**

Run: `pnpm -s tsc --noEmit -p .`
Expected: çıktı yok.

Run: `pnpm test`
Expected: tüm testler PASS.

- [ ] **Step 6: Önizlemede doğrula** (denetleyici yapar; subagent atlayıp raporda belirtir)

Önizleme konsolunda dev veritabanını geçici olarak "gelecek sürüme" çek, yenile, ekranı gör, sonra geri al:

```js
const K = "loalingo.devdb", saved = localStorage.getItem(K);
const SQL = await (await import("/node_modules/.vite/deps/sql__js.js")).default({ locateFile: () => "/node_modules/sql.js/dist/sql-wasm.wasm" });
const d = new SQL.Database(Uint8Array.from(atob(saved), c => c.charCodeAt(0)));
d.exec("PRAGMA user_version = 99");
sessionStorage.setItem("devdb.backup", saved);
localStorage.setItem(K, btoa(String.fromCharCode(...d.export())));
location.reload();
```
Expected: "Bu veri daha yeni bir sürümden" kartı (TR) ya da "This data is from a newer version" (EN), ayrıntı satırı yok.

Geri al:

```js
localStorage.setItem("loalingo.devdb", sessionStorage.getItem("devdb.backup")); location.reload();
```
Expected: uygulama normal açılır.

- [ ] **Step 7: Commit**

```bash
git add src/store.tsx src/App.tsx src/styles.css src/locales/en.json src/locales/tr.json
git commit -m "Show a startup error instead of a blank window when the database can't be opened

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: MIT lisansı

**Files:**
- Create: `LICENSE`
- Modify: `README.md` (dosya sonuna)

**Interfaces:** yok.

- [ ] **Step 1: `LICENSE`**

```text
MIT License

Copyright (c) 2026 Özer Özdaş

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: README'ye bölüm ekle**

`README.md` sonuna:

```markdown

## License

[MIT](LICENSE)
```

`package.json`'da `"license"` alanı yoksa, `"version"` satırının altına ekle:

```json
  "license": "MIT",
```

Doğrulama: `node -e "console.log(require('./package.json').license)"` → `MIT`.

- [ ] **Step 3: Commit**

```bash
git add LICENSE README.md package.json
git commit -m "License the project under MIT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tauri'de uçtan uca doğrulama (yalnızca denetleyici)

Subagent'a verilmez. Merge'den önce denetleyici çalıştırır, çünkü `tauri-plugin-sql`'in çok ifadeli `execute` davranışı ve `VACUUM INTO` yalnızca gerçek uygulamada doğrulanabilir.

- [ ] **Step 1:** Gerçek veri klasörünün önce elle yedeğini al:

```bash
cp ~/Library/Application\ Support/com.nuvocode.loalingo/loalingo.db /tmp/loalingo-before-wave1.db
```

- [ ] **Step 2:** `pnpm tauri dev` ile uygulamayı aç, Öğren ekranının mevcut profil ve ilerlemeyle geldiğini gör, uygulamayı kapat.

- [ ] **Step 3:** Sürümü ve yedeği kontrol et:

```bash
sqlite3 ~/Library/Application\ Support/com.nuvocode.loalingo/loalingo.db "PRAGMA user_version; SELECT count(*) FROM profiles;"
ls ~/Library/Application\ Support/com.nuvocode.loalingo/ | grep pre-v1
```
Expected: `1`, profil sayısı önceki ile aynı; `loalingo.pre-v1-<zaman>.db` dosyası var.

- [ ] **Step 4:** Uygulamayı yeniden aç: yeni bir `pre-v1-*` dosyası oluşmamalı (bekleyen migration yok).
