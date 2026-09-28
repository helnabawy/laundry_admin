import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, EyeOff, Plus, Shirt } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { vendorWhere } from "@/server/auth/scope";
import { db } from "@/server/db";
import { categoryIcon } from "@/lib/category-icons";
import { pick } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { MoveButtons } from "@/components/catalogue/category-row-actions";

export default async function CategoriesPage() {
  const session = await requirePage("catalogue.manage");
  const t = await getTranslations("catalogue");
  const locale = await getLocale();
  const scope = await vendorWhere(session);
  const categories = await db.serviceCategory.findMany({
    where: scope,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { products: true, subServices: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[65ch] text-sm text-ink-2">{t("categoryHint")}</p>
        <Button asChild variant="stamp">
          <Link href="/catalogue/categories/new">
            <Plus aria-hidden /> {t("addCategory")}
          </Link>
        </Button>
      </div>
      <Sheet>
        {categories.length === 0 ? (
          <EmptyState icon={Shirt} title={t("noCategories")} body={t("noCategoriesBody")} />
        ) : (
          <ol className="divide-y divide-rule">
            {categories.map((c, i) => {
              const Icon = categoryIcon(c.iconKey);
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5">
                  <MoveButtons id={c.id} first={i === 0} last={i === categories.length - 1} />
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-[5px] bg-card-recessed">
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" className="size-full object-cover" />
                    ) : null}
                    <span className="absolute bottom-1 start-1 grid size-6 place-items-center rounded-[4px] bg-card text-ink shadow-ticket">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                  </span>
                  <Link href={`/catalogue/categories/${c.id}`} className="group min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold group-hover:underline">{pick(locale, c.nameEn, c.nameAr)}</span>
                      <span className="text-sm text-ink-3" lang={locale === "ar" ? "en" : "ar"} dir={locale === "ar" ? "ltr" : "rtl"}>
                        {locale === "ar" ? c.nameEn : c.nameAr}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-2">
                      {t("subServicesCount", { count: c._count.subServices })} · {t("itemsCount", { count: c._count.products })}
                    </span>
                  </Link>
                  {!c.isActive ? (
                    <span className="hidden items-center gap-1 rounded-[4px] bg-grey-wash px-1.5 py-0.5 text-xs text-grey-ink sm:inline-flex">
                      <EyeOff className="size-3.5" aria-hidden /> {t("hidden")}
                    </span>
                  ) : null}
                  <ChevronRight className="flip-rtl size-4 text-ink-3" aria-hidden />
                </li>
              );
            })}
          </ol>
        )}
      </Sheet>
    </div>
  );
}
