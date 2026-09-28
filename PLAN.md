# Laundry Admin Portal + Backend (Phase 1)

## Context

`PRODUCT.md` describes a laundry pickup and delivery platform. The Flutter app (`laundry_app/`) serves Customers and Drivers. It runs on an in-memory mock (`lib/core/mock/mock_database.dart`), and staff accounts are turned away with `staffMustUsePortal`.

The mock also fakes every facility-side step:
- auto-assigning a driver
- `atFacility`
- counting items and issuing an invoice, including the condition report
- `processing → outForDelivery`

(These live in `features/orders/data/datasources/order_mock_data_source.dart`: `createOrder`, `confirmPickup`, `_generateInvoice`, `_sortingFindings`, `_dispatchWashed`.)

No backend exists anywhere in the repo.

**Goal:** build `laundry_admin/` as a single Next.js app that provides two things:
1. **The web Admin Portal**, where staff manage the catalogue, run orders through the facility steps, view dashboards and reports, and receive realtime notifications. It is bilingual (EN/AR, RTL), has light and dark themes, and gets its design system from Impeccable.
2. **The REST API the Flutter app already expects** (`lib/core/network/api_endpoints.dart`). Setting `--dart-define=USE_MOCK_API=false` then gives a real end-to-end flow.

Phase 1 serves a single vendor (one laundry), but every table is vendor-scoped so multi-vendor needs no schema rewrite.

**Decisions confirmed with the user:**
- Next.js + Postgres (this replaces the "ASP.NET Core" mentioned in `app_config.dart` comments)
- email + password login for staff
- notifications are in-portal realtime only
- the `User` role is a laundry operator

## Stack

- **Framework:** Next.js 15 (App Router, TypeScript, Server Actions for portal mutations, Route Handlers under `app/api/*` for the mobile API), pnpm.
- **Database:** Postgres 16 via `docker-compose.yml`, Prisma ORM with migrations and a seed script.
- **Auth:**
  - Portal: Auth.js v5 Credentials (email + argon2 hash), with the session carrying `role` and `vendorId`.
  - Mobile: phone OTP, then a `jose` JWT Bearer token.
  - The two are separate.
- **UI:**
  - Tailwind CSS v4 with shadcn/ui (Radix), using logical properties (`ms-`/`me-`/`ps-`) so RTL is correct by construction.
  - TanStack Table for lists and Recharts (shadcn chart wrapper) for dashboards.
  - `sonner` for toasts and `react-hook-form` + `zod` for forms.
- **i18n:** `next-intl`, with locale in the URL (`/en/...`, `/ar/...`) and `<html dir>` switching.
- **Themes:** `next-themes`, with system, light and dark options.
- **Realtime:** Server-Sent Events at `/api/admin/events`, fed by Postgres `LISTEN/NOTIFY`. This avoids extra infrastructure and works across instances.
- **Uploads:** a `StorageDriver` interface. Phase 1 writes to local `/public/uploads`, and an S3-compatible driver can be added later. This handles category, product and condition-report photos, and driver proof and failure photos.
- **Reports:** filtered order queries exported to CSV and XLSX (`exceljs`).
- **Tests:** Vitest for the domain, API contract and permissions; Playwright for portal end-to-end tests.

## Roles & permissions (`src/server/auth/permissions.ts`)

| Capability | SUPER_ADMIN (platform) | ADMIN (vendor) | USER (operator) |
|---|---|---|---|
| Dashboard | all vendors | own vendor | own vendor (ops widgets) |
| Orders: view, update status, assign driver, count and invoice | ✓ | ✓ | ✓ |
| Cancel order | ✓ | ✓ | – |
| Catalogue (categories, sub-services, products, tiers, slots) | ✓ | ✓ | – |
| Drivers (mobile driver accounts) | ✓ | ✓ | – |
| Staff users | all roles | ADMIN/USER in own vendor | – |
| Vendors (laundries) | ✓ | – | – |
| Reports and export | ✓ | – | – |
| Audit log | ✓ | – | – |

Every server action and query goes through `requirePermission(session, cap)` and `vendorScope(session)`, which returns a Prisma `where` fragment.

**Phase 1 behaviour:**
- One vendor is seeded, so the vendor switcher stays hidden while `vendors.length === 1`.
- SUPER_ADMIN has `vendorId = null` and sees everything.

## Data model (`prisma/schema.prisma`)

**Multi-vendor rule:** every business row has `vendorId`. Order numbers are unique per `(vendorId, number)`, and numbering starts at 1041 to match the mock.

