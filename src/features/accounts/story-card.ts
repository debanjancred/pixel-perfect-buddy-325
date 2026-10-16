// 1080×1920 story-format PNG of the accounts (WhatsApp/Instagram status). Brand palette
// directly, like the receipt image: it is a shareable document, independent of theme.
import type { Lang } from "@/lib/i18n";
import { canvasToBlob, loadFonts, wrapText } from "@/lib/canvas";
import type { AccountsSummary, Club } from "@/types/domain";
import type { I18n } from "@/lib/i18n";

const C = {
  vermilion: "#B71C1C",
  deep: "#7F1212",
  gold: "#E0B24A",
  light: "#FFFDF8",
  soft: "#F7EDD3",
};
const W = 1080;
const H = 1920;

export async function renderStoryCard(
  club: Club,
  s: AccountsSummary,
  f: Pick<I18n, "t" | "money" | "pick" | "n">,
  lang: Lang,
): Promise<Blob> {
  const family =
    lang === "bn" ? "'Hind Siliguri', Inter, sans-serif" : "Inter, 'Hind Siliguri', sans-serif";
  const font = (w: number, px: number) => `${w} ${px}px ${family}`;
  await loadFonts([font(700, 48), font(800, 48)]);

  const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, C.vermilion);
  grad.addColorStop(1, C.deep);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = C.gold;
  g.lineWidth = 6;
  g.strokeRect(50, 50, W - 100, H - 100);

  g.textAlign = "center";
  g.fillStyle = C.gold;
  g.font = font(700, 46);
  g.fillText(`✦ ${f.t("verified")} ✦`, W / 2, 220);

  g.fillStyle = C.light;
  g.font = font(700, 68);
  const title = wrapText(g, f.pick(club.name_bn, club.name_en), 860);
  title.forEach((line, i) => g.fillText(line, W / 2, 360 + i * 90));

  const rows: [string, number][] = [
    [f.t("collected"), s.total_collected],
    [f.t("spent"), s.total_expenses],
    [f.t("balance"), s.net_balance],
  ];
  const top = 420 + title.length * 90 + 120;
  rows.forEach(([label, value], i) => {
    const y = top + i * 270;
    g.font = font(600, 48);
    g.fillStyle = C.gold;
    g.fillText(label, W / 2, y);
    g.font = font(800, 116);
    g.fillStyle = C.light;
    g.fillText(f.money(value), W / 2, y + 128);
  });

  // Target progress bar.
  const barY = top + rows.length * 270 + 30;
  g.fillStyle = "rgba(255,253,248,0.2)";
  g.beginPath();
  g.roundRect(140, barY, W - 280, 28, 14);
  g.fill();
  g.fillStyle = C.gold;
  g.beginPath();
  g.roundRect(140, barY, Math.max(28, ((W - 280) * s.progress_pct) / 100), 28, 14);
  g.fill();
  g.fillStyle = C.soft;
  g.font = font(600, 40);
  g.fillText(
    `${f.t("target")} ${f.money(s.collection_target)} · ${f.n(String(s.progress_pct))}%`,
    W / 2,
    barY + 96,
  );

  g.font = font(600, 44);
  g.fillStyle = C.gold;
  g.fillText("পুজো খাতা · Pujo Khata", W / 2, H - 140);
  return canvasToBlob(canvas);
}
