/**
 * This IP - Background Service Worker
 * Resolves IP addresses for active tabs using DNS API and fallback methods.
 */

const REFRESH_ALARM = "refresh-ip";
const REFRESH_INTERVAL_MINUTES = 1;
const IP_CACHE = new Map();

// Initialization
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: REFRESH_INTERVAL_MINUTES,
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: REFRESH_INTERVAL_MINUTES,
  });
});

// Alarm handler for periodic refresh
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) return;

  const { enabled } = await chrome.storage.local.get("enabled");
  if (!enabled) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    const hostname = getHostname(tab.url);
    if (hostname) {
      const result = await resolveIP(hostname);
      IP_CACHE.set(hostname, result);
      notifyContentScript(tab.id, result);
    }
  }
});

// Tab navigation triggers IP resolution
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  const { enabled } = await chrome.storage.local.get("enabled");
  if (!enabled) return;

  const hostname = getHostname(tab.url);
  if (!hostname) return;

  const result = await resolveIP(hostname);
  IP_CACHE.set(hostname, result);
  notifyContentScript(tabId, result);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (!enabled) return;

  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return;

  const hostname = getHostname(tab.url);
  if (!hostname) return;

  // Use cache if fresh, otherwise resolve
  if (IP_CACHE.has(hostname)) {
    notifyContentScript(tabId, IP_CACHE.get(hostname));
  } else {
    const result = await resolveIP(hostname);
    IP_CACHE.set(hostname, result);
    notifyContentScript(tabId, result);
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_IP") {
    handleGetIP(message.url).then(sendResponse);
    return true; // async
  }

  if (message.type === "TOGGLE_ENABLED") {
    handleToggle(message.enabled).then(sendResponse);
    return true;
  }

  if (message.type === "REFRESH_IP") {
    handleRefresh(message.url).then(sendResponse);
    return true;
  }
});

async function handleGetIP(url) {
  const hostname = getHostname(url);
  if (!hostname)
    return { ipv4: null, ipv6: null, hostname: null, error: "Invalid URL" };

  if (IP_CACHE.has(hostname)) {
    return IP_CACHE.get(hostname);
  }

  const result = await resolveIP(hostname);
  IP_CACHE.set(hostname, result);
  return result;
}

async function handleToggle(enabled) {
  await chrome.storage.local.set({ enabled });

  if (!enabled) {
    // Notify all tabs to hide the badge
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "TOGGLE_BADGE",
          enabled: false,
        });
      } catch {
        /* tab may not have content script */
      }
    }
  } else {
    // Re-resolve for the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.url) {
      const hostname = getHostname(tab.url);
      if (hostname) {
        const result = await resolveIP(hostname);
        IP_CACHE.set(hostname, result);
        notifyContentScript(tab.id, result);
      }
    }
  }

  return { success: true };
}

async function handleRefresh(url) {
  const hostname = getHostname(url);
  if (!hostname) return { ipv4: null, ipv6: null, hostname: null };

  const result = await resolveIP(hostname);
  IP_CACHE.set(hostname, result);

  // Also notify the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    notifyContentScript(tab.id, result);
  }

  return result;
}

// DNS Resolution
async function resolveIP(hostname) {
  const result = { ipv4: null, ipv6: null, hostname };

  try {
    // Try chrome.dns API first
    if (chrome.dns && chrome.dns.resolve) {
      const dnsResult = await chrome.dns.resolve(hostname);
      if (dnsResult?.address) {
        categorizeIP(dnsResult.address, result);
      }
    }
  } catch {
    /* fallback below */
  }

  // Fallback: use public DNS-over-HTTPS to get both IPv4 and IPv6
  if (!result.ipv4 && !result.ipv6) {
    await resolveViaDOH(hostname, result);
  }

  // If we only have one type, try to get the other
  if (result.ipv4 && !result.ipv6) {
    await resolveViaDOH(hostname, result, "AAAA");
  } else if (!result.ipv4 && result.ipv6) {
    await resolveViaDOH(hostname, result, "A");
  }

  return result;
}

async function resolveViaDOH(hostname, result, type) {
  const types = type ? [type] : ["A", "AAAA"];

  for (const t of types) {
    try {
      const resp = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${t}`,
        { signal: AbortSignal.timeout(3000) },
      );
      const data = await resp.json();

      if (data.Answer) {
        for (const answer of data.Answer) {
          if (answer.data) {
            categorizeIP(answer.data, result);
          }
        }
      }
    } catch {
      /* silent */
    }
  }
}

function categorizeIP(ip, result) {
  if (ip.includes(":")) {
    if (!result.ipv6) result.ipv6 = ip;
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    if (!result.ipv4) result.ipv4 = ip;
  }
}

// Utilities
function getHostname(url) {
  try {
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return parsed.hostname;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function notifyContentScript(tabId, data) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "IP_RESOLVED", data });
  } catch {
    /* content script may not be injected yet */
  }
}
