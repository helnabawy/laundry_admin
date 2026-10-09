# Architecture

A technical map of how this codebase is put together: layers, request flows, data model, the order
state machine, realtime notifications, and the test strategy. For *what* the product does and who
uses it, see `PRODUCT.md`. For colors/components, see `DESIGN.md`. This document is the *how*.

## 1. What this app is

One Next.js 16 (App Router) application that does two unrelated jobs from the same codebase and the
same Postgres database:

1. **Admin portal** (`/`, `/orders`, `/catalogue`, ...) — server-rendered pages staff sign into with
   email + password. Runs orders through their lifecycle, manages the catalogue, shows the dashboard
   and reports.
2. **Mobile REST API** (`/api/*`, excluding `/api/admin/*`) — the backend for the Flutter customer/
   driver app (`../laundry_app`), authenticated with phone + OTP and a bearer JWT.

Both jobs share the same domain layer, the same Prisma models, and the same order state machine —
there is exactly one place that decides whether an order can move from `pickedUp` to `atFacility`,
and both the portal and the app go through it.

## 2. Backend technology stack

There is no separate backend service — "the backend" is the server half of one Next.js app: route
handlers, server actions, and everything under `src/server/*` and `src/domain/*`, all executing in
the **Node.js runtime** (not the Edge runtime — that's a deliberate, forced choice, see below).

| Layer                | Technology                                                                 | Why / notes |
| --------------------- | --------------------------------------------------------------------------- | ----------- |
| HTTP entry points     | Next.js 16 **Route Handlers** (`route.ts` — `GET`/`POST`/etc. exports) and **Server Actions** (`"use server"` functions) | Two flavors of the same idea: a function that runs only on the server. Route handlers are addressable URLs (for the Flutter app); server actions are called directly from React components as if they were local functions, over Next's built-in RPC transport (a `POST` to the page with an action-id payload) — no hand-written fetch/JSON glue for the portal's own mutations. |
| Language / runtime    | TypeScript, Node.js (`serverExternalPackages` in `next.config.ts` forces `@node-rs/argon2`, `pg`, and `exceljs` to stay as real Node dependencies instead of being bundled) | `@node-rs/argon2` ships native (Rust/N-API) bindings and `pg` opens real TCP sockets — neither works on the Edge runtime, which is why this app doesn't use it anywhere. |
| ORM / data access     | **Prisma 7**, with the **`@prisma/adapter-pg` driver adapter** (`src/server/db.ts`) | Prisma 7 can talk to Postgres two ways: its own Rust query-engine binary, or a "driver adapter" that hands queries to a JS driver you already have — here, `pg`. This app uses the adapter, so there's no separate query-engine process to ship/cold-start, and raw `tx.$queryRaw`/`tx.$executeRaw` (used for row locking and `pg_notify`, see §9/§11) run on the exact same `pg` connection Prisma itself uses. |
| Database              | PostgreSQL 16 (`docker-compose.yml`, port 5433 locally) | One database serves both the portal and the mobile API — no separate read replica or cache layer in phase 1. |
| Schema & migrations   | `prisma/schema.prisma` → SQL migrations in `prisma/migrations/*/migration.sql`, run via `prisma migrate dev`/`deploy` | `prisma.config.ts` points migrations/seed at the right paths and loads `DATABASE_URL` from `.env` via `dotenv/config`. |
| Validation            | `zod` schemas, colocated with the service or action that needs them (e.g. `invoiceInputSchema` in `orders/staff.ts`, `newOrderSchema` in `orders/create.ts`) | Every write boundary — server action and route handler alike — parses `unknown` input through a schema before any business logic sees it; a `ZodError` is caught centrally (see below) and turned into field-level errors. |
| Auth — staff          | `jose` (HS256 JWT) in an HTTP-only cookie; `@node-rs/argon2` for password hashing/verification | `src/server/auth/session.ts`. |
| Auth — mobile         | Phone + 4-digit OTP (`node:crypto` SHA-256 + `timingSafeEqual`) issuing a `jose` HS256 JWT bearer token | `src/server/otp.ts`, `src/server/api/http.ts`. |
| Realtime              | Raw `pg` client doing `LISTEN`/`NOTIFY`, fanned out over a Node `EventEmitter` to per-tab Server-Sent Events streams | `src/server/realtime/bus.ts` — no Redis, no websocket server, no third-party pub/sub. |
| File storage          | Local filesystem (`node:fs/promises`) behind a one-method `StorageDriver` interface | `src/server/storage/index.ts` — swappable for S3 later without touching any caller. |
| Reports export        | `exceljs` (streamed XLSX) and hand-written CSV | `src/app/api/admin/reports/export/route.ts`. |
| Error → transport mapping | Two small, centralized adapters: `run()` for server actions (`src/server/actions/result.ts`), `handle()` for route handlers (`src/server/api/http.ts`) | Every service throws plain typed errors (`DomainError`, `TransitionError`, `ForbiddenError`, `ZodError`, `UploadError`); exactly one place per transport turns those into either a translated `ActionResult` or an RFC 7807 JSON body. Business code never formats an HTTP response or a user-facing string itself. |
| Config / secrets      | Environment variables via `.env` (`.env.example` documents all of them): `DATABASE_URL`, `SESSION_SECRET`, `MOBILE_JWT_SECRET`, `DEV_OTP_CODE` (dev only), `PUBLIC_BASE_URL`, `DEFAULT_VENDOR_SLUG` | Read directly with `process.env.X` at the point of use (`session.ts`, `http.ts`, `otp.ts`, `scope.ts`) rather than through a config module — each secret's own file throws a clear error if it's missing (e.g. `"SESSION_SECRET is not set"`). |
| Testing (backend)     | Vitest for the domain layer (no DB); Playwright driving real HTTP requests + a real Postgres for everything with I/O | See §15. |

### Why Node runtime, not Edge

Next.js route handlers and server actions can, in principle, run on either the Node.js runtime or a
lighter-weight Edge runtime. This app is Node-only everywhere, because three of its core
dependencies require it: `pg` needs a real TCP socket to Postgres, `@node-rs/argon2` needs native
bindings, and `exceljs` needs Node's buffer/stream APIs. Declaring them in `serverExternalPackages`
(`next.config.ts`) tells Next's bundler to leave them as real `node_modules` requires instead of
trying to tree-shake/bundle them for a serverless/edge target — get this wrong and password
verification or Excel export breaks in a way that only shows up in a deployed build, not `next dev`.

## 3. Layered architecture

```
┌─────────────────────────────┐   ┌──────────────────────────────────┐
│  Portal pages (RSC)          │   │  Mobile REST API (route handlers) │
│  src/app/(portal)/**          │   │  src/app/api/**                    │
│  + Client components          │   │  laundry_app (Flutter) is the      │
│    src/components/**          │   │  only consumer                     │
└──────────────┬───────────────┘   └────────────────┬─────────────────┘
               │ calls                                │ calls
               ▼                                       ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│  Server Actions ("use server")│   │  Route handlers (handle() wrapper)│
│  src/server/actions/**        │   │  src/app/api/**/route.ts           │
│  - requireCapability()        │   │  - mobileUser()/mobileDriver()     │
│  - zod-validate input          │   │  - zod-validate input              │
│  - call server/* services      │   │  - call server/* services          │
│  - revalidatePath()            │   │  - serialize with server/api/**    │
└──────────────┬───────────────┘   └────────────────┬─────────────────┘
               └───────────────┬───────────────────┘
                                ▼
              ┌───────────────────────────────────────┐
              │  Services   src/server/orders/**        │
              │  (staff.ts, mobile.ts, create.ts)        │
              │  - orchestrate a use case                │
              │  - call the domain layer for the RULE    │
              │  - call transitionOrder() to WRITE       │
              └───────────────────┬─────────────────────┘
                                  ▼
              ┌───────────────────────────────────────┐
              │  Domain layer   src/domain/**            │
              │  order-workflow.ts, pricing.ts, slots.ts,│
              │  notifications.ts                        │
              │  Pure functions. No I/O. No Prisma.      │
              │  100% of the business rules live here.   │
              └───────────────────┬─────────────────────┘
                                  ▼
              ┌───────────────────────────────────────┐
              │  Data layer   src/server/db.ts            │
              │  Prisma Client (generated) → Postgres     │
              │  transitionOrder() = the one write path   │
              │  that mutates order status                │
              └───────────────────────────────────────┘
```

### The backend's four layers, and what belongs in each

| # | Layer | Lives in | Allowed to depend on | Owns | Must never contain |
| - | ----- | -------- | --------------------- | ---- | ------------------- |
| 1 | **Transport** | `src/app/api/**/route.ts`, `src/server/actions/*.ts` | Layers 2–4 | Auth check (who is calling), input parsing (`zod`), calling exactly one service function, shaping the response (`ok()`/serializers, or `ActionResult` + `revalidatePath`) | Business rules, raw Prisma calls, SQL |
| 2 | **Service** | `src/server/orders/{staff,mobile,create}.ts`, `src/server/queries/*.ts` | Layers 3–4 | Orchestrating one use case: load rows, ask the domain layer for the decision, write via `transitionOrder`/Prisma, write the audit log | Deciding *whether* an action is legal (that's layer 3's job) — a service asks, it doesn't decide |
| 3 | **Domain** | `src/domain/*.ts` | Nothing (pure) | Every business rule: the state machine, pricing, slot generation, notification mapping | Any import of Prisma, `next/*`, or anything async/I/O — this is what keeps it unit-testable without a database |
| 4 | **Data** | `src/server/db.ts`, `prisma/schema.prisma`, `transitionOrder()` in `src/server/orders/transition.ts` | Postgres only | The Prisma client, the schema, and the *one* function allowed to change an order's status (row locking, the transaction, the timeline/notification/audit side effects) | Business logic about *which* transition is legal — it trusts what layer 3 already decided |

Reading a stack trace top-to-bottom should always visit these in order (1 → 2 → 3 → 2 → 4), never
skip a layer, and never go backwards (layer 3 calling layer 1, for instance, would mean a domain
rule depends on Next.js — that would break every unit test in `tests/unit`).

The rule this enforces: **pages and API routes never touch business logic directly.** They
authenticate, validate shape, call a service, and format the response. The service asks the domain
layer "is this transition legal?" and, if yes, performs the write inside `transitionOrder`. This is
why `src/domain/*` has no imports from `@/server/*` — it's pure and fully unit-tested, while
`src/server/*` is integration-tested through Playwright against a real database.

## 4. Two clients, one backend

The split shows up everywhere as a pair of parallel implementations that both terminate in the same
domain/data layer:

| Concern            | Portal (staff)                                  | Mobile API (customer/driver)                |
| ------------------- | ------------------------------------------------ | -------------------------------------------- |
| Entry point          | `src/app/(portal)/**/page.tsx` (Server Components) | `src/app/api/**/route.ts` (route handlers)   |
| Mutations            | `src/server/actions/*.ts` (`"use server"`)         | Same route handlers (no separate action layer) |
| Auth                 | Cookie session, `requireSession`/`requireCapability` | Bearer JWT, `mobileUser`/`mobileDriver`       |
| Error shape          | `ActionResult` (`{ ok, error, fieldErrors }`), translated | RFC 7807 `ProblemDetails` JSON               |
| Response shape       | React props (server-rendered)                     | JSON via `src/server/api/serializers.ts` (a contract with the Flutter models) |
| Order writes go through | `src/server/orders/staff.ts`                   | `src/server/orders/mobile.ts` / `create.ts`  |
| Both call            | `transitionOrder()` in `src/server/orders/transition.ts` |                                        |

`src/server/orders/staff.ts`, `mobile.ts`, and `create.ts` are essentially "the same order, seen from
two actors." Staff assigns drivers and issues invoices; the app's customer/driver confirms pickup,
pays, and confirms delivery. Neither side can shortcut the state machine — `resolveTransition()`
checks `actor` (`staff` / `driver` / `customer` / `system`) as well as the order's current status.

## 5. Request lifecycle, traced end to end

### 5a. Portal page render (read path)

`GET /orders` → `src/app/(portal)/orders/page.tsx`:

1. `requirePage("orders.view")` — reads the session cookie (`getSession`, React `cache()`-memoized
   per request), redirects to `/login` if signed out, to `/dashboard` if the role lacks the
   capability (`src/lib/permissions.ts`).
2. `boardTickets(session)` / `listOrders(session, ...)` (`src/server/queries/orders.ts`) — builds a
   Prisma `where` scoped by `vendorWhere(session)` (`src/server/auth/scope.ts`), so an `ADMIN`/`USER`
   physically cannot query rows of a laundry they aren't assigned to; a `SUPER_ADMIN` sees everything.
   Either can narrow to one laundry with the switcher cookie (see §7 and `docs/ROLES.md`).
3. The query result is mapped through a pure `toTicket()`/row-shaping function
   (`src/server/queries/orders.ts`) into a UI-shaped `TicketView`, never leaking Prisma's Decimal or
   internal field names into components.
4. The Server Component renders `<Board>` (a client component) with that data as props — no client-side
   fetch for the initial paint.

### 5b. Portal mutation (write path)

Clicking "Receive items" in `<OrderActions>` calls the server action
`receiveFromDriverAction(orderId)` (`src/server/actions/orders.ts`):

```
receiveFromDriverAction
  → run(async () => {                       // src/server/actions/result.ts
      requireCapability("orders.operate")   // throws ForbiddenError if not allowed
      receiveFromDriver(actor, orderId)      // src/server/orders/staff.ts
        → transitionOrder({ transition: "receiveFromDriver", ... })
             // src/server/orders/transition.ts — the single write path, see §9
        → audit(...)                         // src/server/orders/transition.ts
      revalidatePath("/orders", "/orders/[id]", "/dashboard")
    })
```

`run()` is the one place that turns *any* thrown error (`ForbiddenError`, `TransitionError`,
`DomainError`, `ZodError`, `UploadError`) into a translated, user-facing `ActionResult` — components
never see a raw exception, and unexpected errors are logged server-side but never leaked to the
client (`src/server/actions/result.ts:28-56`).

### 5c. Mobile API request (write path)

`POST /api/driver/tasks/{orderId}/confirm-delivery` (multipart, photo of proof-of-delivery):

```
handle(async (req, ctx) => {                // src/server/api/http.ts — wraps thrown errors
  mobileDriver(req)                          // verifies the Bearer JWT, loads the MobileUser row
  form(req) → photo(...) → storeImage(...)   // validates + persists the upload
  confirmDelivery(driverId, orderId, input)  // src/server/orders/mobile.ts
    → transitionOrder({ transition: "confirmDelivery", guard: deliveryTaskOf(driverId), ... })
  db.order.findUniqueOrThrow(..., { include: orderInclude })
  return ok(order(langOf(req), row))         // src/server/api/serializers.ts — the JSON contract
})
```

Every API error becomes an RFC 7807 `application/problem+json` body (`src/server/api/http.ts:74-96`):
`HttpError` → its own status, `DomainError` → its own status, `TransitionError` → 409 (stale/illegal
transition), `ZodError` → 400 with the first validation issue, anything else → 500 with a generic
message (logged server-side with method + path).

## 6. Authentication & authorization

### Staff (portal)

- **Login** (`src/server/actions/auth.ts`): email/password checked with `@node-rs/argon2`. A
  constant `DUMMY_HASH` is verified even when the email doesn't exist, so a wrong-email response
  takes the same time as a wrong-password one (timing-attack mitigation).
- **Session**: `startSession()` signs a JWT (`jose`, HS256) whose *subject* is the staff user id, and
  sets it as an HTTP-only, `sameSite=lax` cookie (`SESSION_SECRET`, 12h TTL).
  `getSession()` (`src/server/auth/session.ts`) verifies the token and **re-reads the `StaffUser`
  row and its laundry assignments on every request** — a deactivated account, a role change or a
  removed laundry takes effect on the next request, not after 12 hours.
- **Guards**: `requireSession()` (redirect to `/login`), `requirePage(capability)` (redirect to
  `/dashboard` if disallowed — used in Server Components), `requireCapability(capability)` (throws
  `ForbiddenError` — used in server actions/route handlers, since you can't redirect out of a POST).
- **`src/proxy.ts`** (Next middleware) is only an *optimistic* gate: it checks the cookie **exists**,
  not that it's valid, and redirects to `/login` with a `next=` return path. The real check (signature,
  active account, capability) always happens again in the page/action. This keeps middleware fast
  (no DB round trip) without weakening the actual guarantee.
- **Capabilities** (`src/lib/permissions.ts`): a static `MATRIX` from `StaffRole` (`SUPER_ADMIN` /
  `ADMIN` / `USER`) to a list of `Capability` strings (`orders.operate`, `catalogue.manage`, ...).
  Pure and synchronous, so the same matrix drives both server checks and (via props) which buttons the
  client renders — no capability is ever encoded twice. Roles decide *what*; laundry assignments
  decide *where*. The full role / capability / scoping reference is **`docs/ROLES.md`**.

### Mobile (customer / driver)

- **OTP** (`src/server/otp.ts`): 4-digit code, SHA-256 hashed with the request phone + a server
  secret (never stored in plaintext), 5-minute expiry, 5 attempts, 30s resend cooldown.
  **No SMS provider is integrated yet** — `sendSms()` (`otp.ts:21-24`) just does
  `console.info(`[otp] SMS to ${phone}: ${text}`)`. In practice it's rarely even called: with
  `DEV_OTP_CODE` set (`1234` in `.env.example`), every phone accepts that fixed code and `sendSms` is
  skipped entirely. Only when `DEV_OTP_CODE` is unset does the code become a real random 4-digit
  number that flows through `sendSms` — at which point it still only logs, it doesn't reach a real
  gateway (Twilio / AWS SNS / a UAE aggregator, etc.). This is intentionally the one function to
  replace to go live; hashing, expiry, and rate-limiting around it don't need to change. Tracked as
  "not built yet" in `README.md`/`PRODUCT.md`.
- **Token**: `verifyOtp()` succeeding gets you a 30-day bearer JWT (`signMobileToken`,
  `MOBILE_JWT_SECRET`) that the app sends as `Authorization: Bearer <token>` on every call.
- **Guards**: `mobileUser(req)` verifies the JWT and loads the `MobileUser` row (401 if
  missing/inactive); `mobileDriver(req)` additionally requires `role === "driver"` (403 otherwise).

## 7. Multi-vendor (multi-tenant) scoping

Every business table carries `vendorId`; each vendor is one laundry.

- Staff are linked to laundries through `StaffVendor` rows: a `SUPER_ADMIN` has none and sees every
  laundry; an `ADMIN` (laundry admin) has one or more; a `USER` (laundry operator) exactly one.
  `getScope(session)` resolves `{ allowed, active }` once per request — the assigned laundries plus
  the switcher cookie (`VENDOR_COOKIE`), which is only honoured when it names an allowed laundry.
- `vendorWhere(session)` returns `{}` only for a super admin on "All laundries"; everyone else gets
  `{ vendorId }` or `{ vendorId: { in: [...] } }` (deny by default). Raw SQL uses `vendorSql()`.
  `assertVendorAccess()` / `canAccessVendor()` (the `vendorGuard()` closures in `staff.ts`, refunds)
  throw `"Not found"` / `"Order not found"` (never "forbidden" — no existence leak) for a row outside
  the person's laundries. Full reference: `docs/ROLES.md`.
- **Mobile API:** `requestVendor(req)` reads the laundry the customer picked from the `X-Vendor-Id`
  header (or `?vendor=`), matching it by id or slug.
  - A request without one gets `defaultVendor()`: `DEFAULT_VENDOR_SLUG`, or the oldest active laundry.
  - A named laundry that is unknown or paused returns 404, never a silent fallback.
  - `GET /api/vendors` lists the active laundries.
  - Order JSON carries `vendor: {id, name, phone}`.
  - A customer's order history spans every laundry.
- **Writes:** `vendorForWrite()` uses the laundry picked in the switcher (or the person's only
  laundry). Looking at several laundries — a super admin on "All laundries", a laundry admin on "All
  my laundries" — it throws `"Pick a laundry first"` instead of guessing. The catalogue and payment
  settings pages ask for a laundry up front (`singleVendorId()`) for the same reason.
- **Onboarding:** `createVendorAction` can copy another laundry's catalogue, tiers and slot windows
  (`src/server/vendors/copy.ts`). Every copied row gets a new id. `Vendor.invoicePrefix` is unique,
  because `Invoice.number` is unique across all laundries.
- **Location:** a laundry has an optional map pin (`Vendor.latitude`/`longitude`). Staff paste
  coordinates or a Google Maps link, which `parseLatLng()` in `src/domain/geo.ts` reads, or use the
  browser's location. The order page shows the laundry's details, with a route to the customer when
  both have pins. `GET /api/vendors` includes the pin.
- **Multi-laundry views:** the dashboard's `laundryComparison()` appears whenever the view spans
  several laundries (`spansLaundries()`) — for a laundry admin, only their own. The report's
  `byLaundry` breakdown (super admin only) appears when looking at every laundry. The SSE stream
  follows the same scope.

## 8. Domain layer (pure business rules)

`src/domain/*` has zero imports from Prisma, Next.js, or `src/server/*`. Every rule the product cares
about is expressed as a plain function over plain data, which is what makes it exhaustively
unit-testable (see §15) without a database.

- **`order-workflow.ts`** — the state machine. `TRANSITIONS: Record<TransitionId, TransitionRule>`
  is the single source of truth for: which `actor` may perform a transition, which statuses it's
  legal *from*, which order `kind`s it applies to, and what status it lands on (`to`, which can
  depend on `kind` — e.g. `receiveFromDriver` goes to `atFacility` for `WIZARD` but straight to
  `processing` for `SHOP`). `resolveTransition()` throws `TransitionError` for an illegal actor or
  status; `canTransition()` is the boolean check the UI uses to decide which buttons to show
  (`staffActions()`).
- **`pricing.ts`** — money math: line totals, VIP tier surcharge (flat or percentage), cash-on-delivery
  handling fee, all rounded to 2 decimals at each step (`round2`). `invoiceTotals()` is the one
  function both the shop-order checkout (`orders/create.ts`) and the wizard invoice
  (`orders/staff.ts`) call — **the client-supplied total is never trusted**, the server always
  recomputes from catalogue prices.
- **`slots.ts`** — pickup/delivery time windows. A `SlotWindow` is a recurring daily template
  (start/end minute, capacity); a concrete `Slot` is generated on the fly for a given date with id
  `YYYY-MM-DD-<windowId>` — there's no slots table, so booking one just needs the id to round-trip.
  All arithmetic is explicit about the UAE UTC+4 offset (`localMinuteToInstant`/`localDateOf`), which
  matters for date boundaries near midnight.
- **`notifications.ts`** — a pure mapping from `(status, previousStatus)` to which notification
  kinds get created: one for the customer, one for whichever driver is relevant, one for staff. E.g.
  `staffKindFor("processing", previous)` only fires `"paymentChosen"` when the previous status was
  `awaitingPayment` — staff moved a shop order into `processing` themselves, so that transition isn't
  news to them, but the customer's payment choice on a wizard order is.

## 9. The order lifecycle — deep dive

This is the app's central feature, so it's worth tracing the actual write path.

### States and paths

One `OrderStatus` enum serves two booking paths (`PRODUCT.md` has the product framing):

```
WIZARD: pending → driverAssigned → pickedUp → atFacility → awaitingPayment → processing → outForDelivery → delivered
SHOP:   pending → driverAssigned → pickedUp →                                processing → outForDelivery → delivered
Failure branches: driverAssigned/pickedUp → pickupFailed → cancelled (automatic)
                  outForDelivery → deliveryFailed → (staff retries) → outForDelivery
Staff may cancel from most pre-delivery statuses.
```

### `transitionOrder()` — the one way an order changes status

`src/server/orders/transition.ts:170-235`. Every mutation to `Order.status`, from either client,
goes through this function. Per call:

1. **`db.$transaction(async (tx) => ...)`** — everything below happens atomically.
2. **`lockOrder(tx, orderId)`** issues `SELECT ... FOR UPDATE` (`transition.ts:47-55`) — a raw query,
   not the Prisma query builder, specifically to take a row lock. This serializes concurrent
   transitions on the *same* order (e.g. two staff clicking "assign driver" at once) without locking
   the whole table.
3. **`input.guard?.(order)`** — ownership/vendor checks (a driver can only act on their own task, a
   scoped admin can only act on their own vendor's order) run against the locked row, before anything
   else.
4. **`resolveTransition(...)`** — asks the domain layer whether this transition is legal from the
   order's current status, for this actor and kind. Throws `TransitionError` (mapped to HTTP 409 /
   a "stale order, please refresh" message) if not.
5. **`input.apply?.(tx, order)`** — the transition's own side effects *inside the same transaction*:
   assigning a driver, creating the `Invoice` + `InvoiceItem` rows, recording a `TaskFailure`, etc.
   Can return updated driver ids so the right party gets notified.
6. **`tx.order.update(...)`** — writes the new status (and `input.data`, e.g. `cancelReason`) in one
   statement.
7. **`recordStatus(...)`** — in the same transaction: appends an `OrderStatusEvent` (the order's
   timeline), creates 0–3 `Notification` rows (customer/driver/staff, per `src/domain/notifications.ts`),
   and calls `pg_notify('portal_events', ...)` for the realtime feed (§10). Because this runs inside
   the transaction, **a notification is only ever visible after the status change actually commits** —
   no race where a client sees a notification for a status that then rolls back.
8. **Automatic cancellation**: if the resolved status is `pickupFailed`, the same transaction
   immediately writes a second event moving the order to `cancelled` (product rule: a failed pickup
   can't be retried, the customer re-books). This keeps "failed pickup ⇒ cancelled" as one atomic
   unit instead of two separate writes a caller could observe halfway through.

Every write also gets an **audit log entry** (`audit()`, `transition.ts:237-249`) recorded by the
calling service (`staff.ts`/`catalogue.ts`/etc.) right after `transitionOrder` returns, capturing
`actorId`, `vendorId`, `action` (e.g. `"order.issueInvoice"`), and a small JSON payload — this is
what powers the `/audit` page (super-admin only).

### Two call sites, one machine

- `src/server/orders/staff.ts` — the portal's driver assignment, receiving items, issuing the
  invoice (validates `invoiceInputSchema`, recomputes totals via `pricing.ts`, requires a condition
  report — findings or an explicit "none" confirmation), dispatching for delivery, cancelling.
- `src/server/orders/mobile.ts` — the app's customer (`choosePaymentMethod`, `rateOrder`) and driver
  (`confirmPickup`, `reportPickupFailed`, `confirmDelivery`, `reportDeliveryFailed`) actions. Cash
  collection is enforced before a cash-on-delivery order can be marked delivered
  (`mobile.ts:156-165`).
- `src/server/orders/create.ts` — booking a new order (customer-only). Re-validates everything
  server-side that the client also validated (slot not full, slot not in the past, delivery slot
  respects the tier's minimum turnaround, product/sub-service still active) before opening the write
  transaction, then assigns the next `orderSeq` per vendor and creates the `Order` (+ `Invoice` for a
  shop order, priced from live catalogue data — never the client's numbers).

## 10. Data layer: Prisma & Postgres

- **`src/server/db.ts`** — a single `PrismaClient` per process (`globalForPrisma` guard so Next.js's
  dev-mode module reloading doesn't open a new pool each time), using `@prisma/adapter-pg` to talk to
  Postgres directly over `pg` rather than Prisma's own query engine binary.
- **Schema** (`prisma/schema.prisma`) groups into:
  - **Tenancy** — `Vendor` (one row per laundry; `orderSeq` for human-readable order numbers,
    `codFee`, `invoicePrefix`, address and map pin).
  - **People** — `StaffUser` (portal, email+password, `StaffRole`), `MobileUser` (app,
    phone+OTP, `MobileRole` customer/driver), `OtpChallenge`, `Address`.
  - **Catalogue** — `ServiceCategory` → `SubService` (wizard path) and `Product` (shop path,
    priced), `ServiceTier` (Standard/VIP, turnaround + surcharge), `SlotWindow` (recurring
    pickup/delivery windows).
  - **Orders** — `Order` (snapshots `customerName`/`customerPhone`/`addressSnapshot` at booking time
    so later profile edits don't rewrite history), `OrderLine` (wizard-only), `OrderStatusEvent`
    (the timeline), `Invoice`/`InvoiceItem`/`ItemCondition` (wizard pricing + condition report),
    `TaskFailure`, `OrderRating`, `ProofOfDelivery`.
  - **Notifications** — one polymorphic `Notification` table for both audiences: mobile
    notifications have a single recipient (`mobileUserId`); staff notifications are broadcast per
    vendor with per-staff-member read state in `StaffNotificationRead` (so "mark all read" is scoped
    to the viewer, not global).
  - **Support & audit** — `SupportRequest` (a support-chat transcript as `Json`), `AuditLog`.
- **Generated client**: `prisma generate` (via `postinstall` and `db:generate`) emits a fully typed
  client into `src/generated/prisma/` — this is checked into `.gitignore` conceptually (generated),
  imported as `@/generated/prisma/client`, and is what gives every query and every `Prisma.OrderInclude`
  shape (e.g. `orderInclude` in `serializers.ts`) full type-safety end to end.
- **Migrations**: `prisma/migrations/*/migration.sql`, applied with `pnpm db:migrate` (dev) or
  `pnpm db:deploy` (prod-style, no interactive prompts).
- **Seeding**: `prisma/seed.ts` — bilingual catalogue content ported from the app's mock data, three
  demo staff accounts, demo mobile accounts; `--demo` additionally back-fills ~6 weeks of orders for
  the dashboard/reports to have something to show.

## 11. Realtime notifications

No message queue, no websockets library — just Postgres and the browser's native `EventSource`.

```
transitionOrder() (inside its transaction)
  → tx.$executeRaw`SELECT pg_notify('portal_events', ${json})`   // only delivered on COMMIT
       │
       ▼  (any server instance)
src/server/realtime/bus.ts
  - one dedicated `pg` Client per process, LISTEN portal_events
  - re-emits every payload on a Node EventEmitter (in-process fan-out)
       │
       ▼
GET /api/admin/events  (src/app/api/admin/events/route.ts)
  - one ReadableStream per connected browser tab
  - subscribes to the bus, filters by the viewer's laundries (scopeVendorIds)
  - writes `event: notification|order\ndata: {...}\n\n` as it arrives
  - 25s heartbeat comment so proxies don't kill an idle connection
       │
       ▼
Browser EventSource in the portal shell — updates the notification bell / order
board live, reconnecting on its own if the connection drops (native browser behavior)
```

**Mobile push (FCM).** `recordStatus()` queues one push per mobile notification on the transaction's
outbox (`queuePush`). `transitionOrder()` sends the queue only after the commit (`withPushOutbox`), so a
rolled-back change never notifies a phone. The tokens come from `DeviceToken`; tokens that FCM reports
as unregistered are deleted. Catalogue edits send a data-only message to the laundry's topic
(`vendorTopic()`). The driver lives in `src/server/push` and logs instead of sending when
`FIREBASE_SERVICE_ACCOUNT_JSON` is unset.

Because `pg_notify` only fires on commit, a client can never observe a realtime event for a status
change that later rolled back — the transactionality of §9 step 7 is what makes this safe. This
also means realtime works correctly across multiple app server instances (e.g. horizontal scaling)
without any extra coordination: every instance independently listens on the same Postgres channel.

## 12. File storage

`src/server/storage/index.ts` defines a one-method `StorageDriver` interface (`put()`); the only
implementation today, `LocalStorage`, writes to `public/uploads/<folder>/<uuid>.<ext>` and returns a
`/uploads/...` path Next.js serves directly. `storeImage()` validates the file exists, is under 5MB,
and is an allowed image type before ever touching disk. Swapping in S3 later is "implement
`StorageDriver`, change one export" — nothing upstream (server actions, route handlers) needs to
change, since they only ever call `storeImage()`.

## 13. Internationalization & theming

- **`next-intl`**, English and Arabic, both first-class (no hard-coded UI strings — enforced by
  `tests/unit/messages.test.ts`, which fails the build if the two message catalogues
  (`messages/en.json` / `messages/ar.json`) don't have identical key sets and identical ICU
  placeholders).
- The portal's own locale is a per-staff-account preference (`StaffUser.locale`, plus a
  `NEXT_LOCALE` cookie for the pre-login `/login` page) — `setLocale()` in
  `src/server/actions/auth.ts` updates both.
- The mobile API picks its response language per request from the `Accept-Language` header
  (`langOf(req)` in `src/server/api/http.ts`), never from account state — a phone could switch
  languages request to request.
- RTL is handled by mirroring layout, not by a separate Arabic design — `flip-rtl` utility classes
  and logical CSS properties throughout `src/components/**`.
- Light/dark/system theming via `next-themes` (`src/components/providers/providers.tsx`).

## 14. Other features (briefly)

- **Catalogue management** (`src/server/actions/catalogue.ts`) — CRUD for categories, sub-services,
  products, tiers, and slot windows, all `catalogue.manage`-gated, all bilingual-required, all
  audited. Category/product images go through the same `storeImage()` path as condition-report
  photos.
- **Dashboard & reports** (`src/server/queries/dashboard.ts`, `src/server/queries/reports.ts`) —
  read-only aggregation queries (some raw SQL via `Prisma.sql` for things Prisma's query builder
  can't express efficiently, like the revenue subquery in `dashboardData`), always vendor-scoped
  the same way as everything else. `/api/admin/reports/export` streams CSV or XLSX (via `exceljs`),
  super-admin only, and audits every export (who, what filters, how many rows).
- **Audit log** (`/audit` page, `AuditLog` model) — append-only, written by every mutating service
  alongside its `transitionOrder`/catalogue write; never edited, never deleted from the app.
- **Support** (`src/server/support-faqs.ts`, `SupportRequest` model) — a simple FAQ/transcript
  capture for the app's in-app support flow; out of scope for a deep dive here since it doesn't
  touch the order state machine.

## 15. Testing strategy

The test pyramid follows the architecture directly: **the domain layer is exhaustively unit-tested
because it's pure and cheap to test; everything that involves Postgres, HTTP, or the browser is
verified end-to-end against a real seeded database**, because mocking Prisma/transactions/SSE would
mostly test the mocks.

### Unit tests — `pnpm test` (Vitest, `tests/unit/*.test.ts`, 317 lines total)

Config: `vitest.config.mts` — `node` environment, no DB, no network; these run in milliseconds.

| File                       | What it verifies                                                                 |
| -------------------------- | --------------------------------------------------------------------------------- |
| `order-workflow.test.ts`   | Both `PATHS` are walkable end to end using only legal transitions; shop skips inspection/payment; `receiveFromDriver` routes by kind; the *actor* is enforced (a customer can't confirm pickup); **every transition is checked against every (status × kind) combination** to prove `canTransition` matches `TRANSITIONS` exactly, not just on the happy path; `staffActions()` returns the right buttons per status; every active status appears on the board exactly once. |
| `pricing.test.ts`          | Rounding to 2 decimals, VIP surcharge (flat vs. percentage), COD fee only applies to `cashOnDelivery`, `invoiceTotals` composition. |
| `slots.test.ts`            | UAE offset arithmetic (`localMinuteToInstant`/`localDateOf`) around midnight, slot id round-tripping, `generateSlots` filtering (inactive windows, already-started slots, `notBefore` for delivery turnaround), `hhmmToMinute` validation. |
| `notifications.test.ts`    | The `(status, previous) → notification kind` mapping, including the "don't double-notify after a failed-pickup auto-cancel" and "payment-chosen is only news when it followed `awaitingPayment`" rules. |
| `permissions.test.ts`      | The full `Capability` matrix per role — reports/audit are super-admin-only, staff management is super admin (everyone) and laundry admin (operators only), drivers page is admin-only (not super admin), operators can't cancel or manage; laundry-assignment counts per role (`assignmentProblem`). |
| `messages.test.ts`         | English and Arabic message catalogues have identical key sets and identical ICU placeholders — catches an untranslated or mismatched-placeholder string at test time, not in the RTL UI. |

### End-to-end tests — `pnpm test:e2e` (Playwright, `tests/e2e/*.spec.ts`)

Config: `playwright.config.ts` — drives a real `pnpm dev` server (auto-started, reused if already
running) against the seeded database, `fullyParallel: false` / `workers: 1` (tests share and mutate
the same DB state, so they run serially and depend on seed data being present:
`pnpm db:seed` first).

- **`order-lifecycle.spec.ts`** — the flagship test. Drives a *complete* order end to end across
  **both** systems in one test: the mobile API books the order (as the app would), the portal
  (`page` — real browser) assigns a driver and receives items, the mobile API confirms pickup as the
  driver, the portal counts/prices/invoices, the mobile API pays and later confirms delivery
  collecting cash, and the test asserts the full timeline came out in the exact expected order. It
  covers both the wizard path (with a condition-report finding) and the shop path (skips inspection),
  and checks negative cases inline (e.g. confirming delivery without collecting cash → 400,
  acknowledging payment without acknowledging conditions → 400).
- **`portal.spec.ts`** — portal-only flows (navigation, catalogue, permissions surface) as a real
  browser session.
- **`helpers.ts`** — shared fixtures: `staffLogin` (fills the real login form), `mobileLogin`
  (drives `/api/auth/request-otp` + `/api/auth/verify-otp` for a bearer token), `pickSlots` (finds a
  real open pickup/delivery slot pair respecting a tier's turnaround, via the actual `/api/timeslots`
  endpoint — no hand-rolled fixtures that could drift from real slot logic).

### Why this split holds up in review

- A bug in *whether* a transition is legal will be caught by `order-workflow.test.ts` in
  milliseconds, with a combinatorial check that doesn't rely on someone remembering to add a case.
- A bug in *how* a transition is wired to the database (locking, notifications, audit, the
  automatic-cancel-on-failed-pickup side effect) can only be caught by actually running a
  transaction against Postgres — which is exactly what `order-lifecycle.spec.ts` does, and it does
  it by driving the real API/UI rather than calling `transitionOrder` directly, so it also catches
  contract breaks (JSON shape, auth, validation) that a service-level test would miss.
- There is deliberately no test layer in between (no "integration tests that mock Prisma") — the
  team's judgment (see `README.md`) is that a mocked-DB test mostly verifies the mock.

### Other checks

```bash
pnpm typecheck   # tsc --noEmit — the generated Prisma types make most schema drift a compile error
pnpm lint        # eslint
```

## 16. Directory reference

```
prisma/                       schema.prisma, migrations/, seed.ts
messages/{en,ar}.json         every portal string (kept in lockstep by a unit test)
src/domain/                   pure business rules — no I/O, 100% unit-tested
  order-workflow.ts             the state machine (TRANSITIONS, resolveTransition, staffActions)
  pricing.ts                    money math (subtotal, surcharge, COD fee, invoiceTotals)
  slots.ts                      pickup/delivery slot generation, UAE time handling
  notifications.ts              status → notification-kind mapping
src/server/                   everything with I/O
  db.ts                          the Prisma client singleton
  auth/session.ts                staff cookie session (sign/verify/require*)
  auth/scope.ts                  vendor (tenant) scoping helpers
  otp.ts                         mobile OTP issue/verify
  orders/transition.ts           transitionOrder() — the one write path for order status
  orders/staff.ts                portal-side order actions (assign, receive, invoice, dispatch, cancel)
  orders/mobile.ts               app-side order actions (confirm pickup/delivery, pay, rate)
  orders/create.ts               booking a new order (shop or wizard)
  queries/                       read-only, vendor-scoped query functions per page (orders, dashboard, reports, customers)
  actions/                       "use server" entry points the portal's client components call
  api/http.ts                    mobile API plumbing: auth, ProblemDetails errors, the handle() wrapper
  api/serializers.ts             the JSON contract with the Flutter app
  realtime/bus.ts                Postgres LISTEN/NOTIFY → in-process EventEmitter
  storage/                       upload handling (StorageDriver interface + LocalStorage)
src/app/api/                  the mobile REST API + /api/admin/{events,reports/export}
src/app/(portal)/             portal pages (Server Components; one page per route)
src/components/               client components: shell, orders board/table, catalogue forms, charts, UI primitives
src/lib/permissions.ts        the Capability matrix (role → what it can do)
src/server/auth/scope.ts      laundry scoping (role → where): vendorWhere, getScope, … — docs/ROLES.md
src/i18n/                     next-intl config
tests/unit/                   Vitest — domain-layer and cross-cutting rules
tests/e2e/                    Playwright — full-stack flows against a real dev server + seeded DB
```
