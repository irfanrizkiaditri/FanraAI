const fs = require("fs");
const path = require("path");
const { resolveWorkspace } = require("../workspace");

function listFiles(directory = ".") {
  const absolutePath = resolveWorkspace(directory);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Folder tidak ditemukan: ${directory}`
    );
  }

  const stats = fs.statSync(absolutePath);

  if (!stats.isDirectory()) {
    throw new Error(
      `Bukan folder: ${directory}`
    );
  }

  const entries = fs.readdirSync(absolutePath, {
    withFileTypes: true,
  });

  return {
    success: true,
    workspace: absolutePath,
    path: directory,
    files: entries.map((item) => ({
      name: item.name,
      type: item.isDirectory()
        ? "directory"
        : "file",
    })),
  };
}

module.exports = {
  listFiles,
};