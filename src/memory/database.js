const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const fanraDir = path.resolve(process.cwd(), ".fanra");

if (!fs.existsSync(fanraDir)) {
  fs.mkdirSync(fanraDir, { recursive: true });
}

const databasePath = path.join(
  fanraDir,
  "memory.db"
);

const db = new sqlite3.Database(
  databasePath,
  (error) => {
    if (error) {
      console.error(
        "Gagal membuka database:",
        error.message
      );
    }
  }
);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT,
      importance INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_memories_type
    ON memories(type)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_memories_importance
    ON memories(importance)
  `);
});

module.exports = {
  db,
  databasePath,
};