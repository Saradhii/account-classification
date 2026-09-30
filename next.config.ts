import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/run": ["./data/**/*"],
  },
};

export default nextConfig;
