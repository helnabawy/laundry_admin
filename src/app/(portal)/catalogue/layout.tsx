import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { singleVendorId } from "@/server/auth/scope";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CatalogueTabs } from "@/components/catalogue/catalogue-tabs";

export async function generateMetadata() {
  const t = await getTranslations("catalogue");
  return { title: t("title") };
}

export default async function CatalogueLayout({ children }: LayoutProps<"/catalogue">) {
  const session = await requirePage("catalogue.manage");
  const t = await getTranslations("catalogue");
  // Each laundry prices its own services; a mixed list of every laundry's
  // rows can't be edited sensibly, so anyone looking at several laundries
  // (a super admin, or a laundry admin on "All my laundries") picks one first.
  const needsLaundry = !(await singleVendorId(session));
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {needsLaundry ? (
        <EmptyState icon={Store} title={t("pickLaundryTitle")} body={t("pickLaundryBody")} />
      ) : (
        <>
          <CatalogueTabs />
          {children}
        </>
      )}
    </>
  );
}
