"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";

export default function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (status === "loading") {
    return (
      <div className="w-8 h-8 rounded-full bg-surface-muted border border-surface-border animate-pulse" />
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn("github")}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark
                   text-white text-sm font-semibold rounded-xl transition-colors duration-150
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.021C22 6.484 17.522 2 12 2z" />
        </svg>
        Sign in with GitHub
      </button>
    );
  }

  const { user } = session;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account menu for ${user.name ?? user.ghLogin}`}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-muted
                   transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name ?? "avatar"}
            width={28}
            height={28}
            className="rounded-full border border-surface-border"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">
            {(user.name ?? user.ghLogin ?? "U")[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-ink hidden sm:block max-w-[120px] truncate">
          {user.name ?? user.ghLogin}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-52 bg-surface border border-surface-border
                     rounded-xl shadow-panel py-1 z-50"
          role="menu"
        >
          <div className="px-3 py-2 border-b border-surface-border">
            <p className="text-xs font-semibold text-ink truncate">{user.name}</p>
            {user.ghLogin && (
              <p className="text-xs text-ink-muted truncate">@{user.ghLogin}</p>
            )}
          </div>
          <button
            onClick={() => { setOpen(false); signOut(); }}
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-ink-secondary hover:bg-surface-muted
                       hover:text-ink transition-colors focus-visible:outline-none focus-visible:bg-surface-muted"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
