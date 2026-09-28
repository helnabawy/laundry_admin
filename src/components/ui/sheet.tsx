import { cn } from "@/lib/cn";

/** A white card-stock surface. Not nested: one sheet per region. */
export function Sheet({
  className,
  as: As = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "aside" }) {
  return <As className={cn("rounded-ticket bg-card shadow-ticket", className)} {...props} />;
}

export function SheetHeader({
  title,
  actions,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-5", className)}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {actions}
    </div>
  );
}
