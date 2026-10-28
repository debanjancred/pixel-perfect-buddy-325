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
  recent: ["সাম্প্রতিক কার্যকলাপ", "Recent activity"],
  offlineSaved: ["অফলাইন — ফোনে সংরক্ষিত", "Offline — Saved locally"],
  offlineBanner: [
    "অফলাইন মোড — ডেটা আপনার ফোনে সংরক্ষিত হচ্ছে",
    "Offline mode — data is being saved on your phone",
  ],
  syncFailedCount: ["{count}টি এন্ট্রি সিঙ্ক হয়নি", "{count} entries didn't sync"],
  retry: ["আবার চেষ্টা", "Retry"],
  offline: ["অফলাইন", "Offline"],
  online: ["অনলাইন", "Online"],
  pendingCount: ["{count}টি এন্ট্রি সিঙ্কের অপেক্ষায়", "{count} waiting to sync"],
  syncingCount: ["{count}টি এন্ট্রি পাঠানো হচ্ছে…", "Sending {count}…"],
  syncNow: ["এখনই পাঠান", "Sync now"],
  syncPausedCount: [
    "{count}টি এন্ট্রি ফোনে রাখা আছে — সিঙ্ক আপাতত বন্ধ",
    "{count} saved on this phone — syncing is paused",
  ],
  updateRequired: [
    "অ্যাপের নতুন সংস্করণ দরকার। আপনার এন্ট্রি ফোনে নিরাপদ আছে।",
    "A newer version of the app is needed. Your entries are safe on this phone.",
  ],
  updateNow: ["এখনই আপডেট", "Update now"],
  maintenanceText: ["রক্ষণাবেক্ষণ চলছে।", "Maintenance in progress."],
  maintenanceSafe: [
    "সিঙ্ক আপাতত বন্ধ — কাজ চালিয়ে যান, এন্ট্রি ফোনে জমা থাকবে।",
    "Syncing is paused — keep working; entries are saved on this phone.",
  ],
  announcementMore: ["বিস্তারিত", "Details"],
  announcementClose: ["ঘোষণা বন্ধ করুন", "Close announcement"],
  synced: ["সব সিঙ্ক হয়েছে", "All changes synced"],
  refreshed: ["হালনাগাদ হয়েছে", "Refreshed"],
  chandaRegister: ["চাঁদার খাতা", "Chanda Register"],
  all: ["সব", "All"],
  paid: ["জমা", "Paid"],
  pending: ["বাকি", "Pending"],
  promised: ["প্রতিশ্রুত", "Promised"],
  partial: ["আংশিক", "Part paid"],
  promiseMode: ["প্রতিশ্রুতি", "Promise"],
  promiseHint: [
    "পরে দেবেন — এখন রসিদ হবে না। টাকা পেলে তখন নগদ বা UPI হিসেবে লিখুন।",
    "Pays later — no receipt now. Record the cash or UPI payment when it comes in.",
  ],
  savePromise: ["প্রতিশ্রুতি সংরক্ষণ", "Save promise"],
  promiseSaved: ["{name}: {amount} প্রতিশ্রুতি লেখা হয়েছে", "{name}: {amount} promise recorded"],
  cancelPromise: ["প্রতিশ্রুতি বাতিল", "Cancel promise"],
  promisedDue: ["প্রতিশ্রুত, এখনো বাকি", "Promised, still due"],
  today: ["আজ আদায়", "Collected Today"],
  search: ["নাম বা বাড়ি নম্বর খুঁজুন", "Search name or house no."],
  remind: ["রিমাইন্ডার", "Remind"],
  collect: ["আদায়", "Collect"],
  collector: ["সংগ্রাহক", "Collector"],
  pledged: ["প্রতিশ্রুতি", "Pledged"],
  houses: ["বাড়ি", "houses"],
  noResults: ["কিছু পাওয়া যায়নি", "Nothing found"],
  collectTitle: ["চাঁদা গ্রহণ", "Collect Chanda"],
  household: ["বাড়ি / পরিবার", "Household"],
  addHousehold: ["নতুন বাড়ি যোগ করুন", "Add new household"],
  residentName: ["বাসিন্দার নাম", "Resident name"],
  houseNo: ["বাড়ি নং", "House no."],
  houseNoOptional: ["বাড়ি নং (ঐচ্ছিক)", "House no. (optional)"],
  addLane: ["+ নতুন লেন", "+ Add New Lane"],
  newLaneName: ["নতুন লেন / ব্লকের নাম", "New lane / block name"],
  newLaneHint: ["যেমন: ব্লক সি, ২ নং গলি", "For example: Block C, Lane 2"],
  searchMinHint: [
    "খুঁজতে নাম বা বাড়ি নম্বরের অন্তত ২টি অক্ষর লিখুন",
    "Type at least 2 letters of a name or house no. to search",
  ],
  lane: ["লেন / ব্লক", "Lane / Block"],
  allLanes: ["সব লেন / ব্লক", "All lanes / blocks"],
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
  receiptVoid: ["বাতিল", "CANCELLED"],
  receiptVoidNote: ["এই রসিদটি বাতিল করা হয়েছে", "This receipt has been cancelled"],
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
  // No "verified" claim: the figures are this device's records, not independently audited.
  verified: ["স্বচ্ছ খাতা", "Open accounts"],
  readOnly: ["শুধু দেখার জন্য · লগইন লাগবে না", "Read-only · No login needed"],
  byCategory: ["বিভাগ অনুযায়ী খরচ", "Spending by category"],
  storyCard: ["স্টোরি কার্ড", "Story card"],
  accountsNotFound: ["এই ক্লাবের হিসাব পাওয়া যায়নি", "No accounts found for this club"],
  accountsNotFoundHint: [
    "এখন হিসাব শুধু যে ফোনে লেখা হয়েছে সেখানেই দেখা যায়",
    "For now, accounts can only be viewed on the phone they were recorded on",
  ],
  eventsTitle: ["পুজো প্রতিযোগিতা", "Pujo Competitions"],
  registered: ["নাম নথিভুক্ত", "registered"],
  eventMore: ["আরও বিকল্প: {title}", "More options: {title}"],
  shareEventLabel: ["{title} শেয়ার করুন", "Share {title}"],
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
  editEvent: ["প্রতিযোগিতা সম্পাদনা", "Edit event"],
  editEventLabel: ["{title} সম্পাদনা", "Edit {title}"],
  eventUpdated: ["প্রতিযোগিতা আপডেট হয়েছে", "Event updated"],
  deleteEvent: ["মুছে দিন", "Delete"],
  deleteEventLabel: ["{title} মুছে দিন", "Delete {title}"],
  deleteEventConfirm: ["“{title}” মুছে দেবেন?", "Delete “{title}”?"],
  deleteEventHint: [
    "প্রতিযোগিতাটি সবার তালিকা থেকে সরে যাবে।",
    "It disappears from everyone's list.",
  ],
  eventDeleted: ["প্রতিযোগিতা মুছে দেওয়া হয়েছে", "Event deleted"],
  noEvents: ["এখনো কোনো প্রতিযোগিতা নেই", "No events yet"],
  noEventsHint: [
    "বসে আঁকো, ধুনুচি নাচের মতো প্রতিযোগিতা যোগ করুন",
    "Add competitions like Sit & Draw or Dhunuchi Dance",
  ],
  eventShare: [
    "{club}\n🎉 {title}\n📅 {date}\nসবাই আমন্ত্রিত 🙏",
    "{club}\n🎉 {title}\n📅 {date}\nEveryone's welcome 🙏",
  ],
  err_memberExists: [
    "এই নম্বরে আগে থেকেই একজন সদস্য আছেন",
    "A member with this number already exists",
  ],
  cashTitle: ["নগদ জমা", "Cash handover"],
  cashHint: [
    "কোন সংগ্রাহকের কাছে কত নগদ আছে, আর কতটা কোষাধ্যক্ষের হাতে জমা পড়েছে",
    "How much cash each collector holds, and how much has reached the treasurer",
  ],
  cashCollected: ["নগদ আদায়", "Cash collected"],
  handedOver: ["জমা দিয়েছেন", "Handed over"],
  outstanding: ["হাতে আছে", "Outstanding"],
  totalOutstanding: ["সংগ্রাহকদের হাতে মোট", "Held by collectors"],
  receiveCash: ["নগদ জমা নিন", "Receive cash"],
  handoverFrom: ["{name}-এর কাছ থেকে নগদ", "Cash from {name}"],
  handoverHistory: ["জমার ইতিহাস", "Handover history"],
  handoverSaved: ["{amount} জমা নেওয়া হয়েছে", "{amount} received"],
  noHandovers: ["এখনো কোনো জমা নেই", "No handovers yet"],
  noCashYet: ["এখনো কেউ নগদ আদায় করেননি", "No cash collected yet"],
  err_handoverTooMuch: [
    "হাতে থাকা নগদের চেয়ে বেশি জমা নেওয়া যাবে না",
    "Can't receive more than the cash outstanding",
  ],
  err_handoverSelf: [
    "নিজের কাছ থেকে নিজে জমা নেওয়া যায় না",
    "You can't receive a handover from yourself",
  ],
  void: ["বাতিল করুন", "Cancel entry"],
  voidTitle: ["এন্ট্রি বাতিল", "Cancel entry"],
  voidHint: [
    "বাতিল এন্ট্রি মোছে না — খাতায় কেটে দেখানো থাকে, কিন্তু হিসাবে আর ধরা হয় না।",
    "Cancelling doesn't delete: the entry stays in the ledger struck through, but stops counting.",
  ],
  voidReasonLabel: ["বাতিলের কারণ", "Reason for cancelling"],
  voided: ["বাতিল করা হয়েছে", "Cancelled"],
  err_forbidden: ["আপনার এই কাজের অনুমতি নেই", "You don't have permission to do this"],
  noAccess: ["অনুমতি নেই", "No access"],
  noAccessHint: [
    "এই কাজটি আপনার দায়িত্বের মধ্যে পড়ে না। ক্লাবের অ্যাডমিনের সাথে যোগাযোগ করুন।",
    "This isn't part of your role. Ask the club's admin.",
  ],
  actingAs: ["ডেমো: যাঁর হয়ে দেখছেন", "Demo: acting as"],
  demoAs: ["ডেমো: {name} ({role})", "Demo: {name} ({role})"],
  changeRole: ["বদলান", "Change"],
  viewOnly: [
    "আপনি এই ক্লাবের সদস্য নন — শুধু দেখতে পারবেন",
    "You're not a member of this club — view only",
  ],
  actingAsHint: [
    "অন্য দায়িত্বে অ্যাপটি কেমন দেখায়, পরখ করুন",
    "Try how the app looks for each role",
  ],
  err_lastAdmin: [
    "ক্লাবে অন্তত একজন অ্যাডমিন রাখতে হবে — আগে অন্য কাউকে অ্যাডমিন করুন",
    "The club must keep at least one admin — make someone else admin first",
  ],
  err_memberName: ["অনুগ্রহ করে সদস্যের নাম লিখুন", "Please enter the member's name"],
  settingsTitle: ["সেটিংস", "Settings"],
  members: ["সদস্য", "Members"],
  noMembersInRole: ["কেউ নেই", "No one yet"],
  roleChanged: ["{name} এখন {role}", "{name} is now {role}"],
  memberCount: ["{count} জন", "{count}"],
  you: ["আপনি", "You"],
  manageMember: ["সদস্যের তথ্য", "Member details"],
  manageMemberLabel: ["{name}-এর তথ্য ও দায়িত্ব", "{name}: details and role"],
  callMember: ["কল করুন", "Call"],
  addMemberShort: ["যোগ করুন", "Add"],
  saveRole: ["দায়িত্ব সংরক্ষণ", "Save role"],
  role_admin_hint: [
    "সব কাজ — সদস্য, প্রতিযোগিতা, খরচ, বাতিল ও নগদ জমা",
    "Everything — members, events, expenses, cancellations and cash",
  ],
  role_treasurer_hint: [
    "চাঁদা, খরচ, বাতিল ও সংগ্রাহকদের থেকে নগদ জমা",
    "Chanda, expenses, cancellations and cash from collectors",
  ],
  role_collector_hint: ["বাড়ি বাড়ি চাঁদা আদায় ও রসিদ", "Collects chanda and gives receipts"],
  collectDeviceRowHint: [
    "ফোন হারালে বা বদলালে রিসেট করুন — উনি আবার নিজের আদায়ের ডিভাইস বেছে নেবেন।",
    "Reset if their phone is lost or replaced — they'll choose their collecting device again.",
  ],
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
  csv_collector: ["সংগ্রাহক", "Collector"],
  csv_void_reason: ["বাতিলের কারণ", "Cancellation reason"],
  csv_category: ["বিভাগ", "Category"],
  csv_title: ["বিবরণ", "Item"],
  csv_paid_to: ["কাকে দেওয়া", "Paid to"],
  csv_authorized_by: ["অনুমোদন", "Authorised by"],
  status_collected: ["আদায়", "Collected"],
  status_promised: ["প্রতিশ্রুত", "Promised"],
  status_void: ["বাতিল", "Cancelled"],
  status_recorded: ["লেখা হয়েছে", "Recorded"],
  export_remarks: ["মন্তব্য", "Remarks"],
  clubOptions: ["ক্লাবের বিকল্প", "Club options"],
  exportHint: [
    "এক্সেল ফাইল (.xlsx) — বাতিল এন্ট্রি কারণসহ থাকে",
    "Excel file (.xlsx) — cancelled entries are listed with their reason",
  ],
  export_na: ["প্রযোজ্য নয়", "N/A"],
  export_sheet_chanda: ["চাঁদা", "Chanda"],
  export_sheet_expenses: ["খরচ", "Expenses"],
  err_eventPast: ["আজ বা পরের কোনো তারিখ দিন", "Choose today or a later date"],
  role_admin: ["অ্যাডমিন", "Admin"],
  role_treasurer: ["কোষাধ্যক্ষ", "Treasurer"],
  role_collector: ["সংগ্রাহক", "Collector"],
  addMember: ["সদস্য যোগ করুন", "Add member"],
  name: ["নাম", "Name"],
  export: ["ডেটা এক্সপোর্ট (Excel)", "Export data (Excel)"],
  exportChanda: ["চাঁদা Excel", "Chanda Excel"],
  exportExpense: ["খরচ Excel", "Expenses Excel"],
  preferences: ["পছন্দ", "Preferences"],
  darkMode: ["ডার্ক মোড", "Dark mode"],
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
  // Not "বাতিল" / "Cancel": those name cancelling an entry, and both appear in that dialog.
  cancel: ["না, থাক", "No, keep it"],
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
  installTitle: ["অ্যাপ হিসেবে রাখুন", "Install the app"],
  installHint: [
    "হোম স্ক্রিন থেকে এক চাপে খুলবে, নেট ছাড়াও চলবে।",
    "Opens from your home screen in one tap and works offline.",
  ],
  installApp: ["অ্যাপ ইনস্টল করুন", "Install app"],
  installIos: [
    "আইফোনে: শেয়ার বোতাম চাপুন, তারপর “Add to Home Screen”।",
    "On iPhone: tap Share, then “Add to Home Screen”.",
  ],
  installDone: ["অ্যাপ ইনস্টল হয়েছে", "App installed"],
  demoClub: ["নমুনা পূজা কমিটি", "Sample Puja Committee"],
  paidTo: ["কাকে দেওয়া হয়েছে", "Paid to"],
  // Devices (cloud mode): up to 3 per person, chanda collected on one of them.
  err_deviceLimit: [
    "আপনি ইতিমধ্যে ৩টি ডিভাইসে লগ ইন করেছেন",
    "You're already logged in on 3 devices",
  ],
  err_notCollectDevice: [
    "চাঁদা শুধু আপনার আদায়ের ডিভাইস থেকে নেওয়া যায়",
    "Chanda can only be collected on your collecting device",
  ],
  devices: ["ডিভাইস", "Devices"],
  devicesHint: [
    "সর্বোচ্চ ৩টি ডিভাইসে লগ ইন রাখা যায়। চাঁদা আদায় হবে শুধু একটি থেকে — বাকিগুলোতে সব কাজ করা যাবে।",
    "You can stay logged in on up to 3 devices. Chanda is collected on one of them; everything else works on all.",
  ],
  devicesOffline: [
    "ডিভাইসের তালিকা দেখতে ইন্টারনেট দরকার",
    "Connect to the internet to see your devices",
  ],
  thisDevice: ["এই ডিভাইস", "This device"],
  collectDevice: ["আদায়ের ডিভাইস", "Collecting device"],
  lastSeen: ["শেষ ব্যবহার {date}", "Last used {date}"],
  useForCollecting: ["এটি থেকে আদায় করুন", "Collect on this one"],
  removeDevice: ["সরিয়ে দিন", "Remove"],
  removeDeviceConfirm: ["{name} সরিয়ে দেবেন?", "Remove {name}?"],
  removeDeviceHint: [
    "ওই ডিভাইসটি পরের বার খোলার সময় বাকি এন্ট্রিগুলো পাঠিয়ে লগ আউট হয়ে যাবে।",
    "That device sends anything it still has and logs out the next time it opens.",
  ],
  deviceRemoved: [
    "এই ডিভাইসটি অন্য ডিভাইস থেকে সরানো হয়েছে। আবার লগ ইন করুন।",
    "This device was removed from another device. Log in again.",
  ],
  collectDeviceSet: [
    "এখন থেকে এই ডিভাইসে চাঁদা আদায় হবে",
    "Chanda is now collected on this device",
  ],
  collectGateTitle: ["এই ডিভাইসে চাঁদা আদায় বন্ধ", "This device doesn't collect chanda"],
  collectGateOther: [
    "আপনার আদায়ের ডিভাইস: {name}। একজনের রসিদ নম্বর যেন না মেলে, তাই চাঁদা একটি ডিভাইস থেকেই নেওয়া হয়।",
    "Your collecting device is {name}. Chanda is taken on one device so your receipt numbers never clash.",
  ],
  collectGateNone: [
    "আপনার কোনো আদায়ের ডিভাইস বাছা নেই। এই ডিভাইসটি বেছে নিন।",
    "You haven't chosen a collecting device yet. Choose this one.",
  ],
  collectGateOffline: [
    "আদায়ের ডিভাইস বদলাতে ইন্টারনেট দরকার",
    "Connect to the internet to change your collecting device",
  ],
  deviceLimitTitle: ["একটি ডিভাইস সরিয়ে দিন", "Remove a device to continue"],
  deviceLimitHint: [
    "সর্বোচ্চ ৩টি ডিভাইসে লগ ইন রাখা যায়। এই ডিভাইসে লগ ইন করতে একটি সরিয়ে দিন।",
    "You can be logged in on up to 3 devices. Remove one to log in here.",
  ],
  resetCollectDevice: ["আদায়ের ডিভাইস রিসেট", "Reset collecting device"],
  resetCollectDeviceConfirm: [
    "{name}-এর আদায়ের ডিভাইস রিসেট করবেন? তিনি যে ডিভাইস থেকে আদায় করবেন সেটি আবার বেছে নেবেন।",
    "Reset {name}'s collecting device? They'll choose the device they collect on again.",
  ],
  collectDeviceReset: ["আদায়ের ডিভাইস রিসেট হয়েছে", "Collecting device reset"],
  offDevice: ["অন্য ডিভাইসে আদায়", "Collected on another device"],
  offDeviceHint: [
    "এই এন্ট্রিটি সংগ্রাহকের আদায়ের ডিভাইস থেকে আসেনি। টাকা ঠিক আছে কি না দেখে নিন।",
    "This entry didn't come from the writer's collecting device. Check the cash matches.",
  ],
  err_noClub: ["কোনো ক্লাব বেছে নেওয়া হয়নি", "No club selected"],
  err_notFound: ["রেকর্ডটি পাওয়া যায়নি", "Record not found"],
  err_alreadyVoid: ["এই এন্ট্রি আগেই বাতিল হয়েছে", "This entry is already cancelled"],
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
  // Expenses after UAT: edit (until the next handover), own categories, search, load more
  editExpense: ["খরচ সংশোধন", "Edit expense"],
  edit: ["সংশোধন করুন", "Edit"],
  expenseUpdated: ["খরচ সংশোধন হয়েছে", "Expense updated"],
  editedOn: ["সংশোধিত", "Edited"],
  expenseLockedNote: [
    "নগদ জমার পরে এই খরচ আর বদলানো যায় না — দরকারে বাতিল করুন",
    "This expense can't be changed after a cash handover — cancel it if needed",
  ],
  catOther: ["+ অন্যান্য", "+ Other"],
  categoryNameLabel: ["নতুন ক্যাটাগরির নাম", "New category name"],
  categoryNameHint: ["যেমন: সাউন্ড, নিরাপত্তা", "For example: sound, security"],
  searchExpenses: ["খুঁজুন: বিবরণ, কাকে দেওয়া, তারিখ", "Search: item, paid to, date"],
  noSearchResults: ["কিছু পাওয়া যায়নি", "Nothing found"],
  loadMore: ["আরও দেখুন", "Load more"],
  showingCount: ["{total}টির মধ্যে {shown}টি দেখানো হচ্ছে", "Showing {shown} of {total}"],
  err_categoryName: [
    "অনুগ্রহ করে ক্যাটাগরির নাম লিখুন (অন্তত ২ অক্ষর)",
    "Please enter a category name (at least 2 letters)",
  ],
  err_expenseLocked: [
    "নগদ জমা হয়ে গেছে, তাই এই খরচ আর বদলানো যাবে না — শুধু বাতিল করা যাবে",
    "Cash has been handed over since, so this expense can't be changed — only cancelled",
  ],
  entries: ["টি এন্ট্রি", "entries"],
  recorded: ["লেখা হয়েছে", "Recorded"],
  syncStatus: ["সিঙ্ক", "Sync"],
  syncedOne: ["সিঙ্ক হয়েছে", "Synced"],
  syncPending: ["সিঙ্কের অপেক্ষায়", "Waiting to sync"],
  syncFailed: ["সিঙ্ক ব্যর্থ", "Sync failed"],
  voidedExpense: ["এই খরচটি বাতিল করা হয়েছে", "This expense has been cancelled"],
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
  err_required: ["অনুগ্রহ করে এই ঘরটি পূরণ করুন", "Please fill in this field"],
  err_phone: [
    "অনুগ্রহ করে সঠিক ১০ সংখ্যার মোবাইল নম্বর লিখুন (৬–৯ দিয়ে শুরু)",
    "Please enter a valid 10-digit mobile number (starting with 6–9)",
  ],
  err_otp: ["OTP-র সবকটি সংখ্যা দিন", "Enter the full OTP"],
  err_otpSend: [
    "OTP পাঠানো যায়নি, একটু পরে আবার চেষ্টা করুন",
    "Couldn't send the OTP, try again shortly",
  ],
  err_syncFailed: ["সার্ভারে পাঠানো যায়নি", "Couldn't save to the server"],
  err_syncDependency: [
    "এর আগের একটি এন্ট্রি (বাড়ি, সদস্য বা ক্লাব) এখনও সার্ভারে যায়নি",
    "Something it depends on (a household, member or club) hasn't synced yet",
  ],
  syncWhy: ["কারণ দেখুন", "See why"],
  syncFailuresTitle: ["যে এন্ট্রিগুলো সিঙ্ক হয়নি", "Entries that didn't sync"],
  syncFailuresHint: [
    "কারণ ঠিক করে আবার চেষ্টা করুন। এন্ট্রিগুলো ফোনে নিরাপদে আছে।",
    "Fix the reason, then retry. The entries are safe on this phone.",
  ],
  sync_kind_chanda: ["চাঁদা", "Chanda"],
  sync_kind_handover: ["নগদ জমা", "Cash handover"],
  sync_kind_expense: ["খরচ", "Expense"],
  sync_kind_member: ["সদস্য", "Member"],
  sync_kind_household: ["বাড়ি", "Household"],
  sync_kind_club: ["ক্লাব", "Club"],
  sync_kind_event: ["প্রতিযোগিতা", "Event"],
  sync_kind_event_update: ["প্রতিযোগিতা বদল", "Event change"],
  sync_kind_event_delta: ["নাম নথিভুক্তি", "Registration"],
  sync_kind_ticket: ["সাহায্যের অনুরোধ", "Help request"],
  // Settings → Help (ADR 0002 §7)
  help: ["সাহায্য", "Help"],
  helpHint: [
    "কোনো সমস্যা হলে জানান। আমরা আপনার ফোন নম্বরে যোগাযোগ করব।",
    "Tell us about a problem. We'll get back to you on your phone number.",
  ],
  helpReport: ["সমস্যা জানান", "Report a problem"],
  helpCategory: ["কী নিয়ে সমস্যা?", "What is the problem about?"],
  help_cat_login: ["লগইন", "Login"],
  help_cat_sync: ["সিঙ্ক", "Sync"],
  help_cat_device: ["হারানো বা নতুন ফোন", "Lost or new phone"],
  help_cat_entry: ["ভুল এন্ট্রি", "Wrong entry"],
  help_cat_other: ["অন্য কিছু", "Other"],
  helpMessage: ["কী হয়েছে লিখুন", "What happened?"],
  helpMessageHint: [
    "যেমন: কোন পাতায়, কী করতে গিয়ে সমস্যা হলো",
    "For example: which screen, and what you were doing",
  ],
  helpIncludeDetails: ["ফোনের তথ্য যোগ করুন", "Include device details"],
  helpDetailsHint: [
    "অ্যাপের সংস্করণ, অনলাইন কিনা, আর কতগুলো এন্ট্রি সিঙ্কের অপেক্ষায় — কোনো এন্ট্রির বিবরণ নয়",
    "App version, online or not, and how many entries are waiting to sync — no entry details",
  ],
  helpSend: ["পাঠান", "Send"],
  helpSent: ["অনুরোধ পাঠানো হয়েছে", "Request sent"],
  helpQueued: ["অনলাইন হলে পাঠানো হবে", "Will be sent when you're online"],
  helpYourRequests: ["আপনার অনুরোধ", "Your requests"],
  helpStatus_open: ["খোলা", "Open"],
  helpStatus_closed: ["সমাধান হয়েছে", "Closed"],
  helpStatus_pending: ["পাঠানোর অপেক্ষায়", "Waiting to send"],
  helpStatus_failed: ["পাঠানো যায়নি", "Not sent"],
  helpReply: ["উত্তর", "Reply"],
  helpLoginFirst: [
    "সাহায্যের অনুরোধ পাঠাতে আপনার ফোন নম্বর দিয়ে লগইন করুন।",
    "Log in with your phone number to send a help request.",
  ],
  err_ticketCategory: ["সমস্যার ধরন বেছে নিন", "Choose what the problem is about"],
  err_ticketMessage: [
    "অন্তত ১০ অক্ষরে সমস্যাটি লিখুন",
    "Describe the problem in at least 10 characters",
  ],
  err_ticketLimit: [
    "আজ অনেকগুলো অনুরোধ পাঠানো হয়েছে, কাল আবার চেষ্টা করুন",
    "Too many requests today — please try again tomorrow",
  ],
  err_immutable: [
    "এই এন্ট্রি বদলানো যায় না, শুধু বাতিল করা যায়",
    "Entries can't be edited, only cancelled",
  ],
  err_otpWrong: ["OTP মেলেনি, আবার চেষ্টা করুন", "Incorrect OTP, try again"],
  err_otpExpired: ["অনেকবার ভুল হয়েছে — নতুন OTP পাঠান", "Too many attempts — request a new OTP"],
  err_clubNameShort: ["নাম অন্তত ৩ অক্ষরের হতে হবে", "Name must be at least 3 characters"],
  err_clubExists: ["এই নামে ক্লাব আগে থেকেই আছে", "A club with this name already exists"],
  err_tooLong: ["লেখাটি একটু ছোট করুন", "Please make this shorter"],
  err_nameShort: [
    "অনুগ্রহ করে অন্তত ২ অক্ষরের নাম লিখুন",
    "Please enter a name of at least 2 letters",
  ],
  err_amount: [
    "সঠিক টাকার পরিমাণ লিখুন (₹১ থেকে ₹১০ লক্ষ)",
    "Please enter a valid amount (₹1 to ₹10 lakh)",
  ],
  err_household: [
    "অনুগ্রহ করে একটি বাড়ি বেছে নিন বা নতুন বাড়ি যোগ করুন",
    "Please choose a household or add a new one",
  ],
  err_residentName: ["অনুগ্রহ করে দাতার নাম লিখুন", "Please enter resident name"],
  err_lane: [
    "অনুগ্রহ করে লেন / ব্লক বেছে নিন বা নতুন লেন যোগ করুন",
    "Please choose a lane / block or add a new one",
  ],
  err_householdExists: [
    "এই বাড়িতে এই নামে আগে থেকেই নথিভুক্ত আছে",
    "This resident is already registered at this house",
  ],
  err_collector: ["অনুগ্রহ করে সংগ্রাহক বেছে নিন", "Please choose who collected"],
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
  dark: boolean;
  setDark: (b: boolean) => void;
  /** Translates a key; `{name}` placeholders are filled from `vars`. */
  t: (k: TKey, vars?: Record<string, string>) => string;
  n: (v: number | string) => string;
  money: (v: number) => string;
  /** Whole number in words in the current language, e.g. 1001 → "এক হাজার এক". */
  words: (v: number) => string;
  ago: (iso: string) => string;
  /** Calendar date in the current language (Bengali digits in Bengali). */
  date: (iso: string) => string;
  pick: (bn: string, en: string) => string;
}

