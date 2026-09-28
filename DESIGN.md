---
name: Laundry Admin
description: The staff portal of a laundry pickup-and-delivery service, built as a rack of numbered claim tickets.
colors:
  counter: "#e8eaed"
  counter-deep: "#dde0e4"
  card: "#ffffff"
  card-recessed: "#f5f5f3"
  ink: "#17181b"
  ink-2: "#4b4d54"
  ink-3: "#62646b"
  rule: "#dcddd9"
  rule-strong: "#b9bab5"
  stamp: "#17181b"
  stamp-hover: "#2d2f34"
  on-stamp: "#ffffff"
  focus: "#2459c9"
  danger: "#b92d1b"
  danger-hover: "#9c2415"
  danger-wash: "#fbe9e5"
  success: "#1c6a41"
  success-wash: "#e3f4ea"
  stock-canary: "#f5cf33"
  stock-canary-ink: "#6a5200"
  stock-canary-wash: "#fdf6d6"
  stock-pink: "#f3a2bf"
  stock-pink-ink: "#8a2b53"
  stock-pink-wash: "#fdeaf1"
  stock-green: "#8fd4a9"
  stock-green-ink: "#1c6a41"
  stock-green-wash: "#e3f4ea"
  stock-blue: "#9fc5f1"
  stock-blue-ink: "#1d4d8c"
  stock-blue-wash: "#e6f0fc"
  stock-red: "#e5634c"
  stock-red-ink: "#a3261a"
  stock-red-wash: "#fbe9e5"
  stock-grey: "#cfcdc6"
  stock-grey-ink: "#55544f"
  stock-grey-wash: "#f0efec"
  band-label: "#1d1d1f"
  chart-shop: "#5b47c9"
  chart-quick: "#00909c"
  chart-neutral: "#5f6573"
  chart-neutral-soft: "#b7bbc5"
typography:
  numerals-display:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "\"tnum\", \"zero\""
    fontVariation: "\"wdth\" 85"
  numerals-ticket:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "\"tnum\", \"zero\""
    fontVariation: "\"wdth\" 84"
  numerals-count:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "\"tnum\", \"zero\""
    fontVariation: "\"wdth\" 82"
  numerals-inline:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\", \"zero\""
  headline:
    fontFamily: "Readex Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Readex Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Readex Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Readex Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  meta:
    fontFamily: "Readex Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.375
rounded:
  swatch: "2px"
  chip: "4px"
  ticket: "6px"
  control: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "32px"
components:
  button-stamp:
    backgroundColor: "{colors.stamp}"
    textColor: "{colors.on-stamp}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-stamp-hover:
    backgroundColor: "{colors.stamp-hover}"
    textColor: "{colors.on-stamp}"
  button-stamp-lg:
    backgroundColor: "{colors.stamp}"
    textColor: "{colors.on-stamp}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.card-recessed}"
    textColor: "{colors.ink}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.counter-deep}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-stamp}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  button-danger-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  ticket:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ticket}"
    padding: "12px 14px 14px"
  ticket-stub-canary:
    backgroundColor: "{colors.stock-canary}"
    textColor: "{colors.band-label}"
    typography: "{typography.meta}"
    padding: "0 12px"
    height: "34px"
  status-stamp-pink:
    backgroundColor: "{colors.stock-pink-wash}"
    textColor: "{colors.stock-pink-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "0 8px"
    height: "28px"
  nav-item:
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  nav-item-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
  wait-chip-overdue:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
    typography: "{typography.numerals-inline}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  wait-chip-late:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-stamp}"
    typography: "{typography.numerals-inline}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
---

# Design System: Laundry Admin

## Overview

**Creative North Star: "Claim Ticket Stock"**

Every order is its torn-off claim ticket: a numbered white card that travels the rack stage by stage, headed by a band of coloured ticket stock that names its stage family, and carrying exactly one stamped next action. The portal is the sorting-room counter those tickets sit on. It is dense, fast to scan and physical in a quiet way: card stock on a cool counter-grey ground, a soft lift under each card, a dotted perforation with edge notches where the stub tears off, and big tabular numbering-machine digits for every order number, count and amount.

The world rejects the SaaS default of KPI cards over a generic data table. Summaries read as ruled receipts with dotted leaders; stages read as a rack of columns, each headed by its stock swatch, a bilingual name and a big count. Solid ink is the only action colour, used as a rubber stamp; red is reserved for destructive and failed. Dark mode is the facility after hours: charcoal counter, graphite card, the same stocks muted.

