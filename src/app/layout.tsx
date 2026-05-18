import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Force Sports Player Register | Tournament Registration Platform",
  description:
    "Register and manage players for elite sports tournaments in India. Streamlined player registrations, rosters, and secure Razorpay payment processing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
