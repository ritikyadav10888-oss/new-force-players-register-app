import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  // Let the dev server be opened through an ngrok share link (development only).
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
  serverExternalPackages: [
    "pg",
    "@google-cloud/cloud-sql-connector",
    "google-auth-library",
    "firebase-admin",
    "jose",
    "jwks-rsa",
  ],
  async redirects() {
    return [{ source: "/login", destination: "/admin/login", permanent: false }];
  },
  async rewrites() {
    // Browsers request /favicon.ico by default; serve Force Pulse logo instead of the old Vercel icon.
    return [{ source: "/favicon.ico", destination: "/logo.png" }];
  },
};

export default nextConfig;
