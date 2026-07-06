import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const target = process.argv[2];
const outputDir = process.argv[3];

if (!["firefox", "edge"].includes(target) || !outputDir) {
  console.error(
    "Usage: node .github/scripts/prepare-browser-package.mjs <firefox|edge> <output-dir>",
  );
  process.exit(1);
}

const rootDir = process.cwd();
const packageFiles = [
  "manifest.json",
  "README.md",
  "LICENSE",
  "images",
  "popup",
  "scripts",
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of packageFiles) {
  await cp(path.join(rootDir, file), path.join(outputDir, file), {
    recursive: true,
  });
}

const manifestPath = path.join(outputDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (target === "firefox") {
  manifest.background ||= {};
  manifest.background.scripts ||= [manifest.background.service_worker].filter(
    Boolean,
  );
} else {
  if (manifest.background) {
    delete manifest.background.scripts;
  }
  delete manifest.browser_specific_settings;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Prepared ${target} extension source at ${outputDir}`);
