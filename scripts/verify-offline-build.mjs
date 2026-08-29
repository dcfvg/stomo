import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const cachedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".png",
  ".svg",
  ".webmanifest",
  ".woff2",
]);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

const files = await listFiles(outputDirectory);
const serviceWorker = await readFile(join(outputDirectory, "sw.js"), "utf8");
const required = files
  .map((file) => relative(outputDirectory, file).replaceAll("\\", "/"))
  .filter(
    (file) =>
      cachedExtensions.has(extname(file)) &&
      file !== "sw.js" &&
      !file.startsWith("workbox-") &&
      file !== "social-card.png",
  );
const missing = required.filter(
  (file) =>
    !serviceWorker.includes(`url:"${file}"`) &&
    !serviceWorker.includes(`"url":"${file}"`),
);

if (missing.length)
  throw new Error(`Ressources absentes du précache : ${missing.join(", ")}`);

const index = await readFile(join(outputDirectory, "index.html"), "utf8");
const expectedBase = `${process.env.VITE_BASE || "/"}`.replace(/\/?$/, "/");
const absoluteResources = [
  ...index.matchAll(/(?:src|href)="(\/[^"#?]+)"/g),
].map((match) => match[1]);
const wrongBase = absoluteResources.filter(
  (resource) => !resource.startsWith(expectedBase),
);
if (wrongBase.length)
  throw new Error(
    `Ressources hors du chemin ${expectedBase} : ${wrongBase.join(", ")}`,
  );

const manifest = JSON.parse(
  await readFile(join(outputDirectory, "manifest.webmanifest"), "utf8"),
);
if (
  manifest.display !== "standalone" ||
  manifest.start_url !== "." ||
  manifest.scope !== "."
)
  throw new Error("Le manifeste ne permet pas une relance autonome de Stomo.");

console.log(`Précache vérifié : ${required.length} ressources.`);
