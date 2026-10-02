require("dotenv").config();

const readline = require("readline");
const chalk = require("chalk");
const ora = require("ora");

const { createGeminiProvider } = require("./providers/gemini");
const { createGroqProvider } = require("./providers/groq");
const { createOpenRouterProvider } = require("./providers/openrouter");
const { createRouter } = require("./router");
const { createAgent } = require("./agent");


/*
 * ========================================
 * API KEYS
 * ========================================
 */

const geminiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
].filter(Boolean);


if (geminiKeys.length === 0) {
  console.error(
    chalk.red(
      "\nTidak ada Gemini API key di .env\n"
    )
  );

  process.exit(1);
}


/*
 * ========================================
 * MODELS
 * ========================================
 */

const models = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
];


const providers = [];


for (let i = 0; i < geminiKeys.length; i++) {
  for (const model of models) {
    providers.push(
      createGeminiProvider(
        geminiKeys[i],
        model,
        `Gemini Key ${i + 1}`
      )
    );
  }
}


/*
 * ========================================
 * GROQ
 * ========================================
 */

const groqApiKey =
  process.env.GROQ_API_KEY;


if (groqApiKey) {
  providers.push(
    createGroqProvider(
      groqApiKey,
      "llama-3.3-70b-versatile"
    )
  );
}


/*
 * ========================================
 * OPENROUTER
 * ========================================
 */

const openRouterApiKey =
  process.env.OPENROUTER_API_KEY;


if (openRouterApiKey) {
  providers.push(
    createOpenRouterProvider(
      openRouterApiKey,
      "openai/gpt-4o-mini"
    )
  );
}


/*
 * ========================================
 * ROUTER + AGENT
 * ========================================
 */

const router =
  createRouter(providers);


const agent =
  createAgent(router);


/*
 * ========================================
 * STATUS UI
 * ========================================
 */

function createAgentStatus() {
  let spinner = null;


  function start(text) {
    if (!spinner) {
      spinner =
        ora(text).start();
    } else {
      spinner.text =
        text;
    }
  }


  function status(data) {
    switch (data.type) {
      case "task":
        start(
          `Menganalisis tugas (${data.level})`
        );
        break;


      case "level":
        start(
          `Task level: ${data.level}`
        );
        break;


      case "step":
        start(
          `Langkah ${data.step}/${data.maxSteps}`
        );
        break;


      case "provider":
        start(
          `Menggunakan ${data.provider}`
        );
        break;


      case "fallback":
        start(
          `Fallback dari ${data.provider}: ${
            data.error || "unknown error"
          }`
        );
        break;


      case "tool":
        start(
          `Menjalankan ${data.tool}`
        );
        break;


      case "cancel":
        start(
          "Membatalkan task..."
        );
        break;


      case "success":
        start(
          `Selesai dengan ${data.provider}`
        );
        break;
    }
  }


  function finish() {
    if (spinner) {
      spinner.stop();

      spinner = null;
    }
  }


  return {
    status,
    finish,
  };
}


/*
 * ========================================
 * HEADER
 * ========================================
 */

function printHeader() {
  console.clear();


  console.log("");


  console.log(
    chalk.bold.cyan("  FANRA")
  );


  console.log(
    chalk.gray("  AI Coding Agent")
  );


  console.log("");


  console.log(
    chalk.gray("  Gemini ") +
      chalk.white(
        `${geminiKeys.length} key`
      ) +
      chalk.gray("  •  ") +
      chalk.green("Ready")
  );


  console.log(
    chalk.gray("  Providers ") +
      chalk.white(
        `${providers.length}`
      ) +
      chalk.gray("  •  ") +
      chalk.green("Ready")
  );


  console.log("");


  console.log(
    chalk.gray("  ") +
      chalk.white("/cancel") +
      chalk.gray(
        " batalkan task"
      )
  );


  console.log(
    chalk.gray("  ") +
      chalk.white("/exit") +
      chalk.gray(
        " keluar"
      )
  );


  console.log("");
}


/*
 * ========================================
 * MAIN
 * ========================================
 */

