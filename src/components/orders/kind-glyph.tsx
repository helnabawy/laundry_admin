import { useTranslations } from "next-intl";
import { ShoppingBag, Sparkles } from "lucide-react";
import type { OrderKind } from "@/domain/order-workflow";

/** Shop (priced at checkout) vs quick order (priced after counting). */
export function KindGlyph({ kind, withLabel }: { kind: OrderKind; withLabel?: boolean }) {
  const t = useTranslations("kind");
  const Icon = kind === "SHOP" ? ShoppingBag : Sparkles;
  return (
    <span className="inline-flex items-center gap-1" title={t(kind)}>
      <Icon className="size-3.5" aria-hidden />
      {withLabel ? <span>{t(kind)}</span> : <span className="sr-only">{t(kind)}</span>}
    </span>
  );
}
