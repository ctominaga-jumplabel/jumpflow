import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them. `@jumpflow/database` also pulls in `@prisma/client`.
  transpilePackages: [
    "@jumpflow/database",
    "@jumpflow/shared",
    "@jumpflow/ui",
    "@jumpflow/character-nathalia",
  ],
  experimental: {
    // Feed attachments (`attachToPost`) send the raw file bytes inline through a
    // Server Action. The default Server Action body limit is 1 MB, which the UI
    // (10 MB, see FeedComposer/file-validation) silently exceeds — large photos
    // and PDFs fail at the framework layer with a hard "server error" while the
    // text-only post is already saved. Raise the limit above 10 MB, with
    // headroom for multipart/FormData overhead.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
