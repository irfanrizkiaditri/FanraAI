const { exec } = require("child_process");

function openApplication(application) {
  return new Promise((resolve, reject) => {
    if (
      !application ||
      typeof application !== "string"
    ) {
      reject(
        new Error("Nama aplikasi tidak valid.")
      );
      return;
    }

    const target = application.trim();

    if (!target) {
      reject(
        new Error("Nama aplikasi kosong.")
      );
      return;
    }

    exec(
      `start "" "${target}"`,
      {
        windowsHide: true,
      },
      (error) => {
        if (error) {
          reject(
            new Error(
              `Gagal membuka aplikasi "${target}": ${error.message}`
            )
          );
          return;
        }

        resolve({
          success: true,
          type: "application",
          application: target,
        });
      }
    );
  });
}

module.exports = {
  openApplication,
};