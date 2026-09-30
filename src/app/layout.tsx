import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Account Health Signal",
  description: "Engagement sentiment for banking accounts, refreshed every two weeks",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col bg-muted/30">
        <header className="sticky top-0 z-10 border-b bg-background">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-semibold tracking-tight">Account Health Signal</span>
              <Badge variant="outline" className="text-muted-foreground">POC</Badge>
            </Link>
            <nav className="flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/eval">Evaluation</Link>
              </Button>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t bg-background">
          <div className="mx-auto w-full max-w-6xl px-6 py-3 text-xs text-muted-foreground">
            Backbase GTM case study · synthetic data · labels refresh every 2 weeks
          </div>
        </footer>
      </body>
    </html>
  );
}
