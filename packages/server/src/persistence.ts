import { DatabaseSync } from "node:sqlite";
import type { WorldSnapshot } from "@ecosystem/simulation";

/** Small, versioned SQLite store. The engine never calls into this class. */
export class SnapshotStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS world_snapshots (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )`);
  }

  save(snapshot: WorldSnapshot): void {
    this.db.prepare(`INSERT INTO world_snapshots (id, version, created_at, payload) VALUES (1, ?, datetime('now'), ?)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, created_at = excluded.created_at, payload = excluded.payload`).run(snapshot.version, JSON.stringify(snapshot));
  }

  load(): WorldSnapshot | null {
    const row = this.db.prepare("SELECT payload FROM world_snapshots WHERE id = 1").get() as { payload?: string } | undefined;
    if (!row?.payload) return null;
    try {
      const candidate = JSON.parse(row.payload) as Partial<WorldSnapshot>;
      if (typeof candidate.version !== "number" || !candidate.config || !Array.isArray(candidate.organisms) || !Array.isArray(candidate.plants)) return null;
      return candidate as WorldSnapshot;
    } catch { return null; }
  }

  close(): void { this.db.close(); }
}
