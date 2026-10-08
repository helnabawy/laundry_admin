"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireCapability } from "@/server/auth/session";
import { assertVendorAccess, vendorForWrite } from "@/server/auth/scope";
import { audit, DomainError } from "@/server/orders/transition";
import { refundPayment } from "@/server/payments/service";
import { EXPENSE_CATEGORIES } from "@/domain/finance";
import { CARD_PROVIDERS, PAYMENT_PROVIDERS } from "@/domain/payments";
import { isIsoDate } from "@/domain/slots";
import { run } from "./result";

/**
 * The owner's money: refunds, the expense book, and payment-provider
 * settings. Every write is audited.
 */

function done() {
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
}

const money = z.coerce.number().finite().positive().max(10_000_000).refine((v) => Math.round(v * 100) === v * 100, {
  message: "At most 2 decimals",
});

// ---- Refunds ------------------------------------------------------------------------

const refundSchema = z.object({
  amount: money,
  reason: z.string().trim().min(1).max(300),
});

export async function refundPaymentAction(paymentId: string, input: { amount: number; reason: string }) {
  return run(async () => {
    const session = await requireCapability("payments.refund");
    const data = refundSchema.parse(input);
    const refund = await refundPayment(session, paymentId, data.amount, data.reason);
    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { orderId: true } });
    revalidatePath(`/orders/${payment.orderId}`);
    done();
    return refund.id;
  });
}

// ---- Expenses -----------------------------------------------------------------------

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: money,
  incurredOn: z.string().refine(isIsoDate),
  description: z.string().trim().max(300).default(""),
});

export async function saveExpenseAction(id: string | null, input: z.input<typeof expenseSchema>) {
  return run(async () => {
    const session = await requireCapability("finance.manage");
    const data = expenseSchema.parse(input);
    const row = { ...data, incurredOn: new Date(`${data.incurredOn}T00:00:00Z`) };
    if (id) {
      const existing = await db.expense.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw new DomainError("Expense not found", 404);
      assertVendorAccess(session, existing.vendorId);
      await db.expense.update({ where: { id }, data: row });
      await audit(db, { actorId: session.userId, vendorId: existing.vendorId, action: "expense.update", entity: "Expense", entityId: id, data });
      done();
      return id;
    }
    const vendorId = await vendorForWrite(session);
    const created = await db.expense.create({ data: { ...row, vendorId, createdById: session.userId } });
    await audit(db, { actorId: session.userId, vendorId, action: "expense.create", entity: "Expense", entityId: created.id, data });
    done();
    return created.id;
  });
}

export async function deleteExpenseAction(id: string) {
  return run(async () => {
    const session = await requireCapability("finance.manage");
    const existing = await db.expense.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return;
    assertVendorAccess(session, existing.vendorId);
    await db.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(db, { actorId: session.userId, vendorId: existing.vendorId, action: "expense.delete", entity: "Expense", entityId: id });
    done();
  });
}

// ---- Payment providers -----------------------------------------------------------------

const optionalMoney = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().finite().min(0).max(10_000_000).nullable(),
);

const gatewaySchema = z.object({
  cardProvider: z.enum(CARD_PROVIDERS),
  gateways: z
    .array(
      z
        .object({
          provider: z.enum(PAYMENT_PROVIDERS),
          isEnabled: z.boolean(),
          feePercent: z.coerce.number().finite().min(0).max(100),
          feeFixed: z.coerce.number().finite().min(0).max(1000),
          minAmount: optionalMoney,
          maxAmount: optionalMoney,
        })
        .refine((g) => g.minAmount == null || g.maxAmount == null || g.minAmount <= g.maxAmount, {
          message: "Minimum must not be above maximum",
          path: ["maxAmount"],
        }),
    )
    .length(PAYMENT_PROVIDERS.length),
});

export async function saveGatewaySettingsAction(input: z.input<typeof gatewaySchema>) {
  return run(async () => {
    const session = await requireCapability("finance.manage");
    const vendorId = await vendorForWrite(session);
    const data = gatewaySchema.parse(input);
    const card = data.gateways.find((g) => g.provider === data.cardProvider);
    if (card && !card.isEnabled) {
      throw new z.ZodError([
        { code: "custom", path: ["cardProvider"], message: "The card provider must be switched on", input: data.cardProvider },
      ]);
    }
    await db.$transaction([
      db.vendor.update({ where: { id: vendorId }, data: { cardProvider: data.cardProvider } }),
      ...data.gateways.map((g) =>
        db.vendorGateway.upsert({
          where: { vendorId_provider: { vendorId, provider: g.provider } },
          create: { vendorId, ...g },
          update: g,
        }),
      ),
    ]);
    await audit(db, { actorId: session.userId, vendorId, action: "payments.settings", entity: "Vendor", entityId: vendorId, data });
    done();
  });
}
