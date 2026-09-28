import type { Capability } from "@/lib/permissions";

export type NavIcon =
  | "dashboard"
  | "orders"
  | "catalogue"
  | "drivers"
  | "staff"
  | "reports"
  | "vendors"
  | "audit"
  | "notifications";

export interface NavItem {
  href: string;
  /** Key in the `nav` message namespace. */
  label: string;
  icon: NavIcon;
  capability: Capability;
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "sectionWork",
    items: [
      { href: "/orders", label: "orders", icon: "orders", capability: "orders.view" },
      { href: "/dashboard", label: "dashboard", icon: "dashboard", capability: "dashboard.view" },
      { href: "/notifications", label: "notifications", icon: "notifications", capability: "orders.view" },
    ],
  },
  {
    label: "sectionLaundry",
    items: [
      { href: "/catalogue", label: "catalogue", icon: "catalogue", capability: "catalogue.manage" },
      { href: "/drivers", label: "drivers", icon: "drivers", capability: "drivers.manage" },
    ],
  },
  {
    label: "sectionPlatform",
    items: [
      { href: "/reports", label: "reports", icon: "reports", capability: "reports.view" },
      { href: "/staff", label: "staff", icon: "staff", capability: "staff.manage" },
      { href: "/vendors", label: "vendors", icon: "vendors", capability: "vendors.manage" },
      { href: "/audit", label: "audit", icon: "audit", capability: "audit.view" },
    ],
  },
];
