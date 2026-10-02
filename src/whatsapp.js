const makeWASocket =
  require("@sairidev/baileys-new").default;

const {
  useMultiFileAuthState,
  DisconnectReason,
} = require("@sairidev/baileys-new");

const QRCode = require("qrcode-terminal");
const pino = require("pino");

const {
  createAgent,
} = require("./agent");

const {
  createRouter,
} = require("./router");

const {
  createGeminiProvider,
} = require("./providers/gemini");

const {
  taskManager,
} = require("./task_manager");

require("dotenv").config();

/*
 * ========================================
 * FANRA WHATSAPP
 * ========================================
 */

const AUTH_DIR = "./auth_info";
const MAX_MESSAGE_LENGTH = 4000;

/*
 * Satu task aktif per chat.
 *
 * runtime:
 * {
 *   controller,
 *   taskId,
 *   messageKey,
 *   cancel
 * }
 */

const runningTasks = new Map();

/*
 * ========================================
 * LOGGER
 * ========================================
 */

const logger = pino({
  level: "silent",
});

/*
 * ========================================
 * PROVIDERS
 * ========================================
 */

function createFanraAgent() {
  const providers = [];

  /*
   * GEMINI KEY 1
   */

  if (process.env.GEMINI_API_KEY_1) {
    providers.push(
      createGeminiProvider(
        process.env.GEMINI_API_KEY_1,
        "gemini-3.1-flash-lite",
        "Gemini Key 1"
      )
    );

    providers.push(
      createGeminiProvider(
        process.env.GEMINI_API_KEY_1,
        "gemini-3.8-flash",
        "Gemini Key 1"
      )
    );

    providers.push(
      createGeminiProvider(
        process.env.GEMINI_API_KEY_1,
        "gemini-3.1-pro-preview",
        "Gemini Key 1"
      )
    );
  }

  /*
   * GEMINI KEY 2
   */

  if (process.env.GEMINI_API_KEY_2) {
    providers.push(
      createGeminiProvider(
        process.env.GEMINI_API_KEY_2,
        "gemini-3.1-flash-lite",
        "Gemini Key 2"
      )
    );

    providers.push(
      createGeminiProvider(
        process.env.GEMINI_API_KEY_2,
        "gemini-3.8-flash",
        "Gemini Key 2"
      )
    );

    providers.push(
      createGeminiProvider(
        process.env.GEMINI_API_KEY_2,
        "gemini-3.1-pro-preview",
        "Gemini Key 2"
      )
    );
  }

  if (!providers.length) {
    throw new Error(
      "Tidak ada Gemini API key yang ditemukan di .env"
    );
  }

  console.log(
    `  ${providers.length} Gemini providers`
  );

  const router =
    createRouter(providers);

  return createAgent(router);
}

/*
 * ========================================
 * TEXT HELPERS
 * ========================================
 */

function getMessageText(message) {
  const content =
    message?.message;

  if (!content) {
    return "";
  }

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    ""
  ).trim();
}

function normalizeJid(jid) {
  return String(jid || "")
    .trim()
    .toLowerCase();
}

function normalizeNumber(number) {
  return String(number || "")
    .replace(/\D/g, "");
}

/*
 * ========================================
 * CHAT JID
 * ========================================
 */

function getChatJid(message) {
  return normalizeJid(
    message?.key?.remoteJid
  );
}

/*
 * ========================================
 * AUTHORIZED NUMBERS
 * ========================================
 */

function getAllowedNumbers() {
  return String(
    process.env.FANRA_ALLOWED_NUMBERS || ""
  )
    .split(",")
    .map(normalizeNumber)
    .filter(Boolean);
}

/*
 * ========================================
 * JID -> PHONE
 * ========================================
 */

async function resolvePhoneNumber(
  sock,
  message
) {
  const key =
    message?.key || {};

  const candidates = [
    key.senderPn,
    key.participantPn,
    key.remoteJidAlt,
    key.participantAlt,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const number =
      normalizeNumber(
        String(candidate).replace(
          "@s.whatsapp.net",
          ""
        )
      );

    if (number) {
      return number;
    }
  }

  const jid =
    normalizeJid(
      key.remoteJid
    );

  if (
    jid.endsWith("@lid") &&
    typeof sock.findUserId ===
      "function"
  ) {
    try {
      const result =
        await sock.findUserId(
          jid
        );

      if (
        result?.phoneNumber
      ) {
        return normalizeNumber(
          result.phoneNumber
        );
      }
    } catch {
      /*
       * Ignore.
       */
    }
  }

  return "";
}

/*
 * ========================================
 * AUTHORIZATION
 * ========================================
 */

async function isAuthorized(
  sock,
  message
) {
  const key =
    message?.key || {};

  if (key.fromMe) {
    return false;
  }

  const allowedNumbers =
    getAllowedNumbers();

  if (!allowedNumbers.length) {
    return false;
  }

  const phoneNumber =
    await resolvePhoneNumber(
      sock,
      message
    );

  if (!phoneNumber) {
    return false;
  }

  return allowedNumbers.includes(
    phoneNumber
  );
}

