import type { ExpenseCategory } from "@/services/types";
import type { TKey } from "./i18n";

export const CATEGORIES: { key: ExpenseCategory; t: TKey; color: string; emoji: string }[] = [
  { key: "pandal", t: "cat_pandal", color: "var(--chart-1)", emoji: "⛺" },
  { key: "pratima", t: "cat_pratima", color: "var(--chart-2)", emoji: "🪔" },
  { key: "lighting", t: "cat_lighting", color: "var(--chart-5)", emoji: "💡" },
  { key: "bhog", t: "cat_bhog", color: "var(--chart-3)", emoji: "🍛" },
  { key: "cultural", t: "cat_cultural", color: "var(--chart-4)", emoji: "🎭" },
  { key: "misc", t: "cat_misc", color: "var(--chart-6)", emoji: "📎" },
];
