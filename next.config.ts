import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PWA headers — service worker scope
  async headers() {
    return [
      // Allow Discord iframe embedding for /activity routes
      {
        source: "/activity/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Content-Security-Policy", value: "frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com" },
        ],
      },
      // Default: deny framing for all other routes
      {
        source: "/((?!activity).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },
};

export default nextConfig;
