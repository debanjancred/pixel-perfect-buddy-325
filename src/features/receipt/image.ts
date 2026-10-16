// Draws a receipt as a PNG (for sharing as a picture). Uses the brand palette directly
// rather than theme CSS variables: a receipt is a document and stays light in dark mode.
import type { Lang } from "@/lib/i18n";
import { canvasToBlob, cropHeight, loadFonts, wrapText } from "@/lib/canvas";
import { amountInWords, clubName, receiptFields, type Receipt, type ReceiptFormat } from "./model";

const COLORS = {
  vermilion: "#B71C1C",
  vermilionDeep: "#8E1515",
  gold: "#B8860B",
  goldSoft: "#F7EDD3",
  canvas: "#FDFBF7",
  ink: "#2A211C",
  muted: "#6E625A",
  rule: "#E3D9CC",
  onRed: "#FFFDF8",
} as const;

const W = 1080;
const PAD = 72;
const INNER = W - PAD * 2;

const fontStack = (lang: Lang) =>
  lang === "bn" ? "'Hind Siliguri', Inter, sans-serif" : "Inter, 'Hind Siliguri', sans-serif";

export async function renderReceiptImage(r: Receipt, f: ReceiptFormat, lang: Lang): Promise<Blob> {
  const family = fontStack(lang);
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;
  await loadFonts([font(700, 40), font(500, 40)]);

  // Draw on a tall canvas, then crop to the height actually used.
  const canvas = Object.assign(document.createElement("canvas"), { width: W, height: 3000 });
  const g = canvas.getContext("2d")!;
  g.textBaseline = "alphabetic";
  g.fillStyle = COLORS.canvas;
  g.fillRect(0, 0, W, canvas.height);

  // Header band with the club name.
  g.font = font(700, 60);
  const titleLines = wrapText(g, clubName(r, f), INNER);
  // Baselines: kicker, then title lines, then the area label; the band ends below it.
  const titleY = (i: number) => 176 + i * 76;
  const areaY = titleY(titleLines.length - 1) + 70;
  const headerH = areaY + 62;
  const grad = g.createLinearGradient(0, 0, W, headerH);
  grad.addColorStop(0, COLORS.vermilion);
  grad.addColorStop(1, COLORS.vermilionDeep);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, headerH);
  g.fillStyle = COLORS.gold;
  g.fillRect(0, headerH - 10, W, 10);

  g.textAlign = "center";
  g.fillStyle = COLORS.goldSoft;
  g.font = font(600, 34);
  g.fillText(f.t("receipt"), W / 2, 92);
  g.fillStyle = COLORS.onRed;
  g.font = font(700, 60);
  titleLines.forEach((line, i) => g.fillText(line, W / 2, titleY(i)));
  g.font = font(500, 32);
  g.fillText(r.club.area_label, W / 2, areaY);

  let y = headerH + 90;

  // Receipt number.
  g.fillStyle = COLORS.muted;
  g.font = font(500, 32);
  g.fillText(f.t("receiptNo"), W / 2, y);
  y += 64;
  g.fillStyle = COLORS.vermilion;
  g.font = `700 52px ui-monospace, Menlo, monospace`;
  g.fillText(r.receipt_no, W / 2, y);
  y += 56;

  // Labelled rows: label left, value right (wrapping onto extra lines if long).
  for (const field of receiptFields(r, f)) {
    g.strokeStyle = COLORS.rule;
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(PAD, y);
    g.lineTo(W - PAD, y);
    g.stroke();
    g.setLineDash([]);
    y += 62;
    g.textAlign = "left";
    g.fillStyle = COLORS.muted;
    g.font = font(500, 34);
    g.fillText(field.label, PAD, y);
    const labelW = g.measureText(field.label).width + 40;
    g.textAlign = "right";
    g.fillStyle = COLORS.ink;
    g.font = font(600, 36);
    const lines = wrapText(g, field.value, INNER - labelW);
    lines.forEach((line, i) => g.fillText(line, W - PAD, y + i * 48));
    y += (lines.length - 1) * 48 + 26;
  }

  // Amount box.
  y += 30;
  g.font = font(600, 34);
  const wordLines = wrapText(g, amountInWords(r, f), INNER - 80);
  const boxH = 170 + wordLines.length * 48;
  g.fillStyle = COLORS.goldSoft;
  g.strokeStyle = COLORS.gold;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(PAD, y, INNER, boxH, 28);
  g.fill();
  g.stroke();
  g.textAlign = "center";
  g.fillStyle = COLORS.vermilion;
  g.font = font(800, 92);
  g.fillText(f.money(r.amount), W / 2, y + 112);
  g.fillStyle = COLORS.ink;
  g.font = font(600, 34);
  wordLines.forEach((line, i) => g.fillText(line, W / 2, y + 170 + i * 48));
  y += boxH;

  if (r.voided) {
    g.save();
    g.translate(W / 2, headerH + (y - headerH) / 2);
    g.rotate(-Math.PI / 9);
    g.globalAlpha = 0.22;
    g.fillStyle = COLORS.vermilion;
    g.font = font(800, 200);
    g.fillText(f.t("receiptVoid"), 0, 60);
    g.restore();
    y += 70;
    g.fillStyle = COLORS.vermilion;
    g.font = font(700, 34);
    g.fillText(f.t("receiptVoidNote"), W / 2, y);
  }

  // Thanks + footer.
  y += 96;
  g.fillStyle = COLORS.ink;
  g.font = font(600, 38);
  g.fillText(f.t("receiptThanks"), W / 2, y);
  y += 64;
  g.fillStyle = COLORS.muted;
  g.font = font(500, 28);
  g.fillText(f.t("receiptFooter"), W / 2, y);
  y += PAD;

  return canvasToBlob(cropHeight(canvas, Math.ceil(y)));
}
