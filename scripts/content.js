/**
 * This IP - Content Script
 * Injects and manages the floating IP badge on web pages.
 */

(() => {
  "use strict";

  let badge = null;
  let currentData = null;
  let position = "bottom-right";
  let showIcon = true;
  let showTag = true;
  let lightTheme = false;
  let hoverDelay = 1.5;
  let hoverTimer = 0.5;
  let badgeOpacity = 100;

  // Load display preferences
  chrome.storage.local.get(
    ["badgeIcon", "badgeTag", "lightTheme", "hoverDelay", "badgeOpacity"],
    (result) => {
      showIcon = result.badgeIcon !== false;
      showTag = result.badgeTag !== false;
      lightTheme = result.lightTheme === true;
      hoverDelay = result.hoverDelay ?? 1.5;
      badgeOpacity = result.badgeOpacity ?? 100;
    },
  );

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
    if (lightTheme) badge.classList.add("light-theme");
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
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  }

  function handleBadgeClick() {
    // Copy IP to clipboard only — no position toggle
    const ip = currentData?.ipv4 || currentData?.ipv6;
    if (ip) {
      navigator.clipboard.writeText(ip).catch(() => {
        fallbackCopy(ip);
      });
    }

    // Cancel any pending hover switch so click doesn't trigger it
    clearHoverTimer();
  }

  function handleBadgeHoverStart() {
    if (hoverDelay === 0) {
      // Instant dodge
      togglePosition();
      return;
    }
    hoverTimer = setTimeout(() => {
      togglePosition();
      hoverTimer = null;
    }, hoverDelay * 1000);
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

  function handleFullscreenChange() {
    if (!badge) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      badge.classList.remove("visible");
    } else if (currentData) {
      badge.classList.add("visible");
    }
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

    if (showIcon) {
      const icon = document.createElement("span");
      icon.className = "thisip-icon";
      icon.textContent = "⬡";
      content.appendChild(icon);
    }

    const ipText = document.createElement("span");
    ipText.className = "thisip-ip";
    ipText.textContent = ip;
    content.appendChild(ipText);

    if (showTag && typeLabel) {
      const tag = document.createElement("span");
      tag.className = "thisip-tag";
      tag.textContent = typeLabel;
      content.appendChild(tag);
    }

    // Clear previous content
    badge.textContent = "";
    badge.appendChild(content);

    // Don't show if in fullscreen
    if (document.fullscreenElement || document.webkitFullscreenElement) return;

    badge.classList.add("visible");
  }

  function hideBadge() {
    if (badge) {
      badge.classList.remove("visible");
    }
  }

  function applyTheme(isLight) {
    lightTheme = isLight;
    if (badge) {
      badge.classList.toggle("light-theme", isLight);
      applyOpacity();
    }
  }

  function applyOpacity() {
    if (!badge) return;
    const alpha = badgeOpacity / 100;
    if (lightTheme) {
      badge.style.setProperty("--badge-bg-alpha", alpha);
      badge.style.background = `rgba(255, 255, 255, ${0.88 * alpha})`;
    } else {
      badge.style.setProperty("--badge-bg-alpha", alpha);
      badge.style.background = `rgba(15, 15, 20, ${0.82 * alpha})`;
    }
  }

  // Message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "IP_RESOLVED") {
      updateBadge(message.data);
      sendResponse({ received: true });
    }

    if (message.type === "TOGGLE_BADGE") {
      if (message.enabled === false) {
        hideBadge();
      } else if (currentData) {
        updateBadge(currentData);
      }
      sendResponse({ received: true });
    }

    if (message.type === "UPDATE_BADGE_DISPLAY") {
      if (message.badgeIcon !== undefined) showIcon = message.badgeIcon;
      if (message.badgeTag !== undefined) showTag = message.badgeTag;
      if (message.lightTheme !== undefined) applyTheme(message.lightTheme);
      if (message.hoverDelay !== undefined) hoverDelay = message.hoverDelay;
      if (message.badgeOpacity !== undefined) {
        badgeOpacity = message.badgeOpacity;
        applyOpacity();
      }
      if (currentData) updateBadge(currentData);
      sendResponse({ received: true });
    }
  });

  // Initial request
  chrome.runtime.sendMessage(
    { type: "GET_IP", url: window.location.href },
    (response) => {
      if (chrome.runtime.lastError) return;
      if (response) updateBadge(response);
    },
  );
})();