async function main() {
  printHeader();


  const rl =
    readline.createInterface({
      input:
        process.stdin,

      output:
        process.stdout,

      prompt:
        chalk.cyan("> "),
    });


  const messages = [];


  let activeTask = null;


  let exiting = false;


  rl.prompt();


  /*
   * ======================================
   * CTRL + C
   * ======================================
   */

  rl.on("SIGINT", () => {
    if (activeTask) {
      console.log("");


      console.log(
        chalk.yellow(
          "Membatalkan task..."
        )
      );


      activeTask.cancelled = true;


      if (
        activeTask.controller
      ) {
        activeTask.controller.abort();
      }


      if (
        typeof activeTask.cancel ===
        "function"
      ) {
        activeTask.cancel();
      }


      return;
    }


    console.log("");


    console.log(
      chalk.gray(
        "Gunakan /exit untuk keluar dari Fanra."
      )
    );


    console.log("");


    rl.prompt();
  });


  /*
   * ======================================
   * INPUT
   * ======================================
   */

  rl.on(
    "line",
    async (input) => {
      const text =
        input.trim();


      if (!text) {
        rl.prompt();

        return;
      }


      /*
       * ====================================
       * EXIT
       * ====================================
       */

      if (text === "/exit") {
        exiting = true;


        if (activeTask) {
          activeTask.cancelled =
            true;


          if (
            activeTask.controller
          ) {
            activeTask.controller.abort();
          }


          if (
            typeof activeTask.cancel ===
            "function"
          ) {
            activeTask.cancel();
          }
        }


        rl.close();

        return;
      }


      /*
       * ====================================
       * CANCEL
       * ====================================
       */

      if (text === "/cancel") {
        if (!activeTask) {
          console.log("");


          console.log(
            chalk.gray(
              "Tidak ada task yang sedang berjalan."
            )
          );


          console.log("");


          rl.prompt();

          return;
        }


        console.log("");


        console.log(
          chalk.yellow(
            "Membatalkan task..."
          )
        );


        activeTask.cancelled =
          true;


        if (
          activeTask.controller
        ) {
          activeTask.controller.abort();
        }


        if (
          typeof activeTask.cancel ===
          "function"
        ) {
          activeTask.cancel();
        }


        return;
      }


      /*
       * ====================================
       * TASK MASIH BERJALAN
       * ====================================
       */

      if (activeTask) {
        console.log("");


        console.log(
          chalk.yellow(
            "Fanra masih menjalankan task."
          )
        );


        console.log(
          chalk.gray(
            "Gunakan /cancel untuk membatalkannya."
          )
        );


        console.log("");


        rl.prompt();

        return;
      }


      /*
       * ====================================
       * TASK BARU
       * ====================================
       */

      messages.push({
        role: "user",
        content: text,
      });


      const status =
        createAgentStatus();


      const controller =
        new AbortController();


      const taskController = {
        cancelled: false,

        controller,

        cancel() {},
      };


      activeTask =
        taskController;


      try {
        /*
         * JANGAN rl.pause()
         *
         * Input tetap aktif supaya
         * /cancel dan /exit bisa masuk.
         */

        const answer =
          await agent.run(
            messages,
            {
              onStatus:
                status.status,

              signal:
                controller.signal,

              onCancel(callback) {
                taskController.cancel =
                  callback;
              },
            }
          );


        status.finish();


        /*
         * ==================================
         * TASK DIBATALKAN
         * ==================================
         */

        if (
          taskController.cancelled ||
          controller.signal.aborted
        ) {
          console.log("");


          console.log(
            chalk.yellow(
              "Task dibatalkan."
            )
          );


          console.log("");

          return;
        }


        /*
         * ==================================
         * TASK SELESAI
         * ==================================
         */

        messages.push({
          role: "assistant",
          content: answer,
        });


        console.log("");


        console.log(answer);


        console.log("");
      } catch (error) {
        status.finish();


        /*
         * ==================================
         * CANCELLATION ERROR
         * ==================================
         */

        if (
          taskController.cancelled ||
          controller.signal.aborted ||
          error?.name ===
            "AbortError" ||
          error?.code ===
            "ABORT_ERR"
        ) {
          console.log("");


          console.log(
            chalk.yellow(
              "Task dibatalkan."
            )
          );


          console.log("");

          return;
        }


        /*
         * ==================================
         * NORMAL ERROR
         * ==================================
         */

        console.log("");


        console.log(
          chalk.red("Error:")
        );


        console.log(
          chalk.red(
            error.message
          )
        );


        console.log("");
      } finally {
        activeTask = null;


        if (!exiting) {
          rl.prompt();
        }
      }
    }
  );


  /*
   * ========================================
   * CLOSE
   * ========================================
   */

  rl.on("close", () => {
    process.exit(0);
  });
}


/*
 * ========================================
 * START
 * ========================================
 */

main().catch((error) => {
  console.error(
    chalk.red(
      error.message
    )
  );

  process.exit(1);
});