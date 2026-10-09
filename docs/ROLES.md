# Roles and laundry access

Who can use the Admin Portal, what each role can do, and which laundries' data they see. This
covers the portal and `/api/admin/*` only. The mobile API (customers and drivers) is described in
`ARCHITECTURE.md` §6–7.

Two separate things decide what a staff member gets:

- **Role** decides *what* they can do: the capability matrix in `src/lib/permissions.ts`.
- **Laundry assignments** decide *where* they can do it: `StaffVendor` rows, enforced by
  `src/server/auth/scope.ts`.

## 1. The three roles

| Role (DB value) | Label | Laundries | Laundry switcher |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | Super admin | None assigned; sees **every** laundry | "All laundries" + each laundry (once there are 2+) |
| `ADMIN` | Laundry admin | **One or more**, assigned by a super admin | "All my laundries" + each of theirs (once they have 2+) |
| `USER` | Laundry operator | **Exactly one** | None |

The database values stay `SUPER_ADMIN` / `ADMIN` / `USER`. Only the labels (`messages/*.json` →
`roles`) use the product names.

### Who assigns whom

| Acting as | Can create / edit | Can assign them to |
| --- | --- | --- |
| Super admin | Super admins, laundry admins, operators | Any laundry |
| Laundry admin | Operators only | One of **their own** laundries |
| Operator | Nobody | — |

A laundry admin can't edit:

- themselves or other laundry admins (`manageableRoles("ADMIN")` is `["USER"]`);
- an operator who works in a laundry they don't have.

On `/staff`, a laundry admin sees everyone assigned to any of their laundries, but only operators
get an edit button.

### Capabilities

From `MATRIX` in `src/lib/permissions.ts`:

| Capability | Super admin | Laundry admin | Operator |
| --- | :-: | :-: | :-: |
| `dashboard.view` | ✓ | ✓ | ✓ |
| `orders.view`, `orders.operate` (assign, receive, count & invoice, dispatch) | ✓ | ✓ | ✓ |
| `orders.cancel` | ✓ | ✓ | – |
| `catalogue.manage` (services, items, service levels, time slots) | ✓ | ✓ | – |
| `drivers.manage` | – | ✓ | – |
| `customers.manage` (app users, block / unblock) | ✓ | ✓ | – |
| `staff.manage` | ✓ (everyone) | ✓ (operators only) | – |
| `finance.view`, `finance.manage`, `payments.refund` | ✓ | ✓ | – |
| `vendors.manage` (add / edit laundries) | ✓ | – | – |
| `reports.view`, `audit.view` | ✓ | – | – |

## 2. Data model

```prisma
model StaffVendor {            // prisma/schema.prisma
  staffUserId String
  vendorId    String
  @@id([staffUserId, vendorId])
}
```

`StaffVendor` replaced the old single `StaffUser.vendorId` column. Migration
`20261009150000_staff_laundries` copied every existing link across before dropping the column.

The count rule (super admin 0, operator exactly 1, laundry admin 1 or more) is the pure function
`assignmentProblem(role, vendorIds)` in `src/lib/permissions.ts`. It is unit-tested, and
`saveStaffAction` (`src/server/actions/people.ts`) checks it on every save, along with three other
checks:

1. The actor may manage the target's role (`manageableRoles`).
2. Every chosen laundry is one the actor may access (`canAccessVendor`). A laundry admin can't
   assign an operator to someone else's laundry.
3. On edit, every laundry the target already works in is one the actor may access.

## 3. How scoping works

Each request works out its scope once, and every read and write goes through it. No page, action or
route handler filters by laundry on its own.

```
getSession()          → { role, vendorIds }      re-read from the DB on every request
getScope(session)     → { allowed, active }      allowed: assigned laundries (null = all, super admin)
                                                 active:  the switcher's laundry, always ∈ allowed
                                                          (null = "All (my) laundries")
```

### The helpers (`src/server/auth/scope.ts`)

| Helper | Use it for | Returns |
| --- | --- | --- |
| `vendorWhere(session)` | Prisma reads | `{}` (super admin, all) · `{ vendorId: id }` · `{ vendorId: { in: ids } }` |
| `vendorSql(session, column)` | Raw SQL reads | `Prisma.empty` or `AND <column> = ANY(ids)` |
| `scopeVendorIds(session)` | Filtering in code (e.g. the SSE stream) | `string[]`, or `null` for everything |
| `vendorForWrite(session)` | Creating a per-laundry row | The one laundry being worked on, else throws "Pick a laundry first" |
| `singleVendorId(session)` | Per-laundry settings pages | Same as above, but `null` instead of throwing |
| `assertVendorAccess(session, rowVendorId)` | Before updating / deleting a row by id | Throws "Not found" if the row isn't in an **assigned** laundry |
| `assignedVendorIds(session)` | Views that ignore the switcher (app users) | `string[]`, or `null` for everything |
| `spansLaundries(session)` | Show a "Laundry" column / laundry comparison? | `true` when the view covers 2+ laundries |
| `listScopeVendors(session)` | Switcher and laundry pickers | Every active laundry (super admin) or the person's own |

