function detectTaskLevel(messages) {
  const lastUserMessage =
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "user"
      )
      ?.content?.toLowerCase() || "";


  const hardPatterns = [
    "debug",
    "debugging",
    "bug",
    "error",
    "arsitektur",
    "architecture",
    "refactor",
    "optimasi",
    "optimize",
    "security",
    "keamanan",
    "analisis kode",
    "analyze code",
    "database",
    "authentication",
    "authorization",
    "integrasi",
    "integration",
  ];


  const laptopPatterns = [
    "process",
    "proses",
    "laptop",
    "komputer",
    "computer",
    "folder",
    "file",
    "cek status",
    "jalankan",
    "hentikan",
    "matikan",
    "pid",
    "server",
    "terminal",
    "command",
    "perintah",
    "task manager",
    "program yang berjalan",
    "aplikasi yang berjalan",
  ];


  const normalPatterns = [
    "buatkan kode",
    "buat kode",
    "coding",
    "program",
    "fungsi",
    "function",
    "component",
    "komponen",
    "javascript",
    "typescript",
    "node",
    "python",
    "api",
    "endpoint",
    "html",
    "css",
    "fitur",
    "implementasi",
    "implement",
    "aplikasi",
    "website",
    "web",
  ];


  if (
    hardPatterns.some((pattern) =>
      lastUserMessage.includes(pattern)
    )
  ) {
    return "hard";
  }


  if (
    laptopPatterns.some((pattern) =>
      lastUserMessage.includes(pattern)
    )
  ) {
    return "normal";
  }


  if (
    normalPatterns.some((pattern) =>
      lastUserMessage.includes(pattern)
    )
  ) {
    return "normal";
  }


  return "simple";
}


/*
 * ========================================
 * CANCELLATION
 * ========================================
 */

function isAborted(options = {}) {
  return (
    options?.signal?.aborted === true
  );
}


function throwIfAborted(options = {}) {
  if (isAborted(options)) {
    const error =
      new Error(
        "Task dibatalkan."
      );

    error.name =
      "AbortError";

    throw error;
  }
}


/*
 * ========================================
 * ERROR HELPER
 * ========================================
 */

function getErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }


  const message =
    error?.message ||
    String(error);


  return message
    .replace(/\s+/g, " ")
    .slice(0, 240);
}


/*
 * ========================================
 * ROUTER
 * ========================================
 */

function createRouter(providers) {
  return {
    async chat(
      messages,
      taskLevel = null,
      options = {}
    ) {
      const onStatus =
        options.onStatus ||
        (() => {});


      throwIfAborted(options);


      const level =
        taskLevel ||
        detectTaskLevel(messages);


      onStatus({
        type: "level",
        level,
      });


      const modelOrder = {
        simple: [
          "gemini-3.1-flash-lite",
          "gemini-3.8-flash",
          "gemini-3.1-pro-preview",
        ],

        normal: [
          "gemini-3.8-flash",
          "gemini-3.1-pro-preview",
          "gemini-3.1-flash-lite",
        ],

        hard: [
          "gemini-3.1-pro-preview",
          "gemini-3.8-flash",
          "gemini-3.1-flash-lite",
        ],
      };


      const preferredModels =
        modelOrder[level] ||
        modelOrder.simple;


      let lastError;


      /*
       * ========================================
       * GEMINI
       * ========================================
       */

      for (
        const model of preferredModels
      ) {
        throwIfAborted(options);


        const matchingProviders =
          providers.filter(
            (provider) =>
              provider.provider !== "groq" &&
              provider.provider !== "openrouter" &&
              provider.model === model
          );


        for (
          const provider of matchingProviders
        ) {
          throwIfAborted(options);


          try {
            onStatus({
              type: "provider",
              provider:
                provider.name,
            });


            const result =
              await provider.chat(
                messages,
                options
              );


            throwIfAborted(options);


            onStatus({
              type: "success",
              provider:
                provider.name,
            });


            return result;
          } catch (error) {
            if (
              error?.name ===
                "AbortError" ||
              isAborted(options)
            ) {
              const abortError =
                new Error(
                  "Task dibatalkan."
                );

              abortError.name =
                "AbortError";

              throw abortError;
            }


            lastError = error;


            onStatus({
              type: "fallback",
              provider:
                provider.name,

              error:
                getErrorMessage(error),
            });
          }
        }
      }


      /*
       * ========================================
       * GROQ
       * ========================================
       */

      throwIfAborted(options);


      const groqProviders =
        providers.filter(
          (provider) =>
            provider.provider ===
            "groq"
        );


      for (
        const provider of groqProviders
      ) {
        throwIfAborted(options);


        try {
          onStatus({
            type: "provider",
            provider:
              provider.name,
          });


          const result =
            await provider.chat(
              messages,
              options
            );


          throwIfAborted(options);


          onStatus({
            type: "success",
            provider:
              provider.name,
          });


          return result;
        } catch (error) {
          if (
            error?.name ===
              "AbortError" ||
            isAborted(options)
          ) {
            const abortError =
              new Error(
                "Task dibatalkan."
              );

            abortError.name =
              "AbortError";

            throw abortError;
          }


          lastError = error;


          onStatus({
            type: "fallback",
            provider:
              provider.name,

            error:
              getErrorMessage(error),
          });
        }
      }


      /*
       * ========================================
       * OPENROUTER
       * ========================================
       */

      throwIfAborted(options);


      const openRouterProviders =
        providers.filter(
          (provider) =>
            provider.provider ===
            "openrouter"
        );


      for (
        const provider of openRouterProviders
      ) {
        throwIfAborted(options);


        try {
          onStatus({
            type: "provider",
            provider:
              provider.name,
          });


          const result =
            await provider.chat(
              messages,
              options
            );


          throwIfAborted(options);


          onStatus({
            type: "success",
            provider:
              provider.name,
          });


          return result;
        } catch (error) {
          if (
            error?.name ===
              "AbortError" ||
            isAborted(options)
          ) {
            const abortError =
              new Error(
                "Task dibatalkan."
              );

            abortError.name =
              "AbortError";

            throw abortError;
          }


          lastError = error;


          onStatus({
            type: "fallback",
            provider:
              provider.name,

            error:
              getErrorMessage(error),
          });
        }
      }


      /*
       * ========================================
       * SEMUA PROVIDER GAGAL
       * ========================================
       */

      throw (
        lastError ||
        new Error(
          "Tidak ada provider yang tersedia."
        )
      );
    },
  };
}


module.exports = {
  createRouter,
  detectTaskLevel,
};