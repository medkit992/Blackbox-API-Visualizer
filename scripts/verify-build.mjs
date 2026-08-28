import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = new URL("../", import.meta.url);
const distDirectory = new URL("dist/", projectDirectory);
const distPath = fileURLToPath(distDirectory);
const packagePath = new URL("package.json", projectDirectory);
const packageLockPath = new URL("package-lock.json", projectDirectory);
const sourceManifestPath = new URL("public/manifest.json", projectDirectory);
const distManifestPath = new URL("manifest.json", distDirectory);
const panelPagePath = new URL("src/panel/panel.html", distDirectory);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const distManifest = JSON.parse(await readFile(distManifestPath, "utf8"));
const failures = [];

const versionPattern = /^\d+(?:\.\d+){0,3}$/;

if (!versionPattern.test(sourceManifest.version)) {
  failures.push(
    `public/manifest.json version must be a Chrome-compatible numeric version, got ${sourceManifest.version}`
  );
}

if (packageJson.version !== sourceManifest.version) {
  failures.push(
    `Version mismatch: package.json=${packageJson.version}, public/manifest.json=${sourceManifest.version}`
  );
}

if (packageLock.version !== packageJson.version) {
  failures.push(
    `Version mismatch: package-lock.json=${packageLock.version}, package.json=${packageJson.version}`
  );
}

if (packageLock.packages?.[""]?.version !== packageJson.version) {
  failures.push(
    `Version mismatch: package-lock root=${packageLock.packages?.[""]?.version ?? "missing"}, package.json=${packageJson.version}`
  );
}

if (distManifest.version !== sourceManifest.version) {
  failures.push(
    `Version mismatch: dist/manifest.json=${distManifest.version}, public/manifest.json=${sourceManifest.version}`
  );
}

const devtoolsPage = new URL(distManifest.devtools_page, distDirectory);
const devtoolsHtml = await readFile(devtoolsPage, "utf8");
const panelHtml = await readFile(panelPagePath, "utf8");

const JavaScriptExtensions = new Set([".js", ".mjs"]);
const TypeScriptExtensions = new Set([".ts", ".tsx"]);
const files = await collectFiles(distPath);
const bareImportPattern = /(?:from\s*|import\s*)["'](?![./]|chrome-extension:|https?:)[^"']+["']/g;
const sourceModuleReferencePattern = /(?:src|href)=["'][^"']+\.tsx?["']/i;
const bundledScriptPattern = /<script[^>]+src=["'][^"']+\.js["']/i;

for (const file of files) {
  const extension = extname(file);

  if (TypeScriptExtensions.has(extension)) {
    failures.push(`Production bundle contains TypeScript source file: ${file}`);
    continue;
  }

  if (!JavaScriptExtensions.has(extension)) continue;

  const source = await readFile(file, "utf8");
  const imports = source.match(bareImportPattern);
  if (imports) failures.push(`${file}: ${imports.join(", ")}`);
}

for (const [name, html] of [
  ["DevTools page", devtoolsHtml],
  ["panel page", panelHtml],
]) {
  if (sourceModuleReferencePattern.test(html)) {
    failures.push(`${name} still references a TypeScript source module.`);
  }

  if (!bundledScriptPattern.test(html)) {
    failures.push(`${name} does not reference a bundled JavaScript asset.`);
  }
}

if (failures.length > 0) {
  throw new Error(`Production build verification failed:\n${failures.join("\n")}`);
}

console.log(
  `Verified extension build ${distManifest.version}: package/lock/manifest versions match, HTML points to bundled JavaScript, no TypeScript source files are present, and no unresolved package imports were found.`
);
