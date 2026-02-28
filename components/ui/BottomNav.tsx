"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  comingSoon?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Deck", icon: "🏠" },
  { href: "/crawl", label: "Crawl", icon: "🗡️" },
  { href: "/tasks", label: "Tasks", icon: "📋" },
  { href: "/habits", label: "Train", icon: "🔄" },
  { href: "/notifications", label: "Alerts", icon: "🔔" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-dungeon-900/95 backdrop-blur-md border-t border-dungeon-700 z-40">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-3 px-4 text-sm font-medium transition-colors relative ${
                isActive
                  ? "text-crimson-400"
                  : "text-dungeon-500 hover:text-slate-100"
              }`}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-crimson-500 rounded-full" />
              )}
              <span className="text-xl mb-1">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
              {item.comingSoon && (
                <span className="absolute -top-1 -right-1 bg-gold-400 text-dungeon-950 text-xs px-1 rounded">
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
