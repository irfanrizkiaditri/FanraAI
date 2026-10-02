const fs = require("fs");
const path = require("path");

const FANRA_ROOT = path.resolve(process.cwd(), ".fanra");
const WORKSPACE_ROOT = path.join(FANRA_ROOT, "workspace");

function ensureWorkspace() {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, {
      recursive: true,
    });
  }
}

function resolveWorkspacePath(targetPath = ".") {
  ensureWorkspace();

  const resolved = path.resolve(
    WORKSPACE_ROOT,
    targetPath
  );

  if (
    resolved !== WORKSPACE_ROOT &&
    !resolved.startsWith(
      WORKSPACE_ROOT + path.sep
    )
  ) {
    throw new Error(
      "Akses ditolak: path berada di luar workspace Fanra."
    );
  }

  return resolved;
}

function getWorkspaceRoot() {
  ensureWorkspace();
  return WORKSPACE_ROOT;
}

module.exports = {
  FANRA_ROOT,
  WORKSPACE_ROOT,
  ensureWorkspace,
  resolveWorkspacePath,
  getWorkspaceRoot,
};