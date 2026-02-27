"use client";

import { useState } from "react";

interface Category {
  id: string;
  name: string;
  icon: string;
  display_color: string;
}

interface Transaction {
  id: string;
  amount: number;
  merchant_name: string;
  description: string;
}

interface SplitRow {
  amount: string;
  category_id: string;
  description: string;
}

interface Props {
  transaction: Transaction;
  categories: Category[];
  onClose: () => void;
  onSplit: () => void;
}

export default function SplitModal({ transaction, categories, onClose, onSplit }: Props) {
  const [rows, setRows] = useState<SplitRow[]>([
    { amount: "", category_id: "", description: "" },
    { amount: "", category_id: "", description: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalSplit = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const remaining = Math.round((transaction.amount - totalSplit) * 100) / 100;

  const updateRow = (index: number, field: keyof SplitRow, value: string) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { amount: "", category_id: "", description: "" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 2) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);

    const splits = rows
      .filter((r) => r.amount && r.category_id)
      .map((r) => ({
        amount: parseFloat(r.amount),
        category_id: r.category_id,
        description: r.description || undefined,
      }));

    if (splits.length < 2) {
      setError("At least 2 splits required");
      return;
    }

    if (Math.abs(remaining) > 0.01) {
      setError(`Splits must sum to ${formatCurrency(transaction.amount)} (${formatCurrency(remaining)} remaining)`);
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/finance/transactions/${transaction.id}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splits }),
    });

    if (res.ok) {
      onSplit();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to split transaction");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Split Transaction</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="text-sm text-slate-400">
          {transaction.merchant_name || transaction.description} — {formatCurrency(transaction.amount)}
        </div>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={row.amount}
                onChange={(e) => updateRow(i, "amount", e.target.value)}
                className="w-24 px-2 py-2 text-sm bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-green-500"
              />
              <select
                value={row.category_id}
                onChange={(e) => updateRow(i, "category_id", e.target.value)}
                className="flex-1 px-2 py-2 text-sm bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-green-500"
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
              {rows.length > 2 && (
                <button
                  onClick={() => removeRow(i)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          className="text-xs text-green-400 hover:text-green-300 transition-colors"
        >
          + Add split
        </button>

        {/* Remaining indicator */}
        <div className={`text-sm font-medium ${Math.abs(remaining) <= 0.01 ? "text-green-400" : "text-amber-400"}`}>
          {Math.abs(remaining) <= 0.01
            ? "Splits balance perfectly"
            : `${formatCurrency(remaining)} remaining`}
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || Math.abs(remaining) > 0.01}
            className="flex-1 px-4 py-2.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Splitting..." : "Split"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
