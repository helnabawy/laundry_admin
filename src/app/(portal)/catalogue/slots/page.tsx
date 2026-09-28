import { getTranslations } from "next-intl/server";
import { requirePage } from "@/server/auth/session";
import { vendorWhere } from "@/server/auth/scope";
import { db } from "@/server/db";
import { minuteToHhmm } from "@/domain/slots";
import { Sheet } from "@/components/ui/sheet";
import { SlotWindows } from "@/components/catalogue/slot-windows";

export default async function SlotsPage() {
  const session = await requirePage("catalogue.manage");
  const t = await getTranslations("catalogue");
  const scope = await vendorWhere(session);
  const windows = await db.slotWindow.findMany({ where: scope, orderBy: [{ startMinute: "asc" }] });
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="max-w-[65ch] text-sm text-ink-2">{t("slotsHint")}</p>
      <Sheet>
        <SlotWindows
          windows={windows.map((w) => ({
            id: w.id,
            start: minuteToHhmm(w.startMinute),
            end: minuteToHhmm(w.endMinute),
            capacity: w.capacity,
            isActive: w.isActive,
          }))}
        />
      </Sheet>
    </div>
  );
}
