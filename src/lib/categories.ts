import type { ExpenseCategory } from "@/types/domain";
import type { TKey } from "./i18n";

/** Display order; colour slots follow it 1→6 so neighbours stay distinguishable. */
export const CATEGORIES: { key: ExpenseCategory; t: TKey; color: string; emoji: string }[] = [
  { key: "pandal", t: "cat_pandal", color: "var(--chart-1)", emoji: "⛺" },
  { key: "idol", t: "cat_idol", color: "var(--chart-2)", emoji: "🪔" },
  { key: "lighting", t: "cat_lighting", color: "var(--chart-3)", emoji: "💡" },
  { key: "bhog", t: "cat_bhog", color: "var(--chart-4)", emoji: "🍛" },
  { key: "cultural", t: "cat_cultural", color: "var(--chart-5)", emoji: "🎭" },
  { key: "misc", t: "cat_misc", color: "var(--chart-6)", emoji: "📎" },
];

/**
 * A built-in category, or a committee's own one ("custom:<name>"). Own categories are stored
 * as `misc` plus `category_name`, so the six built-ins and their validated colours stay
 * fixed; everywhere else the name behaves as a category of its own.
 */
export type CategoryKey = ExpenseCategory | `custom:${string}`;

const CUSTOM = "custom:";
/** Own categories share one neutral colour; their labels are always shown next to them. */
export const CUSTOM_COLOR = "var(--muted-foreground)";

/** A typed category name as stored: trimmed, single spaces. */
export const cleanCategoryName = (s: string) => s.trim().replace(/\s+/g, " ");

export const categoryKeyOf = (e: {
  category: ExpenseCategory;
  category_name?: string | null | undefined;
}): CategoryKey => (e.category_name ? `custom:${cleanCategoryName(e.category_name)}` : e.category);

export const isCustomKey = (k: string): k is `custom:${string}` => k.startsWith(CUSTOM);

/** Stored fields for a key: built-ins as they are, own categories as misc + name. */
export const categoryFields = (key: CategoryKey) =>
  isCustomKey(key)
    ? { category: "misc" as const, category_name: key.slice(CUSTOM.length) }
    : { category: key, category_name: null };

export const categoryColor = (key: CategoryKey) =>
  isCustomKey(key) ? CUSTOM_COLOR : (CATEGORIES.find((x) => x.key === key)?.color ?? CUSTOM_COLOR);

/** Label, emoji and colour of any category. */
export function categoryInfo(key: CategoryKey, t: (k: TKey) => string) {
  if (isCustomKey(key))
    return { label: key.slice(CUSTOM.length), emoji: "🏷️", color: CUSTOM_COLOR };
  const c = CATEGORIES.find((x) => x.key === key) ?? CATEGORIES[CATEGORIES.length - 1]!;
  return { label: t(c.t), emoji: c.emoji, color: c.color };
}

/** The club's own categories, first spelling kept, case-insensitively unique, A→Z. */
export function customCategoryKeys(list: { category_name?: string | null | undefined }[]) {
  const byLower = new Map<string, CategoryKey>();
  for (const e of list) {
    if (!e.category_name) continue;
    const name = cleanCategoryName(e.category_name);
    if (!byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), `custom:${name}`);
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

/** Reuses an existing own category when the typed name matches it apart from case. */
export function customKeyFor(name: string, existing: CategoryKey[]): CategoryKey {
  const clean = cleanCategoryName(name);
  return (
    existing.find(
      (k) => isCustomKey(k) && k.slice(CUSTOM.length).toLowerCase() === clean.toLowerCase(),
    ) ?? `custom:${clean}`
  );
}
