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
| admin@laundry.local    | `ChangeMe123!` | Admin: runs the laundry (no staff management) |
| operator@laundry.local | `ChangeMe123!` | User: works orders                      |

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

| Capability                                               | Super admin | Admin | User |
| -------------------------------------------------------- | :---------: | :---: | :--: |
| Orders: assign drivers, receive items, count & invoice, dispatch | ✓ | ✓ | ✓ |
| Cancel an order                                          | ✓ | ✓ | – |
| Services, items, service levels, time slots              | ✓ | ✓ | – |
| Drivers page (add/edit a laundry's drivers)              | – | ✓ | – |
| Staff accounts (portal users)                            | ✓ | – | – |
| Reports and export, laundries, audit log                 | ✓ | – | – |

The matrix is defined in `src/lib/permissions.ts`. Server actions check it, and so do pages.

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

Every business table has a `vendorId`. Phase 1 runs one laundry: the mobile API serves the first active vendor, or the one named in `DEFAULT_VENDOR_SLUG`. Admins and users are tied to one vendor. Super admins see all vendors, and a laundry switcher appears in the top bar once a second vendor exists.

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
- push notifications (the app polls `/api/me/notifications`)
- auto-dispatch
- S3 storage (see `src/server/storage`)
