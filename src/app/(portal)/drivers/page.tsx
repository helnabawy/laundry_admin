import { getTranslations } from "next-intl/server";
import { CircleOff, Truck } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { vendorWhere } from "@/server/auth/scope";
import { db } from "@/server/db";
import { deliveredByDriver } from "@/server/queries/orders";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { DriverDialog } from "@/components/people/driver-dialog";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("drivers");
  return { title: t("title") };
}

export default async function DriversPage() {
  const session = await requirePage("drivers.manage");
  const t = await getTranslations("drivers");
  const scope = await vendorWhere(session);
  const drivers = await db.mobileUser.findMany({
    where: { ...scope, role: "driver" },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    include: {
      _count: {
        select: {
          pickupTasks: { where: { status: "driverAssigned" } },
          deliveryTasks: { where: { status: "outForDelivery" } },
        },
      },
    },
  });
  const deliveredBy = await deliveredByDriver(scope, 30);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DriverDialog driver={null} />} />
      <Sheet>
        {drivers.length === 0 ? (
          <EmptyState icon={Truck} title={t("empty")} body={t("emptyBody")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-3 text-start font-medium sm:px-5">{t("name")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("phone")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("onShift")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("openStops")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("delivered30")}</th>
                  <th scope="col" className="px-4 py-3 sm:px-5"><span className="sr-only">{t("edit")}</span></th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} className={cn("border-b border-rule last:border-0", !d.isActive && "text-ink-3")}>
                    <td className="px-4 py-3 font-medium sm:px-5">
                      <span className="flex items-center gap-2">
                        {d.fullName ?? "—"}
                        {!d.isActive ? <CircleOff className="size-3.5" aria-label={t("active")} /> : null}
                      </span>
                    </td>
                    <td className="numerals px-3 py-3 text-[13px]" dir="ltr">{d.phone}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-[13px]", d.isAvailable ? "text-success" : "text-ink-3")}>
                        <span className={cn("size-2 rounded-full", d.isAvailable ? "bg-success" : "bg-rule-strong")} aria-hidden />
                        {d.isAvailable ? t("onShift") : t("offShift")}
                      </span>
                    </td>
                    <td className="numerals px-3 py-3 text-end">{d._count.pickupTasks + d._count.deliveryTasks}</td>
                    <td className="numerals px-3 py-3 text-end">{deliveredBy.get(d.id) ?? 0}</td>
                    <td className="px-4 py-3 text-end sm:px-5">
                      <DriverDialog
                        driver={{ id: d.id, fullName: d.fullName ?? "", phone: d.phone, isActive: d.isActive, isAvailable: d.isAvailable }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </>
  );
}
