import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, CircleX, Clock, Lock } from "lucide-react";
import { db } from "@/server/db";
import { installments } from "@/domain/payments";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { expireIfStale } from "@/server/payments/service";
import { completeMockCheckout } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("pay");
  return { title: t("title") };
}

/** Each mock provider gets its own accent so testers can tell them apart. */
const BRAND: Record<string, { name: string; band: string; ink: string }> = {
  networkIntl: { name: "N-Genius", band: "#0a3d62", ink: "#ffffff" },
  telr: { name: "Telr", band: "#c8102e", ink: "#ffffff" },
  tabby: { name: "tabby", band: "#3bffc1", ink: "#0b0b0b" },
};

export default async function MockCheckoutPage({ params }: PageProps<"/pay/[token]">) {
  const { token } = await params;
  const found = await db.payment.findUnique({
    where: { checkoutToken: token },
    include: { order: { select: { number: true, vendor: { select: { nameEn: true, nameAr: true } } } } },
  });
  if (!found || found.provider === "cash") notFound();
  const payment = await expireIfStale(found);
  const t = await getTranslations("pay");
  const locale = await getLocale();
  const brand = BRAND[payment.provider];
  const amount = Number(payment.amount);
  const vendorName = locale === "ar" ? payment.order.vendor.nameAr : payment.order.vendor.nameEn;
  const action = completeMockCheckout.bind(null, token);

  return (
    <main className="grid min-h-dvh place-items-center bg-counter px-4 py-8">
      <div className="w-full max-w-[26rem]">
        <section className="overflow-hidden rounded-ticket bg-card shadow-lift">
          <div className="flex items-center justify-between px-5 py-4" style={{ background: brand.band, color: brand.ink }}>
            <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
            <span className="rounded-full border border-current/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
              {t("testMode")}
            </span>
          </div>
          <div className="space-y-5 px-5 py-6">
            <div>
              <p className="text-[13px] text-ink-3">{t("payingTo", { vendor: vendorName, number: payment.order.number })}</p>
              <p className="font-mono text-3xl font-semibold tabular-nums">{money(locale, amount)}</p>
              {payment.provider === "tabby" && (
                <p className="mt-1 text-sm text-ink-2">
                  {t("installments", { amount: money(locale, installments(amount)[0]) })}
                </p>
              )}
            </div>

            {payment.status === "pending" ? (
              <form action={action} className="space-y-3">
                <div className="rounded-control border border-rule bg-card-recessed px-3 py-2.5 font-mono text-sm text-ink-2">
                  {payment.provider === "tabby" ? t("tabbyAccount") : "4111 1111 1111 1111 · 12/30 · 123"}
                </div>
                <Button type="submit" name="outcome" value="succeeded" variant="stamp" size="lg" className="w-full">
                  <Lock aria-hidden /> {t("payNow", { amount: money(locale, amount) })}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="submit" name="outcome" value="failed" variant="dangerOutline">
                    {t("decline")}
                  </Button>
                  <Button type="submit" name="outcome" value="cancelled" variant="ghost">
                    {t("cancel")}
                  </Button>
                </div>
                <p className="text-center text-[12px] text-ink-3">{t("mockNote")}</p>
              </form>
            ) : (
              <Result status={payment.status} reason={payment.failureReason} t={t} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Result({
  status,
  reason,
  t,
}: {
  status: string;
  reason: string | null;
  t: Awaited<ReturnType<typeof getTranslations<"pay">>>;
}) {
  const ok = status === "succeeded" || status === "partiallyRefunded" || status === "refunded";
  const Icon = ok ? CheckCircle2 : status === "expired" ? Clock : CircleX;
  const title = ok ? t("successTitle") : status === "expired" ? t("expiredTitle") : status === "cancelled" ? t("cancelledTitle") : t("failedTitle");
  return (
    <div role="status" className="space-y-2 text-center">
      <Icon className={ok ? "mx-auto size-10 text-success" : "mx-auto size-10 text-danger"} aria-hidden />
      <p className="text-lg font-semibold">{title}</p>
      {!ok && reason && <p className="text-sm text-ink-2">{reason}</p>}
      <p className="text-sm text-ink-2">{t("returnToApp")}</p>
    </div>
  );
}
