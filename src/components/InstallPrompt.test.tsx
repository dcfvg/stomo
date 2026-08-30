import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BeforeInstallPromptEvent, InstallPrompt } from "./InstallPrompt";

function makeInstallEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", {
    cancelable: true,
  }) as BeforeInstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: {
      value: Promise.resolve({ outcome, platform: "web" }),
    },
  });
  return { event, prompt };
}

describe("proposition d’installation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    delete (navigator as Navigator & { standalone?: boolean }).standalone;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it("explique l’installation manuelle avant que Chrome propose son dialogue", async () => {
    const user = userEvent.setup();
    render(<InstallPrompt />);
    await user.click(screen.getByRole("button", { name: "Comment installer" }));
    expect(screen.getByText(/Ajouter à l’écran d’accueil/)).toBeInTheDocument();
  });

  it("donne le chemin du menu Partager sur iPhone et iPad", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: false,
    });
    render(<InstallPrompt />);
    await user.click(screen.getByRole("button", { name: "Comment installer" }));

    expect(screen.getByText(/Touche Partager/)).toBeInTheDocument();
  });

  it("propose puis déclenche l’installation fournie par Chrome", async () => {
    const user = userEvent.setup();
    render(<InstallPrompt />);
    const { event, prompt } = makeInstallEvent();

    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    await user.click(
      await screen.findByRole("button", { name: "Installer Stomo" }),
    );

    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Installer Stomo" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("disparaît dès que Chrome confirme l’installation", async () => {
    render(<InstallPrompt />);
    const { event } = makeInstallEvent();
    act(() => window.dispatchEvent(event));
    expect(
      await screen.findByText("Installe Stomo sur ce téléphone"),
    ).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(
      screen.queryByText("Installe Stomo sur ce téléphone"),
    ).not.toBeInTheDocument();
  });

  it("ne propose rien lorsque Stomo est déjà ouvert comme application", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
    } as MediaQueryList);
    render(<InstallPrompt />);
    const { event } = makeInstallEvent();
    act(() => window.dispatchEvent(event));

    expect(
      screen.queryByText("Installe Stomo sur ce téléphone"),
    ).not.toBeInTheDocument();
  });
});
