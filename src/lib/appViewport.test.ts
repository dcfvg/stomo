import { describe, expect, it } from "vitest";
import { measureAppViewport } from "./appViewport";

function viewport(
  visibleHeight: number,
  innerHeight: number,
  fullscreen: boolean,
  offsetTop = 0,
) {
  return measureAppViewport(
    {
      innerHeight,
      visualViewport: { height: visibleHeight, offsetTop },
    } as unknown as Window,
    { fullscreenElement: fullscreen ? {} : null } as unknown as Document,
  );
}

describe("zone visible de l’application", () => {
  it("suit normalement la hauteur visible", () => {
    expect(viewport(640, 640, false)).toMatchObject({
      height: 640,
      bottomInset: 0,
      fullscreenHeight: 0,
    });
  });

  it("garde la scène stable si la barre Android revient en plein écran", () => {
    const expanded = viewport(640, 640, true);
    const withSystemBar = measureAppViewport(
      {
        innerHeight: 592,
        visualViewport: { height: 592, offsetTop: 0 },
      } as unknown as Window,
      { fullscreenElement: {} } as unknown as Document,
      expanded.fullscreenHeight,
    );

    expect(withSystemBar).toMatchObject({
      height: 640,
      bottomInset: 48,
      fullscreenHeight: 640,
    });
  });

  it("expose aussi un éventuel décalage en haut", () => {
    expect(viewport(610, 640, true, 30)).toMatchObject({
      height: 640,
      topInset: 30,
      bottomInset: 0,
    });
  });
});
