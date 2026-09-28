import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Tag } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { vendorWhere } from "@/server/auth/scope";
import { db } from "@/server/db";
import { money, pick } from "@/lib/format";
import { categoryIcon } from "@/lib/category-icons";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductDialog, ProductVisibility } from "@/components/catalogue/product-dialog";
import { cn } from "@/lib/cn";

export default async function ProductsPage({ searchParams }: PageProps<"/catalogue/products">) {
  const session = await requirePage("catalogue.manage");
  const t = await getTranslations("catalogue");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const scope = await vendorWhere(session);
  const selected = (await searchParams).category;
  const categories = await db.serviceCategory.findMany({
    where: scope,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { products: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  const options = categories.map((c) => ({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr }));
  const shown = typeof selected === "string" ? categories.filter((c) => c.id === selected) : categories;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[65ch] text-sm text-ink-2">{t("productsHint")}</p>
        {categories.length > 0 ? (
          <ProductDialog product={null} categories={options} defaultCategoryId={typeof selected === "string" ? selected : undefined} />
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link
          href="/catalogue/products"
          className={cn("flex h-9 shrink-0 items-center rounded-control px-3 text-sm font-medium", !selected ? "bg-stamp text-on-stamp" : "text-ink-2 hover:bg-card")}
        >
          {tc("all")}
        </Link>
        {categories.map((c) => {
          const Icon = categoryIcon(c.iconKey);
          return (
            <Link
              key={c.id}
              href={`/catalogue/products?category=${c.id}`}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-control px-3 text-sm font-medium",
                selected === c.id ? "bg-stamp text-on-stamp" : "text-ink-2 hover:bg-card",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {pick(locale, c.nameEn, c.nameAr)}
            </Link>
          );
        })}
      </div>

      {categories.length === 0 ? (
        <Sheet>
          <EmptyState icon={Tag} title={t("noCategories")} body={t("noCategoriesBody")} />
        </Sheet>
      ) : (
        shown.map((c) => (
          <Sheet key={c.id}>
            <h2 className="border-b border-rule px-4 py-3 text-[15px] font-semibold sm:px-5">{pick(locale, c.nameEn, c.nameAr)}</h2>
            {c.products.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink-3 sm:px-5">{t("noProducts")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-rule text-[12.5px] text-ink-3">
                      <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("nameEn")}</th>
                      <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("nameAr")}</th>
                      <th scope="col" className="px-3 py-2.5 text-end font-medium">{t("price")}</th>
                      <th scope="col" className="px-3 py-2.5 text-center font-medium">{t("visible")}</th>
                      <th scope="col" className="px-4 py-2.5 sm:px-5"><span className="sr-only">{t("editProduct")}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.products.map((p) => (
                      <tr key={p.id} className="border-b border-rule last:border-0">
                        <td className="px-4 py-2.5 sm:px-5">
                          <span className="flex items-center gap-3">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imageUrl} alt="" className="size-9 rounded-[4px] object-cover" />
                            ) : null}
                            <span dir="ltr" className={p.isActive ? "font-medium" : "text-ink-3"}>{p.nameEn}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5" dir="rtl" lang="ar">{p.nameAr}</td>
                        <td className="numerals px-3 py-2.5 text-end">{money(locale, Number(p.unitPrice))}</td>
                        <td className="px-3 py-2.5 text-center">
                          <ProductVisibility id={p.id} isActive={p.isActive} label={`${t("visible")}: ${pick(locale, p.nameEn, p.nameAr)}`} />
                        </td>
                        <td className="px-4 py-2.5 text-end sm:px-5">
                          <ProductDialog
                            product={{
                              id: p.id,
                              categoryId: p.categoryId,
                              nameEn: p.nameEn,
                              nameAr: p.nameAr,
                              descriptionEn: p.descriptionEn,
                              descriptionAr: p.descriptionAr,
                              unitPrice: Number(p.unitPrice),
                              imageUrl: p.imageUrl,
                              isActive: p.isActive,
                            }}
                            categories={options}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Sheet>
        ))
      )}
    </div>
  );
}
