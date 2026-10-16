import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { indian, toBnDigits } from "./format";
import { numberToWords } from "./number-words";

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
  // SPEC §6.5: "Net Balance", never "cash in hand" — it includes UPI money.
  balance: ["নিট ব্যালান্স", "Net balance"],
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
  share: ["শেয়ার করুন", "Share"],
  whatsapp: ["হোয়াটসঅ্যাপ", "WhatsApp"],
  done: ["ঠিক আছে", "Done"],
  donor: ["দাতা", "Donor"],
  address: ["ঠিকানা", "Address"],
  paidVia: ["মাধ্যম", "Paid via"],
  amountInWords: ["{words} টাকা মাত্র", "Rupees {words} Only"],
  receiptThanks: ["আপনার চাঁদার জন্য আন্তরিক ধন্যবাদ 🙏", "Thank you for your chanda 🙏"],
  receiptFooter: ["পুজো খাতা · ডিজিটাল রসিদ", "Pujo Khata · Digital receipt"],
  receiptVoid: ["বাতিল", "VOID"],
  receiptVoidNote: ["এই রসিদটি বাতিল করা হয়েছে", "This receipt has been voided"],
  receiptNotFound: ["রসিদটি পাওয়া যায়নি", "Receipt not found"],
  receiptNotFoundHint: [
    "এন্ট্রিটি হয়তো এই ফোনে নেই বা এটি শুধু প্রতিশ্রুতি",
    "The entry may not be on this phone, or it is only a pledge",
  ],
  viewReceipt: ["রসিদ", "Receipt"],
  print: ["প্রিন্ট", "Print"],
  receiptImage: ["ছবি", "Image"],
  imageFailed: ["ছবি তৈরি করা যায়নি", "Couldn't create the image"],
  back: ["ফিরে যান", "Back"],
  expenseLedger: ["খরচের খাতা", "Expense Ledger"],
  cat_pandal: ["প্যান্ডেল", "Pandal"],
  cat_idol: ["প্রতিমা", "Idol"],
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
  accountsNotFound: ["এই ক্লাবের হিসাব পাওয়া যায়নি", "No accounts found for this club"],
  accountsNotFoundHint: [
    "এখন হিসাব শুধু যে ফোনে লেখা হয়েছে সেখানেই দেখা যায়",
    "For now, accounts can only be viewed on the phone they were recorded on",
  ],
  download: ["ডাউনলোড", "Download"],
  eventsTitle: ["পুজো প্রতিযোগিতা", "Pujo Competitions"],
  registered: ["নাম নথিভুক্ত", "registered"],
  register: ["নাম লেখান", "Register"],
  addEvent: ["নতুন প্রতিযোগিতা", "Add event"],
  eventTitle: ["প্রতিযোগিতার নাম", "Event name"],
  eventsToday: ["আজ", "Today"],
  eventsUpcoming: ["আসছে", "Upcoming"],
  eventsPast: ["শেষ হয়েছে", "Finished"],
  tomorrow: ["আগামীকাল", "Tomorrow"],
  inDays: ["{days} দিন বাকি", "In {days} days"],
  registrationClosed: ["নাম লেখানো বন্ধ", "Registration closed"],
  registeredOne: ["{title}: একজনের নাম লেখা হয়েছে", "{title}: one registration added"],
  undo: ["ফিরিয়ে নিন", "Undo"],
  eventAdded: ["প্রতিযোগিতা যোগ হয়েছে", "Event added"],
  noEvents: ["এখনো কোনো প্রতিযোগিতা নেই", "No events yet"],
  noEventsHint: [
    "বসে আঁকো, ধুনুচি নাচের মতো প্রতিযোগিতা যোগ করুন",
    "Add competitions like Sit & Draw or Dhunuchi Dance",
  ],
  eventShare: [
    "{club}\n🎉 {title}\n📅 {date}\n{count} জন নাম লিখিয়েছেন। নাম লেখাতে ক্লাবের সদস্যদের সাথে যোগাযোগ করুন 🙏",
    "{club}\n🎉 {title}\n📅 {date}\n{count} registered so far. Contact the club to register 🙏",
  ],
  err_memberExists: [
    "এই নম্বরে আগে থেকেই একজন সদস্য আছেন",
    "A member with this number already exists",
  ],
  err_lastAdmin: ["ক্লাবে অন্তত একজন অ্যাডমিন থাকতে হবে", "The club must keep at least one admin"],
  settingsTitle: ["সেটিংস", "Settings"],
  members: ["সদস্য", "Members"],
  noMembersInRole: ["কেউ নেই", "No one yet"],
  roleChanged: ["{name} এখন {role}", "{name} is now {role}"],
  memberAdded: ["সদস্য যোগ হয়েছে", "Member added"],
  role: ["দায়িত্ব", "Role"],
  appVersion: ["সংস্করণ", "Version"],
  resetDemoConfirm: [
    "নমুনা ক্লাবের সব ডেটা মুছে নতুন করে সাজানো হবে। চালিয়ে যাবেন?",
    "All sample club data will be replaced with fresh sample data. Continue?",
  ],
  logoutConfirm: ["লগ আউট করবেন?", "Log out?"],
  confirm: ["হ্যাঁ, চালিয়ে যান", "Yes, continue"],
  csv_receipt_no: ["রসিদ নং", "Receipt no."],
  csv_date: ["তারিখ", "Date"],
  csv_resident: ["বাসিন্দা", "Resident"],
  csv_house: ["বাড়ি নং", "House no."],
  csv_lane: ["লেন / ব্লক", "Lane / Block"],
  csv_amount: ["টাকা", "Amount (₹)"],
  csv_method: ["মাধ্যম", "Method"],
  csv_status: ["অবস্থা", "Status"],
  csv_collector: ["আদায়কারী", "Collector"],
  csv_void_reason: ["বাতিলের কারণ", "Void reason"],
  csv_category: ["বিভাগ", "Category"],
  csv_title: ["বিবরণ", "Item"],
  csv_paid_to: ["কাকে দেওয়া", "Paid to"],
  csv_authorized_by: ["অনুমোদন", "Authorised by"],
  status_collected: ["আদায়", "Collected"],
  status_promised: ["প্রতিশ্রুত", "Promised"],
  status_void: ["বাতিল", "Void"],
  err_eventPast: ["আজ বা পরের কোনো তারিখ দিন", "Choose today or a later date"],
  role_admin: ["অ্যাডমিন", "Admin"],
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
  yourName: ["আপনার নাম", "Your name"],
  creatorHint: [
    "আপনি এই ক্লাবের অ্যাডমিন হবেন — পরে সদস্য যোগ করতে পারবেন",
    "You'll be this club's admin — you can add members later",
  ],
  para: ["পাড়া / লেন", "Para / Lane"],
  zone: ["জোন", "Zone"],
  year: ["পুজোর বছর", "Puja year"],
  cancel: ["বাতিল", "Cancel"],
  tagline: [
    "পাড়ার পুজোর চাঁদা ও খরচের স্বচ্ছ হিসাব",
    "Transparent chanda & expense accounts for your para's puja",
  ],
  sendOtp: ["OTP পাঠান", "Send OTP"],
  enterOtp: ["OTP লিখুন", "Enter OTP"],
  autofill: ["ডেমো OTP 1234 বসান", "Auto-fill demo OTP 1234"],
  verify: ["যাচাই করে ঢুকুন", "Verify & continue"],
  orLabel: ["অথবা", "or"],
  exploreDemo: ["নমুনা ক্লাব দেখুন", "Explore Sample Club"],
  chooseClub: ["আপনার ক্লাব বেছে নিন", "Choose your club"],
  minsAgo: ["মিনিট আগে", "min ago"],
  hrsAgo: ["ঘণ্টা আগে", "h ago"],
  daysAgo: ["দিন আগে", "d ago"],
  justNow: ["এইমাত্র", "just now"],
  viewAll: ["সব দেখুন", "View all"],
  notFound: ["পাতাটি পাওয়া যায়নি", "Page not found"],
  goHome: ["হোমে ফিরুন", "Go home"],
  loadFailed: ["পাতাটি লোড হয়নি", "This page didn't load"],
  loadFailedHint: [
    "কিছু একটা গোলমাল হয়েছে। রিফ্রেশ করুন বা হোমে ফিরুন।",
    "Something went wrong. Try refreshing or head back home.",
  ],
  tryAgain: ["আবার চেষ্টা করুন", "Try again"],
  close: ["বন্ধ করুন", "Close"],
  offlineReady: ["অফলাইনেও চলে", "Offline-ready"],
  demoClub: ["নমুনা পূজা কমিটি", "Sample Puja Committee"],
  paidTo: ["কাকে দেওয়া হয়েছে", "Paid to"],
  err_noClub: ["কোনো ক্লাব বেছে নেওয়া হয়নি", "No club selected"],
  err_notFound: ["রেকর্ডটি পাওয়া যায়নি", "Record not found"],
  err_alreadyVoid: ["এই এন্ট্রি আগেই বাতিল হয়েছে", "This entry is already void"],
  err_voidReason: ["বাতিলের কারণ লিখুন (অন্তত ৩ অক্ষর)", "Give a reason (at least 3 characters)"],
  err_authorizer: [
    "অনুমোদনকারী হিসেবে কোষাধ্যক্ষ বা অ্যাডমিন বেছে নিন",
    "Choose a treasurer or admin to authorise",
  ],
  err_date: ["সঠিক তারিখ দিন", "Enter a valid date"],
  err_voucher: ["ছবিটি সংরক্ষণ করা যায়নি", "Couldn't save the photo"],
  err_dateFuture: ["ভবিষ্যতের তারিখ দেওয়া যাবে না", "The date can't be in the future"],
  err_photoType: ["শুধু ছবি (JPG, PNG) দেওয়া যাবে", "Please choose a photo (JPG, PNG)"],
  err_photoRead: [
    "ছবিটি খোলা যায়নি — অন্য ছবি বা ক্যামেরা ব্যবহার করুন",
    "Couldn't open this photo — try another one or the camera",
  ],
  err_photoTooLarge: ["ছবিটি অনেক বড়", "This photo is too large"],
  removePhoto: ["ছবি সরান", "Remove photo"],
  changePhoto: ["ছবি বদলান", "Change photo"],
  viewPhoto: ["ভাউচারের ছবি দেখুন", "View voucher photo"],
  noPhoto: ["ছবি নেই", "No photo"],
  compressing: ["ছবি ছোট করা হচ্ছে…", "Optimising photo…"],
  expenseDetails: ["খরচের তথ্য", "Expense details"],
  entries: ["টি এন্ট্রি", "entries"],
  recorded: ["লেখা হয়েছে", "Recorded"],
  syncStatus: ["সিঙ্ক", "Sync"],
  syncedOne: ["সিঙ্ক হয়েছে", "Synced"],
  syncFailed: ["সিঙ্ক ব্যর্থ", "Sync failed"],
  voidedExpense: ["এই খরচটি বাতিল করা হয়েছে", "This expense has been voided"],
  voidReason: ["কারণ", "Reason"],
  noExpenses: ["এখনো কোনো খরচ লেখা হয়নি", "No expenses yet"],
  noExpensesHint: [
    "বিলের ছবি সহ প্রথম খরচটি লিখুন",
    "Record the first one with a photo of the bill",
  ],
  noExpensesInCategory: ["এই বিভাগে কোনো খরচ নেই", "No expenses in this category"],
  otpSentTo: ["OTP পাঠানো হয়েছে", "OTP sent to"],
  changeNumber: ["নম্বর বদলান", "Change number"],
  resendOtp: ["আবার OTP পাঠান", "Resend OTP"],
  resendIn: ["আবার পাঠানো যাবে", "Resend in"],
  sec: [" সেকেন্ডে", "s"],
  err_required: ["এই ঘরটি পূরণ করুন", "This field is required"],
  err_phone: [
    "সঠিক ১০ সংখ্যার মোবাইল নম্বর দিন (৬–৯ দিয়ে শুরু)",
    "Enter a valid 10-digit mobile number (starts with 6–9)",
  ],
  err_otp: ["৪ সংখ্যার OTP দিন", "Enter the 4-digit OTP"],
  err_otpWrong: ["OTP মেলেনি, আবার চেষ্টা করুন", "Incorrect OTP, try again"],
  err_otpExpired: ["অনেকবার ভুল হয়েছে — নতুন OTP পাঠান", "Too many attempts — request a new OTP"],
  err_clubNameShort: ["নাম অন্তত ৩ অক্ষরের হতে হবে", "Name must be at least 3 characters"],
  err_clubExists: ["এই নামে ক্লাব আগে থেকেই আছে", "A club with this name already exists"],
  err_tooLong: ["লেখাটি অনেক বড়", "This is too long"],
  err_nameShort: ["নাম অন্তত ২ অক্ষরের হতে হবে", "Name must be at least 2 characters"],
  err_amount: [
    "₹১ থেকে ₹১০ লক্ষের মধ্যে টাকার পরিমাণ দিন",
    "Enter an amount between ₹1 and ₹10 lakh",
  ],
  err_household: ["বাড়ি বেছে নিন বা নতুন বাড়ি যোগ করুন", "Pick a household or add a new one"],
  err_householdExists: [
    "এই বাড়িতে এই নামে আগে থেকেই নথিভুক্ত আছে",
    "This resident is already registered at this house",
  ],
  err_collector: ["আদায়কারী বেছে নিন", "Choose a collector"],
  dueAmount: ["বাকি আছে", "Balance due"],
  paidSoFar: ["জমা হয়েছে", "Paid so far"],
  emptyRegister: ["এখনো কোনো বাড়ি যোগ হয়নি", "No households yet"],
  emptyRegisterHint: [
    "চাঁদা জমা থেকে প্রথম বাড়ি যোগ করুন",
    "Add the first one while collecting chanda",
  ],
  noActivity: ["এখনো কোনো লেনদেন নেই", "No transactions yet"],
  err_target: [
    "লক্ষ্য ₹১,০০০ থেকে ₹১০ কোটির মধ্যে হতে হবে",
    "Target must be between ₹1,000 and ₹10 crore",
  ],
} as const;

