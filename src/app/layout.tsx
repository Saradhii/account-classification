import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { AppHeader } from "@/components/app-header";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Salesforce Account Classification",
  description: "Engagement sentiment for banking accounts, refreshed every two weeks",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppHeader />
          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
          <footer className="border-t">
            <div className="mx-auto w-full max-w-5xl px-6 py-3 text-xs text-muted-foreground">
              Backbase GTM case study · labels refresh every 2 weeks
            </div>
          </footer>
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
