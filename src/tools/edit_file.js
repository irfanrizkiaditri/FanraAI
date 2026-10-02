const fs = require("fs");
const path = require("path");

const {
  resolveWorkspacePath,
} = require("../workspace_manager");

function editFile(filePath, content) {
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

  if (typeof content !== "string") {
    throw new Error(
      "Content file harus berupa string."
    );
  }

  const backupPath =
    `${absolutePath}.fanra-backup`;

  fs.copyFileSync(
    absolutePath,
    backupPath
  );

  fs.writeFileSync(
    absolutePath,
    content,
    "utf8"
  );

  return {
    success: true,
    file: filePath,
    backup: path.relative(
      process.cwd(),
      backupPath
    ),
    bytesWritten: Buffer.byteLength(
      content,
      "utf8"
    ),
  };
}

module.exports = {
  editFile,
};