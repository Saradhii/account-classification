import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-medium">
          Account Classification
          <Badge variant="outline" className="text-muted-foreground">
            POC
          </Badge>
        </Link>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              href="/eval"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Evaluation
            </Link>
            <Link
              href="/evals"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Evals
            </Link>
            <Link
              href="/runs"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Runs
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
