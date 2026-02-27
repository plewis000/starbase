"use client";

import { useEffect, useState } from "react";

interface Budget {
  id: string;
  category_id: string;
  monthly_amount: number;
  category: { id: string; name: string; slug: string; display_color: string; icon: string } | null;
  spent: number;
  remaining: number;
  percent_used: number;
}

export default function BudgetOverview() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const fetchBudgets = async () => {
      const res = await fetch("/api/finance/budgets");
      if (res.ok) {
        const data = await res.json();
        setBudgets(data.budgets || []);
      }
      setLoading(false);
    };
    fetchBudgets();
  }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  if (loading) return <div className="text-slate-400 text-sm">Loading budgets...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Active Budgets</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 rounded-md hover:bg-green-500/20 transition-colors"
        >
          + Add Budget
        </button>
      </div>

      {showAdd && (
        <AddBudgetForm
          onAdded={(b) => {
            setBudgets((prev) => [...prev, b]);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {budgets.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400 text-sm">No budgets set. Create one to start tracking spending limits.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const isOver = b.percent_used > 100;
            const isWarning = b.percent_used >= 75 && b.percent_used <= 100;
            return (
              <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>{b.category?.icon || "?"}</span>
                    <span className="text-sm font-medium text-slate-200">
                      {b.category?.name || "Unknown"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${isOver ? "text-red-400" : "text-slate-100"}`}>
                      {fmt(b.spent)}
                    </span>
                    <span className="text-sm text-slate-500"> / {fmt(b.monthly_amount)}</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOver ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(b.percent_used, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className={`text-xs ${isOver ? "text-red-400" : "text-slate-500"}`}>
                    {b.percent_used}% used
                  </span>
                  <span className={`text-xs ${b.remaining < 0 ? "text-red-400" : "text-green-400"}`}>
                    {b.remaining >= 0 ? `${fmt(b.remaining)} left` : `${fmt(Math.abs(b.remaining))} over`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddBudgetForm({ onAdded, onCancel }: { onAdded: (b: Budget) => void; onCancel: () => void }) {
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCats = async () => {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.expense_categories || []);
      }
    };
    fetchCats();
  }, []);

  const handleSubmit = async () => {
    if (!categoryId || !amount) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/finance/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, monthly_amount: parseFloat(amount) }),
    });

    if (res.ok) {
      const data = await res.json();
      onAdded(data.budget);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create budget");
    }
    setSubmitting(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-green-500"
      >
        <option value="">Select category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
        ))}
      </select>
      <input
        type="number"
        step="0.01"
        placeholder="Monthly budget amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-green-500"
      />
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-3 py-2 text-sm bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !categoryId || !amount}
          className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-500 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
