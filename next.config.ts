import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  serverExternalPackages: [
    "pg",
    "@google-cloud/cloud-sql-connector",
    "google-auth-library",
    "firebase-admin",
  ],
};

export default nextConfig;
