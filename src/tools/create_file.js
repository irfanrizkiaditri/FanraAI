const fs = require("fs");
const path = require("path");

const {
  resolveWorkspacePath,
} = require("../workspace_manager");

function createFile(filePath, content) {
  const absolutePath =
    resolveWorkspacePath(filePath);

  if (fs.existsSync(absolutePath)) {
    throw new Error(
      `File sudah ada: ${filePath}`
    );
  }

  if (typeof content !== "string") {
    throw new Error(
      "Content file harus berupa string."
    );
  }

  const parentDirectory =
    path.dirname(absolutePath);

  if (!fs.existsSync(parentDirectory)) {
    fs.mkdirSync(parentDirectory, {
      recursive: true,
    });
  }

  fs.writeFileSync(
    absolutePath,
    content,
    "utf8"
  );

  return {
    success: true,
    file: filePath,
    bytesWritten: Buffer.byteLength(
      content,
      "utf8"
    ),
  };
}

module.exports = {
  createFile,
};