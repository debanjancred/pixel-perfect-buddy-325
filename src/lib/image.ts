// Client-side photo compression for voucher images (SPEC Story 3.1 / SHOULD HAVE).
// A phone photo of a bill is 3–8 MB; we keep it legible (long side ≤ 1600px) but small
// enough for IndexedDB and a future upload on a weak connection. Re-encoding also drops
// EXIF metadata such as GPS location.

export type ImageErrorCode = "err_photoType" | "err_photoRead" | "err_photoTooLarge";

export class ImageError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(code);
    this.name = "ImageError";
  }
}

export interface CompressOptions {
  /** Longest side in pixels after scaling. */
  maxSide?: number;
  /** Target size; quality, then dimensions, are lowered until the result fits. */
  maxBytes?: number;
  /** Inputs larger than this are refused before decoding (protects low-memory phones). */
  maxInputBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSide: 1600,
  maxBytes: 400_000,
  maxInputBytes: 25_000_000,
};

const QUALITIES = [0.82, 0.72, 0.62, 0.52];
const MAX_DOWNSCALES = 3;
const DOWNSCALE = 0.75;

/** Scale factor (≤ 1) that fits `width × height` within `maxSide` on its longest side. */
export const fitScale = (width: number, height: number, maxSide: number) =>
  Math.min(1, maxSide / Math.max(width, height, 1));

/**
 * Search strategy, kept free of canvas so it can be unit-tested: tries decreasing JPEG
 * quality at full size, then shrinks the image and tries again. Returns the first result
 * under `maxBytes`, or the smallest one produced.
 */
export async function pickEncoding(
  encode: (scale: number, quality: number) => Promise<Blob>,
  maxBytes: number,
): Promise<Blob> {
  let best: Blob | null = null;
  for (let step = 0, scale = 1; step <= MAX_DOWNSCALES; step++, scale *= DOWNSCALE) {
    for (const q of QUALITIES) {
      const blob = await encode(scale, q);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= maxBytes) return blob;
    }
  }
  return best!;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through: some browsers reject options or formats here but load them in <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Compresses a photo to a JPEG. Throws `ImageError` with an i18n error key. */
export async function compressImage(file: Blob, options: CompressOptions = {}): Promise<Blob> {
  const { maxSide, maxBytes, maxInputBytes } = { ...DEFAULTS, ...options };
  if (!file.type.startsWith("image/")) throw new ImageError("err_photoType");
  if (file.size > maxInputBytes) throw new ImageError("err_photoTooLarge");

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    // Typically HEIC on a browser without HEIC support, or a corrupt file.
    throw new ImageError("err_photoRead");
  }
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  const base = fitScale(width, height, maxSide);

  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d");
  if (!g) throw new ImageError("err_photoRead");

  const encode = (scale: number, quality: number) => {
    canvas.width = Math.max(1, Math.round(width * base * scale));
    canvas.height = Math.max(1, Math.round(height * base * scale));
    // JPEG has no alpha: paint white so transparent PNGs don't turn black.
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new ImageError("err_photoRead"))),
        "image/jpeg",
        quality,
      ),
    );
  };

  try {
    return await pickEncoding(encode, maxBytes);
  } finally {
    if ("close" in source) source.close();
  }
}
