import { expect, test } from "@playwright/test";

test("l’accueil tient dans l’écran et ne charge rien à distance", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.protocol.startsWith("http") &&
      url.origin !== "http://127.0.0.1:4187"
    )
      externalRequests.push(request.url());
  });

  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /Quelle histoire/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Nouveau film/ }),
  ).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  expect(externalRequests).toEqual([]);
});

test("la création d’un film reste utilisable sur un petit écran paysage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto("./");
  await page.getByRole("button", { name: /Nouveau film/ }).click();
  await page.getByLabel(/Comment s’appelle ton film/).fill("Les dinosaures");

  const createButton = page.getByRole("button", { name: "Créer mon film" });
  await createButton.scrollIntoViewIfNeeded();
  await expect(createButton).toBeVisible();
  const box = await createButton.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(360);
});

test("l’installation Apple indique le menu Partager", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "webkit");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: false,
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Comment installer" }).click();
  await expect(page.getByText(/Touche Partager/)).toBeVisible();
});

test("l’application redémarre hors connexion après une première ouverture", async ({
  page,
  context,
  browserName,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator))
      throw new Error("Service worker absent");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText("Stomo", { exact: true })).toBeVisible();

  if (browserName === "webkit") {
    const cachedApplication = await page.evaluate(async () => {
      const requests = (
        await Promise.all(
          (await caches.keys()).map(async (name) =>
            (await caches.open(name)).keys(),
          ),
        )
      ).flat();
      const paths = requests.map((request) => new URL(request.url).pathname);
      return (
        paths.some(
          (path) => path.endsWith("/stomo/index.html") || path === "/stomo/",
        ) && paths.some((path) => /\/stomo\/assets\/index-.+\.js$/.test(path))
      );
    });
    expect(cachedApplication).toBe(true);
    return;
  }

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /Quelle histoire/ }),
  ).toBeVisible();
});
