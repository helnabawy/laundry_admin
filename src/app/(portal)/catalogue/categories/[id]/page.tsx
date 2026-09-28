import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { vendorWhere } from "@/server/auth/scope";
import { db } from "@/server/db";
import { money, pick } from "@/lib/format";
import { CategoryForm } from "@/components/catalogue/category-form";
import { SubServices } from "@/components/catalogue/sub-services";
import { Sheet, SheetHeader } from "@/components/ui/sheet";

export default async function CategoryPage({ params }: PageProps<"/catalogue/categories/[id]">) {
  const session = await requirePage("catalogue.manage");
  const { id } = await params;
  const t = await getTranslations("catalogue");
  const locale = await getLocale();
  const back = (
    <Link href="/catalogue" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
      <ArrowLeft className="flip-rtl size-4" aria-hidden />
      {t("categories")}
    </Link>
  );
  if (id === "new") {
    return (
      <div className="max-w-3xl">
        {back}
        <CategoryForm category={null} />
      </div>
    );
  }
  const scope = await vendorWhere(session);
  const category = await db.serviceCategory.findFirst({
    where: { id, ...scope },
    include: {
      subServices: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      products: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!category) notFound();

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,48rem)_1fr]">
      <div className="flex flex-col gap-5">
        <div>
          {back}
          <CategoryForm
            category={{
              id: category.id,
              nameEn: category.nameEn,
              nameAr: category.nameAr,
              descriptionEn: category.descriptionEn,
              descriptionAr: category.descriptionAr,
              iconKey: category.iconKey,
              imageUrl: category.imageUrl,
              isActive: category.isActive,
            }}
          />
        </div>
        <SubServices
          categoryId={category.id}
          items={category.subServices.map((s) => ({
            id: s.id,
            nameEn: s.nameEn,
            nameAr: s.nameAr,
            descriptionEn: s.descriptionEn,
            descriptionAr: s.descriptionAr,
            isActive: s.isActive,
          }))}
        />
      </div>
      <aside className="xl:pt-9">
        <Sheet>
          <SheetHeader
            title={t("products")}
            actions={
              <Link href={`/catalogue/products?category=${category.id}`} className="text-sm font-medium underline decoration-rule-strong hover:decoration-ink">
                {t("addProduct")}
              </Link>
            }
          />
          {category.products.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-3 sm:px-5">{t("noProducts")}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {category.products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className={p.isActive ? "" : "text-ink-3 line-through"}>{pick(locale, p.nameEn, p.nameAr)}</span>
                  <span className="numerals text-[13px]">{money(locale, Number(p.unitPrice))}</span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </aside>
    </div>
  );
}
