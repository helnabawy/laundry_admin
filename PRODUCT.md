# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Responsive web app. Desktop and tablet are the primary targets, and it must also work on a phone for checking and acting on an order away from a desk (confirmed by the user).

## Users

Staff of the laundry, working in three portal roles (confirmed):

- **Super admin**: the platform operator. Sees every laundry, manages staff accounts (the only role that can), runs reports across all requests, exports them, reads the audit log and manages laundries (vendors).
- **Admin**: runs one laundry. Manages the service catalogue (categories, sub-services, priced products, service tiers and time slots), plus drivers and orders. Reads the dashboard.
- **User (laundry operator)**: works orders on the facility floor. Assigns drivers, confirms the driver handed items over, counts and prices items, records the condition report, marks cleaning done and dispatches for delivery.

Situations:
- Managers and the super admin sit at an office desktop.
- Operators stand at a sorting table with a tablet or shared desktop, often switching between the portal and physical bags of laundry.
- Anyone may check an order on a phone.

Customers and drivers are **not** portal users. They use the Flutter app (`../laundry_app`), and the mobile app sends staff accounts here (`staffMustUsePortal`).

## Product Purpose

This is the back office of a laundry pickup-and-delivery service. The facility-side steps the mobile app can only simulate happen here for real:
- assigning the pickup driver
- receiving items from the driver
- counting, pricing and invoicing a wizard order, including the condition report
- marking cleaning done and assigning the delivery driver

It also owns the catalogue the app sells from, and it shows the business how it is doing.

Success means an order never waits on the laundry without somebody knowing, and the customer's tracking screen is always true.

## Positioning

The portal is the single source of truth for two booking paths that share one lifecycle (see root `../PRODUCT.md`):
- **Shop:** priced at checkout, skipping inspection and payment.
- **Wizard:** priced by the laundry after counting.

The portal only ever offers the next action that is legal for the order's path and status.

## Operating Context

- **Order lifecycle** (shared enum with the app):
  - Wizard: `pending → driverAssigned → pickedUp → atFacility → awaitingPayment → processing → outForDelivery → delivered`
  - Shop: `pending → driverAssigned → pickedUp → processing → outForDelivery → delivered`
  - Failures: `pickupFailed → cancelled`, and `deliveryFailed`, which staff may retry.
- **The laundry changes status after the driver hands the items over** (user requirement): "Receive items from driver" moves wizard orders to `atFacility` and shop orders to `processing`.
- **Condition report is mandatory** when invoicing a wizard order. Staff must record findings (stain or damage, optionally with a photo) or explicitly confirm there are none.
- **Catalogue content is bilingual.** Every category, sub-service, product and tier has an English and an Arabic title and description. Categories carry an icon and an optional image.
- **Notifications:**
  - The portal shows in-app realtime notifications for new orders, items picked up, payments chosen, failed pickups and deliveries, deliveries and ratings.
  - Push and email are out of scope for phase 1.
- **Multi-vendor:** phase 1 runs one laundry, but all data is vendor-scoped. A laundry switcher appears only once there is more than one.
- **Currency and region:** AED; UAE (Asia/Dubai time).

## Capabilities and Constraints

- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Postgres via Prisma 7. The same app serves the mobile REST API.
- **Languages:** English (LTR) and Arabic (RTL), both first-class. Staff use both day to day, and the portal follows each user's saved preference. No hard-coded strings.
- **Themes:** light and dark, first-class, with a follow-system option.
- Order-status terminology reuses the app's ARB strings (for example "At the laundry" / "في المغسلة").
- **Out of scope for phase 1:** real card payments, push notifications, auto-dispatch and SMS provider integration.

## Brand Commitments

**Independent** from the mobile app's identity (the user's decision). The portal does not inherit the app's "Care Label" palette, fonts or component shapes, and it gets its own visual world. The product name shown to staff is to be decided. Until then it uses "Laundry Admin" / "إدارة المغسلة".

## Evidence on Hand

- Real bilingual catalogue content ported from the app mock: 4 categories, 7 sub-services, 15 AED-priced products and 2 tiers (`prisma/seed.ts`).
- Placeholder stock category photography from Pexels (`public/catalog/`, see `CREDITS.md`). It is not the company's real facility.
- Demo orders exist only in development seed data (`pnpm db:seed:demo`).
- There are **no** real metrics, customers, testimonials or logos. None may be fabricated in the UI, and empty states stay empty.

## Product Principles

1. **Only the legal next step.** Every order screen offers the actions the workflow allows now, and nothing else.
2. **Irreversible actions state their consequence** before committing: cancel, issue invoice, receive items, dispatch.
3. **Price is honest about when it's known.** Staff see exactly what the customer will see before issuing an invoice.
4. **Both languages are native.** Arabic layouts are mirrored by construction and never an afterthought.
5. **Status is answerable at a glance.** Anyone should be able to see what is waiting on the laundry right now, and for how long.

## Accessibility & Inclusion

- Status is never conveyed by colour alone. Always pair it with a label and an icon.
- Keyboard-operable throughout.
- Touch targets suit tablet use at the sorting table.
- Full RTL mirroring.
- Legible in both themes.
