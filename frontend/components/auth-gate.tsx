"use client";

import { useState } from "react";
import Image from "next/image";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { validatePassword } from "@/lib/api";

interface AuthGateProps {
  onAuthenticated: () => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter a password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const valid = await validatePassword(password);
      if (valid) {
        localStorage.setItem("app_password", password);
        onAuthenticated();
      } else {
        setError("Invalid password. Please try again.");
      }
    } catch {
      setError("Could not connect to the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md animate-fade-in shadow-xl border">
        <CardHeader className="text-center space-y-4 pb-6">
          <div className="mx-auto">
            <Image
              src="/logo.jpg"
              alt="Logo"
              width={140}
              height={140}
              className="rounded-3xl shadow-lg ring-2 ring-primary/10"
            />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl font-bold tracking-tight">Legal Clause Analyzer</CardTitle>
            <CardDescription className="text-sm">
              AI-Powered Agreement Comparison Tool
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-11 text-sm border-2 focus:border-primary"
                autoFocus
              />
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full h-11 text-sm font-semibold shadow-md hover:shadow-lg transition-shadow" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