`canAccessVendor(member, vendorId)` in `src/lib/permissions.ts` is the pure form of the access rule.
The order and refund services use it (`vendorGuard` in `src/server/orders/staff.ts`, and
`refundPayment`), and so does the `pnpm staff` CLI. None of them can read cookies.

### Guarantees

- **Deny by default.** Only a super admin can get an unfiltered query. Anyone else always gets
  `vendorId` or `vendorId IN (...)`, even with no laundries assigned: an empty `in` matches nothing.
- **The switcher can't widen access.** The `laundry_admin_vendor` cookie is only a hint to narrow the
  view. `getScope` re-checks it against the assignments on every request and ignores a laundry
  outside them. `setVendorFilter` refuses to store one.
- **Not found, not forbidden.** A row from a laundry you don't have answers 404 / "Not found", so
  nobody learns that it exists.
- **Changes apply on the next request.** Assignments are loaded with the session on every request.
  Removing a laundry from an admin hides it on their next click; there's no need to sign out.
- **Sign-in starts wide.** Logging in clears the switcher cookie, so a laundry admin with several
  laundries starts on "All my laundries".

### What each role sees

| View | Super admin | Laundry admin (A + B) | Operator (A) |
| --- | --- | --- | --- |
| Orders, dashboard, finance, notifications, live updates | All laundries, or the switcher's one | A + B, or the switcher's one | A |
| Dashboard "Laundries side by side" | When viewing 2+ laundries | When on "All my laundries" (A and B only) | Never |
| Catalogue, payment settings | Pick a laundry first (if 2+ exist) | Pick a laundry first (on "All my laundries") | A (no access to catalogue) |
| App users | Everyone, customers and drivers | Customers who ordered from A or B | No access |
| Staff | Everyone | Staff of A or B; edits operators only | No access |
| Reports, audit log, laundries | ✓ | – | – |

## 4. `GET /api/admin/me`

Returns the signed-in staff member, what their role allows, and where. Authenticated with the portal
session cookie. Without a session it returns 401 as RFC 7807 JSON.

```json
{
  "id": "cmv…",
  "name": "Laundry Manager",
  "email": "admin@laundry.local",
  "role": "ADMIN",
  "capabilities": ["dashboard.view", "orders.view", "…"],
  "assignedLaundryIds": ["fac-1", "cmv…"],
  "laundries": [{ "id": "fac-1", "slug": "main", "nameEn": "Laundry", "nameAr": "…" }],
  "activeLaundryId": null
}
```

- `assignedLaundryIds` is `null` for a super admin, meaning every laundry.
- `laundries` lists what the switcher offers: every active laundry for a super admin, otherwise
  their own laundries.
- `activeLaundryId` is the switcher's laundry. `null` means "All (my) laundries". It is always set
  for an operator.

## 5. Adding things safely

- **A new scoped query:** pass `await vendorWhere(session)` into the Prisma `where`, or use
  `vendorSql(session, Prisma.sql\`t."vendorId"\`)` in raw SQL. Never read `session.vendorIds`
  directly to build a filter, and never treat the `vendorWhere` result as a plain string. It can be
  `{ in: [...] }`.
- **A new mutation on an existing row:** load the row, then call
  `assertVendorAccess(session, row.vendorId)` before writing.
- **A new per-laundry row:** use `vendorId = await vendorForWrite(session)`.
- **A new capability:** add it to `Capability` and `MATRIX` in `src/lib/permissions.ts`, extend
  `tests/unit/permissions.test.ts`, and guard the page with `requirePage` and the action with
  `requireCapability`.

## 6. Tests

- `tests/unit/permissions.test.ts` covers the capability matrix, `manageableRoles` and
  `assignmentProblem`.
- `tests/e2e/staff-roles.spec.ts` covers the full flow:
  - a super admin assigns a laundry admin to two laundries;
  - the admin sees only those laundries (switcher, orders, dashboard), and a forged switcher cookie
    is ignored;
  - the admin adds an operator to one of their laundries;
  - the operator sees exactly that laundry;
  - removing a laundry from the admin takes effect on their next request.
