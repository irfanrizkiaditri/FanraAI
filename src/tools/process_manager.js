const { spawn } = require("child_process");

const {
  resolveWorkspacePath,
} = require("../workspace_manager");

const processes = new Map();

function startProcess(command, targetPath = ".") {
  if (!command || typeof command !== "string") {
    throw new Error("Command tidak valid.");
  }

  const workspace =
    resolveWorkspacePath(targetPath);

  const child = spawn(command, {
    cwd: workspace,
    shell: true,
    windowsHide: true,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const processId = child.pid;

  if (!processId) {
    throw new Error(
      "Gagal mendapatkan PID process."
    );
  }

  const info = {
    pid: processId,
    command,
    path: targetPath,
    workspace,
    startedAt: new Date().toISOString(),
    status: "running",
  };

  processes.set(processId, {
    child,
    info,
  });

  child.on("exit", (code) => {
    const process = processes.get(processId);

    if (process) {
      process.info.status = "exited";
      process.info.exitCode = code;
    }
  });

  return {
    success: true,
    ...info,
  };
}

function listProcesses() {
  return {
    success: true,
    processes: [...processes.values()].map(
      ({ info }) => info
    ),
  };
}

function getProcess(pid) {
  const process = processes.get(
    Number(pid)
  );

  if (!process) {
    return {
      success: false,
      error: `Process tidak ditemukan: ${pid}`,
    };
  }

  return {
    success: true,
    ...process.info,
  };
}

function stopProcess(pid) {
  const process = processes.get(
    Number(pid)
  );

  if (!process) {
    return {
      success: false,
      error: `Process tidak ditemukan: ${pid}`,
    };
  }

  process.child.kill();

  process.info.status = "stopped";

  return {
    success: true,
    pid: Number(pid),
    status: "stopped",
  };
}

module.exports = {
  startProcess,
  listProcesses,
  getProcess,
  stopProcess,
};