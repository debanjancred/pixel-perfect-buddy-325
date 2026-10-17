// Small 2D-canvas helpers for generated images (receipts, story cards).

/** Splits text into lines no wider than `maxWidth` in the context's current font. */
export function wrapText(g: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Waits for web fonts so the first draw doesn't fall back to a system font. */
export async function loadFonts(fonts: string[]) {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => [])));
  await document.fonts.ready;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), type),
  );
}

/** Copies the top `height` pixels into a new canvas, so layouts can be drawn before sizing. */
export function cropHeight(src: HTMLCanvasElement, height: number) {
  const out = Object.assign(document.createElement("canvas"), { width: src.width, height });
  out.getContext("2d")!.drawImage(src, 0, 0);
  return out;
}
