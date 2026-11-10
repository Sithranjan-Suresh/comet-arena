export interface NavItem {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  icon: "scout" | "field" | "schedule" | "agency" | "card";
}

/** Primary navigation (engineering_spec §2). Order matches the mobile tab bar. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Scouting Report", short: "Scout", icon: "scout" },
  { href: "/field", label: "The Field", short: "Field", icon: "field" },
  { href: "/schedule", label: "Schedule", short: "Schedule", icon: "schedule" },
  { href: "/free-agency", label: "Free Agency", short: "Agency", icon: "agency" },
  { href: "/me", label: "Player Card", short: "Card", icon: "card" },
];

/** "/" matches only itself; other tabs also match their sub-routes (e.g. /field?x, /free-agency/foo). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