English and Arabic are both native. Layout mirrors by construction (logical properties, start/end edges), Arabic is never letter-spaced, and digits stay Latin in both languages so the numbering machine reads the same. This world is independent of the sister mobile app and inherits none of its palette, fonts or shapes.

**Key Characteristics:**
- White ticket cards on a cool counter-grey ground, with a soft two-layer lift.
- Six ticket stocks (canary, pink, green, blue, red, grey) name stage families and nothing else.
- One action colour: solid ink, pressed like a rubber stamp.
- Martian Mono numbering-machine digits, condensed on the wdth axis, for every figure.
- Perforated stub with half-circle notches as the recurring signature.
- Status is always stock + pictogram + label; never colour alone.
- Full EN/AR bidirectionality and first-class light and dark themes.

## Colors

A neutral card-and-counter palette with ink as the sole action colour and six stage stocks that each come as a band, a deep ink and a pale wash.

### Primary
- **Stamp Ink** (stamp): the rubber-stamp action colour for the one legal next step on a ticket, the primary button on every page and the checked switch. Identical to body ink in light mode; inverts to near-white in dark mode, where the label becomes the counter colour.

### Neutral
- **Counter Grey** (counter): the page ground under everything, and the notch colour cut into each ticket.
- **Counter Deep** (counter-deep): segmented-control troughs, ghost hover, the unchecked switch track.
- **Card Stock** (card): tickets, sheets, the active nav item, inputs.
- **Recessed Card** (card-recessed): wells inside a card ("waiting on" notes, bar tracks, hover rows).
- **Ink / Ink 2 / Ink 3** (ink, ink-2, ink-3): primary text, secondary text and labels, tertiary metadata and placeholders. Ink 3 still clears 4.5:1 on card in both themes.
- **Rule / Rule Strong** (rule, rule-strong): hairline dividers; control borders, perforation dots and axis lines.
- **Focus Blue** (focus): the 2px focus outline and the input focus border. It is the only blue that is not a stock.

### Stage stocks
Each stock has a **band** (the stub fill and the small swatch), an **ink** (text and marks on white) and a **wash** (status stamp and highlight backgrounds).
- **Canary** (stock-canary): intake (new, pickup scheduled). Canary wash also marks unread and touched rows, and the canary band carries unread counts; canary is the "look here" stock.
- **Pink** (stock-pink): at the laundry (picked up, at the laundry, awaiting payment).
- **Green** (stock-green): cleaning.
- **Blue** (stock-blue): dispatch (out for delivery).
- **Red Stamp** (stock-red): issues (pickup or delivery failed).
- **Grey** (stock-grey): done (delivered, cancelled), and the stub on the period receipt.
- **Band Label** (band-label): the fixed near-black used for words and pictograms printed on a stock band in both themes.

### Semantic
- **Danger** (danger, danger-hover, danger-wash): destructive buttons, errors, and the overdue waiting-time chip (wash when overdue, solid when twice over budget).
- **Success** (success, success-wash): confirmation notes, such as a completed condition report.

### Charts
- **Shop Violet** (chart-shop), **Quick Teal** (chart-quick), **Chart Neutral** (chart-neutral, chart-neutral-soft): data series only. The palette was validated with the dataviz validator. Light: shop #5b47c9, quick #00909c, neutral #5f6573. Dark: #8a78e6, #23a6af, #a3a8b4. All pass CVD ΔE ≥ 8 and contrast ≥ 3:1 on card.

