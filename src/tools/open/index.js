const { exec } = require("child_process");

const {
  checkPath,
} = require("../../security/safety_manager");

function openTarget(target) {
  return new Promise((resolve, reject) => {
    if (
      !target ||
      typeof target !== "string"
    ) {
      reject(
        new Error(
          "Target yang ingin dibuka tidak valid."
        )
      );
      return;
    }

    const trimmedTarget =
      target.trim();

    if (!trimmedTarget) {
      reject(
        new Error(
          "Target yang ingin dibuka kosong."
        )
      );
      return;
    }

    // ========================================
    // URL
    // ========================================

    const isUrl =
      /^https?:\/\//i.test(
        trimmedTarget
      );

    if (isUrl) {
      exec(
        `start "" "${trimmedTarget}"`,
        {
          windowsHide: true,
        },
        (error) => {
          if (error) {
            reject(
              new Error(
                `Gagal membuka URL: ${error.message}`
              )
            );
            return;
          }

          resolve({
            success: true,
            type: "url",
            target: trimmedTarget,
          });
        }
      );

      return;
    }

    // ========================================
    // LOCAL PATH
    // ========================================

    const looksLikePath =
      /^[a-zA-Z]:[\\/]/.test(
        trimmedTarget
      ) ||
      trimmedTarget.startsWith(".\\") ||
      trimmedTarget.startsWith("./");

    if (looksLikePath) {
      try {
        checkPath(trimmedTarget);
      } catch (error) {
        reject(error);
        return;
      }
    }

    // ========================================
    // WINDOWS SHELL
    // ========================================

    const command =
      `start "" "${trimmedTarget}"`;

    exec(
      command,
      {
        windowsHide: true,
      },
      (error) => {
        if (error) {
          reject(
            new Error(
              `Gagal membuka "${trimmedTarget}": ${error.message}`
            )
          );
          return;
        }

        resolve({
          success: true,
          type: isUrl
            ? "url"
            : looksLikePath
              ? "path"
              : "application",
          target: trimmedTarget,
        });
      }
    );
  });
}

module.exports = {
  openTarget,
};