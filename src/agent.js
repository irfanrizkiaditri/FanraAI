const {
  createToolRegistry,
} = require("./tools/tool_registry");

const {
  detectTaskLevel,
} = require("./router");

const {
  getRelevantMemories,
  formatMemories,
} = require("./memory/memory_retriever");

const {
  extractMemory,
} = require("./memory/memory_manager");

const {
  detectFastAction,
} = require("./fast_actions");

const {
  taskManager,
} = require("./task_manager");

/*
 * ========================================
 * CANCELLATION
 * ========================================
 */

function isCancelled(options) {
  return (
    options?.signal?.aborted === true ||
    options?.cancelled === true
  );
}

function throwIfCancelled(options) {
  if (isCancelled(options)) {
    const error = new Error("Task dibatalkan.");
    error.name = "AbortError";
    throw error;
  }
}

/*
 * ========================================
 * BASIC CHAT DETECTION
 * ========================================
 */

function isSimpleConversation(message) {
  const text =
    typeof message === "string"
      ? message.toLowerCase().trim()
      : "";

  if (!text) {
    return true;
  }

  const patterns = [
    /^halo\b/,
    /^hai\b/,
    /^hi\b/,
    /^hey\b/,
    /^helo\b/,
    /^p\b/,
    /^permisi\b/,
    /^selamat pagi\b/,
    /^selamat siang\b/,
    /^selamat sore\b/,
    /^selamat malam\b/,

    /^apa kabar\b/,
    /^gimana kabarnya\b/,
    /^kabarmu\b/,

    /^siapa kamu\b/,
    /^kamu siapa\b/,
    /^lu siapa\b/,
    /^lo siapa\b/,
    /^anda siapa\b/,
    /^kamu itu siapa\b/,
    /^lu itu siapa\b/,
    /^lo itu siapa\b/,

    /^apa itu fanra\b/,
    /^fanra itu apa\b/,
    /^fanra siapa\b/,

    /^terima kasih\b/,
    /^makasih\b/,
    /^thanks\b/,
    /^thank you\b/,

    /^oke\b/,
    /^ok\b/,
    /^okei\b/,
    /^sip\b/,
  ];

  return patterns.some((pattern) =>
    pattern.test(text)
  );
}

/*
 * ========================================
 * DETEKSI TINDAKAN LAPTOP
 * ========================================
 *
 * Penting:
 * Jangan hanya mendeteksi kata seperti
 * "video", "musik", "spotify", dll.
 *
 * Harus ada konteks tindakan.
 */

function isLaptopActionRequest(message) {
  const text =
    typeof message === "string"
      ? message.toLowerCase().trim()
      : "";

  if (!text) {
    return false;
  }

  /*
   * Percakapan sederhana bukan action.
   */
  if (isSimpleConversation(text)) {
    return false;
  }

  const patterns = [
    /*
     * Membuka / menjalankan
     */
    /\b(buka|bukakan|bukain)\b/,
    /\b(open|launch)\b/,
    /\b(jalankan|jalanin)\b/,
    /\b(start)\b/,

    /*
     * Menutup
     */
    /\b(tutup|tutupin|matikan|matiin)\b/,
    /\b(close|kill|terminate)\b/,

    /*
     * Media
     */
    /\b(putar|putarin|mainkan|play|pause|lanjutkan)\b/,

    /*
     * Browser
     */
    /\b(buka|bukakan|bukain)\s+(browser|chrome|brave|edge|firefox|opera)\b/,
    /\b(di|pakai|gunakan|lewat|via|in|with)\s+(chrome|brave|edge|firefox|opera)\b/,

    /*
     * Search / browser action
     */
    /\b(cari|carikan|temukan)\b/,
    /\b(search|find)\b/,
    /\b(browsing|browse)\b/,

    /*
     * Browser interaction
     */
    /\b(klik|click)\b/,
    /\b(ketik|ketikan|tulis|isikan|isi)\b/,
    /\b(scroll|gulir)\b/,
    /\b(login|log in|masuk)\b/,
    /\b(download|unduh)\b/,

    /*
     * Screenshot
     */
    /\b(screenshot|screen shot|tangkap layar)\b/,

    /*
     * File / folder
     */
    /\b(buka folder|buka file)\b/,
    /\b(cari file|temukan file)\b/,
    /\b(buat file|buat folder)\b/,
    /\b(hapus file|hapus folder)\b/,
    /\b(delete file|delete folder)\b/,
    /\b(copy file|salin file)\b/,
    /\b(pindahkan file)\b/,

    /*
     * Process
     */
    /\b(cek process|cek proses)\b/,
    /\b(lihat process|lihat proses)\b/,
    /\b(status process|status proses)\b/,
    /\b(process yang berjalan|proses yang berjalan)\b/,
    /\b(hentikan process|hentikan proses)\b/,
    /\b(stop process|stop proses)\b/,

    /*
     * Terminal / command
     */
    /\b(buka terminal|buka cmd)\b/,
    /\b(jalankan command|jalankan perintah)\b/,
    /\b(run command|run perintah)\b/,

    /*
     * Dev server
     */
    /\b(start server|jalankan server)\b/,
    /\b(stop server|matikan server)\b/,

    /*
     * Explicit laptop context
     */
    /\b(di laptop|di komputer|di pc)\b/,
    /\b(laptop saya|komputer saya|pc saya)\b/,
  ];

  return patterns.some((pattern) =>
    pattern.test(text)
  );
}

/*
 * ========================================
 * DETEKSI BROWSER
 * ========================================
 */

