/**
 * SQLite 기반 세이브 저장소 (Electron 메인 프로세스).
 * Node 내장 node:sqlite(DatabaseSync) 사용 — 네이티브 컴파일 불필요.
 * 렌더러의 SaveStore 인터페이스와 동일한 의미를 가지며, 저장 본문은 직렬화된 JSON.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SaveMeta {
  id: string;
  clubName: string;
  season: number;
  savedAt: string;
}

export class SqliteSaveStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saves (
        id       TEXT PRIMARY KEY,
        json     TEXT NOT NULL,
        clubName TEXT NOT NULL,
        season   INTEGER NOT NULL,
        savedAt  TEXT NOT NULL
      )
    `);
  }

  list(): SaveMeta[] {
    return this.db
      .prepare('SELECT id, clubName, season, savedAt FROM saves ORDER BY savedAt DESC')
      .all() as unknown as SaveMeta[];
  }

  save(id: string, json: string, meta: Omit<SaveMeta, 'id'>): void {
    this.db.prepare(`
      INSERT INTO saves (id, json, clubName, season, savedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        json = excluded.json, clubName = excluded.clubName,
        season = excluded.season, savedAt = excluded.savedAt
    `).run(id, json, meta.clubName, meta.season, meta.savedAt);
  }

  load(id: string): string | null {
    const row = this.db.prepare('SELECT json FROM saves WHERE id = ?').get(id) as
      | { json: string }
      | undefined;
    return row ? row.json : null;
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM saves WHERE id = ?').run(id);
  }

  close(): void {
    this.db.close();
  }
}
