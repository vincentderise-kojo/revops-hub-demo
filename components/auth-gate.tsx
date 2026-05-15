"use client";

import { useState, useEffect } from "react";

const COOKIE_NAME = "kojo_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const PASSCODE = "kojo-hub-042026";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    setAuthed(getCookie(COOKIE_NAME) === "1");
  }, []);

  // Don't render anything until we've checked the cookie (avoids flash)
  if (authed === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
        }}
      />
    );
  }

  if (authed) {
    return <>{children}</>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input === PASSCODE) {
      setCookie(COOKIE_NAME, "1", COOKIE_MAX_AGE);
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setInput("");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          width: 300,
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#FFE500",
            letterSpacing: 2,
          }}
        >
          KOJO
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Enter password to continue
        </span>
        <input
          type="password"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(false);
          }}
          autoFocus
          placeholder="Password"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
            background: "var(--card)",
            color: "var(--text)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        {error && (
          <span style={{ fontSize: 11, color: "var(--red)" }}>
            Incorrect password
          </span>
        )}
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: "#FFE500",
            color: "#1a1a1a",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Continue
        </button>
      </form>
    </div>
  );
}
