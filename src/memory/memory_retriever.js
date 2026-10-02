const {
  searchMemory,
  getMemories,
} = require("./memory_store");

async function retrieveMemory(query, options = {}) {
  const {
    limit = 10,
    type = null,
  } = options;

  if (!query || typeof query !== "string") {
    return [];
  }

  let memories = await searchMemory(
    query,
    limit
  );

  if (type) {
    memories = memories.filter(
      (memory) => memory.type === type
    );
  }

  return memories;
}

async function getRelevantMemories(
  query,
  options = {}
) {
  const {
    limit = 10,
  } = options;

  const memories =
    await retrieveMemory(query, {
      limit,
    });

  if (memories.length > 0) {
    return memories;
  }

  // Jika tidak menemukan memory berdasarkan
  // kata pencarian, ambil memory penting terbaru.
  return getMemories({
    limit,
  });
}

function formatMemories(memories) {
  if (!memories || memories.length === 0) {
    return "Tidak ada memory yang relevan.";
  }

  return memories
    .map((memory) => {
      return `[${memory.type}] ${memory.content}`;
    })
    .join("\n");
}

module.exports = {
  retrieveMemory,
  getRelevantMemories,
  formatMemories,
};