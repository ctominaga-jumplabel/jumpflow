import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them. `@jumpflow/database` also pulls in `@prisma/client`.
  transpilePackages: ["@jumpflow/database", "@jumpflow/shared", "@jumpflow/ui"],
};

export default nextConfig;
