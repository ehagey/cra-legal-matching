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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Image
              src="/logo.jpg"
              alt="Logo"
              width={120}
              height={120}
              className="rounded-2xl"
            />
          </div>
          <CardTitle className="text-2xl">Legal Clause Analyzer</CardTitle>
          <CardDescription>Enter the application password to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Verifying…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

