/**
 * This IP - Popup Script
 */
document.addEventListener("DOMContentLoaded", async () => {
  const ipValue = document.getElementById("ip-value");
  const ipTag = document.getElementById("ip-tag");
  const ipCard = document.getElementById("ip-card");
  const hostnameEl = document.getElementById("hostname");
  const toggleInput = document.getElementById("toggle-input");
  const refreshBtn = document.getElementById("refresh-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const badgeIconInput = document.getElementById("badge-icon");
  const badgeTagInput = document.getElementById("badge-tag");

  let currentUrl = "";
  let currentIP = null;

  // Load saved state
  const stored = await chrome.storage.local.get([
    "enabled",
    "badgeIcon",
    "badgeTag",
  ]);
  toggleInput.checked = stored.enabled !== false;
  badgeIconInput.checked = stored.badgeIcon !== false;
  badgeTagInput.checked = stored.badgeTag !== false;

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    currentUrl = tab.url;
    try {
      hostnameEl.textContent = new URL(tab.url).hostname;
    } catch {
      hostnameEl.textContent = "—";
    }
    fetchIP(tab.url);
  }

  // Toggle enabled
  toggleInput.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: "TOGGLE_ENABLED",
      enabled: toggleInput.checked,
    });
  });

  // Settings panel toggle
  settingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("open");
    settingsBtn.classList.toggle("active");
  });

  // Badge icon checkbox
  badgeIconInput.addEventListener("change", () => {
    const val = badgeIconInput.checked;
    chrome.storage.local.set({ badgeIcon: val });
    notifyBadgeDisplay({ badgeIcon: val });
  });

  // Badge tag checkbox
  badgeTagInput.addEventListener("change", () => {
    const val = badgeTagInput.checked;
    chrome.storage.local.set({ badgeTag: val });
    notifyBadgeDisplay({ badgeTag: val });
  });

  // Refresh
  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("spinning");
    setTimeout(() => refreshBtn.classList.remove("spinning"), 600);
    ipValue.textContent = "Resolving...";
    ipTag.textContent = "";
    ipCard.classList.remove("unavailable", "copied");

    chrome.runtime.sendMessage({ type: "REFRESH_IP", url: currentUrl }, (r) => {
      if (!chrome.runtime.lastError && r) displayIP(r);
    });
  });

  // Click card to copy
  ipCard.addEventListener("click", () => {
    if (!currentIP) return;
    navigator.clipboard.writeText(currentIP).then(() => {
      ipCard.classList.add("copied");
      const prev = ipValue.textContent;
      ipValue.textContent = "Copied!";
      setTimeout(() => {
        ipCard.classList.remove("copied");
        ipValue.textContent = prev;
      }, 1000);
    });
  });

  function fetchIP(url) {
    chrome.runtime.sendMessage({ type: "GET_IP", url }, (r) => {
      if (!chrome.runtime.lastError && r) displayIP(r);
    });
  }

  function displayIP(data) {
    const ip = data.ipv4 || data.ipv6;
    currentIP = ip;

    if (ip) {
      ipValue.textContent = ip;
      ipTag.textContent = data.ipv4 ? "IPv4" : "IPv6";
      ipTag.className = "ip-tag" + (data.ipv6 && !data.ipv4 ? " ipv6" : "");
      ipCard.classList.remove("unavailable");
    } else {
      ipValue.textContent = "Unavailable";
      ipTag.textContent = "";
      ipCard.classList.add("unavailable");
    }
  }

  async function notifyBadgeDisplay(settings) {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (activeTab?.id) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: "UPDATE_BADGE_DISPLAY",
          ...settings,
        });
      } catch {
        /* content script may not be loaded */
      }
    }
  }
});
