import { Field, Input, Textarea } from "@/components/ui/field";

/** English and Arabic side by side, each in its own direction. */
export function BilingualInput({
  name,
  labelEn,
  labelAr,
  defaultEn,
  defaultAr,
  multiline,
  required,
  errorEn,
  errorAr,
}: {
  name: string;
  labelEn: string;
  labelAr: string;
  defaultEn?: string;
  defaultAr?: string;
  multiline?: boolean;
  required?: boolean;
  errorEn?: string;
  errorAr?: string;
}) {
  const Control = multiline ? Textarea : Input;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={labelEn} htmlFor={`${name}En`} error={errorEn}>
        <Control id={`${name}En`} name={`${name}En`} defaultValue={defaultEn} dir="ltr" lang="en" required={required} maxLength={multiline ? 400 : 120} aria-invalid={errorEn ? true : undefined} />
      </Field>
      <Field label={labelAr} htmlFor={`${name}Ar`} error={errorAr}>
        <Control id={`${name}Ar`} name={`${name}Ar`} defaultValue={defaultAr} dir="rtl" lang="ar" required={required} maxLength={multiline ? 400 : 120} aria-invalid={errorAr ? true : undefined} />
      </Field>
    </div>
  );
}
