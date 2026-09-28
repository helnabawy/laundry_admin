---
version: 1
slug: "src-app-portal-orders"
primary_target: "src/app/(portal)/orders"
related_targets: ["src/app/(portal)"]
---

# Surface brief: Admin Portal (orders board first)

Scope: the whole staff portal. The orders board is the first surface; dashboard, catalogue, reports, drivers, staff and settings inherit the world.
Mode: Operate.
Audience and task: laundry operators at the sorting table (tablet or desktop) and managers in the office (desktop). They see what is waiting on the laundry, open an order, perform the one legal next step, count and invoice, and dispatch. The super admin reports across all requests. Phones are for checking and acting on one order.
Constraints: EN/AR with full RTL; light and dark; status never colour alone (stock colour + pictogram + label); keyboard operable; no fabricated data.

## Direction contract

THESIS: Every order is its torn-off claim ticket. It is a numbered card in a coloured stock that travels the rack stage by stage, and it carries one stamped next action. It refuses the SaaS default of KPI cards over a generic data table.

OWN-WORLD:
- Grounds: a cool counter-grey ground; tickets are white card stock with a soft offset shadow, and each is headed by a stock band in its stage colour.
  - canary: intake
  - pink: at the laundry
  - green: cleaning
  - blue: dispatch
  - red stamp: issues
  - grey: done
- The perforated stub is a dotted rule with edge notches, and the numbering-machine digits are big and tabular.
- The single action colour is solid ink, used as a rubber-stamp button; red stamp is for destructive actions only.
- Dark mode is the after-hours facility: charcoal counter, graphite card, the same stocks muted.

STORY: The operator knows within a second what waits on the laundry and for how long. They open a ticket, press the one stamp it offers, and watch it move on. Managers read the tally and charts; the super admin pulls reports.

FIRST VIEWPORT:
- Navigation: the nav rail sits at the start edge. The top bar holds search (number or phone), the bell, language and theme.
- The body is the rack: stage columns, each headed by its stock swatch, a bilingual stage name and a big count.
- Each ticket shows a large number, customer, kind glyph, waiting time that gets heavier when overdue, and its stamp button, which is the primary action.

FORM: Claim Ticket Stock. Position 1 on my ordered list (it was the pick). Seed key 45cafbef. Signature interaction: committing a stamp tears the stub and the ticket advances to its next column (view transition, 180ms ease-out, instant under reduced motion).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
