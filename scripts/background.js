/**
 * This IP - Background Service Worker
 * Reports the IP the browser connected to; falls back to DNS when it is unknown.
 */

const REFRESH_ALARM = "refresh-ip";
const REFRESH_INTERVAL_MINUTES = 1;

// Initialization
chrome.runtime.onInstalled.addListener(() => {
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
  if (enabled === false) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    const hostname = getHostname(tab.url);
    if (hostname) {
      notifyContentScript(tab.id, await resolveIP(hostname));
    }
  }
});

// Tab navigation triggers IP resolution
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled === false) return;

  const hostname = getHostname(tab.url);
  if (!hostname) return;

  notifyContentScript(tabId, await resolveIP(hostname));
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled === false) return;

  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return;

  const hostname = getHostname(tab.url);
  if (!hostname) return;

  notifyContentScript(tabId, await lookupIP(hostname));
});

// The browser's own connection is the source of truth (local DNS, hosts file, VPN)
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    // Firefox flags proxied requests; their ip belongs to the proxy
    if (!details.ip || details.proxyInfo) return;

    const hostname = getHostname(details.url);
    if (!hostname) return;

    const result = { ipv4: null, ipv6: null, hostname, connected: true };
    categorizeIP(details.ip, result);
    setCached(result);
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
);

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

  return lookupIP(hostname);
}

async function handleToggle(enabled) {
  // Content scripts follow this key through storage.onChanged
  await chrome.storage.local.set({ enabled });

  if (enabled) {
    // Re-resolve for the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.url) {
      const hostname = getHostname(tab.url);
      if (hostname) {
        notifyContentScript(tab.id, await resolveIP(hostname));
      }
    }
  }

  return { success: true };
}

async function handleRefresh(url) {
  const hostname = getHostname(url);
  if (!hostname) return { ipv4: null, ipv6: null, hostname: null };

  const result = await resolveIP(hostname);

  // Also notify the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    notifyContentScript(tab.id, result);
  }

  return result;
}

// Session storage outlives service-worker restarts and is dropped when the browser closes
// Connection and DNS results use separate keys, so a DNS write can never replace a connection
// ponytail: entries per hostname until restart (10 MB quota), evict if that ever fills
async function getCached(hostname) {
  const [conn, dns] = [`conn:${hostname}`, `dns:${hostname}`];
  const stored = await chrome.storage.session.get([conn, dns]);
  return stored[conn] ?? stored[dns];
}

function setCached(result) {
  const kind = result.connected ? "conn" : "dns";
  return chrome.storage.session.set({ [`${kind}:${result.hostname}`]: result });
}

// Cached answer when there is one, a fresh lookup otherwise
async function lookupIP(hostname) {
  return (await getCached(hostname)) ?? resolveIP(hostname);
}

// Fresh lookup: the browser's connection first, DNS only when it is unknown
async function resolveIP(hostname) {
  const result = { ipv4: null, ipv6: null, hostname };

  const cached = await getCached(hostname);
  if (cached?.connected) return cached;

  // Short-circuit if hostname is already an IP address or localhost
  if (hostname === "localhost") {
    result.ipv4 = "127.0.0.1";
    result.ipv6 = "::1";
    return result;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    result.ipv4 = hostname;
    return result;
  }
  if (hostname.includes(":")) {
    result.ipv6 = hostname.replace(/^\[|\]$/g, "");
    return result;
  }

  // No connection on record: ask public DNS-over-HTTPS
  await resolveViaDOH(hostname, result);

  if (result.ipv4 || result.ipv6) await setCached(result);

  // Prefer a connection a page load reported meanwhile; an empty answer keeps the earlier one
  return (await getCached(hostname)) ?? result;
}

async function resolveViaDOH(hostname, result) {
  const endpoints = [
    {
      url: (name, t) => `https://dns.google/resolve?name=${name}&type=${t}`,
      headers: {},
    },
    {
      url: (name, t) =>
        `https://cloudflare-dns.com/dns-query?name=${name}&type=${t}`,
      headers: { Accept: "application/dns-json" },
    },
  ];

  await Promise.all(
    ["A", "AAAA"].map(async (t) => {
      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(
            endpoint.url(encodeURIComponent(hostname), t),
            {
              headers: endpoint.headers,
              signal: AbortSignal.timeout(3000),
            },
          );

          if (!resp.ok) continue;

          const data = await resp.json();

          if (data.Answer) {
            for (const answer of data.Answer) {
              if (answer.data) {
                categorizeIP(answer.data, result);
              }
            }
          }

          // If the request was successful, don't try the fallback provider for this record type
          break;
        } catch {
          /* silent, try next provider */
        }
      }
    }),
  );
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
