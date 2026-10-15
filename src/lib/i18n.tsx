import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { indian, toBnDigits } from "./format";

export type Lang = "bn" | "en";

const dict = {
  app: ["পুজো খাতা", "Pujo Khata"],
  home: ["হোম", "Home"],
  chanda: ["চাঁদা", "Chanda"],
  expense: ["খরচ", "Expenses"],
  events: ["প্রতিযোগিতা", "Events"],
  admin: ["ক্লাব", "Club"],
  collected: ["আদায়", "Collected"],
  spent: ["খরচ", "Spent"],
  balance: ["হাতে জমা", "Net balance"],
  target: ["লক্ষ্য", "Target"],
  addChanda: ["চাঁদা জমা", "Add Chanda"],
  addExpense: ["খরচ লিখুন", "Add Expense"],
  shareAccounts: ["হিসাব শেয়ার", "Share Accounts"],
  recent: ["সাম্প্রতিক কার্যকলাপ", "Live activity"],
  offlineSaved: ["অফলাইন — ফোনে সংরক্ষিত", "Offline — Saved locally"],
  offline: ["অফলাইন", "Offline"],
  online: ["অনলাইন", "Online"],
  pendingSync: ["টি সিঙ্কের অপেক্ষায়", "waiting to sync"],
  synced: ["সব সিঙ্ক হয়েছে", "All changes synced"],
  pullRefresh: ["ছেড়ে দিন, রিফ্রেশ হবে", "Release to refresh"],
  refreshed: ["হালনাগাদ হয়েছে", "Refreshed"],
  chandaRegister: ["চাঁদার খাতা", "Chanda Register"],
  all: ["সব", "All"],
  paid: ["জমা", "Paid"],
  pending: ["বাকি", "Pending"],
  promised: ["প্রতিশ্রুত", "Promised"],
  today: ["আজ আদায়", "Collected Today"],
  search: ["নাম বা বাড়ি নম্বর খুঁজুন", "Search name or house no."],
  remind: ["রিমাইন্ডার", "Remind"],
  collect: ["আদায়", "Collect"],
  collector: ["আদায়কারী", "Collector"],
  pledged: ["প্রতিশ্রুতি", "Pledged"],
  houses: ["বাড়ি", "houses"],
  noResults: ["কিছু পাওয়া যায়নি", "Nothing found"],
  collectTitle: ["চাঁদা গ্রহণ", "Collect Chanda"],
  household: ["বাড়ি / পরিবার", "Household"],
  addHousehold: ["নতুন বাড়ি যোগ করুন", "Add new household"],
  residentName: ["বাসিন্দার নাম", "Resident name"],
  houseNo: ["বাড়ি নং", "House no."],
  lane: ["লেন / ব্লক", "Lane / Block"],
  phone: ["মোবাইল নম্বর", "Mobile number"],
  amount: ["টাকার পরিমাণ", "Amount"],
  other: ["অন্য", "Other"],
  mode: ["পেমেন্ট পদ্ধতি", "Payment mode"],
  cash: ["নগদ", "Cash"],
  upi: ["UPI / অনলাইন", "UPI / Online"],
  save: ["সংরক্ষণ করুন", "Save"],
  saveReceipt: ["জমা ও রসিদ তৈরি", "Save & make receipt"],
  change: ["বদলান", "Change"],
  receipt: ["চাঁদার রসিদ", "Chanda Receipt"],
  receiptNo: ["রসিদ নং", "Receipt No"],
  date: ["তারিখ", "Date"],
  receivedFrom: ["প্রাপক / দাতা", "Received from"],
  inWords: ["কথায়", "In words"],
  share: ["শেয়ার করুন", "Share"],
  whatsapp: ["হোয়াটসঅ্যাপ", "WhatsApp"],
  done: ["ঠিক আছে", "Done"],
  expenseLedger: ["খরচের খাতা", "Expense Ledger"],
  cat_pandal: ["প্যান্ডেল", "Pandal"],
  cat_pratima: ["প্রতিমা", "Idol"],
  cat_lighting: ["আলোকসজ্জা", "Lighting"],
  cat_bhog: ["ভোগ", "Bhog"],
  cat_cultural: ["অনুষ্ঠান", "Cultural"],
  cat_misc: ["বিবিধ", "Misc"],
  itemName: ["খরচের বিবরণ", "Item"],
  approvedBy: ["অনুমোদন", "Approved by"],
  category: ["বিভাগ", "Category"],
  receiptPhoto: ["রসিদ / ভাউচারের ছবি", "Receipt / voucher photo"],
  takePhoto: ["ছবি তুলুন বা আপলোড", "Take or upload photo"],
  publicAudit: ["সর্বজনীন স্বচ্ছ হিসাব", "Public Audit"],
  verified: ["স্বচ্ছ খাতা · যাচাইকৃত", "Verified Public Account"],
  readOnly: ["শুধু দেখার জন্য · লগইন লাগবে না", "Read-only · No login needed"],
  byCategory: ["বিভাগ অনুযায়ী খরচ", "Spending by category"],
  collVsExp: ["আদায় বনাম খরচ", "Collections vs expenses"],
  storyCard: ["স্টোরি কার্ড", "Story card"],
  download: ["ডাউনলোড", "Download"],
  eventsTitle: ["পুজো প্রতিযোগিতা", "Pujo Competitions"],
  registered: ["নাম নথিভুক্ত", "registered"],
  register: ["নাম লেখান +১", "Register +1"],
  shareLink: ["লিংক শেয়ার", "Share link"],
  full: ["পূর্ণ", "Full"],
  adminTitle: ["ক্লাব ও দায়িত্ব", "Club & Roles"],
  role_secretary: ["সম্পাদক / অ্যাডমিন", "Secretary / Admin"],
  role_treasurer: ["কোষাধ্যক্ষ", "Treasurer"],
  role_collector: ["চাঁদা সংগ্রাহক", "Field Collector"],
  addMember: ["সদস্য যোগ করুন", "Add member"],
  name: ["নাম", "Name"],
  export: ["ডেটা এক্সপোর্ট (Excel / CSV)", "Export data (Excel / CSV)"],
  exportChanda: ["চাঁদা CSV", "Chanda CSV"],
  exportExpense: ["খরচ CSV", "Expenses CSV"],
  preferences: ["পছন্দ", "Preferences"],
  darkMode: ["ডার্ক মোড", "Dark mode"],
  bnDigits: ["বাংলা সংখ্যা (১২,৫০০)", "Bengali numerals (১২,৫০০)"],
  language: ["ভাষা", "Language"],
  logout: ["লগ আউট", "Log out"],
  resetDemo: ["ডেমো রিসেট", "Reset demo data"],
  switchClub: ["ক্লাব বদলান", "Switch club"],
  createClub: ["নতুন ক্লাব তৈরি", "Create new club"],
  clubName: ["ক্লাবের নাম", "Club name"],
  para: ["পাড়া / লেন", "Para / Lane"],
  zone: ["জোন", "Zone"],
  year: ["পুজোর বছর", "Puja year"],
  cancel: ["বাতিল", "Cancel"],
  tagline: ["পাড়ার পুজোর চাঁদা ও খরচের স্বচ্ছ হিসাব", "Transparent chanda & expense accounts for your para's puja"],
  sendOtp: ["OTP পাঠান", "Send OTP"],
  enterOtp: ["OTP লিখুন", "Enter OTP"],
  autofill: ["Auto-fill OTP 1234", "Auto-fill OTP 1234"],
  verify: ["যাচাই করে ঢুকুন", "Verify & continue"],
  orLabel: ["অথবা", "or"],
  exploreDemo: ["ডেমো ক্লাব দেখুন", "Explore Demo Club"],
  chooseClub: ["আপনার ক্লাব বেছে নিন", "Choose your club"],
  minsAgo: ["মিনিট আগে", "min ago"],
  hrsAgo: ["ঘণ্টা আগে", "h ago"],
  daysAgo: ["দিন আগে", "d ago"],
  justNow: ["এইমাত্র", "just now"],
  viewAll: ["সব দেখুন", "View all"],
} as const;

