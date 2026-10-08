import { getTranslations } from "next-intl/server";
import type { PaymentStatus } from "@/domain/payments";
import { cn } from "@/lib/cn";

const TONE: Record<PaymentStatus, string> = {
  pending: "bg-canary-wash text-canary-ink",
  succeeded: "bg-success-wash text-success",
  failed: "bg-danger-wash text-danger",
  cancelled: "bg-card-recessed text-ink-2",
  expired: "bg-card-recessed text-ink-2",
  partiallyRefunded: "bg-blue-wash text-blue-ink",
  refunded: "bg-blue-wash text-blue-ink",
};

/** A payment's state as a small label (text, not colour alone, carries it). */
export async function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = await getTranslations("finance.status");
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-[12px] font-medium", TONE[status])}>
      {t(status)}
    </span>
  );
}
