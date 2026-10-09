import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function testDatabase(sqlite = new DatabaseSync(':memory:'), initialize = true) {
  if (initialize) sqlite.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'));
  const db = {
    sqlite, queries: [] as string[], fail: false, forbidCatalog: false,
    prepare(sql: string) {
      db.queries.push(sql);
      if (db.fail || (db.forbidCatalog && /tracks|sticker_|playback|comments/i.test(sql))) throw new Error('database unavailable or unrelated catalog work');
      let values: any[] = [];
      const statement = {
        bind(...args: any[]) { values = args; return statement; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        execute() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
        async run() { return statement.execute(); }
      };
      return statement;
    },
    async batch(statements: any[]) {
      sqlite.exec('BEGIN');
      try { const result = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return result; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    }
  };
  return db;
}
