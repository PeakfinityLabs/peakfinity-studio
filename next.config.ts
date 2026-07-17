import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // /api/upload is matched by middleware, which buffers the request body
    // (default cap 10MB). Reference assets can be larger — Seedance accepts
    // 30MB images and 50MB videos — so raise the cap. The client uploads one
    // file per request, so this bounds a single file, not a whole batch.
    middlewareClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
