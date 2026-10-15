// Demo fixtures (SPEC.md Section 5). Generic only: no real clubs, places, people, vendors,
// phone numbers or domains. Stored values use ASCII digits; Bengali numerals are applied at
// render time. Built lazily (never at module scope) so Worker SSR never runs random/time code.
import type {
  ChandaTransaction,
  Club,
  ClubEvent,
  ClubMember,
  ExpenseCategory,
  ExpenseRecord,
  Household,
  PaymentMethod,
  UserRole,
} from "@/types/domain";

export const DEMO_SLUG = "sample-puja-committee-2026";

export interface DemoData {
  club: Club;
  members: ClubMember[];
  households: Household[];
  chanda: ChandaTransaction[];
  expenses: ExpenseRecord[];
  events: ClubEvent[];
}

const BN = "০১২৩৪৫৬৭৮৯";
const bn2 = (i: number) =>
  String(i)
    .padStart(2, "0")
    .replace(/\d/g, (d) => BN[Number(d)]!);

export function buildDemoData(): DemoData {
  const uuid = () => crypto.randomUUID();
  const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
  const created = ago(60 * 24 * 60);

  const club: Club = {
    id: uuid(),
    slug: DEMO_SLUG,
    name_bn: "নমুনা পূজা কমিটি ২০২৬",
    name_en: "Sample Puja Committee 2026",
    area_label: "ব্লক এ",
    target_amount: 500000,
    puja_year: 2026,
    created_at: created,
  };
  const club_id = club.id;

  const memberRows: [string, UserRole, string, string][] = [
    ["অ্যাডমিন ০১", "admin", "9000000001", "A01"],
    ["কোষাধ্যক্ষ ০১", "treasurer", "9000000002", "T01"],
    ["কর্মী ০১", "collector", "9000000003", "C01"],
  ];
  const members: ClubMember[] = memberRows.map(([name, role, phone, collector_code]) => ({
    id: uuid(),
    club_id,
    name,
    role,
    phone,
    collector_code,
    created_at: created,
  }));
  const [admin, treasurer, collector] = members as [ClubMember, ClubMember, ClubMember];

  // Flats 101–105, 201–205, 301–305 across the four generic lanes/blocks.
  const laneFor = (flat: number) =>
    flat < 200 ? "ব্লক এ" : flat < 300 ? "ব্লক বি" : flat < 304 ? "লেন ১" : "লেন ২";
  const households: Household[] = Array.from({ length: 15 }, (_, i) => {
    const flat = (Math.floor(i / 5) + 1) * 100 + (i % 5) + 1;
    return {
      id: uuid(),
      club_id,
      lane_block: laneFor(flat),
      house_flat_no: String(flat),
      resident_name: `আবাসিক ${bn2(i + 1)}`,
      phone_number: `90000001${String(i + 1).padStart(2, "0")}`,
      created_at: created,
    };
  });

  // [household index, amount, method, status, collector, minutes ago, void reason?]
  const chandaRows: [
    number,
    number,
    PaymentMethod,
    "collected" | "promised" | "void",
    ClubMember,
    number,
    string?,
  ][] = [
    [0, 5001, "cash", "collected", collector, 60 * 24 * 9],
    [1, 10001, "upi", "collected", collector, 60 * 24 * 8],
    [2, 2001, "cash", "collected", collector, 60 * 24 * 7],
    [3, 25001, "upi", "collected", admin, 60 * 24 * 6],
    [4, 5001, "cash", "collected", collector, 60 * 24 * 5],
    [5, 11001, "upi", "collected", collector, 60 * 24 * 3],
    [6, 21001, "cash", "collected", admin, 60 * 24 * 2],
    [7, 3001, "cash", "collected", collector, 60 * 26],
    [8, 15001, "upi", "collected", collector, 60 * 3],
    [9, 10001, "cash", "collected", collector, 25],
    [10, 5001, "cash", "promised", collector, 60 * 24 * 4],
    [11, 1001, "cash", "void", collector, 60 * 24 * 4, "ভুল পরিমাণ লেখা হয়েছিল"],
  ];
  const seq = new Map<string, number>();
  const chanda: ChandaTransaction[] = chandaRows
    .sort((a, b) => b[5] - a[5]) // oldest first so receipt numbers rise with time
    .map(([hi, amount, payment_method, status, by, mins, reason]) => {
      const n = (seq.get(by.collector_code) ?? 0) + 1;
      seq.set(by.collector_code, n);
      const at = ago(mins);
      return {
        id: uuid(),
        receipt_no: `PK-${club.puja_year}-${by.collector_code}-${String(n).padStart(4, "0")}`,
        club_id,
        household_id: households[hi]!.id,
        amount,
        payment_method,
        status,
        collector_id: by.id,
        created_at: at,
        updated_at: reason ? ago(mins - 30) : at,
        ...(reason ? { voided_at: ago(mins - 30), void_reason: reason } : {}),
        sync_status: "synced" as const,
      };
    });

  const expenseRows: [ExpenseCategory, string, number, string, ClubMember, string][] = [
    ["pandal", "মণ্ডপ অগ্রিম", 50000, "ভেন্ডর ০১", treasurer, "2026-08-15"],
    ["idol", "প্রতিমা বায়না", 25000, "ভেন্ডর ০২", admin, "2026-08-20"],
    ["lighting", "আলো বুকিং", 15000, "ভেন্ডর ০৩", treasurer, "2026-08-25"],
    ["bhog", "ভোগ সামগ্রী", 8500, "ভেন্ডর ০৪", treasurer, "2026-08-28"],
  ];
  const expenses: ExpenseRecord[] = expenseRows.map(
    ([category, title, amount, paid_to, by, date]) => ({
      id: uuid(),
      club_id,
      category,
      title,
      amount,
      paid_to,
      authorized_by_id: by.id,
      date,
      created_at: `${date}T10:00:00.000Z`,
      updated_at: `${date}T10:00:00.000Z`,
      sync_status: "synced",
    }),
  );

  const events: ClubEvent[] = [
    ["বসে আঁকো", "Sit & Draw", "2026-10-18", 24],
    ["ধুনুচি নাচ", "Dhunuchi Dance", "2026-10-21", 12],
  ].map(([title_bn, title_en, date, registrations_count]) => ({
    id: uuid(),
    club_id,
    title_bn: title_bn as string,
    title_en: title_en as string,
    date: date as string,
    registrations_count: registrations_count as number,
    created_at: created,
  }));

  return { club, members, households, chanda, expenses, events };
}
