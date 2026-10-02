const { spawn, execSync } = require("child_process");
const { resolveWorkspace } = require("../workspace");

function findProcessUsingPort(port) {
  try {
    const output = execSync(
      `netstat -ano | findstr :${port}`,
      {
        encoding: "utf8",
        windowsHide: true,
      }
    );

    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const parts = line.split(/\s+/);

      if (
        parts.length >= 5 &&
        parts[0].toUpperCase() === "TCP" &&
        parts[1].endsWith(`:${port}`) &&
        parts[3].toUpperCase() === "LISTENING"
      ) {
        return parts[4];
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractPort(url) {
  try {
    return Number(new URL(url).port || 80);
  } catch {
    return null;
  }
}

function waitForPort(port, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();

    const check = () => {
      const pid = findProcessUsingPort(port);

      if (pid) {
        resolve(pid);
        return;
      }

      if (Date.now() - start >= timeout) {
        resolve(null);
        return;
      }

      setTimeout(check, 250);
    };

    check();
  });
}

function startDevServer(command, targetPath = ".") {
  return new Promise((resolve, reject) => {
    if (!command || typeof command !== "string") {
      reject(new Error("Command tidak valid."));
      return;
    }

    const cwd = resolveWorkspace(targetPath);

    const child = spawn(
      "cmd.exe",
      ["/d", "/s", "/c", command],
      {
        cwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          BROWSER: "none",
          FORCE_COLOR: "0",
        },
      }
    );

    let output = "";
    let resolved = false;
    let timeoutId;

    const fail = (error) => {
      if (resolved) return;

      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      reject(error);
    };

    const finish = (result) => {
      if (resolved) return;

      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      child.unref();

      resolve(result);
    };

    const verifyServer = async (url) => {
      if (resolved) return;

      const port = extractPort(url);

      if (!port) {
        fail(
          new Error(
            `URL development server tidak memiliki port yang valid: ${url}`
          )
        );
        return;
      }

      const pid = await waitForPort(port);

      if (pid) {
        finish({
          success: true,
          command,
          workspace: cwd,
          url,
          pid,
          alreadyRunning: false,
        });
      } else {
        fail(
          new Error(
            `Development server memberikan URL ${url}, ` +
              `tetapi port ${port} tidak terdeteksi aktif.\n\n` +
              `Workspace:\n${cwd}\n\n` +
              `Output:\n${output}`
          )
        );
      }
    };

    const handleOutput = (data) => {
      const text = data.toString();

      const cleanText = text.replace(
        /\x1B\[[0-?]*[ -/]*[@-~]/g,
        ""
      );

      output += cleanText;

      process.stdout.write(
        `[DevServer] ${cleanText}`
      );

      const urlMatch = output.match(
        /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i
      );

      if (urlMatch && !resolved) {
        verifyServer(urlMatch[0]);
        return;
      }

      const portMatch = output.match(
        /(?:port|PORT)\s+(\d{2,5})/i
      );

      if (
        !resolved &&
        /already running|something is already running/i.test(
          output
        )
      ) {
        const port = portMatch
          ? Number(portMatch[1])
          : 3000;

        waitForPort(port).then((pid) => {
          if (pid) {
            finish({
              success: true,
              command,
              workspace: cwd,
              url: `http://localhost:${port}`,
              pid,
              alreadyRunning: true,
            });
          } else {
            fail(
              new Error(
                `Project melaporkan port ${port} sudah digunakan, ` +
                  `tetapi tidak ada process yang terdeteksi.\n\n` +
                  `Workspace:\n${cwd}\n\n` +
                  `Output:\n${output}`
              )
            );
          }
        });
      }
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);

    child.on("error", (error) => {
      fail(error);
    });

    child.on("exit", (code, signal) => {
      if (!resolved) {
        fail(
          new Error(
            `Dev server berhenti sebelum berhasil dijalankan.\n` +
              `Exit code: ${code}\n` +
              `Signal: ${signal}\n\n` +
              `Workspace:\n${cwd}\n\n` +
              `Output:\n${output}`
          )
        );
      }
    });

    timeoutId = setTimeout(() => {
      fail(
        new Error(
          `Dev server tidak berhasil diverifikasi dalam 20 detik.\n\n` +
            `Workspace:\n${cwd}\n\n` +
            `Output:\n${output}`
        )
      );
    }, 20000);
  });
}

module.exports = {
  startDevServer,
};