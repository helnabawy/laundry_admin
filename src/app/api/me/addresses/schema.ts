import { z } from "zod";

const optional = z.string().trim().max(200).nullish().transform((v) => v || null);

export const addressSchema = z.object({
  kind: z.enum(["home", "work", "other"]).catch("other"),
  label: optional,
  city: z.string().trim().min(1).max(100),
  area: z.string().trim().min(1).max(100),
  building: z.string().trim().min(1).max(100),
  floor: optional,
  apartment: z.string().trim().min(1).max(50),
  alternatePhone: optional,
  latitude: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  longitude: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
});
