import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PrivyWrapper } from "@/providers/PrivyProvider";
import LegalGate from "@/components/LegalGate";
import LegalFooter from "@/components/LegalFooter";
import NavBar from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Decentralflix — Own the films. Keep the art alive.",
  description: "Censorship-resistant platform for independent films. Buy permanent access once, own it forever. Creators receive 75% of every sale directly. No subscription required. Section 230 + DMCA compliant.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PrivyWrapper>
          <LegalGate>
            <NavBar />
            {children}
            <LegalFooter />
          </LegalGate>
        </PrivyWrapper>
      </body>
    </html>
  );
}
