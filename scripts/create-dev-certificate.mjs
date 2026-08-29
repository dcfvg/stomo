import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

function runMkcert(argumentsList) {
  const result = spawnSync("mkcert", argumentsList, {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(
      "mkcert n’est pas installé. Sur macOS : brew install mkcert.",
    );
  }
  if (result.status !== 0)
    throw new Error("mkcert n’a pas réussi à créer le certificat.");
}

const addresses = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter(
    (address) =>
      address.family === "IPv4" &&
      !address.internal &&
      /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(address.address),
  )
  .map((address) => address.address);

const certificateDirectory = resolve(".cert");
mkdirSync(certificateDirectory, { recursive: true });
runMkcert(["-install"]);
runMkcert([
  "-key-file",
  resolve(certificateDirectory, "stomo-key.pem"),
  "-cert-file",
  resolve(certificateDirectory, "stomo.pem"),
  "localhost",
  "127.0.0.1",
  "::1",
  ...addresses,
]);

console.log("\nCertificat Stomo créé pour :");
console.log("  https://localhost:4175/");
for (const address of addresses) console.log(`  https://${address}:4175/`);
console.log(
  "\nSur Android, installe l’autorité racine de mkcert avant d’ouvrir l’adresse locale.",
);
