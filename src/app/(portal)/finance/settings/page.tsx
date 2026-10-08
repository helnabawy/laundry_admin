import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listActiveVendors, switcherVendorId } from "@/server/auth/scope";
import { gatewaySettings } from "@/server/queries/finance";
import { EmptyState } from "@/components/ui/empty-state";
import { GatewaySettingsForm } from "@/components/finance/gateway-settings-form";

export default async function PaymentSettingsPage() {
  const session = await requirePage("finance.manage");
  const t = await getTranslations("finance");
  // Each laundry has its own provider contracts, so a super admin picks one.
  let vendorId = await switcherVendorId(session);
  if (!vendorId) {
    const vendors = await listActiveVendors();
    if (vendors.length !== 1) return <EmptyState icon={Store} title={t("pickLaundryTitle")} body={t("pickLaundryBody")} />;
    vendorId = vendors[0].id;
  }
  return <GatewaySettingsForm settings={await gatewaySettings(vendorId)} />;
}
