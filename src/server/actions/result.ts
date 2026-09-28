import "server-only";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { ForbiddenError } from "@/server/auth/session";
import { DomainError } from "@/server/orders/transition";
import { TransitionError } from "@/domain/order-workflow";
import { UploadError } from "@/server/storage";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Known domain messages → translated error keys (namespace `errors`). */
const KNOWN: Record<string, string> = {
  "Order not found": "orderNotFound",
  "Driver not found": "driverNotFound",
  "Product not found": "productNotFound",
  "This order already has an invoice": "alreadyInvoiced",
  "A reason is required to cancel": "cancelReasonRequired",
  "Record the condition report: add findings or confirm there are none": "conditionReportRequired",
  "Add at least one item": "itemsRequired",
};

/**
 * Runs a server action body and turns thrown errors into a translated,
 * user-facing message. Unexpected errors are logged, never leaked.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    const t = await getTranslations("errors");
    if (error instanceof ForbiddenError) return { ok: false, error: t("forbidden") };
    if (error instanceof TransitionError) return { ok: false, error: t("staleOrder") };
    if (error instanceof UploadError) return { ok: false, error: t("uploadFailed", { reason: error.message }) };
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) {
          const known = KNOWN[issue.message];
          fieldErrors[key] = known ? t(known) : t("invalidField");
        }
      }
      return { ok: false, error: t("invalid"), fieldErrors };
    }
    if (error instanceof DomainError) {
      const key = KNOWN[error.message];
      return { ok: false, error: key ? t(key) : error.message };
    }
    if (error instanceof ActionError) return { ok: false, error: error.message };
    console.error("[action]", error);
    return { ok: false, error: t("generic") };
  }
}

/** Throw inside `run` with an already-translated message. */
export class ActionError extends Error {}