**Tables:**
- `Vendor`: id, slug, nameEn, nameAr, logoUrl, phone, isActive, settings JSON (cod fee, wash window).
- `StaffUser`: email, passwordHash, name, role enum (SUPER_ADMIN, ADMIN, USER), vendorId?, locale, isActive, lastLoginAt.
- `MobileUser`: phone (E.164), fullName, role enum (customer, driver), vendorId? (drivers belong to a vendor), isAvailable. Plus `OtpChallenge` (hash, expiresAt, attempts). The SMS sender is behind an interface; in dev it logs the code or uses the fixed code `1234`.
- `Address`: the fields from `Address` in the app, plus userId.
- `ServiceCategory`:
  - vendorId, nameEn, nameAr, descriptionEn, descriptionAr
  - **iconKey** (a curated icon set, e.g. `shirt`, `carpet`, `curtain`, `bed`)
  - **imageUrl** (uploaded)
  - sortOrder, isActive
  - Stable `code` slug (`cat-clothes` etc.) so the app's existing `category_icons.dart` keeps working.
- `SubService`: categoryId, the same bilingual fields, sortOrder, isActive.
- `Product`: vendorId, categoryId, bilingual name and description, `unitPrice Decimal(10,2)` (AED), imageUrl, isActive, sortOrder.
- `ServiceTier`: vendorId, bilingual name, deliveryHours, isVip, surchargeType (none/flat/percentage), surchargeValue, perks (bilingual JSON array).
- `SlotWindow`: vendorId, startMinute, endMinute, capacity, weekdays, isActive. Concrete `TimeSlot`s are generated per date with id `YYYY-MM-DD-<index>` (same format as the mock). `isFull` is computed from booked orders ≥ capacity.
- `Order`:
  - vendorId, number, userId, `kind` enum (SHOP, WIZARD)
  - status (the 11 `OrderStatus` values, spelled exactly as the app's enum names)
  - tierId, pickupSlotStart/End, deliverySlotStart/End, addressSnapshot JSON
  - pickupDriverId?, deliveryDriverId?, createdAt
- `OrderLine` (wizard): orderId, categoryId, subServiceId.
- `OrderStatusEvent`: orderId, status, at, actorType (staff, driver, customer, system), actorId, note. This is the timeline.
- `Invoice`: orderId (unique), number, paymentMethod?, paid, vipSurcharge, codFee, note, conditionsAcknowledged, paidAt.
- `InvoiceItem`: name snapshot, quantity, unitPrice, productId?, categoryId?.
- `ItemCondition`: invoiceId, itemName, kind (stain, damage), note, photoUrl.
- `TaskFailure`: orderId, stage (pickup, delivery), reason, note, photoUrl.
- `OrderRating`: stars, comment.
- `Notification`:
  - audience (staff or mobile), recipient id or `vendorId` broadcast
  - kind (the app's `NotificationKind` values plus staff kinds: `newOrder`, `itemsHandedOver`, `paymentReceived`, `pickupFailed`, `deliveryFailed`, `orderRated`)
  - orderId, readAt.
- `AuditLog`: actor, action, entity, entityId, diff JSON.

Pricing authority stays on the server. For shop orders, prices are resolved from `Product` and snapshotted into `InvoiceItem`. A client-supplied total is never trusted, matching `PRODUCT.md`.

## Order state machine (`src/domain/order-workflow.ts`)

This is one pure module that both the portal and the mobile API call. It is unit-tested exhaustively.

**Wizard path:**
`pending → driverAssigned → pickedUp → atFacility → awaitingPayment → processing → outForDelivery → delivered`

**Shop path:**
`pending → driverAssigned → pickedUp → processing → outForDelivery → delivered`

Terminal states for both paths: `pickupFailed → cancelled`, `deliveryFailed`, `cancelled`.

**Transitions and who can perform them:**

| Transition | Actor | Portal action (EN label) |
|---|---|---|
| pending → driverAssigned | staff | "Assign pickup driver" |
| driverAssigned → pickedUp | driver (app) | – |
| pickedUp → atFacility (wizard) / → processing (shop) | staff | **"Receive items from driver"**: the laundry confirms the handover. This is the user's explicit requirement. |
| atFacility → awaitingPayment | staff | **"Count items & issue invoice"**. This is a form with product-priced lines plus free lines, and the condition report is mandatory. Staff either add stains or damage findings with an optional photo, or tick "No stains or damage found". |
| awaitingPayment → processing | customer (app) | – (`payment-method`, which requires `conditionsAcknowledged` when findings exist) |
| processing → outForDelivery | staff | "Cleaning done: assign delivery driver" |
| outForDelivery → delivered / deliveryFailed | driver (app) | – |
| deliveryFailed → outForDelivery | staff | "Retry delivery" (reassign) |
| any active → cancelled | ADMIN+ | "Cancel order", with a reason |

Every staff action opens a confirm dialog that states its consequence before committing (PRODUCT principle 5).

Each transition does three things in one DB transaction:
1. appends an `OrderStatusEvent`
2. writes an `AuditLog` row
3. creates notifications (a customer notification using the mapping in `notification_mock_data_source.dart`, driver `newPickup`/`newDelivery`, and staff events), then calls `pg_notify('vendor_events', …)`.

**Invoice rules:**
- Wizard invoices add `codFee` when COD is chosen (this closes the mock's gap).
- The VIP surcharge uses `surchargeFor(subtotal)` semantics.

## Mobile REST API (`src/app/api/**/route.ts`)

This implements every endpoint in the contract table from exploration exactly: same paths, JSON keys, and enum spellings. It includes:
- auth: `request-otp` and `verify-otp`, returning `{token, user}`, with the role staying out of the token
- `me` and addresses
- catalogue, tiers and `timeslots?date&tier&type&notBefore`
- orders CRUD, payment-method and rating
- notifications and read-all
- driver tasks, availability, confirm-pickup/delivery, and report-pickup/delivery-failed (multipart photo uploads)
- support FAQs, assistant (stub) and requests

**Shared helpers** (`src/server/api/`):
- `withMobileAuth` (Bearer JWT; a 401 is what triggers the app's `SessionCubit.expire()`)
- `localize(row, acceptLanguage)`, which turns `nameEn`/`nameAr` into a single `name` so the payload matches the mock's `tr()`
- `problem(status, detail)`, which returns ProblemDetails, because the app reads `detail` for error messages
- serializers in `src/server/api/serializers/*.ts`, one per app model (`laundry-order.ts` produces the exact `LaundryOrderModel` JSON)

**Catalogue responses** also include `iconKey` and `imageUrl`. The app ignores unknown keys today, so this is non-breaking. Using them in the app is a separate follow-up.

**Staff-side data** for the portal UI does not go through the REST API. It uses Server Components and Server Actions, plus `/api/admin/events` (SSE) and `/api/admin/reports/export`.

## Portal screens (`src/app/[locale]/(portal)/...`)

The shell has a collapsible sidebar (it mirrors in RTL), a top bar, a global order search (by number or phone), a language toggle, a theme toggle, a notification bell and a user menu.

1. **Dashboard:**
   - KPI tiles: orders today, active orders, awaiting payment, revenue (AED, paid invoices), average turnaround, failed stops.
   - Charts: orders per day (stacked shop vs wizard), revenue trend, status distribution, top categories/products, tier mix (Standard vs VIP), and pickup/delivery load by slot.
   - Date-range filter.
   - SUPER_ADMIN gets a vendor filter.
   - Rule: no fabricated data; empty states only.
2. **Orders:**
   - **Board view:** a kanban of columns by operational stage: *New*, *Driver assigned*, *Picked up, awaiting handover*, *At laundry*, *Awaiting payment*, *Processing*, *Out for delivery*, *Issues*.
   - **Table view:** filters for status, kind, tier, date, driver and payment.
   - **Order detail:**
     - the timeline
     - customer and address (map link)
     - lines or items, the invoice and the condition report
     - the failure record with its photo
     - a primary action button that shows only the valid next transition(s) from the workflow module
3. **Count & invoice sheet:**
   - a product picker (quantity steppers) plus custom lines
   - the condition findings list with photo upload
   - a live subtotal, VIP surcharge and total
   - a preview of what the customer will see
4. **Catalogue:**
   - Categories, then Sub-services and Products, with tabs for bilingual fields (EN | AR side by side), an icon picker plus image upload, active toggles and drag-to-reorder.
   - Service tiers.
   - Slot windows and capacity.
5. **Drivers:** create driver accounts (phone), set availability, view today's load, deactivate.
6. **Staff users:** invite or create, set role, deactivate, reset password. Scope follows the permissions matrix.
7. **Reports (SUPER_ADMIN):**
   - All requests across vendors, with advanced filters (date range, vendor, status, kind, payment method/paid, driver, tier, category).
   - Saved presets.
   - Summary aggregates.
   - Export to CSV or XLSX.
8. **Notifications:** bell dropdown plus a full page, with toasts over SSE, mark read, and click-through to the order.
9. **Vendors (SUPER_ADMIN):** a list with one row in phase 1; edit details and settings.
10. **Audit log (SUPER_ADMIN)**, **Profile** (password, language, theme) and **Login**.

## Design system (Impeccable)

1. Before building UI, invoke the `impeccable` skill to shape the portal's design system and write `laundry_admin/DESIGN.md` plus tokens. Give it:
   - `PRODUCT.md`
   - the app's existing "Care Label" tokens (`laundry_app/lib/core/design/tokens/design_colors.dart`, `design_typography.dart`, `design_metrics.dart`)
   - the brief: "back-office working surface; dense but calm; bilingual RTL; light and dark".
2. Anchor the palette to the app's brand so the two products feel like one family:
   - tape and ink neutrals
   - violet `tint` #5B2D8E / #B18AE8 as the only action colour
   - `signal` red reserved for errors, unpaid and destructive states
3. Status colours must never be the only signal. Always pair them with a label and an icon, per the accessibility rules in `PRODUCT.md`.
4. Output the tokens as CSS variables in `src/styles/tokens.css`, with `:root` and `.dark`, mapped into the Tailwind v4 `@theme` and the shadcn variables.
5. Fonts: Archivo (Latin display and numerics) and Noto Kufi Arabic, both reused from `laundry_app/assets/fonts`, plus a body sans chosen by Impeccable. Use `next/font/local`.
6. After the build, run Impeccable's critique/polish pass and its documenter on the finished screens.

## Localization

- `messages/en.json` and `messages/ar.json`.
- Reuse the app's exact terminology from `laundry_app/lib/l10n/app_*.arb` for statuses, payment, the condition report and notification titles. For example, `statusAtFacility` is "At the laundry" / "في المغسلة".
- No hard-coded strings; an ESLint rule and a test check that the key sets are equal.
- Numbers and dates go through `Intl`. Currency AED renders as `currencyAed`.

## Repo layout (`laundry_admin/`)

```
docker-compose.yml   .env.example   prisma/{schema.prisma,seed.ts,migrations}
messages/{en,ar}.json   DESIGN.md
src/app/[locale]/(auth)/login   src/app/[locale]/(portal)/{dashboard,orders,catalogue,drivers,users,reports,notifications,vendors,audit,profile}
src/app/api/{auth,me,service-categories,products,service-tiers,timeslots,orders,invoices,driver,support}/…   src/app/api/admin/{events,reports/export}
src/domain/{order-workflow.ts,pricing.ts,slots.ts,notification-mapping.ts}
src/server/{db.ts,auth/,api/,actions/,storage/,realtime/}
src/components/{ui (shadcn),shell,orders,catalogue,charts}
tests/{unit,api,e2e}
```

**Seed:** port the mock data verbatim so the app behaves the same against the real API:
- vendor `fac-1`
- the 4 categories and 7 sub-services, the 15 products and the 2 tiers from `catalog_mock_data_source.dart`, with the same ids
- the 4 slot windows
- the customer and driver phones from `mock_database.dart`
- the two addresses
- a few sample orders spread across statuses
- staff users `super@…`, `admin@…` and `operator@…`

## Build order

1. Scaffold: Next.js, Tailwind, shadcn, next-intl, next-themes, Prisma, docker-compose. Schema and seed.
2. Domain modules (workflow, pricing, slots, notification mapping) with Vitest.
3. Mobile REST API, contract-tested against the app's JSON shapes.
4. Impeccable design pass, which produces DESIGN.md and tokens, then the app shell (auth, RTL, themes).
5. Orders: board, detail, transitions, and the count & invoice sheet.
6. Catalogue CRUD with uploads, then drivers and staff users.
7. Dashboard charts, reports and export, notifications over SSE.
8. Polish: Impeccable critique, accessibility, empty/loading/error states, README.

## Verification

- `docker compose up -d && pnpm prisma migrate dev && pnpm db:seed && pnpm dev`
- `pnpm test`: runs Vitest over every legal and illegal workflow transition for both paths, pricing (VIP percentage, COD fee), the permission matrix and vendor scoping, and API serializer snapshots that must match the app's `fromJson` field names.
- `pnpm test:e2e` (Playwright):
  - log in as each role and check the menu and permission gating
  - create a category with an EN/AR title and icon
  - walk an order through handover, then invoice, then dispatch
  - export a report
  - run in both `ar` (RTL) and dark mode
- **End-to-end with the real app:**
  1. `cd laundry_app && flutter run --dart-define=USE_MOCK_API=false --dart-define=API_BASE_URL=http://localhost:3000`, on the iOS simulator (or `10.0.2.2:3000` on Android).
  2. Book a wizard order as the customer (+971501234567, OTP 1234).
  3. Confirm pickup as the driver.
  4. Check that the portal shows a realtime toast.
  5. Receive the items, then issue an invoice with a stain finding.
  6. The customer sees the invoice and acknowledges it.
  7. Pay COD, then in the portal mark it done and assign the delivery driver.
  8. The driver delivers.
  9. Repeat for a shop order, confirming it skips the handover invoice step.
- **Visual check:** open the portal in Chrome in en/ar and light/dark, and at 1280px and tablet widths.
- **Submodule:** commit inside `laundry_admin` and push before bumping the pointer in the umbrella repo (see root `README.md`).

## Out of scope for phase 1 (schema-ready)

- a vendor onboarding UI beyond the single seeded vendor, and customer-facing vendor selection
- auto-dispatch
- push (FCM) and email notifications
- real card payments and SMS provider integration (both are interfaces with dev stubs)
- app changes that use the new `imageUrl`/`iconKey` fields
