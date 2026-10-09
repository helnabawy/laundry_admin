import { getLocale, getTranslations } from "next-intl/server";
import { UsersRound } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listScopeVendors } from "@/server/auth/scope";
import { db } from "@/server/db";
import { canAccessVendor, manageableRoles } from "@/lib/permissions";
import { dateTime, pick } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffDialog } from "@/components/people/staff-dialog";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("staff");
  return { title: t("title") };
}

export default async function StaffPage() {
  const session = await requirePage("staff.manage");
  const t = await getTranslations();
  const locale = await getLocale();
  const roles = manageableRoles(session.role);
  const platform = session.role === "SUPER_ADMIN";
  // A laundry admin sees the staff of their own laundries (and can edit the operators).
  const staff = await db.staffUser.findMany({
    where: platform ? {} : { vendors: { some: { vendorId: { in: session.vendorIds } } } },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    include: {
      vendors: {
        orderBy: { createdAt: "asc" },
        select: { vendorId: true, vendor: { select: { nameEn: true, nameAr: true } } },
      },
    },
  });
  const vendors = await listScopeVendors(session);
  const showLaundries = platform || vendors.length > 1;

  return (
    <>
      <PageHeader
        title={t("staff.title")}
        description={platform ? t("staff.description") : t("staff.descriptionLaundry")}
        actions={<StaffDialog staff={null} roles={roles} vendors={vendors} />}
      />
      <Sheet>
        {staff.length === 0 ? (
          <EmptyState icon={UsersRound} title={t("staff.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-3 text-start font-medium sm:px-5">{t("staff.name")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("staff.role")}</th>
                  {showLaundries ? <th scope="col" className="px-3 py-3 text-start font-medium">{t("staff.laundries")}</th> : null}
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("staff.lastLogin")}</th>
                  <th scope="col" className="px-4 py-3 sm:px-5"><span className="sr-only">{t("staff.edit")}</span></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const editable = roles.includes(s.role) && s.vendors.every((l) => canAccessVendor(session, l.vendorId));
                  return (
                    <tr key={s.id} className={cn("border-b border-rule last:border-0", !s.isActive && "text-ink-3")}>
                      <td className="px-4 py-3 sm:px-5">
                        <span className="block font-medium">
                          {s.name}
                          {s.id === session.userId ? <span className="ms-2 rounded-[4px] bg-canary-wash px-1.5 text-xs text-canary-ink">{t("staff.you")}</span> : null}
                        </span>
                        <span className="block text-[12.5px] text-ink-3" dir="ltr">{s.email}</span>
                      </td>
                      <td className="px-3 py-3">
                        {t(`roles.${s.role}`)}
                        {!s.isActive ? <span className="block text-[12px]">{t("common.inactive")}</span> : null}
                      </td>
                      {showLaundries ? (
                        <td className="px-3 py-3 text-ink-2">
                          {s.vendors.length === 0 ? (
                            "—"
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {s.vendors.map((l) => (
                                <span key={l.vendorId} className="rounded-[4px] bg-card-recessed px-1.5 text-[12.5px]">
                                  {pick(locale, l.vendor.nameEn, l.vendor.nameAr)}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="numerals px-3 py-3 text-[12.5px] text-ink-2">
                        {s.lastLoginAt ? dateTime(locale, s.lastLoginAt) : <span className="font-sans">{t("common.never")}</span>}
                      </td>
                      <td className="px-4 py-3 text-end sm:px-5">
                        {editable ? (
                          <StaffDialog
                            staff={{ id: s.id, name: s.name, email: s.email, role: s.role, vendorIds: s.vendors.map((l) => l.vendorId), isActive: s.isActive }}
                            roles={roles}
                            vendors={vendors}
                            isSelf={s.id === session.userId}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </>
  );
}
