const {
  saveMemory,
} = require("./memory_store");

async function extractMemory(router, userMessage, assistantMessage) {
  if (!userMessage || !assistantMessage) {
    return null;
  }

  const messages = [
    {
      role: "system",
      content: `
Kamu adalah memory manager Fanra.

Tugasmu menentukan apakah percakapan berikut memiliki informasi
yang layak disimpan sebagai memory jangka panjang.

Simpan hanya informasi yang:
- berguna untuk percakapan atau pekerjaan Fanra di masa depan
- merupakan preferensi pengguna
- merupakan informasi penting tentang project
- merupakan keputusan penting
- merupakan fakta yang kemungkinan tetap relevan

JANGAN simpan:
- sapaan
- candaan
- percakapan sementara
- pertanyaan umum
- jawaban AI
- informasi yang hanya relevan untuk satu pesan
- informasi sensitif

Jika tidak layak disimpan, jawab persis:
NO_MEMORY

Jika layak disimpan, gunakan format JSON persis:

{
  "type": "user_preference",
  "content": "informasi yang perlu diingat",
  "importance": 1
}

type harus salah satu:
- user_preference
- user_info
- project
- decision
- experience

importance:
1 = rendah
2 = biasa
3 = penting
4 = sangat penting
5 = sangat penting untuk jangka panjang

Jangan gunakan markdown.
Jangan tambahkan penjelasan.
`,
    },
    {
      role: "user",
      content: `
USER:
${userMessage}

FANRA:
${assistantMessage}
`,
    },
  ];

  try {
    const result = await router.chat(
      messages,
      "simple"
    );

    const text = result.trim();

    if (text === "NO_MEMORY") {
      return null;
    }

    const jsonMatch =
      text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return null;
    }

    const memory =
      JSON.parse(jsonMatch[0]);

    const allowedTypes = [
      "user_preference",
      "user_info",
      "project",
      "decision",
      "experience",
    ];

    if (
      !allowedTypes.includes(memory.type)
    ) {
      return null;
    }

    if (
      !memory.content ||
      typeof memory.content !== "string"
    ) {
      return null;
    }

    const importance =
      Math.min(
        5,
        Math.max(
          1,
          Number(memory.importance) || 1
        )
      );

    const saved =
      await saveMemory({
        type: memory.type,
        content: memory.content,
        source: "conversation",
        importance,
      });

    return {
      success: true,
      ...memory,
      importance,
      id: saved.id,
    };
  } catch {
    return null;
  }
}

module.exports = {
  extractMemory,
};