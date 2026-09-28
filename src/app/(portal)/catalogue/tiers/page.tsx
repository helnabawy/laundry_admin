import { getTranslations } from "next-intl/server";
import { EyeOff } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { vendorWhere } from "@/server/auth/scope";
import { db } from "@/server/db";
import { Sheet } from "@/components/ui/sheet";
import { TierDialog, TierSummary, type TierValues } from "@/components/catalogue/tier-card";

export default async function TiersPage() {
  const session = await requirePage("catalogue.manage");
  const t = await getTranslations("catalogue");
  const scope = await vendorWhere(session);
  const tiers = await db.serviceTier.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const values: TierValues[] = tiers.map((x) => ({
    id: x.id,
    nameEn: x.nameEn,
    nameAr: x.nameAr,
    deliveryHours: x.deliveryHours,
    isVip: x.isVip,
    surchargeType: x.surchargeType,
    surchargeValue: Number(x.surchargeValue),
    perks: Array.isArray(x.perks) ? (x.perks as { en: string; ar: string }[]) : [],
    isActive: x.isActive,
  }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[65ch] text-sm text-ink-2">{t("tiersHint")}</p>
        <TierDialog tier={null} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {values.map((tier) => (
          <Sheet key={tier.id} className="flex flex-col gap-4 p-5">
            <TierSummary tier={tier} />
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule pt-3">
              {tier.isActive ? <span /> : (
                <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                  <EyeOff className="size-3.5" aria-hidden /> {t("hidden")}
                </span>
              )}
              <TierDialog tier={tier} />
            </div>
          </Sheet>
        ))}
      </div>
    </div>
  );
}
