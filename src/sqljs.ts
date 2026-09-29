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
