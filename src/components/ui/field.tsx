import { cn } from "@/lib/cn";

const control =
  "w-full rounded-control border border-rule-strong bg-card px-3 text-sm text-ink placeholder:text-ink-3 " +
  "transition-[border-color,box-shadow] duration-150 outline-none " +
  "focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25 focus-visible:outline-none " +
  "aria-invalid:border-danger disabled:opacity-50 disabled:bg-card-recessed";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        control,
        "h-10 appearance-none bg-no-repeat pe-9",
        "bg-[length:16px] bg-[position:right_10px_center] rtl:bg-[position:left_10px_center]",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2362646b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-ink-2", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const note = error ? (
    <p className="text-[13px] text-danger" role="alert">
      {error}
    </p>
  ) : hint ? (
    <p className="text-[13px] text-ink-3">{hint}</p>
  ) : null;
  // Without an explicit id, the label wraps its control so it still names it.
  if (!htmlFor) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">{label}</span>
          {children}
        </label>
        {note}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {note}
    </div>
  );
}