function isBrowserTask(message) {
  const text =
    typeof message === "string"
      ? message.toLowerCase().trim()
      : "";

  if (!text) {
    return false;
  }

  /*
   * Browser eksplisit.
   */
  if (
    /\b(chrome|brave|edge|firefox|opera|browser)\b/.test(
      text
    )
  ) {
    return true;
  }

  /*
   * Website / service yang biasanya dibuka
   * melalui browser.
   */
  const websitePatterns = [
    /\b(buka|bukakan|bukain|akses|kunjungi)\s+(youtube|google|github|gmail|instagram|facebook|discord|web whatsapp|chatgpt)\b/,
    /\bhttps?:\/\//,
    /\bwww\./,
  ];

  if (
    websitePatterns.some((pattern) =>
      pattern.test(text)
    )
  ) {
    return true;
  }

  /*
   * Browser media/search.
   */
  const browserActionPatterns = [
    /\bcari video\b/,
    /\bcarikan video\b/,
    /\bsearch video\b/,
    /\bcari lagu\b/,
    /\bcarikan lagu\b/,
    /\bsearch lagu\b/,
    /\bputar lagu\b/,
    /\bplay lagu\b/,
    /\bputar video\b/,
    /\bplay video\b/,
    /\btonton\b/,
    /\bnonton\b/,
    /\bdengarkan\b/,
  ];

  return browserActionPatterns.some((pattern) =>
    pattern.test(text)
  );
}

/*
 * ========================================
 * DETEKSI BROWSER TARGET
 * ========================================
 */

function extractBrowserTarget(message) {
  const text =
    typeof message === "string"
      ? message
      : "";

  const match = text.match(
    /\b(?:di|pakai|gunakan|lewat|via|in|with)\s+(brave|chrome|edge|firefox|opera)\b/i
  );

  if (!match) {
    return null;
  }

  return match[1].toLowerCase();
}

/*
 * ========================================
 * DETEKSI BROWSER INTERACTION
 * ========================================
 */

function isBrowserInteractionRequest(message) {
  const text =
    typeof message === "string"
      ? message.toLowerCase().trim()
      : "";

  if (!text) {
    return false;
  }

  const patterns = [
    /*
     * Search
     */
    /\bcari\b/,
    /\bcarikan\b/,
    /\bsearch\b/,
    /\btemukan\b/,
    /\bfind\b/,

    /*
     * Media
     */
    /\bplay\b/,
    /\bputar\b/,
    /\bpause\b/,
    /\blanjutkan\b/,
    /\btonton\b/,
    /\bnonton\b/,
    /\bdengarkan\b/,

    /*
     * Interaction
     */
    /\bklik\b/,
    /\bclick\b/,
    /\bketik\b/,
    /\btulis\b/,
    /\bisi\b/,
    /\bscroll\b/,
    /\bgulir\b/,
    /\blogin\b/,
    /\blog in\b/,
    /\bmasuk\b/,

    /*
     * Download
     */
    /\bdownload\b/,
    /\bunduh\b/,
  ];

  return patterns.some((pattern) =>
    pattern.test(text)
  );
}

/*
 * ========================================
 * DETEKSI OPEN ONLY
 * ========================================
 */

function isOpenOnlyRequest(message) {
  const text =
    typeof message === "string"
      ? message.toLowerCase().trim()
      : "";

  if (!text) {
    return false;
  }

  const startsWithOpen =
    /^(buka|bukakan|bukain|open|jalankan|launch)\b/.test(
      text
    );

  if (!startsWithOpen) {
    return false;
  }

  /*
   * Jika ada interaction, bukan open-only.
   */
  if (isBrowserInteractionRequest(text)) {
    return false;
  }

  /*
   * Contoh:
   *
   * buka Spotify
   * buka ChatGPT di laptop
   * buka YouTube
   *
   * = open only
   */

  return true;
}

/*
 * ========================================
 * OPEN SUCCESS MESSAGE
 * ========================================
 */

function createOpenSuccessMessage(result) {
  if (!result) {
    return "Sudah dibuka.";
  }

  if (result.type === "application") {
    if (result.application) {
      return `${result.application} sudah dibuka.`;
    }

    return "Aplikasi sudah dibuka.";
  }

  if (result.type === "url") {
    return "Halaman sudah dibuka.";
  }

  if (result.action === "open") {
    if (result.title) {
      return `${result.title} sudah dibuka.`;
    }

    return "Halaman sudah dibuka.";
  }

  if (result.success === true) {
    return "Sudah dibuka.";
  }

  return "Sudah dibuka.";
}

/*
 * ========================================
 * FAST ACTION RESULT MESSAGE
 * ========================================
 */

function createFastActionSuccessMessage(
  action,
  result
) {
  if (!result) {
    return "Selesai.";
  }

  if (action.type === "youtube_search") {
    return `YouTube dibuka dan pencarian "${action.query}" sudah dijalankan.`;
  }

  if (action.type === "open_application") {
    return createOpenSuccessMessage(result);
  }

  if (action.type === "browser_open") {
    return createOpenSuccessMessage(result);
  }

  return "Selesai.";
}

/*
 * ========================================
 * TOOL SIGNATURE
 * ========================================
 */

function createToolSignature(
  toolName,
  parameters
) {
  try {
    return `${toolName}:${JSON.stringify(
      parameters || {}
    )}`;
  } catch {
    return `${toolName}:${String(parameters)}`;
  }
}

/*
 * ========================================
 * TASK ACTION LABEL
 * ========================================
 */

function getTaskActionLabel(
  toolName,
  parameters = {}
) {
  const labels = {
    list_files:
      "Memeriksa file project",

    read_file: parameters.path
      ? `Membaca ${parameters.path}`
      : "Membaca file",

    create_file: parameters.path
      ? `Membuat ${parameters.path}`
      : "Membuat file",

    edit_file: parameters.path
      ? `Mengubah ${parameters.path}`
      : "Mengubah file",

    delete_file: parameters.path
      ? `Menghapus ${parameters.path}`
      : "Menghapus file",

    run_command:
      "Menjalankan command",

    open_application:
      parameters.application
        ? `Membuka ${parameters.application}`
        : "Membuka aplikasi",

    open_target:
      parameters.target
        ? `Membuka ${parameters.target}`
        : "Membuka file atau folder",

    browser_open:
      parameters.url
        ? `Membuka ${parameters.url}`
        : "Membuka halaman",

    browser_read:
      "Membaca halaman",

    browser_click:
      "Mengklik elemen",

    browser_type:
      "Mengisi input",

    browser_press:
      "Menekan tombol",

    browser_screenshot:
      "Mengambil screenshot",

    browser_list_tabs:
      "Memeriksa tab browser",

    browser_switch_tab:
      "Mengganti tab browser",

    screenshot:
      "Mengambil screenshot",

    visual_review:
      "Memeriksa tampilan",

    detect_dev_command:
      "Mendeteksi command development",

    start_dev_server:
      "Menjalankan development server",

    list_processes:
      "Memeriksa process",

    get_process:
      "Memeriksa process",

    stop_process:
      "Menghentikan process",
  };

  return (
    labels[toolName] ||
    `Menjalankan ${toolName}`
  );
}

