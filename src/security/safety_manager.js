const DANGEROUS_COMMANDS = [
  "format",
  "diskpart",
  "shutdown",
  "restart-computer",
  "stop-computer",
  "remove-item",
  "del /s",
  "erase /s",
];

const DANGEROUS_PATHS = [
  "c:\\windows",
  "c:\\program files",
  "c:\\program files (x86)",
  "c:\\programdata",
  "c:\\users\\public",
];

function normalizeCommand(command) {
  if (!command || typeof command !== "string") {
    return "";
  }

  return command
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getCommandRisk(command) {
  const normalized =
    normalizeCommand(command);

  if (!normalized) {
    return {
      level: "safe",
      reason: "Command kosong.",
    };
  }

  for (const dangerous of DANGEROUS_COMMANDS) {
    if (
      normalized === dangerous ||
      normalized.startsWith(
        `${dangerous} `
      )
    ) {
      return {
        level: "blocked",
        reason:
          "Command termasuk operasi sistem yang berbahaya.",
      };
    }
  }

  return {
    level: "safe",
    reason:
      "Command tidak termasuk daftar operasi berbahaya.",
  };
}

function getPathRisk(targetPath) {
  if (
    !targetPath ||
    typeof targetPath !== "string"
  ) {
    return {
      level: "safe",
      reason: "Path kosong.",
    };
  }

  const normalized = targetPath
    .trim()
    .toLowerCase()
    .replace(/\//g, "\\");

  for (const dangerousPath of DANGEROUS_PATHS) {
    if (
      normalized === dangerousPath ||
      normalized.startsWith(
        `${dangerousPath}\\`
      )
    ) {
      return {
        level: "blocked",
        reason:
          "Path berada di area sistem yang dilindungi.",
      };
    }
  }

  return {
    level: "safe",
    reason:
      "Path tidak termasuk area sistem yang dilindungi.",
  };
}

function checkCommand(command) {
  const result =
    getCommandRisk(command);

  if (result.level === "blocked") {
    throw new Error(
      `Operasi ditolak oleh Fanra Safety Layer: ${result.reason}`
    );
  }

  return {
    allowed: true,
    ...result,
  };
}

function checkPath(targetPath) {
  const result =
    getPathRisk(targetPath);

  if (result.level === "blocked") {
    throw new Error(
      `Akses ditolak oleh Fanra Safety Layer: ${result.reason}`
    );
  }

  return {
    allowed: true,
    ...result,
  };
}

module.exports = {
  normalizeCommand,
  getCommandRisk,
  getPathRisk,
  checkCommand,
  checkPath,
};