const { db } = require("./database");

function saveMemory({
  type,
  content,
  source = null,
  importance = 1,
}) {
  return new Promise((resolve, reject) => {
    if (!type || !content) {
      reject(
        new Error(
          "Memory harus memiliki type dan content."
        )
      );
      return;
    }

    const now = new Date().toISOString();

    const sql = `
      INSERT INTO memories
      (type, content, source, importance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
      sql,
      [
        type,
        content,
        source,
        importance,
        now,
        now,
      ],
      function (error) {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          success: true,
          id: this.lastID,
        });
      }
    );
  });
}

function getMemory(id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM memories WHERE id = ?`,
      [id],
      (error, row) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(row || null);
      }
    );
  });
}

function getMemories({
  type = null,
  limit = 20,
} = {}) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT *
      FROM memories
    `;

    const params = [];

    if (type) {
      sql += ` WHERE type = ?`;
      params.push(type);
    }

    sql += `
      ORDER BY importance DESC, updated_at DESC
      LIMIT ?
    `;

    params.push(limit);

    db.all(
      sql,
      params,
      (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      }
    );
  });
}

function searchMemory(query, limit = 10) {
  return new Promise((resolve, reject) => {
    if (!query || typeof query !== "string") {
      resolve([]);
      return;
    }

    const search = `%${query}%`;

    db.all(
      `
        SELECT *
        FROM memories
        WHERE content LIKE ?
           OR type LIKE ?
           OR source LIKE ?
        ORDER BY importance DESC, updated_at DESC
        LIMIT ?
      `,
      [
        search,
        search,
        search,
        limit,
      ],
      (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      }
    );
  });
}

function deleteMemory(id) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM memories WHERE id = ?`,
      [id],
      function (error) {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          success: true,
          deleted: this.changes > 0,
        });
      }
    );
  });
}

module.exports = {
  saveMemory,
  getMemory,
  getMemories,
  searchMemory,
  deleteMemory,
};