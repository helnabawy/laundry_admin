import {
  Baby,
  Bath,
  BedDouble,
  Blinds,
  Footprints,
  Grid2x2,
  Scissors,
  Shirt,
  ShoppingBag,
  Sofa,
  Sparkles,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

/**
 * The curated icon set a category can wear. Keys are stored on the category
 * (`iconKey`) and sent to the app, so never rename one.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  shirt: Shirt,
  bed: BedDouble,
  carpet: Grid2x2,
  curtain: Blinds,
  shoe: Footprints,
  bag: ShoppingBag,
  baby: Baby,
  sparkles: Sparkles,
  washer: WashingMachine,
  sofa: Sofa,
  bath: Bath,
  scissors: Scissors,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

export function categoryIcon(key: string): LucideIcon {
  return CATEGORY_ICONS[key] ?? Shirt;
}