export type TKey = keyof typeof dict;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  bnDigits: boolean;
  setBnDigits: (b: boolean) => void;
  dark: boolean;
  setDark: (b: boolean) => void;
  t: (k: TKey) => string;
  n: (v: number | string) => string;
  money: (v: number) => string;
  ago: (iso: string) => string;
  pick: (bn: string, en: string) => string;
}

const I18nCtx = createContext<Ctx | null>(null);
const PREF = "pk_prefs_v1";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("bn");
  const [bnDigits, setBnDigits] = useState(true);
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
      if (p.lang) setLang(p.lang);
      if (typeof p.bnDigits === "boolean") setBnDigits(p.bnDigits);
      if (typeof p.dark === "boolean") setDark(p.dark);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("dark", dark);
    if (loaded) localStorage.setItem(PREF, JSON.stringify({ lang, bnDigits, dark }));
  }, [lang, bnDigits, dark, loaded]);

  const n = useCallback((v: number | string) => {
    const s = typeof v === "number" ? indian(v) : v;
    return lang === "bn" && bnDigits ? toBnDigits(s) : s;
  }, [lang, bnDigits]);

  const value = useMemo<Ctx>(() => {
    const t = (k: TKey) => dict[k][lang === "bn" ? 0 : 1];
    return {
      lang, setLang, bnDigits, setBnDigits, dark, setDark, t, n,
      money: (v) => "₹" + n(v),
      pick: (bn, en) => (lang === "bn" ? bn : en),
      ago: (iso) => {
        const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        if (m < 1) return t("justNow");
        if (m < 60) return `${n(String(m))} ${t("minsAgo")}`;
        const h = Math.round(m / 60);
        if (h < 24) return `${n(String(h))} ${t("hrsAgo")}`;
        return `${n(String(Math.round(h / 24)))} ${t("daysAgo")}`;
      },
    };
  }, [lang, bnDigits, dark, n]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
