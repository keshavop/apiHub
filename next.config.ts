import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/Node-only packages used by server code (spec lint, sqlite, hashing).
  serverExternalPackages: [
    "better-sqlite3",
    "@node-rs/argon2",
    "@stoplight/spectral-core",
    "@stoplight/spectral-rulesets",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
