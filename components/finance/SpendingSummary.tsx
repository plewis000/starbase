"use client";

import { useEffect, useState } from "react";

interface CategoryBreakdown {
  category: { id: string; name: string; slug: string; display_color: string; icon: string };
  amount: number;
  percent: number;
  budget: number | null;
  over_budget: boolean;
}

interface SummaryData {
  period: { start: string; end: string; days: number };
  total_spending: number;
  total_income: number;
  net: number;
  pending_total: number;
  daily_average: number;
  projected_monthly: number | null;
  breakdown: CategoryBreakdown[];
}

export default function SpendingSummary() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [period, setPeriod] = useState<"month" | "week" | "year">("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      const res = await fetch(`/api/finance/summary?period=${period}`);
      if (res.ok) {
        setData(await res.json());
      }
      setLoading(false);
    };
    fetchSummary();
  }, [period]);

  if (loading) return <div className="text-slate-400 text-sm">Loading spending summary...</div>;
  if (!data) return <div className="text-slate-400 text-sm">No data available.</div>;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-2">
        {(["week", "month", "year"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              period === p
                ? "bg-slate-700 text-slate-100"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Spent" value={fmt(data.total_spending)} color="text-red-400" />
        <StatCard label="Income" value={fmt(data.total_income)} color="text-red-400" />
        <StatCard label="Net" value={fmt(data.net)} color={data.net >= 0 ? "text-red-400" : "text-red-400"} />
        <StatCard label="Daily Avg" value={fmt(data.daily_average)} color="text-slate-300" />
      </div>

      {data.projected_monthly !== null && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400">Projected monthly: </span>
          <span className="text-sm font-semibold text-slate-100">{fmt(data.projected_monthly)}</span>
        </div>
      )}

      {data.pending_total > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <span className="text-xs text-amber-400">Pending transactions: </span>
          <span className="text-sm font-semibold text-amber-300">{fmt(data.pending_total)}</span>
        </div>
      )}

      {/* Category breakdown */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-300">By Category</h3>
        {data.breakdown.length === 0 ? (
          <p className="text-sm text-slate-500">No categorized spending yet.</p>
        ) : (
          data.breakdown.map((item) => (
            <div key={item.category.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span>{item.category.icon}</span>
                  <span className="text-sm text-slate-200">{item.category.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-slate-100">{fmt(item.amount)}</span>
                  {item.budget && (
                    <span className={`text-xs ml-2 ${item.over_budget ? "text-red-400" : "text-slate-500"}`}>
                      / {fmt(item.budget)}
                    </span>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(item.percent, 100)}%`,
                    backgroundColor: item.over_budget ? "#ef4444" : item.category.display_color,
                  }}
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">{item.percent}% of spending</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
