import type { Chanda, DB, Expense, Household, Member, PujoEvent, Lane, PaymentMode, PledgeStatus, ExpenseCategory } from "./types";

// Built lazily (never at module scope) so Worker SSR never runs random/time code globally.
export function seedDB(): DB {
  const uuid = () => crypto.randomUUID();
  const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();
  const club_id = uuid();

  const lanes: Lane[] = [
    { bn: "লেক ভিউ রোড", en: "Lake View Road" },
    { bn: "শরৎ বোস লেন", en: "Sarat Bose Lane" },
    { bn: "দক্ষিণ পল্লী", en: "Dakshin Pally" },
    { bn: "ব্লক বি", en: "Block B" },
  ];

  const members: Member[] = [
    { name: "বিশ্বনাথ পাল", name_en: "Biswanath Pal", role: "secretary" as const, phone: "9830012345" },
    { name: "সুব্রত সেনগুপ্ত", name_en: "Subrata Sengupta", role: "treasurer" as const, phone: "9831023456" },
    { name: "রাহুল দে", name_en: "Rahul Dey", role: "collector" as const, phone: "9874034567" },
    { name: "পিয়ালী সরকার", name_en: "Piyali Sarkar", role: "collector" as const, phone: "9903045678" },
  ].map((m) => ({ ...m, id: uuid(), club_id }));

  type Row = [string, string, number, string, number, PledgeStatus, number | null, PaymentMode, number];
  const rows: Row[] = [
    ["দিলীপ রায়", "Dilip Roy", 0, "12A", 1001, "paid", 2, "upi", 2],
    ["সৌমেন চট্টোপাধ্যায়", "Soumen Chattopadhyay", 0, "14", 5001, "paid", 25, "cash", 0],
    ["অনিন্দিতা মুখার্জি", "Anindita Mukherjee", 1, "3/2", 2001, "paid", 70, "upi", 3],
    ["কাকলি ব্যানার্জি", "Kakoli Banerjee", 2, "7", 1001, "paid", 180, "cash", 2],
    ["মৌসুমী দত্ত", "Mousumi Dutta", 3, "B-12", 501, "paid", 60 * 20, "cash", 3],
    ["অরূপ ঘোষ", "Arup Ghosh", 1, "8", 2001, "paid", 60 * 26, "upi", 2],
    ["তনুশ্রী বসু", "Tanushree Basu", 2, "21", 1001, "paid", 60 * 30, "cash", 3],
    ["প্রদীপ মিত্র", "Pradip Mitra", 0, "18B", 10001, "paid", 60 * 48, "upi", 1],
    ["রীনা সাহা", "Rina Saha", 3, "B-3", 2001, "paid", 60 * 72, "cash", 2],
    ["অমিতাভ গুহ", "Amitabha Guha", 1, "11", 5001, "promised", null, "cash", 0],
    ["সঞ্চিতা নন্দী", "Sanchita Nandi", 2, "9", 1001, "pending", null, "cash", 0],
    ["রাজীব বর্মন", "Rajib Barman", 3, "B-18", 2001, "promised", null, "cash", 0],
    ["পলাশ মণ্ডল", "Palash Mondal", 0, "22", 501, "pending", null, "cash", 0],
    ["শুভজিৎ দাস", "Subhajit Das", 1, "5", 1001, "pending", null, "cash", 0],
    ["সুদীপা চক্রবর্তী", "Sudipa Chakraborty", 2, "30", 5001, "promised", null, "cash", 0],
    ["তাপস কুণ্ডু", "Tapas Kundu", 3, "B-9", 1001, "pending", null, "cash", 0],
  ];

  const households: Household[] = [];
  const chandaDrafts: Omit<Chanda, "receipt_no">[] = [];
  rows.forEach(([bn, en, li, house, pledge, status, mins, mode, ci], i) => {
    const id = uuid();
    households.push({
      id, club_id, lane_bn: lanes[li].bn, lane_en: lanes[li].en, house_no: house,
      resident_name: bn, resident_name_en: en, phone: `98300${String(10000 + i * 731).slice(0, 5)}`,
      pledged_amount: pledge, status, created_at: ago(60 * 24 * 20), sync_status: "synced",
    });
    if (mins !== null) {
      chandaDrafts.push({
        id: uuid(), club_id, household_id: id, payer_name: bn, payer_name_en: en, amount: pledge,
        payment_mode: mode, collector_id: members[ci].id, created_at: ago(mins), sync_status: "synced",
      });
    }
  });

  const TARGET_COLLECTED = 542000;
  const sponsors: [string, string, number, number][] = [
    ["সেনকো গোল্ড (স্পনসর)", "Senco Gold (Sponsor)", 150000, 60 * 24 * 6],
    ["স্থানীয় ব্যবসায়ী সমিতি", "Local Traders' Association", 85000, 60 * 24 * 8],
  ];
  sponsors.forEach(([bn, en, amt, mins]) =>
    chandaDrafts.push({ id: uuid(), club_id, household_id: null, payer_name: bn, payer_name_en: en, amount: amt, payment_mode: "upi", collector_id: members[0].id, created_at: ago(mins), sync_status: "synced" }),
  );
  const subtotal = chandaDrafts.reduce((s, c) => s + c.amount, 0);
  chandaDrafts.push({
    id: uuid(), club_id, household_id: null, payer_name: "পূর্ববর্তী খাতার আদায় (খাতা ১–৩)", payer_name_en: "Earlier ledger collections (books 1–3)",
    amount: TARGET_COLLECTED - subtotal, payment_mode: "cash", collector_id: members[1].id, created_at: ago(60 * 24 * 14), sync_status: "synced",
  });

  chandaDrafts.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const chandas: Chanda[] = chandaDrafts.map((c, i) => ({ ...c, receipt_no: `PK-2026-${String(380 + i + 1).padStart(4, "0")}` }));

  const ex: [ExpenseCategory, string, string, number, number, number][] = [
    ["pandal", "প্যান্ডেল কাঠামো — অগ্রিম", "Pandal structure — advance", 80000, 1, 60 * 24 * 12],
    ["pandal", "বাঁশ ও কাপড়", "Bamboo & cloth", 40000, 1, 60 * 24 * 5],
    ["pratima", "কুমোরটুলি প্রতিমা — অগ্রিম", "Kumartuli idol — advance", 60000, 0, 60 * 24 * 15],
    ["pratima", "প্রতিমার সাজ ও ডাকের সাজ", "Idol ornaments (daker saaj)", 25000, 0, 60 * 24 * 3],
    ["lighting", "চন্দননগরের আলোকসজ্জা", "Chandannagar lighting", 45000, 1, 60 * 24 * 4],
    ["bhog", "ভোগের বাজার", "Bhog groceries", 18000, 1, 60 * 30],
    ["bhog", "রাঁধুনি ও সহকারী", "Cooks & helpers", 12000, 1, 60 * 6],
    ["cultural", "সাংস্কৃতিক সন্ধ্যা — শিল্পী", "Cultural night — artists", 25000, 0, 60 * 24 * 2],
    ["misc", "পুলিশ ও দমকল অনুমতি", "Police & fire permissions", 8000, 0, 60 * 24 * 18],
    ["misc", "রসিদ বই ও ব্যানার ছাপা", "Receipt books & banner printing", 5000, 1, 60 * 24 * 16],
  ];
  const expenses: Expense[] = ex.map(([category, bn, en, amount, mi, mins]) => ({
    id: uuid(), club_id, category, item_name: bn, item_name_en: en, amount, approved_by_id: members[mi].id,
    receipt_image: null, created_at: ago(mins), sync_status: "synced",
  }));

  const events: PujoEvent[] = [
    { key: "draw" as const, name_bn: "বসে আঁকো প্রতিযোগিতা", name_en: "Sit & Draw Competition", date_bn: "ষষ্ঠী · সকাল ১০টা", date_en: "Shashthi · 10 AM", registrations: 46, capacity: 80, slots: [] },
    { key: "dhunuchi" as const, name_bn: "ধুনুচি নাচ", name_en: "Dhunuchi Naach", date_bn: "নবমী · সন্ধ্যা ৭টা", date_en: "Navami · 7 PM", registrations: 22, capacity: 40, slots: [] },
    { key: "shankha" as const, name_bn: "শঙ্খধ্বনি প্রতিযোগিতা", name_en: "Shankha Dhwani Contest", date_bn: "অষ্টমী · বিকেল ৪টা", date_en: "Ashtami · 4 PM", registrations: 15, capacity: 30, slots: [] },
    {
      key: "pushpanjali" as const, name_bn: "অষ্টমীর পুষ্পাঞ্জলি", name_en: "Ashtami Pushpanjali", date_bn: "অষ্টমী · সকাল", date_en: "Ashtami · Morning", registrations: 0, capacity: 0,
      slots: [
        { label_bn: "১ম ব্যাচ · ৮:০০", label_en: "Batch 1 · 8:00", filled: 50, capacity: 50 },
        { label_bn: "২য় ব্যাচ · ৮:৪৫", label_en: "Batch 2 · 8:45", filled: 41, capacity: 50 },
        { label_bn: "৩য় ব্যাচ · ৯:৩০", label_en: "Batch 3 · 9:30", filled: 18, capacity: 50 },
        { label_bn: "৪র্থ ব্যাচ · ১০:১৫", label_en: "Batch 4 · 10:15", filled: 4, capacity: 50 },
      ],
    },
  ].map((e) => ({ ...e, id: uuid(), club_id }));

  return {
    version: 1,
    active_club_id: club_id,
    clubs: [{
      id: club_id, name: "বিবেকানন্দ পার্ক সার্বজনীন দুর্গোৎসব ২০২৬", name_en: "Vivekananda Park Sarbojanin Durgotsav 2026",
      para: "বিবেকানন্দ পার্ক", zone: "দক্ষিণ কলকাতা", puja_year: 2026, target_amount: 850000,
      receipt_seq: 380 + chandas.length, created_at: ago(60 * 24 * 30),
    }],
    lanes: { [club_id]: lanes },
    households, chandas, expenses, events, members,
  };
}
