import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "THEO",
  description: "Pick'em Sports — pick winners against the spread.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        {/* Bottom navigation — renders on all pages except /auth and /admin.
            BottomNav checks the current path itself and returns null on those routes. */}
        <BottomNav />
      </body>
    </html>
  );
}
