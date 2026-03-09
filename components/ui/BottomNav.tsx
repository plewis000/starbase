"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/routines", label: "Routines", icon: "🔄" },
  { href: "/tasks", label: "Tasks", icon: "📋" },
  { href: "/projects", label: "Projects", icon: "🎯" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
];

const moreItems: NavItem[] = [
  { href: "/crawl", label: "Game", icon: "🎮" },
  { href: "/budget", label: "Budget", icon: "💰" },
  { href: "/shopping", label: "Shopping", icon: "🛒" },
  { href: "/recipes", label: "Recipes", icon: "🍳" },
  { href: "/comms", label: "Messages", icon: "💬" },
  { href: "/notifications", label: "Alerts", icon: "🔔" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = React.useState(false);

  // Check if any "more" item is active
  const moreIsActive = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* More panel */}
      {showMore && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setShowMore(false)}
          />
          <div className="fixed bottom-[4.5rem] left-2 right-2 bg-dungeon-900 border border-dungeon-700 rounded-xl z-50 lg:hidden p-2">
            <div className="grid grid-cols-3 gap-1">
              {moreItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center justify-center py-3 px-2 min-h-[48px] rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "text-crimson-400 bg-crimson-900/20"
                        : "text-dungeon-500 hover:text-slate-100 hover:bg-dungeon-800"
                    }`}
                  >
                    <span className="text-lg mb-0.5">{item.icon}</span>
                    <span className="text-[10px]">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-dungeon-900/95 backdrop-blur-md border-t border-dungeon-700 z-40">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-3 px-3 text-sm font-medium transition-colors relative ${
                  isActive
                    ? "text-crimson-400"
                    : "text-dungeon-500 hover:text-slate-100"
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-crimson-500 rounded-full" />
                )}
                <span className="text-xl mb-0.5">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center justify-center py-3 px-3 text-sm font-medium transition-colors relative ${
              moreIsActive || showMore
                ? "text-crimson-400"
                : "text-dungeon-500 hover:text-slate-100"
            }`}
          >
            {(moreIsActive && !showMore) && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-crimson-500 rounded-full" />
            )}
            <span className="text-xl mb-0.5">{showMore ? "✕" : "•••"}</span>
            <span className="text-[10px]">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
