/**
 * This IP - Popup Controller
 *
 * Manages the extension popup: IP display, clipboard copy,
 * theme toggle, settings persistence, and badge communication.
 */
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
  let isLightTheme = false;

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
  isLightTheme = stored.lightTheme === true;
  updateThemeIcon(isLightTheme);

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

  // Theme toggle
  on(elements.themeBtn, "click", () => {
    isLightTheme = !isLightTheme;
    updateThemeIcon(isLightTheme);
    chrome.storage.local.set({ lightTheme: isLightTheme });
    notifyBadge({ lightTheme: isLightTheme });
  });

  // Settings panel
  on(elements.settingsBtn, "click", () => {
    elements.settingsPanel?.classList.toggle("open");
    elements.settingsBtn.classList.toggle("active");
  });

  // Badge icon toggle
  on(elements.badgeIcon, "change", () => {
    const value = elements.badgeIcon.checked;
    chrome.storage.local.set({ badgeIcon: value });
    notifyBadge({ badgeIcon: value });
  });

  // Badge tag toggle
  on(elements.badgeTag, "change", () => {
    const value = elements.badgeTag.checked;
    chrome.storage.local.set({ badgeTag: value });
    notifyBadge({ badgeTag: value });
  });

  // Opacity slider
  on(elements.badgeOpacity, "input", () => {
    if (elements.opacityValue) {
      elements.opacityValue.textContent = elements.badgeOpacity.value + "%";
    }
  });
  on(elements.badgeOpacity, "change", () => {
    const value = parseInt(elements.badgeOpacity.value, 10);
    chrome.storage.local.set({ badgeOpacity: value });
    notifyBadge({ badgeOpacity: value });
  });

  // Auto-dodge slider
  on(elements.hoverDelay, "input", () => {
    if (elements.dodgeValue) {
      elements.dodgeValue.textContent = elements.hoverDelay.value + "s";
    }
  });
  on(elements.hoverDelay, "change", () => {
    const value = parseFloat(elements.hoverDelay.value);
    chrome.storage.local.set({ hoverDelay: value });
    notifyBadge({ hoverDelay: value });
  });

  // Refresh
  on(elements.refreshBtn, "click", () => {
    elements.refreshBtn.classList.add("spinning");
    setTimeout(() => elements.refreshBtn.classList.remove("spinning"), 600);
    if (elements.ipValue) elements.ipValue.textContent = "Resolving...";
    if (elements.ipTag) elements.ipTag.textContent = "";
    elements.ipCard?.classList.remove("unavailable", "copied");

    chrome.runtime.sendMessage({ type: "REFRESH_IP", url: currentUrl }, (response) => {
      if (!chrome.runtime.lastError && response) displayIP(response);
    });
  });

  // Copy on card click
  on(elements.ipCard, "click", () => {
    if (!currentIP) return;
    navigator.clipboard.writeText(currentIP).then(() => {
      elements.ipCard.classList.add("copied");
      const previous = elements.ipValue.textContent;
      elements.ipValue.textContent = "Copied!";
      setTimeout(() => {
        elements.ipCard.classList.remove("copied");
        elements.ipValue.textContent = previous;
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
      elements.ipTag.className = "ip-tag" + (data.ipv6 && !data.ipv4 ? " ipv6" : "");
      elements.ipCard.classList.remove("unavailable");
    } else {
      elements.ipValue.textContent = "Unavailable";
      elements.ipTag.textContent = "";
      elements.ipCard.classList.add("unavailable");
    }
  }

  function updateThemeIcon(isLight) {
    const moonIcon = elements.themeBtn.querySelector(".icon-moon");
    const sunIcon = elements.themeBtn.querySelector(".icon-sun");
    moonIcon.classList.toggle("hidden", isLight);
    sunIcon.classList.toggle("hidden", !isLight);
  }

  async function notifyBadge(settings) {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab?.id) return;

    try {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: "UPDATE_BADGE_DISPLAY",
        ...settings,
      });
    } catch {
      /* content script may not be loaded */
    }
  }
});