/*
 * ========================================
 * BUILD SYSTEM MESSAGE
 * ========================================
 */

function buildSystemMessage({
  memoryContext,
  getToolsDescription,
  laptopAction,
  browserTask,
  browserInteraction,
  openOnly,
  browserTarget,
}) {
  const browserName =
    browserTarget || "browser default";

  return {
    role: "system",

    content: `
Kamu adalah Fanra, AI assistant dan coding agent pribadi.

GAYA KOMUNIKASI
========================================

- Gunakan Bahasa Indonesia yang natural.
- Untuk percakapan biasa, jawab seperti manusia.
- Jangan terdengar seperti robot.
- Jangan terlalu formal.
- Jangan membuat task untuk percakapan biasa.
- Jangan menyebut provider, API key, router, model,
  AbortController, TaskManager, atau detail internal.
- Jangan mengatakan "task berhasil" untuk percakapan biasa.
- Jika pertanyaan sederhana, jawab sederhana.

MEMORY FANRA
========================================

${memoryContext}

Gunakan memory jika relevan.

Jangan menganggap memory sebagai fakta jika tidak relevan.

TOOLS
========================================

${getToolsDescription()}

FORMAT TOOL
========================================

Gunakan format:

<tool>
nama_tool
{"parameter":"value"}
</tool>

Jangan mengarang nama tool.

Jangan mengarang hasil tool.

ATURAN UMUM
========================================

1. Jika user hanya ngobrol, jawab langsung.
2. Jika user meminta tindakan nyata, gunakan tool.
3. Jangan memberikan tutorial jika Fanra dapat melakukan
   tindakan tersebut secara langsung.
4. Jangan meminta konfirmasi untuk tindakan yang memang
   sudah diminta user.
5. Jangan mengklaim berhasil sebelum tool berhasil.
6. Jika tool gagal, baca error.
7. Jika memungkinkan, gunakan pendekatan lain.
8. Jangan mengulang tool dengan parameter yang sama
   jika sudah berhasil.
9. Jika tujuan sudah selesai, BERHENTI.
10. Jangan melakukan langkah tambahan yang tidak diperlukan.

ATURAN APLIKASI DESKTOP
========================================

Jika user meminta membuka aplikasi desktop:

gunakan:

<tool>
open_application
{"application":"Nama Aplikasi"}
</tool>

Contoh:

User:
"buka Spotify"

Gunakan:

<tool>
open_application
{"application":"Spotify"}
</tool>

User:
"buka ChatGPT di laptop"

Gunakan:

<tool>
open_application
{"application":"ChatGPT"}
</tool>

User:
"buka Brave"

Gunakan:

<tool>
open_application
{"application":"Brave"}
</tool>

JANGAN membuka website jika user jelas meminta
aplikasi desktop.

JANGAN menggunakan browser hanya karena nama aplikasi
tersebut memiliki versi web.

ATURAN BROWSER TARGET
========================================

Browser target user:

${browserName}

Jika user secara eksplisit menyebut:

- Brave → WAJIB Brave.
- Chrome → WAJIB Chrome.
- Edge → WAJIB Edge.
- Firefox → WAJIB Firefox.
- Opera → WAJIB Opera.

Jangan mengganti browser yang diminta user.

Contoh:

"buka YouTube di Brave"

berarti:

browser_open harus menggunakan Brave.

Bukan Chrome.

Contoh:

"buka Google di Edge"

berarti:

gunakan Edge.

ATURAN WEBSITE
========================================

Jika user hanya meminta membuka website:

gunakan browser_open.

Contoh:

"buka YouTube"

cukup buka YouTube.

JANGAN:

- browser_read
- browser_click
- browser_type
- mencari video

kecuali memang diminta.

Jika browser_open berhasil dan user hanya meminta
membuka halaman:

PEKERJAAN SELESAI.

ATURAN BROWSER INTERACTION
========================================

Jika user meminta:

- mencari sesuatu
- memilih sesuatu
- klik sesuatu
- mengetik sesuatu
- login
- download
- memutar media
- membuka hasil tertentu

gunakan Browser Controller.

Tools yang tersedia:

browser_open
browser_read
browser_click
browser_type
browser_press
browser_screenshot
browser_list_tabs
browser_switch_tab

Jangan mengarang isi halaman.

Jangan mengarang hasil pencarian.

ATURAN SEARCH
========================================

Jika user meminta mencari:

1. Buka halaman jika diperlukan.
2. Baca halaman.
3. Temukan input.
4. Ketik query.
5. Tekan Enter jika diperlukan.
6. Baca hasil.
7. Pilih hasil jika diperlukan.
8. Verifikasi.

Jangan berhenti sebelum tujuan tercapai.

ATURAN YOUTUBE
========================================

Jika user mengatakan:

"buka YouTube"

cukup buka YouTube.

Jika user mengatakan:

"cari video MrBeast"

maka lakukan pencarian.

Jika user mengatakan:

"putar video MrBeast"

maka cari dan buka video yang relevan,
kemudian lanjutkan sampai video benar-benar diputar
jika tool memungkinkan.

Jangan mengatakan PLAYING hanya karena halaman video
sudah terbuka.

Status harus dibedakan:

OPENED
FOUND
PLAYING

ATURAN SPOTIFY
========================================

Jika user mengatakan:

"buka Spotify"

dan tidak menyebut browser:

prioritaskan aplikasi desktop Spotify.

Jika user mengatakan:

"buka Spotify di Brave"

gunakan Brave.

Jika user mengatakan:

"putar lagu Sorai di Spotify"

lakukan workflow yang diperlukan.

ATURAN FOLDER DAN FILE
========================================

Untuk membuka folder atau file:

gunakan:

open_target

Untuk membaca isi project:

gunakan:

list_files
read_file

ATURAN PROCESS
========================================

Untuk melihat process:

list_processes

Untuk melihat process tertentu:

get_process

Untuk menghentikan process:

stop_process

Jangan mengarang PID.

ATURAN COMMAND
========================================

Untuk menjalankan command:

run_command

Jangan mengarang output command.

ATURAN CODING / PROJECT
========================================

Aturan workflow project hanya berlaku jika user memang
meminta coding atau pekerjaan project.

Workflow:

1. list_files
2. baca file yang relevan
3. edit/create file
4. install dependency jika perlu
5. build/test/lint
6. detect_dev_command jika frontend
7. start_dev_server
8. screenshot
9. visual_review
10. perbaiki jika ada masalah
11. verifikasi ulang
12. selesai

Jangan menjalankan workflow project untuk percakapan biasa.

DESAIN FRONTEND
========================================

Jika membuat atau memperbaiki frontend:

- modern
- clean
- responsive
- nyaman di HP
- typography bagus
- spacing konsisten
- alignment rapi
- tidak terlalu banyak card
- tidak terlalu banyak rounded corner
- jangan gradient berlebihan
- jangan terlihat seperti template AI generik
- jangan menggunakan terlalu banyak ikon tanpa alasan

STATUS
========================================

Jika sedang melakukan tool:

jelaskan status melalui tool/status system,
bukan dengan mengarang hasil.

Jangan mengirim penjelasan panjang sebelum pekerjaan selesai.

Jika pekerjaan selesai:

berikan jawaban final singkat dan natural.
`.trim(),
  };
}