/*
 * ========================================
 * SEND TEXT
 * ========================================
 */

async function sendText(
  sock,
  jid,
  text
) {
  if (!text) {
    return null;
  }

  const content =
    String(text);

  if (
    content.length <=
    MAX_MESSAGE_LENGTH
  ) {
    return sock.sendMessage(
      jid,
      {
        text: content,
      }
    );
  }

  const sentMessages = [];

  for (
    let i = 0;
    i < content.length;
    i += MAX_MESSAGE_LENGTH
  ) {
    const result =
      await sock.sendMessage(
        jid,
        {
          text: content.slice(
            i,
            i + MAX_MESSAGE_LENGTH
          ),
        }
      );

    sentMessages.push(
      result
    );
  }

  return sentMessages;
}

/*
 * ========================================
 * EDIT MESSAGE
 * ========================================
 */

async function editMessage(
  sock,
  jid,
  key,
  text
) {
  if (!key || !text) {
    return null;
  }

  try {
    return await sock.sendMessage(
      jid,
      {
        text: String(text),
        edit: key,
      }
    );
  } catch {
    /*
     * Edit gagal tidak boleh
     * membuat task gagal.
     */
    return null;
  }
}

/*
 * ========================================
 * REACTION
 * ========================================
 */

async function reactToMessage(
  sock,
  jid,
  key,
  reaction
) {
  if (!key || !reaction) {
    return;
  }

  try {
    await sock.sendMessage(
      jid,
      {
        react: {
          text: reaction,
          key,
        },
      }
    );
  } catch {
    /*
     * Reaction bersifat optional.
     */
  }
}

/*
 * ========================================
 * TASK HELPERS
 * ========================================
 */

function getChatTasks(jid) {
  return taskManager
    .getActiveTasks()
    .filter(
      (task) =>
        task.metadata?.chatJid ===
        jid
    );
}

function getChatTask(
  jid,
  taskId
) {
  const task =
    taskManager.getTask(
      taskId
    );

  if (!task) {
    return null;
  }

  if (
    task.metadata?.chatJid !==
    jid
  ) {
    return null;
  }

  return task;
}

/*
 * ========================================
 * TASK STATUS
 * ========================================
 */

function getTaskIcon(task) {
  if (!task) {
    return "•";
  }

  switch (task.status) {
    case "completed":
      return "✓";

    case "failed":
      return "×";

    case "cancelled":
      return "■";

    case "queued":
      return "○";

    default:
      return "◌";
  }
}

/*
 * ========================================
 * PROGRESS BAR
 * ========================================
 */

function progressBar(
  current,
  total,
  width = 12
) {
  const safeTotal =
    Number(total) || 1;

  const safeCurrent =
    Math.max(
      0,
      Math.min(
        Number(current) || 0,
        safeTotal
      )
    );

  const ratio =
    safeCurrent /
    safeTotal;

  const filled =
    Math.round(
      ratio * width
    );

  return (
    "█".repeat(
      filled
    ) +
    "░".repeat(
      Math.max(
        0,
        width - filled
      )
    )
  );
}

/*
 * ========================================
 * TASK LABEL
 * ========================================
 */

function getTaskLabel(task) {
  if (!task) {
    return "Mengerjakan permintaan";
  }

  if (
    task.metadata?.taskLabel
  ) {
    return task.metadata.taskLabel;
  }

  if (
    task.metadata?.laptopAction
  ) {
    return "Mengontrol laptop";
  }

  if (
    task.metadata?.browserTask
  ) {
    return "Menjalankan browser";
  }

  if (
    task.type ===
    "laptop"
  ) {
    return "Mengontrol laptop";
  }

  if (
    task.type ===
    "browser"
  ) {
    return "Menjalankan browser";
  }

  return "Mengerjakan permintaan";
}

/*
 * ========================================
 * CLEAN ACTION TEXT
 * ========================================
 */

function cleanActionText(
  action
) {
  if (!action) {
    return "";
  }

  let text =
    String(action)
      .replace(/\s+/g, " ")
      .trim();

  /*
   * Jangan tampilkan detail internal
   * provider/API/error mentah di terminal.
   */

  text = text
    .replace(
      /gemini\s+(key\s*)?\d+/gi,
      ""
    )
    .replace(
      /429|quota|resource exhausted/gi,
      ""
    )
    .replace(
      /api key/gi,
      ""
    )
    .replace(
      /provider/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "Memproses...";
  }

  return text.slice(
    0,
    100
  );
}

/*
 * ========================================
 * TASK MESSAGE
 * ========================================
 */

