import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

const themeBoot = `(function(){try{var t=localStorage.getItem('fp-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export const metadata: Metadata = {
  title: "Force Pulse | Tournament Registration Platform",
  description:
    "Register and manage players for elite sports tournaments in India. Streamlined player registrations, rosters, and secure Razorpay payment processing.",
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png", sizes: "any" },
      { url: "/favicon.png", type: "image/png" },
    ],
    shortcut: "/logo.png",
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors closeButton position="top-center" />
      </body>
    </html>
  );
}