### Named Rules
**The Stock Is The Stage Rule.** Ticket stocks are reserved for stages (and canary's look-here highlight). They are never reused for data series; charts draw only from the chart palette.

**The Never Colour Alone Rule.** Status is always stock + pictogram + label. A swatch without its words and icon is decoration, not status.

**The One Stamp Rule.** Solid ink is the only fill for a primary action, and a ticket shows one stamp. Red fill is for destructive actions and failures only.

## Typography

**Display Font:** Martian Mono (with ui-monospace, monospace), loaded with its wdth axis
**Body Font:** Readex Pro (with ui-sans-serif, system-ui), Latin and Arabic subsets

**Character:** Readex Pro is one family for both scripts, so English and Arabic sit at the same weight and colour. Martian Mono is the numbering machine: condensed, semibold, slightly negative tracking, tabular and slashed-zero, used for anything that is a figure.

### Hierarchy
- **Numerals Display** (600, 44px, 1): the order number heading an order's detail page.
- **Numerals Ticket** (600, 32px, 1): the order number on each ticket.
- **Numerals Count** (600, 20 to 22px, 1): stage counts on the stage rail and column headers; dashboard tallies run 30px.
- **Numerals Inline** (400 to 600, 12 to 13px): times, slot windows, money, table figures.
- **Headline** (600, 26px, 1.25, -0.015em): page titles, balanced wrap, with a 14px ink-2 description capped at 65ch.
- **Title** (600, 15px): column headers and sheet titles.
- **Body** (400, 14px): customer names, table cells, form values.
- **Label** (500, 13px, ink-2): field labels, status stamps, small buttons.
- **Meta** (400, 12.5px, ink-2 or ink-3): ticket metadata, hints, stub labels, chart legends.

### Named Rules
**The Numbering Machine Rule.** Every order number, count, amount and time is set in Martian Mono with tabular, slashed-zero digits, condensed on the wdth axis (80 to 88%, tighter as the size grows). Digits are Latin in both languages.

**The Untracked Arabic Rule.** Right-to-left text never takes letter-spacing; the portal forces it to zero under `dir="rtl"`. There are no uppercase or tracked labels anywhere.

**The Bidi Isolation Rule.** Phone numbers and time ranges are set left-to-right and kept whole; names inserted into sentences are wrapped in first-strong isolates.

## Layout

A fixed start-edge nav rail (15.5rem) beside a sticky 64px top bar (search by number or phone, language, theme, bell, user) sitting on a translucent counter with a light blur. Content is capped at 100rem, with 12 / 20 / 32px side padding at phone, small and large widths. The rail collapses into a sheet below the large breakpoint.

The rack is the signature layout. A stage rail lists every stage with its stock, count and both-language names, so nothing hides off-screen; below it, only busy stages become columns. Column width comes from a container query so a whole number of tickets always fits and no ticket is cut mid-card: one column under 44rem, then up to 2, 3, 4 and 5 columns at 44, 60, 70 and 88rem, each at most 28rem with 16px gutters. On phones the stage rail is the stage picker and one column shows at a time, with scroll snap.

Spacing runs on a 4px base. 12px is the in-card rhythm (ticket stack gap, card padding); 16px separates cards and columns; 20px is sheet padding on wider screens. Touch targets are 40px by default and 48px for the detail-page stamp.

## Elevation & Depth

Depth is physical and soft. Cards sit on the counter with a two-layer shadow: a tight contact shadow plus a diffuse drop. Hover and overlays raise to a stronger lift. Recessed wells inside a card use tone (card-recessed) instead of shadow. In dark mode the same shadows go to black at higher opacity.

### Shadow Vocabulary
- **Ticket** (`box-shadow: 0 1px 1px rgb(23 24 27 / 0.06), 0 3px 10px -2px rgb(23 24 27 / 0.1)`): tickets, sheets, the stage rail, the active nav item and the selected segment.
- **Lift** (`box-shadow: 0 2px 4px rgb(23 24 27 / 0.08), 0 12px 28px -6px rgb(23 24 27 / 0.18)`): ticket hover, dialogs, menus, toasts and chart tooltips.
- **Stamp edge** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.2)`): the 1px bottom edge under a stamp button.

### Named Rules
**The Card Stock Rule.** Only card stock casts a shadow. Controls, chips and stamps sit flat on the card.

## Shapes

Gently cut card corners (6px) for tickets, sheets and dialogs; slightly softer control corners (8px) for buttons, inputs, nav items and notes; small 4px chips for status stamps, waiting-time chips and badges; 2px swatches. Pills and circles appear only as switches, avatars and progress stops.

The perforation is the recurring silhouette: a row of 1.1px dots in rule-strong on a 7px pitch between the stub and the ticket body, with 12px half-circle notches cut into both edges in the ground colour so the ticket keeps its real shadow. Anything built as a stub (the ticket, the login card, the dashboard's period receipt) uses a 34px stock band, the perforation, and the band-label colour for its words. Dialogs open as bottom sheets on phones with a 10px top radius.

## Components

### Buttons
Tactile and decisive: the stamp is pressed, not clicked.
- **Shape:** control corners (8px); sizes are 32px, 40px (default) and 48px tall, and 40px or 32px square for icons.
- **Stamp (primary):** stamp ink fill, on-stamp label, 16px inline padding, 1px dark bottom edge. It is the one legal next step; on a ticket it fills the ticket's width.
- **Hover / Focus / Active:** fill moves to stamp-hover over 150ms ease-out; focus is a 2px focus-blue outline offset 2px; press runs a 140ms scale to 0.96 and back.
- **Outline (default):** card fill, rule-strong border, ink label, recessed on hover. Used for secondary legal actions.
- **Ghost:** ink-2 label that darkens to ink over a counter-deep wash on hover.
- **Danger / Danger outline:** solid danger for confirming a destructive step; outlined danger (50% border) for offering one, such as cancel.
- **Disabled:** 45% opacity, no pointer events.

### Status Stamp
- **Style:** stock wash background, stock ink text, a 15% current-colour border and chip corners (4px); 28px tall with a 16px pictogram, or 24px tall with a 14px pictogram.
- **Content:** always pictogram + status words.

### Cards / Containers
- **Corner Style:** card corners (6px).
- **Background:** card stock; inner wells are card-recessed.
- **Shadow Strategy:** Ticket at rest, Lift on hover (see Elevation & Depth).
- **Border:** none on tickets and sheets; dialogs add a rule hairline.
- **Internal Padding:** 12 to 14px on tickets, 16 to 20px on sheets.

### Inputs / Fields
- **Style:** card fill, rule-strong 1px border, control corners (8px), 40px tall, 12px padding, ink-3 placeholder. Selects carry an inline chevron that swaps sides in Arabic.
- **Focus:** border turns focus blue with a 2px focus ring at 25%.
- **Error / Disabled:** danger border with a 13px danger message; disabled drops to 50% on a recessed fill.
- **Labels:** 13px medium ink-2 above the control with a 6px gap; hints in 13px ink-3.

### Navigation
- **Style:** 40px rows with an 18px icon and 14px medium label, grouped under small 12px ink-3 section names.
- **States:** inactive rows are ink-2 and wash to counter-deep on hover; the active row becomes a card with the Ticket shadow and ink text. Unread counts sit in a canary badge with numbering-machine digits.
- **Mobile:** the rail becomes a sheet opened from the top bar.

### Ticket (signature)
A white card headed by a 34px stock band (pictogram, status words, VIP tier chip, shop-or-quick glyph), the perforation and notches, then a 32px order number, a waiting-time chip, customer and area, a slot window, driver and items with price, and the stamp. The waiting-time chip escalates in place: plain ink-2, then danger wash when over the stage's wait budget, then solid danger at twice the budget. When nothing is the laundry's to do, a recessed note says who the order waits on.

**Motion:** committing a stamp tears the stub (180ms, cubic-bezier(0.16, 1, 0.3, 1): lift 5px, rotate -2.2deg, settle at -1deg, perforation fades to 35%), then the ticket travels to its next column as a named view transition over the same 180ms. Tear pivots from the end corner and mirrors in Arabic. Under reduced motion, everything completes in 1ms.

### Stage Rail and Rack Column
The rail is one card split into eight cells on desktop, each with a 4px stock band across its top, the stage pictogram, a big count and names in both languages; empty stages dim to 60%. Rack columns are headed by a 2px ink rule, a small stock swatch, the bilingual name, the count and a one-line hint.

### Progress Strip
The order's path as 32px circular stops joined by 2px lines: done stops are solid ink with a check, the current stop fills with its stock band inside an ink ring, stops ahead are outlined in rule-strong. Shop orders ride the shorter path.

### Period Receipt
Dashboard summaries are a stub-headed receipt (grey band, perforation) of ruled rows with dotted leaders running from label to numbering-machine value, not KPI cards.

## Do's and Don'ts

### Do:
- **Do** give every order its ticket: stock band, perforation with notches, big tabular number and exactly one stamp for its legal next step.
- **Do** show status as stock + pictogram + label, every time, in every theme.
- **Do** set every figure in Martian Mono, tabular and slashed-zero, condensed on the wdth axis, with Latin digits in both languages.
- **Do** draw charts from the validated chart palette only (shop, quick, neutral), with the chart-neutral family for single-series bars.
- **Do** use logical properties and start/end edges so Arabic mirrors by construction; mirror directional icons only.
- **Do** keep stock band labels in the band-label near-black and check each band against it for 4.5:1 in both themes.
- **Do** size rack columns so a whole number of tickets fits the width.

### Don't:
- **Don't** build dashboards as KPI cards over a generic data table; use the rack, ruled receipts and charts.
- **Don't** reuse a stage stock for a data series, a category or a decorative accent.
- **Don't** convey status by colour alone.
- **Don't** fill a primary action with anything but stamp ink, or fill with red for anything that isn't destructive or failed.
- **Don't** letter-space Arabic, or set labels in tracked uppercase.
- **Don't** give controls or chips their own shadow; only card stock lifts.
- **Don't** fabricate metrics, customers or logos; empty states stay empty.