function buildTaskMessage(
  task,
  extra = {}
) {
  if (!task) {
    return "Fanra";
  }

  const label =
    getTaskLabel(task);

  const status =
    task.status;

  let title =
    "◌ Fanra sedang bekerja";

  let reaction =
    "🧠";

  if (
    status ===
    "completed"
  ) {
    title =
      "✓ Fanra selesai";

    reaction =
      "✅";
  }

  if (
    status ===
    "failed"
  ) {
    title =
      "× Fanra mengalami error";

    reaction =
      "❌";
  }

  if (
    status ===
    "cancelled"
  ) {
    title =
      "■ Task dibatalkan";

    reaction =
      "🛑";
  }

  const lines = [
    title,
    "",
    label,
  ];

  if (
    task.command &&
    task.command.length <= 100
  ) {
    lines.push(
      `“${task.command}”`
    );
  }

  lines.push("");

  /*
   * RUNNING
   */

  if (
    status ===
    "running"
  ) {
    const action =
      cleanActionText(
        task.currentAction ||
          extra.action ||
          "Memproses..."
      );

    lines.push(
      `› ${action}`
    );

    if (
      task.totalSteps
    ) {
      lines.push("");

      lines.push(
        `${progressBar(
          task.completedSteps,
          task.totalSteps
        )} ${
          task.completedSteps
        }/${task.totalSteps}`
      );
    }
  }

  /*
   * QUEUED
   */

  if (
    status ===
    "queued"
  ) {
    lines.push(
      "› Menunggu..."
    );
  }

  /*
   * COMPLETED
   */

  if (
    status ===
    "completed"
  ) {
    const result =
      extra.result ||
      task.result;

    if (result) {
      const cleanResult =
        String(result)
          .trim();

      if (cleanResult) {
        lines.push(
          cleanResult.length >
            1000
            ? cleanResult.slice(
                0,
                1000
              ) + "..."
            : cleanResult
        );
      }
    }
  }

  /*
   * FAILED
   */

  if (
    status ===
    "failed"
  ) {
    if (
      task.error
    ) {
      lines.push(
        String(
          task.error
        ).slice(
          0,
          800
        )
      );
    }
  }

  /*
   * CANCELLED
   */

  if (
    status ===
    "cancelled"
  ) {
    lines.push(
      "Fanra menghentikan pekerjaan."
    );
  }

  lines.push("");

  lines.push(
    task.id
  );

  return lines.join(
    "\n"
  );
}

/*
 * ========================================
 * TASK MESSAGE UPDATE
 * ========================================
 *
 * Semua perubahan progress WhatsApp
 * diedit pada pesan yang sama.
 */

async function updateTaskMessage(
  sock,
  jid,
  taskId,
  extra = {},
  reaction = null
) {
  const runtime =
    runningTasks.get(
      jid
    );

  if (
    !runtime ||
    runtime.taskId !== taskId ||
    !runtime.messageKey
  ) {
    return;
  }

  const task =
    taskManager.getTask(
      taskId
    );

  if (!task) {
    return;
  }

  const content =
    buildTaskMessage(
      task,
      extra
    );

  await editMessage(
    sock,
    jid,
    runtime.messageKey,
    content
  );

  if (reaction) {
    await reactToMessage(
      sock,
      jid,
      runtime.messageKey,
      reaction
    );
  }
}

/*
 * ========================================
 * CREATE TASK MESSAGE
 * ========================================
 */

async function createTaskMessage(
  sock,
  jid,
  task
) {
  const result =
    await sendText(
      sock,
      jid,
      buildTaskMessage(
        task
      )
    );

  if (!result) {
    return null;
  }

  const message =
    Array.isArray(result)
      ? result[0]
      : result;

  return (
    message?.key ||
    null
  );
}

/*
 * ========================================
 * TASK LIST
 * ========================================
 */

function formatChatTasks(jid) {
  const tasks =
    getChatTasks(jid);

  if (!tasks.length) {
    return [
      "FANRA",
      "",
      "Tidak ada task aktif.",
    ].join("\n");
  }

  const lines = [
    "FANRA",
    "",
    `${tasks.length} task aktif`,
    "",
  ];

  for (
    const task of tasks
  ) {
    lines.push(
      `${getTaskIcon(task)}  ${task.id}`
    );

    lines.push(
      `   ${getTaskLabel(task)}`
    );

    if (
      task.currentAction
    ) {
      lines.push(
        `   › ${cleanActionText(
          task.currentAction
        )}`
      );
    }

    if (
      task.totalSteps
    ) {
      lines.push(
        `   ${progressBar(
          task.completedSteps,
          task.totalSteps,
          10
        )} ${
          task.completedSteps
        }/${task.totalSteps}`
      );
    }

    lines.push("");
  }

  return lines.join(
    "\n"
  ).trim();
}

/*
 * ========================================
 * TASK DETAIL
 * ========================================
 */

