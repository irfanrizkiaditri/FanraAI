const fs = require("fs");

const {
  resolveWorkspacePath,
} = require("../workspace_manager");

function readFile(filePath) {
  const absolutePath =
    resolveWorkspacePath(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `File tidak ditemukan: ${filePath}`
    );
  }

  const stats = fs.statSync(absolutePath);

  if (!stats.isFile()) {
    throw new Error(
      `Bukan file: ${filePath}`
    );
  }

  return {
    success: true,
    file: filePath,
    content: fs.readFileSync(
      absolutePath,
      "utf8"
    ),
  };
}

module.exports = {
  readFile,
};