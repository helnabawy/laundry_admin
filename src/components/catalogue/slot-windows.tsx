"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveSlotWindowAction } from "@/server/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

interface Win {
  id: string;
  start: string;
  end: string;
  capacity: number;
  isActive: boolean;
}

export function SlotWindows({ windows }: { windows: Win[] }) {
  const t = useTranslations("catalogue");
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col">
      <div className="hidden grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 border-b border-rule px-4 py-2.5 text-[12.5px] font-medium text-ink-3 sm:grid sm:px-5">
        <span>{t("start")}</span>
        <span>{t("end")}</span>
        <span>{t("capacity")}</span>
        <span>{t("visible")}</span>
        <span className="w-20" />
      </div>
      {windows.map((w) => (
        <Row key={w.id} win={w} />
      ))}
      {adding ? <Row win={null} onDone={() => setAdding(false)} /> : null}
      <div className="px-4 py-3 sm:px-5">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={adding}>
          <Plus aria-hidden /> {t("addSlot")}
        </Button>
      </div>
    </div>
  );
}

function Row({ win, onDone }: { win: Win | null; onDone?: () => void }) {
  const t = useTranslations("catalogue");
  const tc = useTranslations("common");
  const [v, setV] = useState({
    start: win?.start ?? "09:00",
    end: win?.end ?? "11:00",
    capacity: String(win?.capacity ?? 8),
    isActive: win?.isActive ?? true,
  });
  const [pending, start] = useTransition();
  const dirty =
    !win || v.start !== win.start || v.end !== win.end || Number(v.capacity) !== win.capacity || v.isActive !== win.isActive;
  return (
    <form
      className="grid grid-cols-2 items-center gap-3 border-b border-rule px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:px-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveSlotWindowAction(win?.id ?? null, { ...v, capacity: Number(v.capacity) });
          if (res.ok) {
            toast.success(tc("saved"));
            onDone?.();
          } else toast.error(res.error);
        });
      }}
    >
      <Input type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} aria-label={t("start")} className="numerals" dir="ltr" required />
      <Input type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} aria-label={t("end")} className="numerals" dir="ltr" required />
      <Input
        inputMode="numeric"
        value={v.capacity}
        onChange={(e) => setV({ ...v, capacity: e.target.value.replace(/\D/g, "") })}
        aria-label={t("capacity")}
        className="numerals"
        dir="ltr"
      />
      <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} aria-label={t("visible")} />
      <Button type="submit" variant={dirty ? "stamp" : "ghost"} size="sm" disabled={!dirty || pending} className="w-20">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : tc("save")}
      </Button>
    </form>
  );
}
