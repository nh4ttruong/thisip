import { readFile, stat } from "node:fs/promises";

const API_BASE =
  process.env.EDGE_API_BASE ||
  "https://api.addons.microsoftedge.microsoft.com/v1";
const POLL_INTERVAL_MS = Number(process.env.EDGE_POLL_INTERVAL_MS || 15000);
const POLL_TIMEOUT_MS = Number(process.env.EDGE_POLL_TIMEOUT_MS || 20 * 60_000);

const productId = requiredEnv("EDGE_PRODUCT_ID");
const clientId = requiredEnv("EDGE_CLIENT_ID");
const apiKey = requiredEnv("EDGE_API_KEY");
const packagePath = requiredEnv("EDGE_PACKAGE_PATH");
const certificationNotes =
  process.env.EDGE_CERTIFICATION_NOTES ||
  "Automated release from GitHub Actions.";

await ensureReadablePackage(packagePath);

const uploadOperationId = await startOperation("package upload", {
  method: "POST",
  url: `${API_BASE}/products/${encodeURIComponent(
    productId,
  )}/submissions/draft/package`,
  headers: {
    ...authHeaders(),
    "Content-Type": "application/zip",
  },
  body: await readFile(packagePath),
});

await pollOperation(
  "package upload",
  `${API_BASE}/products/${encodeURIComponent(
    productId,
  )}/submissions/draft/package/operations/${encodeURIComponent(
    uploadOperationId,
  )}`,
);

const publishOperationId = await startOperation("submission publish", {
  method: "POST",
  url: `${API_BASE}/products/${encodeURIComponent(productId)}/submissions`,
  headers: {
    ...authHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
  },
  body: certificationNotes,
});

await pollOperation(
  "submission publish",
  `${API_BASE}/products/${encodeURIComponent(
    productId,
  )}/submissions/operations/${encodeURIComponent(publishOperationId)}`,
);

console.log("Edge Add-ons submission was created successfully.");

function authHeaders() {
  return {
    Authorization: `ApiKey ${apiKey}`,
    "X-ClientID": clientId,
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function ensureReadablePackage(path) {
  const packageStat = await stat(path);
  if (!packageStat.isFile()) {
    throw new Error(`EDGE_PACKAGE_PATH is not a file: ${path}`);
  }
}

async function startOperation(label, request) {
  console.log(`Starting Edge ${label}...`);
  const response = await fetch(request.url, request);

  if (response.status !== 202) {
    throw new Error(
      `Edge ${label} failed to start: HTTP ${response.status}\n${await response.text()}`,
    );
  }

  const operationId = await getOperationId(response);
  if (!operationId) {
    throw new Error(`Edge ${label} response did not include an operation ID.`);
  }

  console.log(`Edge ${label} operation ID: ${operationId}`);
  return operationId;
}

async function getOperationId(response) {
  const location = response.headers.get("location");
  if (location) {
    return location.split("/").filter(Boolean).pop();
  }

  const text = await response.text();
  if (!text) return "";

  try {
    const body = JSON.parse(text);
    return body.id || body.operationId || "";
  } catch {
    return text.trim();
  }
}

async function pollOperation(label, url) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await fetch(url, {
      method: "GET",
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        `Edge ${label} status check failed: HTTP ${response.status}\n${await response.text()}`,
      );
    }

    const body = await response.json();
    const status = body.status || "Unknown";
    console.log(`Edge ${label} status: ${status}`);

    if (status === "Succeeded") {
      if (body.message) console.log(body.message);
      return body;
    }

    if (status === "Failed") {
      throw new Error(
        `Edge ${label} failed: ${JSON.stringify(body, null, 2)}`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for Edge ${label} after ${POLL_TIMEOUT_MS}ms.`,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
