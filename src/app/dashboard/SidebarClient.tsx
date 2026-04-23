"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const nav = [
  { href: "/dashboard",            label: "Dashboard",   icon: "📊" },
  { href: "/dashboard/chat",       label: "AI Chat",     icon: "🤖" },
  { href: "/dashboard/analytics",  label: "Analytics",   icon: "📈" },
  { href: "/dashboard/settings",   label: "Settings",    icon: "⚙️"  },
];

interface Props {
  user: { name?: string | null; email?: string | null; image?: string | null };
}

export default function SidebarClient({ user }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const initials = (user.name ?? user.email ?? "?")[0].toUpperCase();

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-14 bg-slate-800 border-b border-slate-700">
        <span className="text-white font-bold">Personal Assistant</span>
        <button onClick={() => setOpen(!open)} className="text-slate-300 text-xl">
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-20
        w-64 flex flex-col bg-slate-800 dark:bg-slate-900
        border-r border-slate-700 transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 h-16 border-b border-slate-700">
          <span className="text-2xl">🤖</span>
          <span className="text-white font-bold text-lg">Personal Assistant</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
              >
                <span>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            {user.image ? (
              <img src={user.image} className="w-9 h-9 rounded-full" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                {initials}
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-white text-sm font-medium truncate">{user.name ?? "Пользователь"}</p>
              <p className="text-slate-400 text-xs truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 text-sm transition-colors text-left px-3"
          >
            Выйти →
          </button>
        </div>
      </aside>

      {/* Push content on mobile */}
      <div className="md:hidden h-14" />
    </>
  );
}
