const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

async function execute({ url }) {
  if (!url) {
    throw new Error("URL wajib diberikan.");
  }

  const screenshotDir = path.resolve(
    process.cwd(),
    ".fanra",
    "screenshots"
  );

  fs.mkdirSync(screenshotDir, {
    recursive: true,
  });

  const screenshotPath = path.join(
    screenshotDir,
    `screenshot-${Date.now()}.png`
  );

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 900,
      },
      deviceScaleFactor: 1,
    });

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    return {
      success: true,
      url,
      screenshot: screenshotPath,
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  name: "screenshot",
  description:
    "Mengambil screenshot website dari URL yang sedang berjalan.",
  execute,
};