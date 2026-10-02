function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanSearchQuery(query) {
  return String(query || "")
    .trim()
    .replace(/[?.!,]+$/g, "")
    .trim();
}

function detectFastAction(text) {
  const input = normalizeText(text);

  if (!input) return null;

  // =========================================================
  // YOUTUBE SEARCH
  // =========================================================

  const youtubeSearchPatterns = [
    /^(?:buka|open)\s+(?:youtube|yt)\s+(?:dan\s+)?(?:cari|search)\s+(.+)$/i,

    /^(?:cari|search)\s+(.+?)\s+(?:di|on)\s+(?:youtube|yt)$/i,

    /^(?:buka|open)\s+(?:youtube|yt)\s+(?:untuk\s+)?(?:mencari|search)\s+(.+)$/i,
  ];

  for (const pattern of youtubeSearchPatterns) {
    const match = input.match(pattern);

    if (match) {
      const query = cleanSearchQuery(match[1]);

      if (query) {
        return {
          type: "youtube_search",
          query,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
            query
          )}`,
        };
      }
    }
  }

  // =========================================================
  // YOUTUBE MUSIC
  // =========================================================

  const youtubePlayMatch = input.match(
    /^(?:play|putar|mainkan)\s+(?:music|musik|lagu|song)\s+(.+?)\s+(?:di|on)\s+(?:youtube music|youtube|yt)$/i
  );

  if (youtubePlayMatch) {
    return {
      type: "youtube_play",
      query: youtubePlayMatch[1].trim(),
    };
  }

  // =========================================================
  // APPLICATION
  // =========================================================

  const applicationMap = [
    {
      patterns: [
        "buka spotify",
        "jalankan spotify",
        "open spotify",
      ],
      application: "Spotify",
    },

    {
      patterns: [
        "buka chrome",
        "jalankan chrome",
        "open chrome",
      ],
      application: "Chrome",
    },

    {
      patterns: [
        "buka vscode",
        "buka vs code",
        "jalankan vscode",
        "jalankan vs code",
        "open vscode",
        "open vs code",
      ],
      application: "VS Code",
    },

    {
      patterns: [
        "buka discord",
        "jalankan discord",
        "open discord",
      ],
      application: "Discord",
    },

    {
      patterns: [
        "buka notepad",
        "jalankan notepad",
        "open notepad",
      ],
      application: "Notepad",
    },
  ];

  for (const item of applicationMap) {
    if (item.patterns.includes(input)) {
      return {
        type: "open_application",
        application: item.application,
      };
    }
  }

  // =========================================================
  // WEBSITE
  // =========================================================

  const websiteMap = [
    {
      patterns: ["buka youtube", "open youtube", "buka yt", "open yt"],
      url: "https://www.youtube.com",
    },

    {
      patterns: ["buka spotify web", "open spotify web"],
      url: "https://open.spotify.com",
    },

    {
      patterns: ["buka youtube music", "open youtube music"],
      url: "https://music.youtube.com",
    },

    {
      patterns: ["buka google", "open google"],
      url: "https://www.google.com",
    },
  ];

  for (const item of websiteMap) {
    if (item.patterns.includes(input)) {
      return {
        type: "browser_open",
        url: item.url,
      };
    }
  }

  // =========================================================
  // DIRECT URL
  // =========================================================

  const urlMatch = input.match(
    /^(?:buka|open)\s+(https?:\/\/\S+)$/i
  );

  if (urlMatch) {
    return {
      type: "browser_open",
      url: urlMatch[1],
    };
  }

  return null;
}

module.exports = {
  normalizeText,
  detectFastAction,
};