const { readFile } = require("./read_file");
const { listFiles } = require("./list_files");
const { listDirectory } = require("./list_directory");

const {
  startProcess,
  listProcesses,
  getProcess,
  stopProcess,
} = require("./process_manager");

const { editFile } = require("./edit_file");
const { createFile } = require("./create_file");
const { runCommand } = require("./run_command");

const { openTarget } = require("./open");
const { openApplication } = require("./app_launcher");

const {
  browserOpen,
  browserRead,
  browserClick,
  browserType,
  browserPress,
  browserScreenshot,
  browserListTabs,
  browserSwitchTab,
} = require("./browser_controller");

const { startDevServer } = require("./start_dev_server");
const { detectDevCommand } = require("./detect_dev_command");

const { execute: screenshot } = require("./screenshot");

const {
  createVisualReviewTool,
} = require("./visual_review");


function createToolRegistry(router) {
  const visualReview =
    createVisualReviewTool(router);


  const tools = {

    read_file: {
      description:
        "Membaca isi file dari workspace project yang ditentukan.",

      execute: ({ path }) =>
        readFile(path),
    },


    list_files: {
      description:
        "Melihat daftar file dan folder dari workspace project yang ditentukan.",

      execute: ({ path = "." }) =>
        listFiles(path),
    },


    list_directory: {
      description:
        "Melihat isi folder pada workspace laptop Fanra.",

      execute: ({ path = "." }) =>
        listDirectory(path),
    },


    edit_file: {
      description:
        "Mengganti seluruh isi file dari workspace project yang ditentukan. Membuat backup sebelum perubahan.",

      execute: ({ path, content }) =>
        editFile(path, content),
    },


    create_file: {
      description:
        "Membuat file baru di workspace project yang ditentukan. Gagal jika file sudah ada.",

      execute: ({ path, content }) =>
        createFile(path, content),
    },


    run_command: {
      description:
        "Menjalankan command di workspace project yang ditentukan dan mengembalikan stdout, stderr, serta exit code. Command melewati Safety Layer Fanra.",

      execute: ({ command, path = "." }) =>
        runCommand(command, path),
    },


    start_process: {
      description:
        "Menjalankan process di dalam workspace Fanra dan mengembalikan PID.",

      execute: ({ command, path = "." }) =>
        startProcess(command, path),
    },


    list_processes: {
      description:
        "Melihat process yang sedang dikelola oleh Fanra.",

      execute: () =>
        listProcesses(),
    },


    get_process: {
      description:
        "Melihat status process Fanra berdasarkan PID.",

      execute: ({ pid }) =>
        getProcess(pid),
    },


    stop_process: {
      description:
        "Menghentikan process Fanra berdasarkan PID.",

      execute: ({ pid }) =>
        stopProcess(pid),
    },


    open_application: {
      description:
        "Membuka aplikasi Windows berdasarkan nama aplikasi seperti Chrome, Brave, Spotify, Notepad, Discord, ChatGPT, atau VS Code.",

      execute: ({ application }) =>
        openApplication(application),
    },


    open_target: {
      description:
        "Membuka aplikasi Windows, file, folder, atau URL menggunakan Windows Shell.",

      execute: ({ target }) =>
        openTarget(target),
    },


    /*
     * ========================================
     * BROWSER
     * ========================================
     */

    browser_open: {
      description:
        "Membuka URL menggunakan browser yang dikontrol Fanra. Gunakan parameter browser jika pengguna secara eksplisit meminta Brave, Chrome, atau Edge. Contoh browser='brave'.",

      execute: (
        {
          url,
          browser,
          browserName,
        },
        options = {}
      ) =>
        browserOpen(
          url,
          {
            ...options,
            browser:
              browser ||
              browserName ||
              options.browser ||
              options.browserName,
          }
        ),
    },


    browser_read: {
      description:
        "Membaca isi halaman browser aktif untuk mengetahui teks, link, hasil pencarian, video, atau informasi lain yang terlihat.",

      execute: (
        {
          browser,
          browserName,
        } = {},
        options = {}
      ) =>
        browserRead({
          ...options,
          browser:
            browser ||
            browserName ||
            options.browser ||
            options.browserName,
        }),
    },


    browser_click: {
      description:
        "Mengklik elemen tertentu pada halaman browser menggunakan CSS selector.",

      execute: (
        {
          selector,
          browser,
          browserName,
        },
        options = {}
      ) =>
        browserClick(
          selector,
          {
            ...options,
            browser:
              browser ||
              browserName ||
              options.browser ||
              options.browserName,
          }
        ),
    },


    browser_type: {
      description:
        "Mengisi teks ke input tertentu pada halaman browser.",

      execute: (
        {
          selector,
          text,
          browser,
          browserName,
        },
        options = {}
      ) =>
        browserType(
          selector,
          text,
          {
            ...options,
            browser:
              browser ||
              browserName ||
              options.browser ||
              options.browserName,
          }
        ),
    },


    browser_press: {
      description:
        "Menekan tombol keyboard pada elemen tertentu di browser.",

      execute: (
        {
          selector,
          key,
          browser,
          browserName,
        },
        options = {}
      ) =>
        browserPress(
          selector,
          key,
          {
            ...options,
            browser:
              browser ||
              browserName ||
              options.browser ||
              options.browserName,
          }
        ),
    },


    browser_screenshot: {
      description:
        "Mengambil screenshot halaman browser yang sedang aktif.",

      execute: (
        {
          path,
          browser,
          browserName,
        },
        options = {}
      ) =>
        browserScreenshot(
          path,
          {
            ...options,
            browser:
              browser ||
              browserName ||
              options.browser ||
              options.browserName,
          }
        ),
    },


    browser_list_tabs: {
      description:
        "Melihat semua tab browser yang sedang dikelola Fanra, termasuk URL, judul, dan index tab.",

      execute: (
        {
          browser,
          browserName,
        } = {},
        options = {}
      ) =>
        browserListTabs({
          ...options,
          browser:
            browser ||
            browserName ||
            options.browser ||
            options.browserName,
        }),
    },


    browser_switch_tab: {
      description:
        "Memilih dan membawa tab browser tertentu ke depan berdasarkan index.",

      execute: (
        {
          index,
          browser,
          browserName,
        },
        options = {}
      ) =>
        browserSwitchTab(
          index,
          {
            ...options,
            browser:
              browser ||
              browserName ||
              options.browser ||
              options.browserName,
          }
        ),
    },


    /*
     * ========================================
     * MEDIA
     * ========================================
     */

    youtube_play: {
      description:
        "Mencari lagu atau video di YouTube dan memutar hasil yang paling relevan berdasarkan query pengguna.",

      execute: (
        { query },
        options = {}
      ) => {
        throw new Error(
          "Tool youtube_play belum diimplementasikan."
        );
      },
    },


    /*
     * ========================================
     * DEVELOPMENT
     * ========================================
     */

    start_dev_server: {
      description:
        "Menjalankan development server dari workspace project yang ditentukan dan mendeteksi URL localhost.",

      execute: ({
        command,
        path = ".",
      }) =>
        startDevServer(
          command,
          path
        ),
    },


    detect_dev_command: {
      description:
        "Mendeteksi command development dari package.json pada workspace project yang ditentukan.",

      execute: ({
        path = ".",
      }) =>
        detectDevCommand({
          path,
        }),
    },


    screenshot: {
      description:
        "Mengambil screenshot halaman website dari URL localhost yang sedang berjalan.",

      execute: ({
        url,
      }) =>
        screenshot({
          url,
        }),
    },


    visual_review:
      visualReview,
  };


  return {

    tools,


    getTool(name) {
      return tools[name];
    },


    getToolsDescription() {
      return Object.entries(
        tools
      )
        .map(
          ([name, tool]) =>
            `${name}: ${tool.description}`
        )
        .join("\n");
    },

  };
}


module.exports = {
  createToolRegistry,
};