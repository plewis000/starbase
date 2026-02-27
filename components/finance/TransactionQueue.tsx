"use client";

import { useEffect, useState, useCallback } from "react";
import SplitModal from "./SplitModal";
import { useToast } from "@/components/ui/Toast";

interface Category {
  id: string;
  name: string;
  slug: string;
  display_color: string;
  icon: string;
}

interface Transaction {
  id: string;
  amount: number;
  description: string;
  merchant_name: string;
  transaction_date: string;
  category_id: string | null;
  category: Category | null;
  pending: boolean;
  reviewed: boolean;
  excluded: boolean;
  is_split_parent: boolean;
  source: string;
  notes: string | null;
  transaction_splits: { id: string; amount: number; category_id: string; description: string }[];
}

interface Props {
  onUpdate: () => void;
}

export default function TransactionQueue({ onUpdate }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"unreviewed" | "all" | "excluded">("unreviewed");
  const [splitTarget, setSplitTarget] = useState<Transaction | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const toast = useToast();

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter === "unreviewed") params.set("reviewed", "false");
      if (filter === "excluded") params.set("excluded", "true");

      const res = await fetch(`/api/finance/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      } else {
        toast.error("Failed to load transactions");
      }
    } catch {
      toast.error("Failed to load transactions");
    }
    setLoading(false);
  }, [filter]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        if (data.expense_categories) {
          setCategories(data.expense_categories);
        }
      }
    } catch {
      toast.error("Failed to load categories");
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchCategories();
  }, [fetchTransactions, fetchCategories]);

  const categorize = async (txId: string, categoryId: string) => {
    setActionInProgress(txId);
    try {
      const res = await fetch(`/api/finance/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId, reviewed: true }),
      });
      if (res.ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== txId));
        onUpdate();
      } else { toast.error("Failed to categorize"); }
    } catch { toast.error("Failed to categorize"); }
    setActionInProgress(null);
  };

  const markReviewed = async (txId: string) => {
    setActionInProgress(txId);
    try {
      const res = await fetch(`/api/finance/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true }),
      });
      if (res.ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== txId));
        onUpdate();
      } else { toast.error("Failed to mark reviewed"); }
    } catch { toast.error("Failed to mark reviewed"); }
    setActionInProgress(null);
  };

  const exclude = async (txId: string) => {
    setActionInProgress(txId);
    try {
      const res = await fetch(`/api/finance/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: true, reviewed: true }),
      });
      if (res.ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== txId));
        onUpdate();
      } else { toast.error("Failed to exclude"); }
    } catch { toast.error("Failed to exclude"); }
    setActionInProgress(null);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  if (loading) {
    return <div className="text-slate-400 text-sm">Loading transactions...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2">
        {(["unreviewed", "all", "excluded"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === f
                ? "bg-slate-700 text-slate-100"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {f === "unreviewed" ? "Needs Review" : f === "all" ? "All" : "Excluded"}
          </button>
        ))}
      </div>

      {transactions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400 text-sm">
            {filter === "unreviewed"
              ? "All transactions reviewed! You're caught up."
              : "No transactions found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionCard
              key={tx.id}
              transaction={tx}
              categories={categories}
              onCategorize={categorize}
              onReview={markReviewed}
              onExclude={exclude}
              onSplit={() => setSplitTarget(tx)}
              disabled={actionInProgress === tx.id}
            />
          ))}
        </div>
      )}

      {splitTarget && (
        <SplitModal
          transaction={splitTarget}
          categories={categories}
          onClose={() => setSplitTarget(null)}
          onSplit={() => {
            setSplitTarget(null);
            fetchTransactions();
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

function TransactionCard({
  transaction: tx,
  categories,
  onCategorize,
  onReview,
  onExclude,
  onSplit,
  disabled,
}: {
  transaction: Transaction;
  categories: Category[];
  onCategorize: (id: string, catId: string) => void;
  onReview: (id: string) => void;
  onExclude: (id: string) => void;
  onSplit: () => void;
  disabled: boolean;
}) {
  const [showCategories, setShowCategories] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Left: transaction info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-100 truncate">
              {tx.merchant_name || tx.description}
            </span>
            {tx.pending && (
              <span className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                Pending
              </span>
            )}
            {tx.is_split_parent && (
              <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">
                Split
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">{tx.transaction_date}</span>
            {tx.category && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${tx.category.display_color}20`,
                  color: tx.category.display_color,
                }}
              >
                {tx.category.icon} {tx.category.name}
              </span>
            )}
          </div>
        </div>

        {/* Right: amount */}
        <span className="text-sm font-semibold text-slate-100 whitespace-nowrap">
          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(tx.amount)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
        <button
          onClick={() => setShowCategories(!showCategories)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 rounded-md hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          Categorize
        </button>
        <button
          onClick={onSplit}
          disabled={disabled}
          className="text-xs px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-md hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          Split
        </button>
        <button
          onClick={() => onReview(tx.id)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          {disabled ? "Saving..." : "Accept"}
        </button>
        <button
          onClick={() => onExclude(tx.id)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 text-slate-500 hover:text-red-400 transition-colors ml-auto disabled:opacity-50"
        >
          Exclude
        </button>
      </div>

      {/* Category picker */}
      {showCategories && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                onCategorize(tx.id, cat.id);
                setShowCategories(false);
              }}
              className="text-xs px-2 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-left truncate"
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