/*
 * ========================================
 * CREATE AGENT
 * ========================================
 */

function createAgent(router) {
  return {
    async run(messages, options = {}) {
      const onStatus =
        options.onStatus ||
        (() => {});

      /*
       * ========================================
       * VALIDATE INPUT
       * ========================================
       */

      if (!Array.isArray(messages)) {
        messages = [
          {
            role: "user",
            content: String(messages || ""),
          },
        ];
      }

      /*
       * ========================================
       * CANCELLATION
       * ========================================
       */

      let cancelled = false;

      const agentController =
        new AbortController();

      const callerSignal =
        options?.signal;

      let callerAbortHandler = null;

      if (callerSignal) {
        if (callerSignal.aborted) {
          agentController.abort();
        } else if (
          typeof callerSignal.addEventListener ===
          "function"
        ) {
          callerAbortHandler = () => {
            if (
              !agentController.signal.aborted
            ) {
              agentController.abort();
            }
          };

          callerSignal.addEventListener(
            "abort",
            callerAbortHandler,
            {
              once: true,
            }
          );
        }
      }

      if (
        typeof options.onCancel ===
        "function"
      ) {
        options.onCancel(() => {
          cancelled = true;

          if (
            !agentController.signal.aborted
          ) {
            agentController.abort();
          }
        });
      }

      const cancellationOptions = {
        ...options,

        signal:
          agentController.signal,

        get cancelled() {
          return cancelled;
        },
      };

      /*
       * ========================================
       * CLEANUP CANCELLATION
       * ========================================
       */

      const cleanupCancellation =
        () => {
          if (
            callerSignal &&
            callerAbortHandler &&
            typeof callerSignal
              .removeEventListener ===
              "function"
          ) {
            callerSignal.removeEventListener(
              "abort",
              callerAbortHandler
            );

            callerAbortHandler = null;
          }
        };

      /*
       * ========================================
       * LAST USER MESSAGE
       * ========================================
       */

      const lastUserMessage =
        [...messages]
          .reverse()
          .find(
            (message) =>
              message.role === "user"
          )
          ?.content || "";

      /*
       * ========================================
       * INTENT DETECTION
       * ========================================
       */

      const taskLevel =
        detectTaskLevel(messages);

      const laptopAction =
        isLaptopActionRequest(
          lastUserMessage
        );

      const browserTask =
        laptopAction &&
        isBrowserTask(
          lastUserMessage
        );

      const browserInteraction =
        browserTask &&
        isBrowserInteractionRequest(
          lastUserMessage
        );

      const openOnly =
        laptopAction &&
        isOpenOnlyRequest(
          lastUserMessage
        );

      const browserTarget =
        extractBrowserTarget(
          lastUserMessage
        );

      /*
       * ========================================
       * SIMPLE CHAT
       * ========================================
       *
       * PENTING:
       * Tidak membuat task sama sekali.
       */

      if (
        taskLevel === "simple" &&
        !laptopAction &&
        !isSimpleConversation(lastUserMessage)
      ) {
        /*
         * Tetap simple chat.
         */
      }

      if (
        !laptopAction &&
        (
          taskLevel === "simple" ||
          isSimpleConversation(
            lastUserMessage
          )
        )
      ) {
        try {
          throwIfCancelled(
            cancellationOptions
          );

          onStatus({
            type: "chat",
          });

          const answer =
            await router.chat(
              messages,
              "simple",
              {
                onStatus,
                signal:
                  cancellationOptions.signal,
              }
            );

          throwIfCancelled(
            cancellationOptions
          );

          /*
           * Memory extraction tetap boleh,
           * tetapi tidak membuat task.
           */
          try {
            const memory =
              await extractMemory(
                router,
                lastUserMessage,
                answer
              );

            if (memory) {
              onStatus({
                type: "memory_saved",
                memory,
              });
            }
          } catch (error) {
            if (
              error?.name ===
              "AbortError"
            ) {
              throw error;
            }

            /*
             * Jangan ganggu chat hanya karena
             * memory gagal.
             */
          }

          return answer;
        } finally {
          cleanupCancellation();
        }
      }

      /*
       * ========================================
       * DETECT TYPE
       * ========================================
       */

      const detectedType =
        laptopAction
          ? browserTask
            ? "browser"
            : "laptop"
          : taskLevel === "hard"
            ? "hard"
            : taskLevel === "normal"
              ? "coding"
              : "general";

      throwIfCancelled(
        cancellationOptions
      );

      /*
       * ========================================
       * CREATE TASK
       * ========================================
       */

      const task =
        taskManager.createTask({
          command:
            lastUserMessage,

          type:
            detectedType,

          metadata: {
            taskLevel,

            laptopAction,

            browserTask,

            browserInteraction,

            openOnly,

            browserTarget,

            ...(
              options.taskMetadata ||
              {}
            ),
          },
        });

      const taskId =
        task.id;

      taskManager.startTask(
        taskId
      );

      /*
       * ========================================
       * TASK STATUS
       * ========================================
       */

      onStatus({
        type: "task",
        level: detectedType,
        taskId,
      });

      onStatus({
        type: "task_created",
        taskId,
        command:
          lastUserMessage,
        taskType:
          detectedType,
      });

      onStatus({
        type: "task_started",
        taskId,
      });

      /*
       * ========================================
       * INITIAL STEP
       * ========================================
       */

      taskManager.setStep(
        taskId,
        "planning",
        "Menentukan langkah berikutnya"
      );

      /*
       * ========================================
       * FAST ACTION
       * ========================================
       */

      const fastAction =
        detectFastAction(
          lastUserMessage
        );

      if (fastAction) {
        try {
          throwIfCancelled(
            cancellationOptions
          );

          taskManager.completeStep(
            taskId
          );

          taskManager.setStep(
            taskId,
            fastAction.type,
            "Menjalankan tindakan cepat"
          );

          onStatus({
            type: "fast_action",
            action:
              fastAction.type,
            query:
              fastAction.query,
            taskId,
          });

          const toolRegistry =
            createToolRegistry(
              router
            );

          const tool =
            toolRegistry.getTool(
              fastAction.type
            );

          if (!tool) {
            throw new Error(
              `Fast action membutuhkan tool yang tidak ditemukan: ${fastAction.type}`
            );
          }

          onStatus({
            type: "tool",
            tool:
              fastAction.type,
            taskId,
          });

          let result;

          try {
            result =
              await tool.execute(
                fastAction,
                cancellationOptions
              );

            throwIfCancelled(
              cancellationOptions
            );
          } catch (error) {
            if (
              error?.name ===
              "AbortError"
            ) {
              throw error;
            }

            result = {
              success: false,
              error:
                error?.message ||
                "Fast action gagal.",
            };
          }

          if (!result?.success) {
            taskManager.failStep(
              taskId,
              result?.error ||
                "Fast action gagal."
            );

            throw new Error(
              result?.error ||
                `Fast action gagal: ${fastAction.type}`
            );
          }

          taskManager.completeStep(
            taskId,
            result
          );

          const finalMessage =
            createFastActionSuccessMessage(
              fastAction,
              result
            );

          taskManager.completeTask(
            taskId,
            finalMessage
          );

          onStatus({
            type:
              "fast_action_success",
            action:
              fastAction.type,
            taskId,
          });

          onStatus({
            type:
              "task_completed",
            taskId,
            result:
              finalMessage,
          });

          return finalMessage;
        } catch (error) {
          if (
            error?.name ===
            "AbortError"
          ) {
            taskManager.cancelTask(
              taskId,
              "Task dibatalkan."
            );

            onStatus({
              type:
                "task_cancelled",
              taskId,
            });

            throw error;
          }

          taskManager.failTask(
            taskId,
            error
          );

          onStatus({
            type:
              "task_failed",
            taskId,
            error:
              error?.message ||
              "Task gagal.",
          });

          throw error;
        } finally {
          cleanupCancellation();
        }
      }

      /*
       * ========================================
       * MEMORY RETRIEVAL
       * ========================================
       */

      throwIfCancelled(
        cancellationOptions
      );

      let memories = [];

      try {
        memories =
          await getRelevantMemories(
            lastUserMessage,
            {
              limit: 10,
            }
          );
      } catch (error) {
        if (
          error?.name ===
          "AbortError"
        ) {
          throw error;
        }

        onStatus({
          type:
            "memory_error",
          message:
            error?.message ||
            "Memory error.",
          taskId,
        });
      }

      throwIfCancelled(
        cancellationOptions
      );

      const memoryContext =
        formatMemories(
          memories
        );

      /*
       * ========================================
       * TOOL REGISTRY
       * ========================================
       */

      const toolRegistry =
        createToolRegistry(
          router
        );

      const getTool =
        toolRegistry.getTool;

      const getToolsDescription =
        toolRegistry
          .getToolsDescription;

      /*
       * ========================================
       * SYSTEM MESSAGE
       * ========================================
       */

      const systemMessage =
        buildSystemMessage({
          memoryContext,
          getToolsDescription,
          laptopAction,
          browserTask,
          browserInteraction,
          openOnly,
          browserTarget,
        });

      /*
       * ========================================
       * CONVERSATION
       * ========================================
       */

      const conversation = [
        systemMessage,
        ...messages,
      ];

      /*
       * ========================================
       * WORKFLOW STATE
       * ========================================
       */

      const state = {
        listed: false,

        readFiles:
          new Set(),

        changedFiles: false,

        commandRun: false,

        devCommandDetected:
          false,

        serverStarted:
          false,

        screenshotTaken:
          false,

        visualReviewed:
          false,

        laptopAction,

        browserTask,

        browserInteraction,

        browserOpened:
          false,

        browserRead:
          false,

        browserInteracted:
          false,

        toolExecuted:
          false,

        toolHistory:
          new Map(),

        consecutiveFailures:
          0,
      };

      /*
       * ========================================
       * MAX STEPS
       * ========================================
       */

      const maxSteps =
        laptopAction ||
        browserTask
          ? 12
          : 15;

      /*
       * ========================================
       * AGENT LOOP
       * ========================================
       */

      try {
        for (
          let step = 0;
          step < maxSteps;
          step++
        ) {
          throwIfCancelled(
            cancellationOptions
          );

          /*
           * Close previous running step.
           */
          const activeTask =
            taskManager.getActiveTask(
              taskId
            );

          if (
            activeTask &&
            activeTask.steps?.length
          ) {
            const currentStep =
              [
                ...activeTask.steps,
              ]
                .reverse()
                .find(
                  (item) =>
                    item.status ===
                    "running"
                );

            if (
              currentStep
            ) {
              taskManager.completeStep(
                taskId
              );
            }
          }

          /*
           * Current agent step.
           */
          taskManager.setStep(
            taskId,
            `agent_step_${step + 1}`,
            "Menentukan langkah berikutnya"
          );

          taskManager.updateTask(
            taskId,
            {
              totalSteps:
                maxSteps,
            }
          );

          onStatus({
            type: "step",
            step:
              step + 1,
            maxSteps,
            taskId,
          });

          /*
           * ========================================
           * MODEL
           * ========================================
           */

          throwIfCancelled(
            cancellationOptions
          );

          const response =
            await router.chat(
              conversation,
              taskLevel,
              {
                onStatus,
                signal:
                  cancellationOptions.signal,
              }
            );

          throwIfCancelled(
            cancellationOptions
          );

          taskManager.completeStep(
            taskId,
            response
          );

          /*
           * ========================================
           * TOOL MATCH
           * ========================================
           *
           * Regex yang benar.
           */

          const toolMatch =
            typeof response === "string"
              ? response.match(
                  /<tool>\s*([\s\S]*?)\s*<\/tool>/i
                )
              : null;

          /*
           * ========================================
           * MODEL TIDAK MENGELUARKAN TOOL
           * ========================================
           */

          if (!toolMatch) {
            /*
             * Browser mode:
             * jika memang butuh interaction,
             * paksa model menggunakan browser tool.
             */
            if (
              state.browserTask &&
              state.browserInteraction &&
              !state.browserInteracted
            ) {
              conversation.push({
                role: "assistant",
                content:
                  response,
              });

              conversation.push({
                role: "user",
                content: `
PERINTAH AGENT:

Tujuan pengguna belum selesai.

Pengguna meminta tindakan nyata pada browser.

WAJIB menggunakan Browser Controller.

Browser yang diminta user:

${
  browserTarget ||
  "gunakan browser yang sesuai dengan tool"
}

Jangan memberikan jawaban final.

Gunakan tool yang diperlukan.

Jangan mengulang tool yang sudah berhasil
dengan parameter yang sama.
`.trim(),
              });

              continue;
            }

            /*
             * Laptop mode.
             */
            if (
              state.laptopAction &&
              !state.toolExecuted
            ) {
              conversation.push({
                role: "assistant",
                content:
                  response,
              });

              conversation.push({
                role: "user",
                content: `
PERINTAH AGENT:

Permintaan pengguna adalah tindakan nyata
pada laptop.

Kamu BELUM menjalankan tool.

WAJIB menggunakan tool yang sesuai.

Jika membuka aplikasi:

open_application

Jika membuka URL:

browser_open

Jika membuka file/folder:

open_target

Jika browser perlu berinteraksi:

browser_open
browser_read
browser_type
browser_press
browser_click

Jika melihat process:

list_processes

Jika melihat process tertentu:

get_process

Jika menghentikan process:

stop_process

Browser target user:

${
  browserTarget ||
  "tidak ditentukan"
}

Jangan mengarang hasil.

Jangan memberikan jawaban final
sebelum tindakan benar-benar dilakukan.
`.trim(),
              });

              continue;
            }

            /*
             * Project mode.
             */
            if (
              !state.laptopAction &&
              !state.listed
            ) {
              conversation.push({
                role: "assistant",
                content:
                  response,
              });

              conversation.push({
                role: "user",
                content:
                  "Workflow project belum dimulai. WAJIB gunakan list_files terlebih dahulu.",
              });

              continue;
            }

            /*
             * Project verification.
             */
            if (
              !state.laptopAction &&
              state.changedFiles &&
              !state.commandRun
            ) {
              conversation.push({
                role: "assistant",
                content:
                  response,
              });

              conversation.push({
                role: "user",
                content:
                  "Pekerjaan project belum diverifikasi. WAJIB gunakan run_command untuk build/test/lint yang relevan sebelum menyatakan selesai.",
              });

              continue;
            }

            /*
             * ========================================
             * MEMORY EXTRACTION
             * ========================================
             */

            throwIfCancelled(
              cancellationOptions
            );

            try {
              const memory =
                await extractMemory(
                  router,
                  lastUserMessage,
                  response
                );

              if (memory) {
                onStatus({
                  type:
                    "memory_saved",
                  memory,
                  taskId,
                });
              }
            } catch (error) {
              if (
                error?.name ===
                "AbortError"
              ) {
                throw error;
              }

              onStatus({
                type:
                  "memory_error",
                message:
                  error?.message ||
                  "Memory error.",
                taskId,
              });
            }

            throwIfCancelled(
              cancellationOptions
            );

            taskManager.completeTask(
              taskId,
              response
            );

            onStatus({
              type:
                "task_completed",
              taskId,
              result:
                response,
            });

            return response;
          }

          /*
           * ========================================
           * PARSE TOOL BLOCK
           * ========================================
           */

          const toolBlock =
            toolMatch[1].trim();

          const lines =
            toolBlock.split(
              /\r?\n/
            );

          const toolName =
            lines
              .shift()
              ?.trim();

          if (!toolName) {
            throw new Error(
              "Nama tool tidak ditemukan."
            );
          }

          /*
           * ========================================
           * PARSE JSON
           * ========================================
           */

          const jsonText =
            lines.join(
              "\n"
            ).trim();

          let parameters;

          try {
            parameters =
              JSON.parse(
                jsonText
              );
          } catch (error) {
            throw new Error(
              `Parameter tool tidak valid untuk ${toolName}: ${error.message}`
            );
          }

          /*
           * ========================================
           * GET TOOL
           * ========================================
           */

          const tool =
            getTool(
              toolName
            );

          if (!tool) {
            throw new Error(
              `Tool tidak ditemukan: ${toolName}`
            );
          }

          throwIfCancelled(
            cancellationOptions
          );

          /*
           * ========================================
           * TOOL SIGNATURE
           * ========================================
           */

          const signature =
            createToolSignature(
              toolName,
              parameters
            );

          const previousCount =
            state.toolHistory.get(
              signature
            ) || 0;

          /*
           * ========================================
           * ANTI LOOP
           * ========================================
           */

          if (
            previousCount >= 2
          ) {
            onStatus({
              type:
                "tool_blocked",
              tool:
                toolName,
              reason:
                "Tool yang sama dengan parameter yang sama sudah dijalankan terlalu sering.",
              taskId,
            });

            conversation.push({
              role: "assistant",
              content:
                response,
            });

            conversation.push({
              role: "user",
              content: `
ANTI-LOOP:

Tool ${toolName} dengan parameter:

${JSON.stringify(
  parameters,
  null,
  2
)}

sudah dijalankan terlalu sering.

JANGAN gunakan tool tersebut lagi
dengan parameter yang sama.

Cari pendekatan lain.

Jika tujuan sebenarnya sudah tercapai,
berikan jawaban final.
`.trim(),
            });

            continue;
          }

          /*
           * ========================================
           * PROJECT WORKFLOW GUARDS
           * ========================================
           */

          if (
            toolName ===
              "start_dev_server" &&
            !state.laptopAction &&
            !state.listed
          ) {
            conversation.push({
              role: "assistant",
              content:
                response,
            });

            conversation.push({
              role: "user",
              content:
                "Tool start_dev_server ditolak. Jalankan list_files terlebih dahulu.",
            });

            continue;
          }

          if (
            toolName ===
              "start_dev_server" &&
            !state.laptopAction &&
            state.changedFiles &&
            !state.commandRun
          ) {
            conversation.push({
              role: "assistant",
              content:
                response,
            });

            conversation.push({
              role: "user",
              content:
                "Tool start_dev_server ditolak. Jalankan run_command untuk verifikasi terlebih dahulu.",
            });

            continue;
          }

          /*
           * ========================================
           * SCREENSHOT GUARD
           * ========================================
           */

          if (
            toolName ===
              "screenshot" &&
            !state.serverStarted
          ) {
            conversation.push({
              role: "assistant",
              content:
                response,
            });

            conversation.push({
              role: "user",
              content:
                "Tool screenshot ditolak. Development server belum berhasil dijalankan.",
            });

            continue;
          }

          /*
           * ========================================
           * VISUAL REVIEW GUARD
           * ========================================
           */

          if (
            toolName ===
              "visual_review" &&
            !state.screenshotTaken
          ) {
            conversation.push({
              role: "assistant",
              content:
                response,
            });

            conversation.push({
              role: "user",
              content:
                "Tool visual_review ditolak. Screenshot belum diambil.",
            });

            continue;
          }

          /*
           * ========================================
           * TASK STEP
           * ========================================
           */

          const actionLabel =
            getTaskActionLabel(
              toolName,
              parameters
            );

          taskManager.setStep(
            taskId,
            toolName,
            actionLabel
          );

          onStatus({
            type: "tool",
            tool:
              toolName,
            taskId,
            action:
              actionLabel,
          });

          /*
           * ========================================
           * EXECUTE TOOL
           * ========================================
           */

          let result;

          try {
            throwIfCancelled(
              cancellationOptions
            );

            result =
              await tool.execute(
                parameters,
                cancellationOptions
              );

            throwIfCancelled(
              cancellationOptions
            );
          } catch (error) {
            if (
              error?.name ===
              "AbortError"
            ) {
              throw error;
            }

            result = {
              success: false,
              error:
                error?.message ||
                "Tool gagal.",
            };
          }

          /*
           * ========================================
           * UPDATE TOOL HISTORY
           * ========================================
           */

          const newCount =
            previousCount + 1;

          state.toolHistory.set(
            signature,
            newCount
          );

          /*
           * ========================================
           * TOOL FAILED
           * ========================================
           */

          if (
            result?.success ===
            false
          ) {
            state.consecutiveFailures +=
              1;

            taskManager.failStep(
              taskId,
              result?.error ||
                "Tool gagal."
            );

            onStatus({
              type:
                "tool_failed",
              tool:
                toolName,
              error:
                result?.error ||
                "Tool gagal.",
              taskId,
            });

            if (
              state.consecutiveFailures >=
              3
            ) {
              throw new Error(
                `Agent berhenti karena tool gagal ${state.consecutiveFailures} kali berturut-turut. Terakhir: ${
                  result?.error ||
                  "Tool gagal."
                }`
              );
            }
          } else {
            state.consecutiveFailures =
              0;

            taskManager.completeStep(
              taskId,
              result
            );

            onStatus({
              type:
                "tool_success",
              tool:
                toolName,
              taskId,
            });
          }

          /*
           * ========================================
           * TOOL EXECUTED
           * ========================================
           */

          state.toolExecuted =
            true;

          /*
           * ========================================
           * BROWSER STATE
           * ========================================
           */

          if (
            toolName ===
              "browser_open" &&
            result?.success
          ) {
            state.browserOpened =
              true;
          }

          if (
            toolName ===
              "browser_read" &&
            result?.success
          ) {
            state.browserRead =
              true;
          }

          if (
            (
              toolName ===
                "browser_click" ||
              toolName ===
                "browser_type" ||
              toolName ===
                "browser_press"
            ) &&
            result?.success
          ) {
            state.browserInteracted =
              true;
          }

          /*
           * ========================================
           * PROJECT STATE
           * ========================================
           */

          if (
            toolName ===
              "list_files" &&
            result?.success !==
              false
          ) {
            state.listed =
              true;
          }

          if (
            toolName ===
              "read_file" &&
            result?.success !==
              false
          ) {
            if (
              parameters?.path
            ) {
              state.readFiles.add(
                parameters.path
              );
            }
          }

          if (
            (
              toolName ===
                "edit_file" ||
              toolName ===
                "create_file"
            ) &&
            result?.success !==
              false
          ) {
            state.changedFiles =
              true;
          }

          if (
            toolName ===
              "run_command" &&
            result?.success !==
              false
          ) {
            state.commandRun =
              true;
          }

          if (
            toolName ===
              "detect_dev_command" &&
            result?.success
          ) {
            state.devCommandDetected =
              true;
          }

          if (
            toolName ===
              "start_dev_server" &&
            result?.success
          ) {
            state.serverStarted =
              true;
          }

          if (
            toolName ===
              "screenshot" &&
            result?.success
          ) {
            state.screenshotTaken =
              true;
          }

          if (
            toolName ===
              "visual_review" &&
            result?.success
          ) {
            state.visualReviewed =
              true;
          }

          throwIfCancelled(
            cancellationOptions
          );

          /*
           * ========================================
           * IMMEDIATE STOP: OPEN ONLY
           * ========================================
           */

          if (
            result?.success &&
            openOnly &&
            (
              toolName ===
                "browser_open" ||
              toolName ===
                "open_application" ||
              toolName ===
                "open_target"
            )
          ) {
            const finalMessage =
              createOpenSuccessMessage(
                result
              );

            taskManager.completeTask(
              taskId,
              finalMessage
            );

            onStatus({
              type:
                "task_completed",
              taskId,
              result:
                finalMessage,
            });

            return finalMessage;
          }

          /*
           * ========================================
           * BROWSER OPEN TANPA INTERACTION
           * ========================================
           */

          if (
            result?.success &&
            toolName ===
              "browser_open" &&
            state.browserTask &&
            !state.browserInteraction
          ) {
            const finalMessage =
              createOpenSuccessMessage(
                result
              );

            taskManager.completeTask(
              taskId,
              finalMessage
            );

            onStatus({
              type:
                "task_completed",
              taskId,
              result:
                finalMessage,
            });

            return finalMessage;
          }

          /*
           * ========================================
           * TOOL RESULT TO CONVERSATION
           * ========================================
           */

          conversation.push({
            role: "assistant",
            content:
              response,
          });

          conversation.push({
            role: "user",
            content: `
Hasil tool ${toolName}:

${JSON.stringify(
  result,
  null,
  2
)}

STATE WORKFLOW:

${JSON.stringify(
  {
    listed:
      state.listed,

    readFiles:
      [
        ...state.readFiles,
      ],

    changedFiles:
      state.changedFiles,

    commandRun:
      state.commandRun,

    devCommandDetected:
      state.devCommandDetected,

    serverStarted:
      state.serverStarted,

    screenshotTaken:
      state.screenshotTaken,

    visualReviewed:
      state.visualReviewed,

    laptopAction:
      state.laptopAction,

    browserTask:
      state.browserTask,

    browserInteraction:
      state.browserInteraction,

    browserOpened:
      state.browserOpened,

    browserRead:
      state.browserRead,

    browserInteracted:
      state.browserInteracted,

    toolExecuted:
      state.toolExecuted,

    consecutiveFailures:
      state.consecutiveFailures,
  },
  null,
  2
)}

BROWSER TARGET:

${
  browserTarget ||
  "tidak ditentukan"
}

Gunakan hasil tool tersebut untuk menentukan
langkah berikutnya.

Jangan mengarang hasil yang tidak diberikan tool.

Jika permintaan pengguna sudah benar-benar
berhasil dilakukan, berikan jawaban final.

Jika belum berhasil, gunakan tool berikutnya
yang diperlukan.

JANGAN mengulang tool yang sudah berhasil
dengan parameter yang sama.

Jika tool gagal berulang kali, jangan terus
mengulang tanpa alasan.

ATURAN OPEN ONLY:

Jika user hanya meminta membuka aplikasi,
folder, file, atau halaman:

dan tool sudah berhasil:

SELESAI.

ATURAN BROWSER:

Jika hanya diminta membuka halaman dan
browser_open berhasil:

SELESAI.

Jika diminta mencari, memilih, membuka konten,
atau memutar media:

lanjutkan workflow sampai tujuan tercapai.

Jangan melakukan langkah tambahan yang
tidak diperlukan.
`.trim(),
          });
        }

        /*
         * ========================================
         * MAX STEPS REACHED
         * ========================================
         */

        throw new Error(
          `Agent berhenti setelah mencapai batas ${maxSteps} langkah.`
        );
      } catch (error) {
        /*
         * ========================================
         * TASK ERROR / CANCEL
         * ========================================
         */

        if (
          error?.name ===
            "AbortError" ||
          isCancelled(
            cancellationOptions
          )
        ) {
          taskManager.cancelTask(
            taskId,
            "Task dibatalkan."
          );

          onStatus({
            type:
              "task_cancelled",
            taskId,
          });
        } else {
          taskManager.failTask(
            taskId,
            error
          );

          onStatus({
            type:
              "task_failed",
            taskId,
            error:
              error?.message ||
              "Task gagal.",
          });
        }

        throw error;
      } finally {
        cleanupCancellation();
      }
    },
  };
}

/*
 * ========================================
 * EXPORT
 * ========================================
 */

module.exports = {
  createAgent,

  isLaptopActionRequest,

  isBrowserTask,

  isBrowserInteractionRequest,

  isOpenOnlyRequest,

  extractBrowserTarget,

  isSimpleConversation,
};