export type TKey = keyof typeof dict;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  bnDigits: boolean;
  setBnDigits: (b: boolean) => void;
  dark: boolean;
  setDark: (b: boolean) => void;
  /** Translates a key; `{name}` placeholders are filled from `vars`. */
  t: (k: TKey, vars?: Record<string, string>) => string;
  n: (v: number | string) => string;
  money: (v: number) => string;
  /** Whole number in words in the current language, e.g. 1001 → "এক হাজার এক". */
  words: (v: number) => string;
  ago: (iso: string) => string;
  /** Calendar date in the current language; digits follow the Bengali-numerals setting. */
  date: (iso: string) => string;
  pick: (bn: string, en: string) => string;
}

export type I18n = Ctx;

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

  const n = useCallback(
    (v: number | string) => {
      const s = typeof v === "number" ? indian(v) : v;
      return lang === "bn" && bnDigits ? toBnDigits(s) : s;
    },
    [lang, bnDigits],
  );

  const value = useMemo<Ctx>(() => {
    const t = (k: TKey, vars?: Record<string, string>) => {
      const s: string = dict[k][lang === "bn" ? 0 : 1];
      return vars ? s.replace(/\{(\w+)\}/g, (m, v: string) => vars[v] ?? m) : s;
    };
    return {
      lang,
      setLang,
      bnDigits,
      setBnDigits,
      dark,
      setDark,
      t,
      n,
      money: (v) => (v < 0 ? "−₹" + n(-v) : "₹" + n(v)),
      words: (v) => numberToWords(v, lang),
      pick: (bn, en) => (lang === "bn" ? bn : en),
      ago: (iso) => {
        const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        if (m < 1) return t("justNow");
        if (m < 60) return `${n(String(m))} ${t("minsAgo")}`;
        const h = Math.round(m / 60);
        if (h < 24) return `${n(String(h))} ${t("hrsAgo")}`;
        return `${n(String(Math.round(h / 24)))} ${t("daysAgo")}`;
      },
      date: (iso) =>
        n(
          new Date(iso).toLocaleDateString(lang === "bn" ? "bn-IN" : "en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
            numberingSystem: "latn",
          }),
        ),
    };
  }, [lang, bnDigits, dark, n]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
