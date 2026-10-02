const path = require("path");

function resolveWorkspace(targetPath = ".") {
  const baseWorkspace = process.cwd();

  const workspace = path.resolve(
    baseWorkspace,
    targetPath
  );

  if (
    workspace !== baseWorkspace &&
    !workspace.startsWith(baseWorkspace + path.sep)
  ) {
    throw new Error(
      "Workspace ditolak: project harus berada di dalam folder Fanra."
    );
  }

  return workspace;
}

module.exports = {
  resolveWorkspace,
};