function formatTaskDetail(
  jid,
  taskId
) {
  const task =
    getChatTask(
      jid,
      taskId
    );

  if (!task) {
    return [
      "FANRA",
      "",
      `Task ${taskId} tidak ditemukan.`,
    ].join("\n");
  }

  const lines = [
    `${getTaskIcon(task)} ${task.id}`,
    "",
    getTaskLabel(task),
    "",
    `Status  ${task.status.toUpperCase()}`,
  ];

  if (
    task.totalSteps
  ) {
    lines.push(
      `Progress ${task.completedSteps}/${task.totalSteps}`
    );

    lines.push(
      progressBar(
        task.completedSteps,
        task.totalSteps,
        14
      )
    );
  }

  if (
    task.currentAction
  ) {
    lines.push("");

    lines.push(
      `› ${cleanActionText(
        task.currentAction
      )}`
    );
  }

  if (
    task.currentStep
  ) {
    lines.push(
      `Step: ${task.currentStep}`
    );
  }

  lines.push("");

  lines.push(
    task.command ||
      "-"
  );

  return lines.join(
    "\n"
  );
}

/*
 * ========================================
 * TERMINAL UI
 * ========================================
 */

function printHeader() {
  console.clear();

  console.log("");
  console.log("  FANRA");
  console.log("  WhatsApp Remote Agent");
  console.log("");
  console.log("  Connecting...");
  console.log("");
}

function printConnected(
  sock
) {
  console.clear();

  console.log("");
  console.log("  FANRA");
  console.log("  WhatsApp Remote Agent");
  console.log("");

  console.log(
    `  ● Online    ${
      sock.user?.id || "-"
    }`
  );

  console.log(
    "  ● Gemini"
  );

  console.log("");

  console.log(
    "  /tasks     active tasks"
  );

  console.log(
    "  /task ID   task detail"
  );

  console.log(
    "  /cancel    cancel task"
  );

  console.log(
    "  /status    status"
  );

  console.log(
    "  /help      help"
  );

  console.log("");

  console.log(
    "  Waiting for WhatsApp..."
  );

  console.log("");
}

/*
 * ========================================
 * TERMINAL TASK STATE
 * ========================================
 */

const terminalTasks =
  new Map();

let terminalLineActive =
  false;

function renderTerminalTask(
  taskId,
  patch = {}
) {
  const previous =
    terminalTasks.get(
      taskId
    ) || {};

  const next = {
    ...previous,
    ...patch,
  };

  terminalTasks.set(
    taskId,
    next
  );

  const action =
    cleanActionText(
      next.action ||
        "Memproses..."
    );

  const step =
    next.step &&
    next.maxSteps
      ? `${next.step}/${next.maxSteps}`
      : "";

  const line =
    `  ${next.icon || "◌"} ${
      next.id || taskId
    }  ${action}${
      step
        ? `  ${step}`
        : ""
    }`;

  /*
   * Kalau sebelumnya ada baris task,
   * update baris yang sama.
   */

  if (
    terminalLineActive
  ) {
    process.stdout.write(
      "\r\x1b[2K"
    );
  }

  process.stdout.write(
    line
  );

  terminalLineActive =
    true;
}

function finishTerminalTask(
  taskId,
  icon,
  action
) {
  renderTerminalTask(
    taskId,
    {
      icon,
      action,
    }
  );

  process.stdout.write(
    "\n"
  );

  terminalLineActive =
    false;

  terminalTasks.delete(
    taskId
  );
}

/*
 * ========================================
 * TERMINAL STATUS
 * ========================================
 *
 * Satu handler saja.
 *
 * Tidak ada lagi:
 *
 * createStatusHandler(...)
 * + handler lain
 *
 * yang memproses event bersamaan.
 */

