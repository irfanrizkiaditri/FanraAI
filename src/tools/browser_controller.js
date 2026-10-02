const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

let browser = null;
let context = null;
let activeBrowserType = null;

const tabs = new Map();


/*
 * ========================================
 * CANCELLATION
 * ========================================
 */

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("Task dibatalkan.");
    error.name = "AbortError";
    throw error;
  }
}


/*
 * ========================================
 * BROWSER RESOLVER
 * ========================================
 */

function normalizeBrowserName(browserName) {
  if (!browserName) {
    return "chromium";
  }

  const value = String(browserName)
    .trim()
    .toLowerCase();

  if (
    value === "brave" ||
    value === "brave browser"
  ) {
    return "brave";
  }

  if (
    value === "chrome" ||
    value === "google chrome" ||
    value === "googlechrome"
  ) {
    return "chrome";
  }

  if (
    value === "edge" ||
    value === "microsoft edge" ||
    value === "msedge"
  ) {
    return "edge";
  }

  if (
    value === "chromium"
  ) {
    return "chromium";
  }

  return "chromium";
}


function getBrowserExecutable(browserName) {
  const name =
    normalizeBrowserName(browserName);

  const localAppData =
    process.env.LOCALAPPDATA || "";

  const programFiles =
    process.env.PROGRAMFILES || "";

  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] || "";

  const candidates = {
    brave: [
      path.join(
        localAppData,
        "BraveSoftware",
        "Brave-Browser",
        "Application",
        "brave.exe"
      ),
      path.join(
        programFiles,
        "BraveSoftware",
        "Brave-Browser",
        "Application",
        "brave.exe"
      ),
      path.join(
        programFilesX86,
        "BraveSoftware",
        "Brave-Browser",
        "Application",
        "brave.exe"
      ),
    ],

    chrome: [
      path.join(
        localAppData,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      path.join(
        programFiles,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      path.join(
        programFilesX86,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
    ],

    edge: [
      path.join(
        programFiles,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
      path.join(
        programFilesX86,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
      path.join(
        localAppData,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
    ],

    chromium: [],
  };

  const list =
    candidates[name] || [];

  for (const candidate of list) {
    if (
      candidate &&
      fs.existsSync(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}


/*
 * ========================================
 * URL HELPERS
 * ========================================
 */

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);

    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname.toLowerCase(),
      host: parsed.host.toLowerCase(),
      pathname: parsed.pathname,
      origin: parsed.origin,
      href: parsed.href,
    };
  } catch {
    return null;
  }
}


function getDomain(url) {
  const parsed = normalizeUrl(url);

  if (!parsed) {
    return null;
  }

  return parsed.hostname;
}


function getTabKey(url) {
  const domain = getDomain(url);

  if (!domain) {
    return null;
  }

  return domain;
}


/*
 * ========================================
 * TAB REGISTRY
 * ========================================
 */

function registerPage(page) {
  if (
    !page ||
    page.isClosed()
  ) {
    return;
  }

  const updateTab = () => {
    if (page.isClosed()) {
      return;
    }

    const url = page.url();
    const key = getTabKey(url);

    if (!key) {
      return;
    }

    for (
      const [
        existingKey,
        existingPage,
      ] of tabs.entries()
    ) {
      if (
        existingPage === page &&
        existingKey !== key
      ) {
        tabs.delete(existingKey);
      }
    }

    tabs.set(key, page);
  };

  updateTab();

  page.on(
    "framenavigated",
    () => {
      updateTab();
    }
  );

  page.on(
    "close",
    () => {
      for (
        const [
          key,
          existingPage,
        ] of tabs.entries()
      ) {
        if (
          existingPage === page
        ) {
          tabs.delete(key);
        }
      }
    }
  );
}


/*
 * ========================================
 * BROWSER
 * ========================================
 */

async function closeBrowser() {
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }

  browser = null;
  context = null;
  activeBrowserType = null;
  tabs.clear();
}


async function ensureBrowser(
  signal,
  browserName = "chromium"
) {
  throwIfAborted(signal);

  const requestedBrowser =
    normalizeBrowserName(
      browserName
    );

  /*
   * Kalau browser sudah hidup dengan
   * engine yang sama, gunakan kembali.
   */
  if (
    browser &&
    context &&
    activeBrowserType === requestedBrowser
  ) {
    for (
      const page of context.pages()
    ) {
      registerPage(page);
    }

    return context;
  }

  /*
   * Kalau user meminta browser berbeda,
   * tutup instance lama lalu buka browser
   * yang benar.
   */
  if (
    browser &&
    activeBrowserType !== requestedBrowser
  ) {
    await closeBrowser();
    throwIfAborted(signal);
  }

  const executablePath =
    getBrowserExecutable(
      requestedBrowser
    );

  const launchOptions = {
    headless: false,
  };

  /*
   * Chromium Playwright tetap dipakai
   * sebagai engine automation.
   *
   * Untuk Brave / Chrome / Edge,
   * executablePath diarahkan ke browser
   * desktop yang benar.
   */
  if (executablePath) {
    launchOptions.executablePath =
      executablePath;
  }

  browser =
    await chromium.launch(
      launchOptions
    );

  throwIfAborted(signal);

  activeBrowserType =
    requestedBrowser;

  context =
    await browser.newContext({
      viewport: {
        width: 1280,
        height: 800,
      },
    });

  context.on(
    "page",
    (page) => {
      registerPage(page);
    }
  );

  for (
    const page of context.pages()
  ) {
    registerPage(page);
  }

  throwIfAborted(signal);

  return context;
}


/*
 * ========================================
 * FIND TAB
 * ========================================
 */

async function findExistingTab(
  url,
  signal,
  browserName
) {
  throwIfAborted(signal);

  await ensureBrowser(
    signal,
    browserName
  );

  const targetDomain =
    getDomain(url);

  if (!targetDomain) {
    return null;
  }

  const registeredPage =
    tabs.get(targetDomain);

  if (
    registeredPage &&
    !registeredPage.isClosed()
  ) {
    return registeredPage;
  }

  for (
    const page of context.pages()
  ) {
    throwIfAborted(signal);

    if (page.isClosed()) {
      continue;
    }

    const pageDomain =
      getDomain(
        page.url()
      );

    if (
      pageDomain ===
      targetDomain
    ) {
      registerPage(page);

      return page;
    }
  }

  return null;
}


/*
 * ========================================
 * GET / CREATE TAB
 * ========================================
 */

async function getOrCreateTab(
  url,
  signal,
  browserName
) {
  throwIfAborted(signal);

  const existingPage =
    await findExistingTab(
      url,
      signal,
      browserName
    );

  throwIfAborted(signal);

  if (existingPage) {
    await existingPage.bringToFront();

    throwIfAborted(signal);

    return existingPage;
  }

  const currentContext =
    await ensureBrowser(
      signal,
      browserName
    );

  throwIfAborted(signal);

  const newPage =
    await currentContext.newPage();

  throwIfAborted(signal);

  registerPage(newPage);

  return newPage;
}


/*
 * ========================================
 * OPEN URL
 * ========================================
 */

async function browserOpen(
  url,
  options = {}
) {
  const signal =
    options?.signal;

  const browserName =
    options?.browser ||
    options?.browserName ||
    "chromium";

  throwIfAborted(signal);

  if (
    !url ||
    typeof url !== "string"
  ) {
    throw new Error(
      "URL tidak valid."
    );
  }

  const targetUrl =
    url.trim();

  const currentPage =
    await getOrCreateTab(
      targetUrl,
      signal,
      browserName
    );

  throwIfAborted(signal);

  const currentUrl =
    currentPage.url();

  const currentDomain =
    getDomain(currentUrl);

  const targetDomain =
    getDomain(targetUrl);

  if (
    currentUrl === "about:blank" ||
    !currentDomain ||
    currentDomain !== targetDomain
  ) {
    await currentPage.goto(
      targetUrl,
      {
        waitUntil:
          "domcontentloaded",
        timeout:
          30000,
      }
    );
  }

  throwIfAborted(signal);

  registerPage(
    currentPage
  );

  await currentPage.bringToFront();

  throwIfAborted(signal);

  return {
    success: true,
    action: "open",

    browser:
      normalizeBrowserName(
        browserName
      ),

    url:
      currentPage.url(),

    title:
      await currentPage.title(),

    domain:
      getDomain(
        currentPage.url()
      ),

    tabs:
      context.pages().length,
  };
}


/*
 * ========================================
 * ACTIVE PAGE
 * ========================================
 */

async function getActivePage(
  signal,
  browserName
) {
  throwIfAborted(signal);

  await ensureBrowser(
    signal,
    browserName
  );

  const pages =
    context.pages();

  if (
    pages.length === 0
  ) {
    const newPage =
      await context.newPage();

    throwIfAborted(signal);

    registerPage(newPage);

    return newPage;
  }

  return pages[
    pages.length - 1
  ];
}


/*
 * ========================================
 * READ
 * ========================================
 */

async function browserRead(
  options = {}
) {
  const signal =
    options?.signal;

  const browserName =
    options?.browser ||
    options?.browserName ||
    activeBrowserType ||
    "chromium";

  throwIfAborted(signal);

  const currentPage =
    await getActivePage(
      signal,
      browserName
    );

  throwIfAborted(signal);

  const title =
    await currentPage.title();

  throwIfAborted(signal);

  const url =
    currentPage.url();

  const text =
    await currentPage
      .locator("body")
      .innerText({
        timeout: 10000,
      });

  throwIfAborted(signal);

  return {
    success: true,
    action: "read",

    browser:
      activeBrowserType,

    url,
    title,

    domain:
      getDomain(url),

    content:
      text.slice(
        0,
        12000
      ),
  };
}


/*
 * ========================================
 * CLICK
 * ========================================
 */

async function browserClick(
  selector,
  options = {}
) {
  const signal =
    options?.signal;

  throwIfAborted(signal);

  if (
    !selector ||
    typeof selector !== "string"
  ) {
    throw new Error(
      "Selector tidak valid."
    );
  }

  const currentPage =
    await getActivePage(
      signal,
      options?.browser ||
      options?.browserName ||
      activeBrowserType ||
      "chromium"
    );

  throwIfAborted(signal);

  await currentPage
    .locator(selector)
    .first()
    .click({
      timeout: 15000,
    });

  throwIfAborted(signal);

  registerPage(
    currentPage
  );

  return {
    success: true,
    action: "click",

    selector,

    url:
      currentPage.url(),
  };
}


/*
 * ========================================
 * TYPE
 * ========================================
 */

async function browserType(
  selector,
  text,
  options = {}
) {
  const signal =
    options?.signal;

  throwIfAborted(signal);

  if (
    !selector ||
    typeof selector !== "string"
  ) {
    throw new Error(
      "Selector tidak valid."
    );
  }

  if (
    typeof text !== "string"
  ) {
    throw new Error(
      "Text tidak valid."
    );
  }

  const currentPage =
    await getActivePage(
      signal,
      options?.browser ||
      options?.browserName ||
      activeBrowserType ||
      "chromium"
    );

  throwIfAborted(signal);

  await currentPage
    .locator(selector)
    .first()
    .fill(text);

  throwIfAborted(signal);

  return {
    success: true,
    action: "type",

    selector,

    url:
      currentPage.url(),
  };
}


/*
 * ========================================
 * PRESS
 * ========================================
 */

async function browserPress(
  selector,
  key,
  options = {}
) {
  const signal =
    options?.signal;

  throwIfAborted(signal);

  if (
    !selector ||
    typeof selector !== "string"
  ) {
    throw new Error(
      "Selector tidak valid."
    );
  }

  if (
    !key ||
    typeof key !== "string"
  ) {
    throw new Error(
      "Key tidak valid."
    );
  }

  const currentPage =
    await getActivePage(
      signal,
      options?.browser ||
      options?.browserName ||
      activeBrowserType ||
      "chromium"
    );

  throwIfAborted(signal);

  await currentPage
    .locator(selector)
    .first()
    .press(key);

  throwIfAborted(signal);

  return {
    success: true,
    action: "press",

    selector,
    key,

    url:
      currentPage.url(),
  };
}


/*
 * ========================================
 * SCREENSHOT
 * ========================================
 */

async function browserScreenshot(
  path,
  options = {}
) {
  const signal =
    options?.signal;

  throwIfAborted(signal);

  const currentPage =
    await getActivePage(
      signal,
      options?.browser ||
      options?.browserName ||
      activeBrowserType ||
      "chromium"
    );

  throwIfAborted(signal);

  const outputPath =
    typeof path === "string" &&
    path.trim()
      ? path.trim()
      : ".fanra/browser.png";

  await currentPage.screenshot({
    path: outputPath,
    fullPage: false,
  });

  throwIfAborted(signal);

  return {
    success: true,
    action: "screenshot",

    path:
      outputPath,

    url:
      currentPage.url(),

    browser:
      activeBrowserType,
  };
}


/*
 * ========================================
 * LIST TABS
 * ========================================
 */

async function browserListTabs(
  options = {}
) {
  const signal =
    options?.signal;

  throwIfAborted(signal);

  await ensureBrowser(
    signal,
    options?.browser ||
    options?.browserName ||
    activeBrowserType ||
    "chromium"
  );

  const pages =
    context.pages();

  const result = [];

  for (
    let i = 0;
    i < pages.length;
    i++
  ) {
    throwIfAborted(signal);

    const page =
      pages[i];

    if (
      page.isClosed()
    ) {
      continue;
    }

    const url =
      page.url();

    result.push({
      index: i,
      url,

      title:
        await page.title(),

      domain:
        getDomain(url),
    });
  }

  throwIfAborted(signal);

  return {
    success: true,
    action: "list_tabs",

    browser:
      activeBrowserType,

    count:
      result.length,

    tabs:
      result,
  };
}


/*
 * ========================================
 * SWITCH TAB
 * ========================================
 */

async function browserSwitchTab(
  index,
  options = {}
) {
  const signal =
    options?.signal;

  throwIfAborted(signal);

  await ensureBrowser(
    signal,
    options?.browser ||
    options?.browserName ||
    activeBrowserType ||
    "chromium"
  );

  const pages =
    context.pages();

  if (
    typeof index !== "number" ||
    index < 0 ||
    index >= pages.length
  ) {
    throw new Error(
      `Tab index tidak valid. Tersedia: 0-${pages.length - 1}`
    );
  }

  const selectedPage =
    pages[index];

  if (
    selectedPage.isClosed()
  ) {
    throw new Error(
      "Tab tersebut sudah ditutup."
    );
  }

  throwIfAborted(signal);

  registerPage(
    selectedPage
  );

  await selectedPage.bringToFront();

  throwIfAborted(signal);

  return {
    success: true,
    action:
      "switch_tab",

    browser:
      activeBrowserType,

    index,

    url:
      selectedPage.url(),

    title:
      await selectedPage.title(),

    domain:
      getDomain(
        selectedPage.url()
      ),
  };
}


module.exports = {
  ensureBrowser,
  closeBrowser,

  browserOpen,
  browserRead,

  browserClick,
  browserType,
  browserPress,

  browserScreenshot,

  browserListTabs,
  browserSwitchTab,
};