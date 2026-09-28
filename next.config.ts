import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Native modules used on the server only.
  serverExternalPackages: ["@node-rs/argon2", "pg", "exceljs"],
  experimental: {
    // Uploaded images (categories, products, condition photos) go through
    // server actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default withNextIntl(nextConfig);
