const TITLE_BACKGROUND = "#090b0d";
const TITLE_FOREGROUND = "#ffffff";
const TITLE_FONT = '"Lexend Variable", "Lexend", sans-serif';

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Stomo n’a pas réussi à préparer le titre."));
      },
      "image/webp",
      0.92,
    );
  });
}

function splitLongWord(
  word: string,
  measure: (value: string) => number,
  maxWidth: number,
) {
  const parts: string[] = [];
  let part = "";
  for (const character of word) {
    const candidate = `${part}${character}`;
    if (part && measure(candidate) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = candidate;
    }
  }
  if (part) parts.push(part);
  return parts;
}

export function wrapTitleText(
  title: string,
  measure: (value: string) => number,
  maxWidth: number,
) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const sourceWord of words) {
    const pieces =
      measure(sourceWord) > maxWidth
        ? splitLongWord(sourceWord, measure, maxWidth)
        : [sourceWord];
    for (const word of pieces) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["Mon film"];
}

export async function renderTitleCard(
  title: string,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Stomo n’a pas réussi à préparer le titre.");

  const safeTitle = title.trim().slice(0, 60) || "Mon film";
  const maxWidth = width * 0.8;
  const maxTextHeight = height * 0.6;
  const minimumFontSize = Math.max(
    48,
    Math.floor(Math.min(width, height) * 0.05),
  );
  let fontSize = Math.min(
    200,
    Math.floor(Math.min(width * 0.13, height * 0.18)),
  );
  await document.fonts
    ?.load(`700 ${fontSize}px ${TITLE_FONT}`, safeTitle)
    .catch(() => undefined);

  let lines: string[] = [];
  while (fontSize >= minimumFontSize) {
    context.font = `700 ${fontSize}px ${TITLE_FONT}`;
    lines = wrapTitleText(
      safeTitle,
      (value) => context.measureText(value).width,
      maxWidth,
    );
    if (lines.length <= 3 && lines.length * fontSize * 1.18 <= maxTextHeight)
      break;
    fontSize -= 4;
  }

  context.fillStyle = TITLE_BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.fillStyle = TITLE_FOREGROUND;
  context.font = `700 ${fontSize}px ${TITLE_FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lineHeight = fontSize * 1.18;
  const firstLineY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines
    .slice(0, 3)
    .forEach((line, index) =>
      context.fillText(line, width / 2, firstLineY + index * lineHeight),
    );

  const blob = await canvasBlob(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}
