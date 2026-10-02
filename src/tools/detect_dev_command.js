const fs = require("fs");
const path = require("path");
const { resolveWorkspace } = require("../workspace");

function detectDevCommand({ path: targetPath = "." } = {}) {
  const workspace = resolveWorkspace(targetPath);
  const packagePath = path.join(
    workspace,
    "package.json"
  );

  if (!fs.existsSync(packagePath)) {
    throw new Error(
      `package.json tidak ditemukan di workspace: ${workspace}`
    );
  }

  let packageJson;

  try {
    packageJson = JSON.parse(
      fs.readFileSync(packagePath, "utf8")
    );
  } catch (error) {
    throw new Error(
      `package.json tidak valid: ${error.message}`
    );
  }

  const scripts = packageJson.scripts || {};

  if (scripts.dev) {
    return {
      success: true,
      workspace,
      command: "npm run dev",
      script: "dev",
      reason:
        "Menemukan script 'dev' di package.json.",
    };
  }

  if (scripts.start) {
    return {
      success: true,
      workspace,
      command: "npm start",
      script: "start",
      reason:
        "Menemukan script 'start' di package.json.",
    };
  }

  return {
    success: false,
    workspace,
    command: null,
    script: null,
    reason:
      "Tidak ditemukan script 'dev' atau 'start' di package.json.",
  };
}

module.exports = {
  detectDevCommand,
};