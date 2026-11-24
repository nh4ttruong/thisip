/**
 * This IP - Popup Controller
 *
 * Manages the extension popup: IP display, clipboard copy,
 * theme toggle, settings persistence, and badge communication.
 */

// Mock Chrome API for local UI development
if (
  typeof chrome === "undefined" ||
  !chrome.runtime ||
  !chrome.runtime.getManifest
) {
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "local-dev" }),
      sendMessage: (msg, cb) => {
        if ((msg.type === "GET_IP" || msg.type === "REFRESH_IP") && cb) {
          cb({ ipv4: "127.0.0.1", ipv6: null, hostname: "localhost" });
        }
      },
      lastError: null,
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
    },
    tabs: {
      query: async () => [{ url: "http://localhost/local-test", id: 999 }],
      sendMessage: async () => {},
    },
  };
}

// Theme button cycles through these; `light: undefined` follows the system
const THEMES = [
  { light: undefined, icon: ".icon-system", title: "Theme: System" },
  { light: true, icon: ".icon-sun", title: "Theme: Light" },
  { light: false, icon: ".icon-moon", title: "Theme: Dark" },
];
const THEME_MIRROR = "lightTheme";
const systemLight = matchMedia("(prefers-color-scheme: light)");

// chrome.storage answers after the first paint, so the choice is mirrored for a synchronous read
let lightTheme = readThemeMirror();
applyTheme();
systemLight.addEventListener("change", applyTheme);

