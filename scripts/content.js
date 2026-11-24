/**
 * This IP - Content Script
 * Injects and manages the floating IP badge on web pages.
 */

(() => {
  "use strict";

  let badge = null;
  let currentData = null;
  let position = "bottom-right";
  let hoverTimer = null;
  const systemLight = window.matchMedia("(prefers-color-scheme: light)");

  // Stored preferences with their defaults; lightTheme null follows the system
  const DEFAULTS = {
    enabled: true,
    badgeIcon: true,
    badgeTag: true,
    lightTheme: null,
    hoverDelay: 1.5,
    badgeOpacity: 100,
  };
  const prefs = { ...DEFAULTS };

  // Load preferences first so the first render already uses them
  chrome.storage.local.get(DEFAULTS, (stored) => {
    Object.assign(prefs, stored);
    // Listening any earlier would let a pushed result render with default preferences
    chrome.runtime.onMessage.addListener(handleMessage);
    if (prefs.enabled) requestIP();
  });

  // The popup only writes to storage; every open tab picks the change up here
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      prefs[key] = newValue ?? DEFAULTS[key];
    }
    applyTheme();
    applyOpacity();
    if (currentData) {
      updateBadge(currentData);
    } else if (changes.enabled && prefs.enabled) {
      // Loaded while disabled: nothing to show yet
      requestIP();
    }
  });

  systemLight.addEventListener("change", applyTheme);

  // Create badge element
  function createBadge() {
    if (badge) return;

    badge = document.createElement("div");
    badge.id = "thisip-badge";
    badge.setAttribute("role", "button");
    badge.setAttribute("aria-label", "Site IP address");
    badge.setAttribute("tabindex", "0");

    document.documentElement.appendChild(badge);
    badge.classList.add(position);
    applyTheme();
    applyOpacity();

    // Click handler — copy only, no position toggle
    badge.addEventListener("click", handleBadgeClick);
    badge.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBadgeClick();
      }
    });

    // Hover handler — auto-switch position after delay
    badge.addEventListener("mouseenter", handleBadgeHoverStart);
    badge.addEventListener("mouseleave", handleBadgeHoverEnd);

    // Fullscreen change — hide/show badge
    document.addEventListener("fullscreenchange", syncVisibility);
    document.addEventListener("webkitfullscreenchange", syncVisibility);
  }

  function handleBadgeClick() {
    // Copy IP to clipboard only — no position toggle
    const ip = currentData?.ipv4 || currentData?.ipv6;
    if (ip) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(ip).catch(() => {
          fallbackCopy(ip);
        });
      } else {
        // Insecure (http) pages have no navigator.clipboard
        fallbackCopy(ip);
      }
    }

    // Cancel any pending hover switch so click doesn't trigger it
    clearHoverTimer();
  }

  function handleBadgeHoverStart() {
    if (prefs.hoverDelay === 0) {
      // Instant dodge
      togglePosition();
      return;
    }
    hoverTimer = setTimeout(() => {
      togglePosition();
      hoverTimer = null;
    }, prefs.hoverDelay * 1000);
  }

  function handleBadgeHoverEnd() {
    clearHoverTimer();
  }

  function clearHoverTimer() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function togglePosition() {
    if (!badge) return;
    badge.classList.remove(position);
    position = position === "bottom-right" ? "bottom-left" : "bottom-right";
    badge.classList.add(position);
  }

  function syncVisibility() {
    if (!badge) return;
    const fullscreen =
      document.fullscreenElement || document.webkitFullscreenElement;
    badge.classList.toggle(
      "visible",
      prefs.enabled && !!currentData && !fullscreen,
    );
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  // Update badge content
  function updateBadge(data) {
    currentData = data;

    if (!badge) createBadge();

    const ip = data?.ipv4 || data?.ipv6 || "...";
    const typeLabel = data?.ipv4 ? "IPv4" : data?.ipv6 ? "IPv6" : "";

    // Build content
    const content = document.createElement("span");
    content.className = "thisip-content";

    if (prefs.badgeIcon) {
      const icon = document.createElement("span");
      icon.className = "thisip-icon";
      icon.textContent = "⬡";
      content.appendChild(icon);
    }

    const ipText = document.createElement("span");
    ipText.className = "thisip-ip";
    ipText.textContent = ip;
    content.appendChild(ipText);

    if (prefs.badgeTag && typeLabel) {
      const tag = document.createElement("span");
      tag.className = "thisip-tag";
      tag.textContent = typeLabel;
      content.appendChild(tag);
    }

    // Clear previous content
    badge.textContent = "";
    badge.appendChild(content);

    syncVisibility();
  }

  function applyTheme() {
    badge?.classList.toggle(
      "light-theme",
      prefs.lightTheme ?? systemLight.matches,
    );
  }

  // content.css multiplies each theme's background alpha by this
  function applyOpacity() {
    badge?.style.setProperty("--badge-bg-alpha", prefs.badgeOpacity / 100);
  }

  function handleMessage(message, sender, sendResponse) {
    if (message.type === "IP_RESOLVED") {
      // A slow lookup can land after the tab moved to another site
      if (message.data?.hostname === window.location.hostname) {
        updateBadge(message.data);
      }
      sendResponse({ received: true });
    }
  }

  // Initial request
  function requestIP() {
    chrome.runtime.sendMessage(
      { type: "GET_IP", url: window.location.href },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (response) updateBadge(response);
      },
    );
  }
})();
