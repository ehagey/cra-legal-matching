"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { Moon, Sun, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  authenticated: boolean;
  onLogout: () => void;
}

export function Header({ authenticated, onLogout }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt="Logo"
            width={64}
            height={64}
            className="rounded-lg"
          />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Legal Clause Analyzer</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Agreement Comparison</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          {authenticated && (
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