function readThemeMirror() {
  try {
    return JSON.parse(localStorage.getItem(THEME_MIRROR)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeThemeMirror() {
  try {
    localStorage.setItem(THEME_MIRROR, JSON.stringify(lightTheme ?? null));
  } catch {
    /* the mirror only saves a repaint */
  }
}

function applyTheme() {
  const themeBtn = document.getElementById("theme-btn");
  const current = THEMES.find((theme) => theme.light === lightTheme);
  for (const theme of THEMES) {
    themeBtn
      .querySelector(theme.icon)
      .classList.toggle("hidden", theme !== current);
  }
  themeBtn.title = current.title;
  document.body.classList.toggle(
    "light-theme",
    lightTheme ?? systemLight.matches,
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  // DOM references (null-safe)
  const $ = (id) => document.getElementById(id);

  const elements = {
    ipValue: $("ip-value"),
    ipTag: $("ip-tag"),
    ipCard: $("ip-card"),
    hostname: $("hostname"),
    version: $("version"),
    toggleInput: $("toggle-input"),
    themeBtn: $("theme-btn"),
    settingsBtn: $("settings-btn"),
    refreshBtn: $("refresh-btn"),
    settingsPanel: $("settings-panel"),
    badgeIcon: $("badge-icon"),
    badgeTag: $("badge-tag"),
    badgeOpacity: $("badge-opacity"),
    opacityValue: $("opacity-value"),
    hoverDelay: $("hover-delay"),
    dodgeValue: $("dodge-value"),
  };

  let currentUrl = "";
  let currentIP = null;

  // Display version
  const manifest = chrome.runtime.getManifest();
  if (elements.version && manifest.version) {
    elements.version.textContent = "v" + manifest.version;
  }

  // Load saved preferences
  const stored = await chrome.storage.local.get([
    "enabled",
    "badgeIcon",
    "badgeTag",
    "lightTheme",
    "hoverDelay",
    "badgeOpacity",
  ]);

  elements.toggleInput.checked = stored.enabled !== false;
  elements.badgeIcon.checked = stored.badgeIcon !== false;
  elements.badgeTag.checked = stored.badgeTag !== false;
  lightTheme = stored.lightTheme;
  applyTheme();
  writeThemeMirror();

  const savedDelay = stored.hoverDelay ?? 1.5;
  elements.hoverDelay.value = savedDelay;
  elements.dodgeValue.textContent = savedDelay + "s";

  const savedOpacity = stored.badgeOpacity ?? 100;
  elements.badgeOpacity.value = savedOpacity;
  elements.opacityValue.textContent = savedOpacity + "%";

  // Resolve current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    currentUrl = tab.url;
    try {
      elements.hostname.textContent = new URL(tab.url).hostname;
    } catch {
      elements.hostname.textContent = "—";
    }
    fetchIP(tab.url);
  }

  // Event Handlers

  // Null-safe event binding
  const on = (el, event, handler) => el?.addEventListener(event, handler);

  // Enable/disable
  on(elements.toggleInput, "change", () => {
    chrome.runtime.sendMessage({
      type: "TOGGLE_ENABLED",
      enabled: elements.toggleInput.checked,
    });
  });

  // Theme: system → light → dark; badges follow through storage.onChanged
  on(elements.themeBtn, "click", () => {
    const index = THEMES.findIndex((theme) => theme.light === lightTheme);
    lightTheme = THEMES[(index + 1) % THEMES.length].light;
    applyTheme();
    writeThemeMirror();
    if (lightTheme === undefined) {
      chrome.storage.local.remove("lightTheme");
    } else {
      chrome.storage.local.set({ lightTheme });
    }
  });

  // Settings panel
  on(elements.settingsBtn, "click", () => {
    elements.settingsPanel?.classList.toggle("open");
    elements.settingsBtn.classList.toggle("active");
  });

  // Badge icon toggle
  on(elements.badgeIcon, "change", () => {
    chrome.storage.local.set({ badgeIcon: elements.badgeIcon.checked });
  });

  // Badge tag toggle
  on(elements.badgeTag, "change", () => {
    chrome.storage.local.set({ badgeTag: elements.badgeTag.checked });
  });

  // Opacity slider
  on(elements.badgeOpacity, "input", () => {
    if (elements.opacityValue) {
      elements.opacityValue.textContent = elements.badgeOpacity.value + "%";
    }
  });
  on(elements.badgeOpacity, "change", () => {
    chrome.storage.local.set({
      badgeOpacity: parseInt(elements.badgeOpacity.value, 10),
    });
  });

  // Auto-dodge slider
  on(elements.hoverDelay, "input", () => {
    if (elements.dodgeValue) {
      elements.dodgeValue.textContent = elements.hoverDelay.value + "s";
    }
  });
  on(elements.hoverDelay, "change", () => {
    chrome.storage.local.set({
      hoverDelay: parseFloat(elements.hoverDelay.value),
    });
  });

  // Refresh
  on(elements.refreshBtn, "click", () => {
    elements.refreshBtn.classList.add("spinning");
    setTimeout(() => elements.refreshBtn.classList.remove("spinning"), 600);
    if (elements.ipValue) elements.ipValue.textContent = "Resolving...";
    if (elements.ipTag) elements.ipTag.textContent = "";
    elements.ipCard?.classList.remove("unavailable", "copied");

    chrome.runtime.sendMessage(
      { type: "REFRESH_IP", url: currentUrl },
      (response) => {
        if (!chrome.runtime.lastError && response) displayIP(response);
      },
    );
  });

  // Copy on card click
  on(elements.ipCard, "click", () => {
    if (!currentIP) return;
    navigator.clipboard.writeText(currentIP).then(() => {
      elements.ipCard.classList.add("copied");
      elements.ipValue.textContent = "Copied!";
      setTimeout(() => {
        elements.ipCard.classList.remove("copied");
        // Restore from state: a second click would read "Copied!" back as the IP
        if (currentIP) elements.ipValue.textContent = currentIP;
      }, 1000);
    });
  });

  // Functions

  function fetchIP(url) {
    chrome.runtime.sendMessage({ type: "GET_IP", url }, (response) => {
      if (!chrome.runtime.lastError && response) displayIP(response);
    });
  }

  function displayIP(data) {
    const ip = data.ipv4 || data.ipv6;
    currentIP = ip;

    if (ip) {
      elements.ipValue.textContent = ip;
      elements.ipTag.textContent = data.ipv4 ? "IPv4" : "IPv6";
      elements.ipTag.className =
        "ip-tag" + (data.ipv6 && !data.ipv4 ? " ipv6" : "");
      elements.ipCard.classList.remove("unavailable");
    } else {
      elements.ipValue.textContent = "Unavailable";
      elements.ipTag.textContent = "";
      elements.ipCard.classList.add("unavailable");
    }
  }
});
