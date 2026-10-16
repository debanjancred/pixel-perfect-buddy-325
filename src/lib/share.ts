/** WhatsApp reminder; without an amount (nothing pledged yet) it asks for chanda generally. */
export function reminderText(lang: "bn" | "en", name: string, club: string, amount?: string) {
  if (lang === "bn")
    return amount
      ? `নমস্কার ${name}, ${club}-এর জন্য আপনার ${amount} চাঁদা এখনো বাকি আছে। আমাদের সংগ্রাহক শীঘ্রই আসবেন, অথবা UPI-তে পাঠাতে পারেন। ধন্যবাদ 🙏`
      : `নমস্কার ${name}, ${club}-এর জন্য আপনার চাঁদা এখনো বাকি আছে। আমাদের সংগ্রাহক শীঘ্রই আসবেন, অথবা UPI-তে পাঠাতে পারেন। ধন্যবাদ 🙏`;
  return amount
    ? `Namaskar ${name}, your chanda of ${amount} for ${club} is still due. Our collector will visit soon, or you can pay by UPI. Thank you 🙏`
    : `Namaskar ${name}, your chanda for ${club} is still due. Our collector will visit soon, or you can pay by UPI. Thank you 🙏`;
}

export function waLink(phone: string | undefined, text: string) {
  const p = phone ? `91${phone.replace(/\D/g, "").slice(-10)}` : "";
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export async function shareOrWhatsApp(text: string, url?: string, phone?: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text });
      return;
    } catch {
      /* cancelled → fall back */
    }
  }
  window.open(waLink(phone, url ? `${text} ${url}` : text), "_blank");
}

/** True when the Web Share API exists. Call after mount: it is undefined during SSR. */
export const canShareNatively = () => typeof navigator !== "undefined" && !!navigator.share;

/** Opens the native share sheet; resolves false if unavailable or the user cancelled. */
export async function shareNatively(data: ShareData): Promise<boolean> {
  if (!canShareNatively()) return false;
  try {
    await navigator.share(data);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  // Give the browser a tick to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Shares a file through the native sheet where the device supports files (most phones,
 * so it lands straight in WhatsApp), otherwise downloads it.
 */
export async function shareFileOrDownload(blob: Blob, filename: string, text?: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (canShareNatively() && navigator.canShare?.({ files: [file] })) {
    if (await shareNatively(text ? { files: [file], text } : { files: [file] })) return "shared";
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
