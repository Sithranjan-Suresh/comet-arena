/** Pick a title size so long competition names still fit on the 1200x630 share card. */
export function ogTitleFontSize(title: string): number {
  const n = title.length;
  if (n <= 24) return 104;
  if (n <= 40) return 84;
  if (n <= 64) return 68;
  return 54;
}
