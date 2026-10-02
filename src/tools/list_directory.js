const fs = require("fs");

const {
  resolveWorkspacePath,
} = require("../workspace_manager");

async function listDirectory(targetPath = ".") {
  const directory =
    resolveWorkspacePath(targetPath);

  if (!fs.existsSync(directory)) {
    throw new Error(
      `Folder tidak ditemukan: ${targetPath}`
    );
  }

  const stat = fs.statSync(directory);

  if (!stat.isDirectory()) {
    throw new Error(
      `${targetPath} bukan sebuah folder.`
    );
  }

  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });

  return {
    success: true,
    path: targetPath,
    entries: entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory()
        ? "directory"
        : "file",
    })),
  };
}

module.exports = {
  listDirectory,
};