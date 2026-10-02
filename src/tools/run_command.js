const { exec } = require("child_process");

const {
  resolveWorkspacePath,
} = require("../workspace_manager");

const {
  checkCommand,
  checkPath,
} = require("../security/safety_manager");

function runCommand(
  command,
  targetPath = "."
) {
  return new Promise((resolve, reject) => {
    if (
      !command ||
      typeof command !== "string"
    ) {
      reject(
        new Error("Command tidak valid.")
      );
      return;
    }

    // ========================================
    // SAFETY CHECK — COMMAND
    // ========================================

    try {
      checkCommand(command);
    } catch (error) {
      reject(error);
      return;
    }

    // ========================================
    // SAFETY CHECK — PATH
    // ========================================

    try {
      checkPath(targetPath);
    } catch (error) {
      reject(error);
      return;
    }

    // ========================================
    // WORKSPACE
    // ========================================

    let workspace;

    try {
      workspace =
        resolveWorkspacePath(targetPath);
    } catch (error) {
      reject(error);
      return;
    }

    // ========================================
    // EXECUTE
    // ========================================

    exec(
      command,
      {
        cwd: workspace,
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          workspace,
          command,
          exitCode: error
            ? error.code ?? 1
            : 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      }
    );
  });
}

module.exports = {
  runCommand,
};