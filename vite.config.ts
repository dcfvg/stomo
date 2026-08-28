import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const httpsRequested = process.env.STOMO_HTTPS === "1";
const certificateFile = resolve(".cert/stomo.pem");
const certificateKeyFile = resolve(".cert/stomo-key.pem");

if (
  httpsRequested &&
  (!existsSync(certificateFile) || !existsSync(certificateKeyFile))
) {
  throw new Error("Certificat absent. Lance d’abord « npm run cert:dev ».");
}

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Stomo — mon studio d’animation",
        short_name: "Stomo",
        description: "Crée des films image par image, même sans internet.",
        lang: "fr",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "any",
        theme_color: "#151719",
        background_color: "#f5f1e8",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        globIgnores: ["social-card.png"],
        navigateFallback: "index.html",
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 4174,
    https: httpsRequested
      ? {
          cert: readFileSync(certificateFile),
          key: readFileSync(certificateKeyFile),
        }
      : undefined,
  },
  build: { target: "chrome101" },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    css: true,
  },
});