function createStatusHandler(
  sock,
  jid,
  runtime
) {
  return (data) => {
    if (!data) {
      return;
    }

    /*
     * TASK CREATED
     */

    if (
      data.type ===
      "task_created"
    ) {
      runtime.taskId =
        data.taskId;

      runningTasks.set(
        jid,
        runtime
      );

      terminalTasks.set(
        data.taskId,
        {
          id:
            data.taskId,
          icon:
            "◌",
          action:
            "Memproses...",
        }
      );

      /*
       * Task baru sekarang sudah
       * mempunyai ID.
       */

      updateTaskMessage(
        sock,
        jid,
        data.taskId,
        {
          action:
            "Memproses...",
        },
        "🧠"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * TASK STARTED
     */

    if (
      data.type ===
      "task_started"
    ) {
      if (
        data.taskId
      ) {
        renderTerminalTask(
          data.taskId,
          {
            icon:
              "🧠",
            action:
              "Memahami permintaan...",
          }
        );

        updateTaskMessage(
          sock,
          jid,
          data.taskId,
          {
            action:
              "Memahami permintaan...",
          },
          "🧠"
        ).catch(
          () => {}
        );
      }

      return;
    }

    /*
     * STEP
     */

    if (
      data.type ===
      "step"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      renderTerminalTask(
        taskId,
        {
          icon:
            "⏳",
          step:
            data.step,
          maxSteps:
            data.maxSteps,
          action:
            data.action ||
            "Menjalankan langkah...",
        }
      );

      updateTaskMessage(
        sock,
        jid,
        taskId,
        {
          action:
            data.action ||
            "Menjalankan langkah...",
        },
        "⏳"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * TOOL
     */

    if (
      data.type ===
      "tool"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      const action =
        cleanActionText(
          data.action ||
            "Menjalankan aksi..."
        );

      renderTerminalTask(
        taskId,
        {
          icon:
            "🔧",
          action,
        }
      );

      updateTaskMessage(
        sock,
        jid,
        taskId,
        {
          action,
        },
        "🔧"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * FAST ACTION
     */

    if (
      data.type ===
      "fast_action"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      const action =
        cleanActionText(
          data.action ||
            "Menjalankan aksi..."
        );

      renderTerminalTask(
        taskId,
        {
          icon:
            "🔧",
          action,
        }
      );

      updateTaskMessage(
        sock,
        jid,
        taskId,
        {
          action,
        },
        "🔧"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * TOOL FAILED
     */

    if (
      data.type ===
      "tool_failed"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      renderTerminalTask(
        taskId,
        {
          icon:
            "↻",
          action:
            "Mencoba memperbaiki...",
        }
      );

      updateTaskMessage(
        sock,
        jid,
        taskId,
        {
          action:
            "Mencoba memperbaiki...",
        },
        "🔎"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * SUCCESS DARI PROVIDER
     *
     * Jangan tampilkan provider.
     */

    if (
      data.type ===
      "success"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      renderTerminalTask(
        taskId,
        {
          icon:
            "⏳",
          action:
            "Menyelesaikan...",
        }
      );

      return;
    }

    /*
     * TASK COMPLETED
     */

    if (
      data.type ===
      "task_completed"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      /*
       * Jangan mengubah status task
       * secara manual di sini.
       *
       * Agent yang mengelolanya.
       */

      const task =
        taskManager.getTask(
          taskId
        );

      const result =
        task?.result ||
        data.result ||
        null;

      finishTerminalTask(
        taskId,
        "✓",
        "Selesai"
      );

      updateTaskMessage(
        sock,
        jid,
        taskId,
        {
          result,
        },
        "✅"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * TASK CANCELLED
     */

    if (
      data.type ===
      "task_cancelled"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      finishTerminalTask(
        taskId,
        "■",
        "Dibatalkan"
      );

      updateTaskMessage(
        sock,
        jid,
        taskId,
        {},
        "🛑"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * TASK FAILED
     */

    if (
      data.type ===
      "task_failed"
    ) {
      const taskId =
        data.taskId ||
        runtime.taskId;

      if (!taskId) {
        return;
      }

      finishTerminalTask(
        taskId,
        "×",
        "Gagal"
      );

      updateTaskMessage(
        sock,
        jid,
        taskId,
        {},
        "❌"
      ).catch(
        () => {}
      );

      return;
    }

    /*
     * ERROR / FALLBACK / PROVIDER
     *
     * Sengaja tidak ditampilkan.
     *
     * Jadi quota/error provider tidak
     * memenuhi terminal.
     */
  };
}

/*
 * ========================================
 * HELP
 * ========================================
 */

async function sendHelp(
  sock,
  jid
) {
  const message = [
    "FANRA",
    "",
    "Kirim perintah langsung.",
    "",
    "TASK",
    "• /tasks",
    "• /task FANRA-XXXXXX",
    "• /cancel",
    "• /cancel FANRA-XXXXXX",
    "",
    "LAINNYA",
    "• /status",
    "• /help",
    "",
    "Contoh",
    "• buka Spotify",
    "• buka Chrome",
    "• buka Downloads",
    "• buka YouTube di Brave",
    "• cari video di YouTube",
    "• buat file hello.js",
  ].join("\n");

  await sendText(
    sock,
    jid,
    message
  );
}

/*
 * ========================================
 * SIMPLE CHAT
 * ========================================
 *
 * Chat biasa tidak boleh dianggap
 * sebagai task.
 *
 * Fungsi ini hanya sebagai guard
 * tambahan di sisi WhatsApp.
 */

function looksLikeSimpleChat(
  text
) {
  const value =
    String(text || "")
      .trim()
      .toLowerCase();

  if (!value) {
    return true;
  }

  const greetings = [
    "halo",
    "hai",
    "hi",
    "hey",
    "hello",
    "p",
    "permisi",
    "selamat pagi",
    "selamat siang",
    "selamat sore",
    "selamat malam",
    "apa kabar",
    "gimana kabarnya",
    "kamu siapa",
    "siapa kamu",
    "kamu itu siapa",
    "namamu siapa",
    "nama kamu siapa",
    "terima kasih",
    "makasih",
    "thanks",
    "oke",
    "ok",
    "okei",
    "sip",
    "mantap",
  ];

  if (
    greetings.includes(
      value
    )
  ) {
    return true;
  }

  return false;
}

/*
 * ========================================
 * COMMAND HANDLER
 * ========================================
 */

async function handleWhatsAppCommand(
  sock,
  jid,
  text
) {
  const lowerText =
    text
      .trim()
      .toLowerCase();

  /*
   * /TASKS
   */

  if (
    lowerText ===
    "/tasks"
  ) {
    await sendText(
      sock,
      jid,
      formatChatTasks(
        jid
      )
    );

    return true;
  }

  /*
   * /TASK ID
   */

  if (
    lowerText.startsWith(
      "/task "
    )
  ) {
    const taskId =
      text
        .slice(6)
        .trim()
        .toUpperCase();

    if (!taskId) {
      await sendText(
        sock,
        jid,
        "Gunakan /task FANRA-XXXXXX"
      );

      return true;
    }

    await sendText(
      sock,
      jid,
      formatTaskDetail(
        jid,
        taskId
      )
    );

    return true;
  }

  /*
   * /CANCEL
   */

  if (
    lowerText ===
    "/cancel"
  ) {
    const runtime =
      runningTasks.get(
        jid
      );

    const tasks =
      getChatTasks(
        jid
      );

    if (
      runtime?.controller &&
      !runtime.controller
        .signal.aborted
    ) {
      runtime.controller.abort();

      return true;
    }

    if (!tasks.length) {
      await sendText(
        sock,
        jid,
        [
          "FANRA",
          "",
          "Tidak ada task aktif.",
        ].join("\n")
      );

      return true;
    }

    if (
      tasks.length ===
      1
    ) {
      const task =
        tasks[0];

      taskManager.cancelTask(
        task.id,
        "Task dibatalkan oleh pengguna."
      );

      await sendText(
        sock,
        jid,
        `Task ${task.id} dibatalkan.`
      );

      return true;
    }

    await sendText(
      sock,
      jid,
      [
        "FANRA",
        "",
        "Ada beberapa task aktif.",
        "",
        formatChatTasks(
          jid
        ),
        "",
        "Gunakan /cancel FANRA-XXXXXX",
      ].join("\n")
    );

    return true;
  }

  /*
   * /CANCEL ID
   */

  if (
    lowerText.startsWith(
      "/cancel "
    )
  ) {
    const taskId =
      text
        .slice(8)
        .trim()
        .toUpperCase();

    if (!taskId) {
      await sendText(
        sock,
        jid,
        "Gunakan /cancel FANRA-XXXXXX"
      );

      return true;
    }

    const task =
      getChatTask(
        jid,
        taskId
      );

    if (!task) {
      await sendText(
        sock,
        jid,
        `Task ${taskId} tidak ditemukan.`
      );

      return true;
    }

    const runtime =
      runningTasks.get(
        jid
      );

    if (
      runtime?.taskId ===
        taskId &&
      runtime.controller &&
      !runtime.controller
        .signal.aborted
    ) {
      runtime.controller.abort();

      return true;
    }

    taskManager.cancelTask(
      task.id,
      "Task dibatalkan oleh pengguna."
    );

    await sendText(
      sock,
      jid,
      `Task ${task.id} dibatalkan.`
    );

    return true;
  }

  /*
   * /STATUS
   */

  if (
    lowerText ===
    "/status"
  ) {
    const tasks =
      getChatTasks(
        jid
      );

    if (!tasks.length) {
      await sendText(
        sock,
        jid,
        [
          "FANRA",
          "",
          "● IDLE",
          "Tidak ada task aktif.",
        ].join("\n")
      );

      return true;
    }

    await sendText(
      sock,
      jid,
      formatChatTasks(
        jid
      )
    );

    return true;
  }

  /*
   * /HELP
   */

  if (
    lowerText ===
    "/help"
  ) {
    await sendHelp(
      sock,
      jid
    );

    return true;
  }

  return false;
}

/*
 * ========================================
 * MAIN
 * ========================================
 */

async function startWhatsApp() {
  printHeader();

  const {
    state,
    saveCreds,
  } =
    await useMultiFileAuthState(
      AUTH_DIR
    );

  const sock =
    makeWASocket({
      auth: state,
      logger,
    });

  /*
   * Agent dibuat sekali
   * untuk koneksi ini.
   */

  const agent =
    createFanraAgent();

  /*
   * ========================================
   * CREDENTIALS
   * ========================================
   */

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  /*
   * ========================================
   * CONNECTION
   * ========================================
   */

  sock.ev.on(
    "connection.update",
    ({
      connection,
      lastDisconnect,
      qr,
    }) => {
      if (qr) {
        console.log("");

        console.log(
          "  Scan QR dengan WhatsApp:"
        );

        console.log("");

        QRCode.generate(
          qr,
          {
            small: true,
          }
        );

        console.log("");
      }

      if (
        connection ===
        "open"
      ) {
        printConnected(
          sock
        );
      }

      if (
        connection ===
        "close"
      ) {
        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log("");

        console.log(
          `  Connection closed${
            statusCode
              ? ` (${statusCode})`
              : ""
          }`
        );

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {
          console.log(
            "  Session logout."
          );

          console.log(
            "  Hapus auth_info lalu login ulang."
          );

          console.log("");

          return;
        }

        console.log(
          "  Reconnecting..."
        );

        console.log("");

        startWhatsApp()
          .catch(
            (error) => {
              console.error(
                error?.message ||
                  error
              );
            }
          );
      }
    }
  );

  /*
   * ========================================
   * INCOMING MESSAGE
   * ========================================
   */

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type,
    }) => {
      /*
       * Hanya pesan baru.
       */

      if (
        type !==
        "notify"
      ) {
        return;
      }

      for (
        const message of
          messages || []
      ) {
        try {
          if (
            !message?.message
          ) {
            continue;
          }

          /*
           * Jangan proses pesan
           * dari Fanra sendiri.
           */

          if (
            message?.key?.fromMe
          ) {
            continue;
          }

          const text =
            getMessageText(
              message
            );

          if (!text) {
            continue;
          }

          const jid =
            getChatJid(
              message
            );

          /*
           * ========================================
           * AUTH
           * ========================================
           */

          const authorized =
            await isAuthorized(
              sock,
              message
            );

          if (!authorized) {
            continue;
          }

          /*
           * ========================================
           * COMMANDS
           * ========================================
           */

          const handled =
            await handleWhatsAppCommand(
              sock,
              jid,
              text
            );

          if (handled) {
            continue;
          }

          /*
           * ========================================
           * EXISTING TASK
           * ========================================
           *
           * Jangan menjalankan dua task
           * dari chat yang sama.
           */

          const existingTasks =
            getChatTasks(
              jid
            );

          if (
            existingTasks.length
          ) {
            const task =
              existingTasks[0];

            await sendText(
              sock,
              jid,
              [
                "FANRA",
                "",
                "Masih mengerjakan task sebelumnya.",
                "",
                `${getTaskIcon(
                  task
                )} ${task.id}`,
                getTaskLabel(
                  task
                ),
                task.currentAction
                  ? `› ${cleanActionText(
                      task.currentAction
                    )}`
                  : "",
                "",
                "Gunakan /cancel untuk menghentikannya.",
              ]
                .filter(
                  Boolean
                )
                .join("\n")
            );

            continue;
          }

          /*
           * ========================================
           * TERMINAL INCOMING MESSAGE
           * ========================================
           */

          console.log(
            `\n  WA  › ${text}`
          );

          /*
           * ========================================
           * SIMPLE CHAT
           * ========================================
           *
           * Penting:
           *
           * Chat biasa tetap dikirim
           * ke agent, tetapi tidak membuat
           * task UI di WhatsApp.
           *
           * Guard ini juga memastikan
           * greeting sederhana tidak
           * mendapatkan tampilan task
           * sebelum agent menentukan
           * levelnya.
           */

          if (
            looksLikeSimpleChat(
              text
            )
          ) {
            try {
              const answer =
                await agent.run(
                  [
                    {
                      role:
                        "user",
                      content:
                        text,
                    },
                  ],
                  {
                    taskMetadata: {
                      chatJid:
                        jid,
                      simpleChat:
                        true,
                    },
                  }
                );

              if (
                answer
              ) {
                await sendText(
                  sock,
                  jid,
                  String(
                    answer
                  ).trim()
                );
              }

              console.log(
                `  FANRA › ${
                  String(
                    answer ||
                      ""
                  )
                    .replace(
                      /\s+/g,
                      " "
                    )
                    .slice(
                      0,
                      120
                    )
                }`
              );
            } catch (error) {
              await sendText(
                sock,
                jid,
                "Maaf, Fanra lagi bermasalah sebentar."
              );

              console.log(
                `  × Chat: ${
                  error?.message ||
                  error
                }`
              );
            }

            continue;
          }

          /*
           * ========================================
           * START TASK
           * ========================================
           */

          const controller =
            new AbortController();

          const runtime = {
            controller,
            taskId:
              null,
            messageKey:
              null,
            cancel:
              null,
          };

          runningTasks.set(
            jid,
            runtime
          );

          /*
           * ========================================
           * INITIAL WHATSAPP TASK MESSAGE
           * ========================================
           */

          const initialMessage =
            await sendText(
              sock,
              jid,
              [
                "◌ Fanra sedang bekerja",
                "",
                "Menyiapkan task...",
              ].join("\n")
            );

          const initialKey =
            Array.isArray(
              initialMessage
            )
              ? initialMessage[0]
                  ?.key
              : initialMessage?.key;

          runtime.messageKey =
            initialKey ||
            null;

          if (
            runtime.messageKey
          ) {
            await reactToMessage(
              sock,
              jid,
              runtime.messageKey,
              "🧠"
            );
          }

          /*
           * ========================================
           * RUN AGENT
           * ========================================
           */

          try {
            const conversation = [
              {
                role:
                  "user",
                content:
                  text,
              },
            ];

            let latestTaskId =
              null;

            const statusHandler =
              createStatusHandler(
                sock,
                jid,
                runtime
              );

            const answer =
              await agent.run(
                conversation,
                {
                  signal:
                    controller.signal,

                  onStatus:
                    statusHandler,

                  onCancel(
                    cancel
                  ) {
                    runtime.cancel =
                      typeof cancel ===
                      "function"
                        ? cancel
                        : null;
                  },

                  taskMetadata: {
                    chatJid:
                      jid,
                  },
                }
              );

            /*
             * Ambil task yang terakhir
             * diketahui oleh runtime.
             */

            latestTaskId =
              runtime.taskId;

            /*
             * Kalau dibatalkan,
             * jangan kirim hasil akhir.
             */

            if (
              controller.signal
                .aborted
            ) {
              return;
            }

            /*
             * ========================================
             * FINAL RESULT
             * ========================================
             *
             * Agent sudah bertanggung jawab
             * terhadap status task.
             *
             * Di sini hanya memperbarui
             * tampilan WhatsApp.
             */

            const finalTask =
              latestTaskId
                ? taskManager.getTask(
                    latestTaskId
                  )
                : null;

            if (
              runtime.messageKey
            ) {
              if (
                finalTask
              ) {
                await editMessage(
                  sock,
                  jid,
                  runtime.messageKey,
                  buildTaskMessage(
                    finalTask,
                    {
                      result:
                        answer ||
                        finalTask.result ||
                        "Task selesai.",
                    }
                  )
                );
              } else {
                await editMessage(
                  sock,
                  jid,
                  runtime.messageKey,
                  [
                    "✓ Fanra selesai",
                    "",
                    answer ||
                      "Task selesai.",
                    "",
                    latestTaskId ||
                      "FANRA",
                  ].join(
                    "\n"
                  )
                );
              }

              await reactToMessage(
                sock,
                jid,
                runtime.messageKey,
                "✅"
              );
            }

            console.log(
              `  ✓ ${
                latestTaskId ||
                "Task"
              }`
            );
          } catch (error) {
            /*
             * ========================================
             * CANCELLATION
             * ========================================
             */

            if (
              error?.name ===
                "AbortError" ||
              controller.signal
                .aborted
            ) {
              const task =
                runtime.taskId
                  ? taskManager.getTask(
                      runtime.taskId
                    )
                  : null;

              if (
                task &&
                task.status !==
                  "cancelled"
              ) {
                taskManager.cancelTask(
                  task.id,
                  "Task dibatalkan oleh pengguna."
                );
              }

              if (
                runtime.messageKey
              ) {
                const taskId =
                  runtime.taskId ||
                  "FANRA";

                await editMessage(
                  sock,
                  jid,
                  runtime.messageKey,
                  [
                    "■ Task dibatalkan",
                    "",
                    "Fanra menghentikan pekerjaan.",
                    "",
                    taskId,
                  ].join(
                    "\n"
                  )
                );

                await reactToMessage(
                  sock,
                  jid,
                  runtime.messageKey,
                  "🛑"
                );
              }

              console.log(
                `  ■ ${
                  runtime.taskId ||
                  "Task"
                }`
              );

              return;
            }

            /*
             * ========================================
             * NORMAL ERROR
             * ========================================
             */

            console.log(
              `  × ${
                runtime.taskId ||
                "Task"
              }`
            );

            /*
             * Terminal hanya menampilkan
             * error ringkas.
             *
             * Tidak menampilkan:
             * - API key
             * - quota detail
             * - provider detail
             */

            const safeError =
              String(
                error?.message ||
                  error ||
                  "Terjadi error."
              )
                .replace(
                  /gemini\s+(key\s*)?\d+/gi,
                  ""
                )
                .replace(
                  /api key/gi,
                  ""
                )
                .replace(
                  /429/gi,
                  ""
                )
                .replace(
                  /resource exhausted/gi,
                  ""
                )
                .trim();

            console.log(
              `    ${safeError.slice(
                0,
                200
              )}`
            );

            if (
              runtime.messageKey
            ) {
              await editMessage(
                sock,
                jid,
                runtime.messageKey,
                [
                  "× Fanra mengalami error",
                  "",
                  safeError.slice(
                    0,
                    800
                  ),
                  "",
                  runtime.taskId ||
                    "FANRA",
                ].join(
                  "\n"
                )
              );

              await reactToMessage(
                sock,
                jid,
                runtime.messageKey,
                "❌"
              );
            }
          } finally {
            /*
             * Runtime dihapus setelah
             * seluruh proses selesai.
             */

            runningTasks.delete(
              jid
            );

            if (
              runtime.taskId
            ) {
              terminalTasks.delete(
                runtime.taskId
              );
            }
          }
        } catch (error) {
          console.log(
            `  × WA ${
              error?.message ||
              error
            }`
          );
        }
      }
    }
  );
}

/*
 * ========================================
 * START
 * ========================================
 */

startWhatsApp()
  .catch(
    (error) => {
      console.error("");

      console.error(
        "  FANRA ERROR"
      );

      console.error(
        `  ${
          error?.message ||
          error
        }`
      );

      console.error("");
    }
  );