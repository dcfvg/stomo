import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

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

const precacheBytes = (
  await Promise.all(required.map((file) => readFile(join(outputDirectory, file))))
).reduce((total, content) => total + content.byteLength, 0);
if (precacheBytes > 1024 * 1024)
  throw new Error(
    `Le précache dépasse 1 Mio (${Math.ceil(precacheBytes / 1024)} Kio).`,
  );

const applicationScripts = files.filter((file) =>
  /\/assets\/index-[^/]+\.js$/.test(file.replaceAll("\\", "/")),
);
if (applicationScripts.length !== 1)
  throw new Error("Le fichier JavaScript principal n’a pas été identifié.");
const applicationScript = await readFile(applicationScripts[0]);
const compressedScriptBytes = gzipSync(applicationScript).byteLength;
if (compressedScriptBytes > 200 * 1024)
  throw new Error(
    `Le JavaScript principal dépasse 200 Kio compressé (${Math.ceil(compressedScriptBytes / 1024)} Kio).`,
  );

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

const remoteExecutableResources = (
  index.match(/<(?:script|link)\b[^>]+>/g) ?? []
).filter(
  (tag) =>
    /(?:src|href)="https?:\/\//.test(tag) &&
    !/rel="canonical"/.test(tag),
);
if (remoteExecutableResources.length)
  throw new Error("Une ressource exécutable dépend d’un site extérieur.");

const manifest = JSON.parse(
  await readFile(join(outputDirectory, "manifest.webmanifest"), "utf8"),
);
if (
  manifest.id !== "." ||
  manifest.display !== "standalone" ||
  manifest.start_url !== "." ||
  manifest.scope !== "."
)
  throw new Error("Le manifeste ne permet pas une relance autonome de Stomo.");

const requiredIcons = [
  ["icon-192.png", "any"],
  ["icon-512.png", "any"],
  ["icon-maskable-512.png", "maskable"],
];
for (const [src, purpose] of requiredIcons) {
  const icon = manifest.icons?.find(
    (candidate) => candidate.src === src && candidate.purpose === purpose,
  );
  if (!icon) throw new Error(`Icône ${purpose} absente du manifeste : ${src}`);
  if (!(await readFile(join(outputDirectory, src))).byteLength)
    throw new Error(`Icône vide : ${src}`);
}

console.log(
  `Précache vérifié : ${required.length} ressources, ${Math.ceil(precacheBytes / 1024)} Kio ; JavaScript principal ${Math.ceil(compressedScriptBytes / 1024)} Kio compressé.`,
);
