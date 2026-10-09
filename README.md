# Laundry Admin Portal

This is the back office for the laundry pickup-and-delivery platform, and the REST API that the Flutter app in `../laundry_app` talks to. See `PRODUCT.md` for the users and the business rules, and `DESIGN.md` for the design system.

It is one Next.js 16 app that does two jobs:

- **Admin portal (`/`)**: staff sign in with email and password. They run orders through the laundry's steps, manage services and prices, view the dashboard and reports, and get realtime notifications. The portal is in English and Arabic (with full right-to-left layout) and has light and dark themes.
- **Mobile API (`/api/*`)**: implements every endpoint in `laundry_app/lib/core/network/api_endpoints.dart`, using the same JSON shapes as the app's mock.

## Quick start

```bash
pnpm install
cp .env.example .env         # then set SESSION_SECRET and MOBILE_JWT_SECRET
pnpm db:up                   # Postgres 16 in Docker, on port 5433
pnpm db:migrate              # apply migrations
pnpm db:seed:demo            # catalogue, accounts and ~6 weeks of demo orders
pnpm dev                     # http://localhost:3000
```

`pnpm db:seed` seeds the same data without the demo orders.

| Portal login           | Password       | Role                                    |
| ---------------------- | -------------- | --------------------------------------- |
| super@laundry.local    | `ChangeMe123!` | Super admin: every laundry, staff accounts, reports, audit |
| admin@laundry.local    | `ChangeMe123!` | Laundry admin: runs their laundries, manages their operators |
| operator@laundry.local | `ChangeMe123!` | Laundry operator: works one laundry's orders |

Mobile accounts use OTP `1234` while `DEV_OTP_CODE` is set:

- customer: `+971501234567`
- drivers: `+971500000001` and `+971500000002`

### Run the Flutter app against it

```bash
cd ../laundry_app
flutter run --dart-define=USE_MOCK_API=false --dart-define=API_BASE_URL=http://localhost:3000
# Android emulator: API_BASE_URL=http://10.0.2.2:3000
```

## Roles

| Capability                                               | Super admin | Laundry admin | Operator |
| -------------------------------------------------------- | :---------: | :---: | :--: |
| Orders: assign drivers, receive items, count & invoice, dispatch | ✓ | ✓ | ✓ |
| Cancel an order                                          | ✓ | ✓ | – |
| Services, items, service levels, time slots              | ✓ | ✓ | – |
| Drivers page (add/edit a laundry's drivers)              | – | ✓ | – |
| Staff accounts (portal users)                            | ✓ | operators of their laundries | – |
| Reports and export, laundries, audit log                 | ✓ | – | – |

The matrix is defined in `src/lib/permissions.ts`. Server actions check it, and so do pages.
A super admin sees every laundry; a laundry admin is assigned one or more laundries by a super admin;
an operator works in exactly one. See [`docs/ROLES.md`](docs/ROLES.md) for assignments, scoping and
`GET /api/admin/me`.

## Order lifecycle

All state changes go through `src/domain/order-workflow.ts`, a pure, unit-tested module, and `src/server/orders/transition.ts`. Each transition runs in a single locked transaction that writes the timeline entry, the notifications, the audit entry and a realtime event.

- **Quick order (wizard):**
  1. `pending` → staff assign a driver → `driverAssigned`
  2. The driver collects → `pickedUp`
  3. **Staff receive the items from the driver** → `atFacility`
  4. Staff count the items, price them and record the condition report → `awaitingPayment`
  5. The customer pays → `processing`
  6. Staff mark cleaning done and assign the delivery driver → `outForDelivery`
  7. The driver delivers → `delivered`
- **Shop order:** priced at checkout. Receiving the items moves the order straight to `processing`.
- **Failures:** a failed pickup cancels the order automatically. After a failed delivery, staff can send the order out again.

## Multi-vendor

Each vendor is one laundry, and every business table has a `vendorId`.

- **Adding a laundry:** super admins add laundries on `/vendors`. A new laundry can start from a copy of another laundry's services, prices, service levels and time windows. Each laundry needs its own invoice prefix, so invoice numbers never repeat across laundries.
- **Who sees what:** operators work in one laundry; laundry admins in the laundries a super admin assigned them; super admins in every laundry. A laundry switcher appears in the top bar for a super admin once a second laundry exists, and for a laundry admin with more than one laundry ("All my laundries" is the default).
  - Looking at several laundries, the dashboard shows them side by side; the super admin's reports break totals down by laundry.
  - Catalogue editing and payment settings ask to pick a laundry first.
- **Mobile API:** the app sends the customer's chosen laundry as an `X-Vendor-Id` header (id or slug). `GET /api/vendors` lists the laundries to choose from. A request without the header gets `DEFAULT_VENDOR_SLUG` or the oldest active laundry; an unknown or paused laundry returns 404.
- **Drivers** belong to one laundry, and that laundry's admin manages them.

## Push notifications

Order status changes send a Firebase Cloud Messaging push to the customer, and new pickups and deliveries go to the driver. The text matches the app's own notification copy, in the language the device registered with. The push is sent after the transaction commits (`src/server/push`).

Catalogue, tier, time-slot and laundry edits send a silent message to the `vendor-<id>` topic, so an app with the shop open refetches prices.

The app registers its token with `POST /api/me/devices` and removes it with `DELETE /api/me/devices` on sign-out. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to send pushes; without it, they're logged to the console.

## Layout

```
prisma/                 schema, migrations, seed
messages/{en,ar}.json   every portal string; a test checks both files have the same keys
src/domain/             pure rules: workflow, pricing, slots, notification mapping
src/server/             db, auth, mobile API helpers, order services, queries, server actions,
                        storage (local uploads), realtime (Postgres LISTEN/NOTIFY → SSE)
src/app/api/            mobile REST API, plus /api/admin/{events,reports/export}
src/app/(portal)/       portal pages
src/components/         UI primitives, shell, orders, catalogue, charts
tests/unit, tests/e2e   Vitest and Playwright
```

## Tests

```bash
pnpm test        # unit tests: workflow, pricing, slots, notifications, permissions, message catalogues
pnpm test:e2e    # Playwright end to end: portal and mobile API against the dev server
pnpm typecheck && pnpm lint
```

## Not built yet (phase 1)

These are behind interfaces and ready to wire:

- real card payments (card is treated as paid)
- an SMS provider for OTP
- auto-dispatch
- S3 storage (see `src/server/storage`)
