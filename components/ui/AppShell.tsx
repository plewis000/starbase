"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import SignOutButton from "@/components/SignOutButton";
import BottomNav from "./BottomNav";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  comingSoon?: boolean;
}

interface User {
  full_name: string;
  email: string;
  avatar_url?: string;
}

interface AppShellProps {
  user: User;
  children: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/tasks", label: "Tasks", icon: "📋" },
  { href: "/goals", label: "Goals", icon: "🎯" },
  { href: "/habits", label: "Habits", icon: "🔄" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
];

export default function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 bg-slate-900 border-b border-slate-800 z-40">
        <div className="flex items-center justify-between h-16 px-4 lg:px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-slate-400 hover:text-slate-100 transition-colors p-2"
              aria-label="Toggle sidebar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <Link href="/dashboard" className="text-xl font-bold text-slate-100">
              ⭐ Starbase
            </Link>
          </div>

          {/* Right side: Notifications + User */}
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-8 h-8 rounded-full bg-slate-800"
                />
              )}
              <div className="hidden sm:flex flex-col text-sm">
                <span className="text-slate-100 font-medium">
                  {user.full_name}
                </span>
                <span className="text-slate-400 text-xs">{user.email}</span>
              </div>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex pt-16">
        {/* Sidebar - Desktop */}
        <aside
          className={`fixed left-0 top-16 w-60 h-[calc(100vh-4rem)] bg-slate-900 border-r border-slate-800 transition-transform duration-300 lg:translate-x-0 z-30 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Close button on mobile */}
          <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-100">
              Navigation
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-slate-400 hover:text-slate-100 transition-colors p-1"
              aria-label="Close sidebar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Nav items */}
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all relative group ${
                    isActive
                      ? "bg-slate-800 text-green-400 border-l-2 border-green-400"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.comingSoon && (
                    <span className="ml-auto text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-semibold">
                      Soon
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 lg:ml-60 mb-20 lg:mb-0">
          {children}
        </main>
      </div>

      {/* Bottom nav - Mobile */}
      <BottomNav />

      {/* Overlay on mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
