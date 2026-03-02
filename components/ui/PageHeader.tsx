"use client";

import React from "react";
import Link from "next/link";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  action?: React.ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  action,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="flex items-center gap-2 mb-1">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-dungeon-600">/</span>}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-dungeon-500 hover:text-slate-100 text-sm transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-100 text-sm font-medium">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-100 dcc-heading tracking-wide">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-dungeon-500 mt-1 font-mono">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  );
}
