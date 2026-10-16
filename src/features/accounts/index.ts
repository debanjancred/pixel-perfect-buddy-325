// Public surface of the accounts module (M6 / SPEC Story 4.1). Import from
// "@/features/accounts" rather than reaching into its files.
export { AccountsActions } from "./AccountsActions";
export { AccountsOverview, CollectionSplit } from "./AccountsOverview";
export { CategoryDonut } from "./CategoryDonut";
export { accountsShareText, cashPct, categoryShares, type CategoryShare } from "./model";
