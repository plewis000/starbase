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
  { href: "/tasks", label: "Tasks", icon: "📋" },
  { href: "/goals", label: "Goals", icon: "🎯" },
  { href: "/habits", label: "Habits", icon: "🔄" },
  { href: "/shopping", label: "Shop", icon: "🛒" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-slate-900 border-t border-slate-800 z-40">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-3 px-4 text-sm font-medium transition-colors relative ${
                isActive
                  ? "text-green-400"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              <span className="text-xl mb-1">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
              {item.comingSoon && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-amber-950 text-xs px-1 rounded">
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
