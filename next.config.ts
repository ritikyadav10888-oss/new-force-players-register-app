import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  serverExternalPackages: [
    "pg",
    "@google-cloud/cloud-sql-connector",
    "google-auth-library",
    "firebase-admin",
    "jose",
    "jwks-rsa",
  ],
  async rewrites() {
    // Browsers request /favicon.ico by default; serve Force Pulse logo instead of the old Vercel icon.
    return [{ source: "/favicon.ico", destination: "/logo.png" }];
  },
};

export default nextConfig;
