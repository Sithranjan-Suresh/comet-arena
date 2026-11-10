# Accessibility

Target: WCAG 2.1 AA. The bar for shipping is **zero serious or critical axe violations** on every page.

## What is checked automatically

`e2e/a11y.spec.ts` runs axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) on every public page at desktop and
phone width: home, The Field (with filters), Game Day, Schedule, Free Agency, login, Report a Game, and the
unsubscribe page. It also checks:

- the skip link is the first tab stop and moves focus to `#main`
- every control reachable by Tab on The Field shows a visible focus ring
- countdowns carry a spoken `aria-label` (never just ticking digits)
- dialogs trap focus and return it to the opener on Escape (native `<dialog>`, also covered in `components/ui/ui.test.tsx`)

Signed-in pages (Schedule, Player Card, Free Agency actions, admin) are covered by component tests with
Testing Library queries by role and name, which fail when a control has no accessible name. Add them to the
axe list once end-to-end sign-in exists (Task 125 onward).

## Contrast audit

Color pairs are declared in `lib/theme/tokens.ts` with a minimum ratio and asserted in `tests/theme.test.ts`.
Findings fixed so far:

| Finding                                                                             | Fix                                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Orange kicker text on turf was 4.4:1 (needs 4.5)                                    | New `utd-orange-text` token (5.4:1) for small orange text on dark backgrounds |
| Mobile tab "Scout" did not match its accessible name "Scouting Report" (WCAG 2.5.3) | Visible label is now "Scouting"                                               |

## Conventions

- Status is never color alone: badges carry text and an icon.
- Time is spoken in full ("closes in 2 days 3 hours"); the visible LED digits are decoration.
- Touch targets are at least 44 px (`min-h-11`).
- Motion respects `prefers-reduced-motion`.
