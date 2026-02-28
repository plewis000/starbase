"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import SignOutButton from "@/components/SignOutButton";
import BottomNav from "./BottomNav";
import ChatBubble from "@/components/zev/ChatBubble";
import CommandPalette from "@/components/ui/CommandPalette";
import FeedbackButton from "@/components/FeedbackButton";

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
  { href: "/dashboard", label: "Command Deck", icon: "🏠" },
  { href: "/chat", label: "Talk to Zev", icon: "💬" },
  { href: "/crawl", label: "The Crawl", icon: "🗡️" },
  { href: "/tasks", label: "Task Board", icon: "📋" },
  { href: "/budget", label: "The Vault", icon: "💰" },
  { href: "/goals", label: "War Room", icon: "🎯" },
  { href: "/habits", label: "Training Grounds", icon: "🔄" },
  { href: "/shopping", label: "Quartermaster", icon: "🛒" },
  { href: "/notifications", label: "Message Board", icon: "🔔" },
  { href: "/settings", label: "Registry", icon: "⚙️" },
];

export default function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-dungeon-950">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 bg-dungeon-900/95 backdrop-blur-md border-b border-dungeon-700 z-40">
        <div className="flex items-center justify-between h-16 px-4 lg:px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-dungeon-500 hover:text-slate-100 transition-colors p-2"
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

            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-crimson-400 text-xl">🗡️</span>
              <span className="dcc-heading text-lg text-slate-100 tracking-wider">
                Desperado Club
              </span>
            </Link>
          </div>

          {/* Right side: Notifications + User */}
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="flex items-center gap-3 pl-3 border-l border-dungeon-700">
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-8 h-8 rounded-full bg-dungeon-800 ring-2 ring-dungeon-700"
                />
              )}
              <div className="hidden sm:flex flex-col text-sm">
                <span className="text-slate-100 font-medium">
                  {user.full_name}
                </span>
                <span className="text-dungeon-500 text-xs">{user.email}</span>
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
          className={`fixed left-0 top-16 w-60 h-[calc(100vh-4rem)] bg-dungeon-900 border-r border-dungeon-700 transition-transform duration-300 lg:translate-x-0 z-30 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Close button on mobile */}
          <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-dungeon-700">
            <span className="text-sm font-semibold text-slate-100 dcc-heading tracking-wider">
              Navigation
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-dungeon-500 hover:text-slate-100 transition-colors p-1"
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
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-all relative group text-sm ${
                    isActive
                      ? "bg-crimson-900/30 text-crimson-400 border-l-2 border-crimson-500 shadow-crimson-glow"
                      : "text-dungeon-500 hover:text-slate-100 hover:bg-dungeon-800"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.comingSoon && (
                    <span className="ml-auto text-xs bg-gold-900/30 text-gold-400 px-2 py-0.5 rounded font-semibold border border-gold-800">
                      Soon
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar footer — floor indicator */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-dungeon-700">
            <div className="text-xs text-dungeon-500 text-center font-mono">
              The System is watching.
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 lg:ml-60 mb-20 lg:mb-0">
          {children}
        </main>
      </div>

      {/* Bottom nav - Mobile */}
      <BottomNav />

      {/* Feedback Button */}
      <FeedbackButton />

      {/* Zev Chat Bubble */}
      <ChatBubble />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette />

      {/* Overlay on mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
