/**
 * The saved-views ordering convention (spec §5: "Saved views as tabs, 'mine'
 * first"). Plain module so server pages and the client <SavedViews> share it.
 * Views marked `mine` come first, in the order given, then the rest.
 */
export function orderViews<T extends { mine?: boolean }>(views: T[]): T[] {
  return [...views.filter((v) => v.mine), ...views.filter((v) => !v.mine)];
}
