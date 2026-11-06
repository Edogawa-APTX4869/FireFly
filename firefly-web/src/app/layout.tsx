import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Wallet", template: "%s · Wallet" },
  description: "A fast, modern personal finance and net-worth tracker with automatic currency intelligence.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Wallet", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#161821" },
  ],
};

// Applies stored or system light/dark preference before first paint (anti-FOUC).
const themeScript = `(function(){try{var s=localStorage.getItem("color-scheme");var isDark=s==="dark"||((!s||s==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var resolved=isDark?"dark":"light";var root=document.documentElement;if(isDark){root.classList.add("dark");}else{root.classList.remove("dark");}root.style.colorScheme=resolved;var meta=document.querySelector('meta[name="color-scheme"]');if(meta){meta.content=resolved;}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