export type I18n = Ctx;

const I18nCtx = createContext<Ctx | null>(null);
const PREF = "pk_prefs_v1"; // dark mode (numerals follow the language since UAT 2026-10-28)
// SPEC Story 1.2: the language lives under `app_locale`, read and written only here.
const LOCALE = "app_locale";
const isLang = (v: unknown): v is Lang => v === "bn" || v === "en";

/**
 * Inline <head> script that applies dark mode before first paint, so dark-mode users
 * don't see a light flash while the app hydrates. Reads the same key as the provider.
 */
export const themeBootScript = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREF)})||"{}");if(p.dark)document.documentElement.classList.add("dark")}catch(e){}`;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("bn");
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
      // Older builds kept the language inside the prefs object; honour it once.
      const stored = localStorage.getItem(LOCALE) ?? p.lang;
      if (isLang(stored)) setLang(stored);
      if (typeof p.dark === "boolean") setDark(p.dark);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("dark", dark);
    if (loaded) {
      localStorage.setItem(LOCALE, lang);
      localStorage.setItem(PREF, JSON.stringify({ dark }));
    }
  }, [lang, dark, loaded]);

  const n = useCallback(
    (v: number | string) => {
      const s = typeof v === "number" ? indian(v) : v;
      // Numerals follow the language: ১২,৫০০ in Bengali, 12,500 in English.
      return lang === "bn" ? toBnDigits(s) : s;
    },
    [lang],
  );

  const value = useMemo<Ctx>(() => {
    const t = (k: TKey, vars?: Record<string, string>) => {
      const s: string = dict[k][lang === "bn" ? 0 : 1];
      return vars ? s.replace(/\{(\w+)\}/g, (m, v: string) => vars[v] ?? m) : s;
    };
    return {
      lang,
      setLang,
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
  }, [lang, dark, n]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
