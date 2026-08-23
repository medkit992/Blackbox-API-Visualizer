import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDirectory = new URL("../dist/", import.meta.url);
const distPath = fileURLToPath(distDirectory);
const manifestPath = new URL("manifest.json", distDirectory);

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

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const devtoolsPage = new URL(manifest.devtools_page, distDirectory);
await readFile(devtoolsPage);

const JavaScriptExtensions = new Set([".js", ".mjs"]);
const files = await collectFiles(distPath);
const bareImportPattern = /(?:from\s*|import\s*)["'](?![./]|chrome-extension:|https?:)[^"']+["']/g;
const failures = [];

for (const file of files) {
  if (!JavaScriptExtensions.has(extname(file))) continue;

  const source = await readFile(file, "utf8");
  const imports = source.match(bareImportPattern);
  if (imports) failures.push(`${file}: ${imports.join(", ")}`);
}

if (failures.length > 0) {
  throw new Error(
    `Production build contains unresolved package imports:\n${failures.join("\n")}`
  );
}

console.log(`Verified extension build ${manifest.version}: no unresolved package imports.`);
