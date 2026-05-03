/**
 * This IP
 */

(() => {
  "use strict";

  let badge = null;
  let currentData = null;
  let position = "bottom-right";
  let showIcon = true;
  let showTag = true;

  // Load display preferences
  chrome.storage.local.get(["badgeIcon", "badgeTag"], (result) => {
    showIcon = result.badgeIcon !== false;
    showTag = result.badgeTag !== false;
  });

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

    // Click handler
    badge.addEventListener("click", handleBadgeClick);
    badge.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBadgeClick();
      }
    });
  }

  function handleBadgeClick() {
    // Copy IP to clipboard
    const ip = currentData?.ipv4 || currentData?.ipv6;
    if (ip) {
      navigator.clipboard.writeText(ip).catch(() => {
        fallbackCopy(ip);
      });
    }

    // Toggle position
    badge.classList.remove(position);
    position = position === "bottom-right" ? "bottom-left" : "bottom-right";
    badge.classList.add(position);
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

    badge.classList.add("visible");
  }

  function hideBadge() {
    if (badge) {
      badge.classList.remove("visible");
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
