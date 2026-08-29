import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStomoStore } from "../state/useStomoStore";
import type { ProjectRecord } from "../types";
import { Home } from "./Home";

const project: ProjectRecord = {
  id: "project-card",
  name: "Le dragon",
  createdAt: new Date("2026-08-28T08:00:00Z").getTime(),
  updatedAt: new Date("2026-08-29T08:32:00Z").getTime(),
  fps: 8,
  countdownSeconds: 2,
  onionOpacity: 0.4,
  onionFrameCount: 2,
  autoPreviewFrames: 6,
  autoPreviewLoops: 2,
  width: 1920,
  height: 1080,
  frameCount: 0,
  gridEnabled: false,
  cameraFacing: "environment",
  cameraDeviceId: null,
  orientation: "landscape",
};

describe("liste des films", () => {
  afterEach(cleanup);

  it("ouvre un film en touchant toute sa carte et montre sa date", async () => {
    const openFilm = vi.fn().mockResolvedValue(undefined);
    useStomoStore.setState({ projects: [project], openFilm });
    const user = userEvent.setup();
    render(<Home sessionActive={false} sessionId={null} sessionEvents={[]} />);

    const card = screen.getByRole("button", { name: "Continuer Le dragon" });
    expect(screen.getByText(/Modifié le/)).toBeInTheDocument();
    await user.click(card);
    expect(openFilm).toHaveBeenCalledWith(project.id);
  });
});
