import { getTranslations } from "next-intl/server";
import { requirePage } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { CatalogueTabs } from "@/components/catalogue/catalogue-tabs";

export async function generateMetadata() {
  const t = await getTranslations("catalogue");
  return { title: t("title") };
}

export default async function CatalogueLayout({ children }: LayoutProps<"/catalogue">) {
  await requirePage("catalogue.manage");
  const t = await getTranslations("catalogue");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CatalogueTabs />
      {children}
    </>
  );
}
