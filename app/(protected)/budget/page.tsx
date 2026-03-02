"use client";

import { useEffect, useState, useCallback } from "react";
import TransactionQueue from "@/components/finance/TransactionQueue";
import SpendingSummary from "@/components/finance/SpendingSummary";
import BudgetOverview from "@/components/finance/BudgetOverview";
import PlaidLink from "@/components/finance/PlaidLink";
import AccountsList from "@/components/finance/AccountsList";

type Tab = "triage" | "spending" | "budgets" | "accounts";

export default function BudgetPage() {
  const [activeTab, setActiveTab] = useState<Tab>("triage");
  const [unreviewedCount, setUnreviewedCount] = useState(0);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);

  const fetchCounts = useCallback(async () => {
    const res = await fetch("/api/finance/transactions?reviewed=false&limit=1");
    if (res.ok) {
      const data = await res.json();
      setUnreviewedCount(data.total || 0);
    }
  }, []);

  const checkAccounts = useCallback(async () => {
    const res = await fetch("/api/plaid/accounts");
    if (res.ok) {
      const data = await res.json();
      setHasAccounts(data.accounts && data.accounts.length > 0);
    } else {
      setHasAccounts(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    checkAccounts();
  }, [fetchCounts, checkAccounts]);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "triage", label: "Triage", badge: unreviewedCount > 0 ? unreviewedCount : undefined },
    { id: "spending", label: "Spending" },
    { id: "budgets", label: "Budgets" },
    { id: "accounts", label: "Accounts" },
  ];

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100">Budget</h1>
          {hasAccounts === false && (
            <PlaidLink onSuccess={() => { checkAccounts(); fetchCounts(); }} />
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all relative ${
                activeTab === tab.id
                  ? "bg-slate-800 text-red-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs bg-amber-500/20 text-amber-300 rounded-full">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "triage" && (
          <TransactionQueue onUpdate={fetchCounts} />
        )}
        {activeTab === "spending" && <SpendingSummary />}
        {activeTab === "budgets" && <BudgetOverview />}
        {activeTab === "accounts" && (
          <AccountsList onLink={() => { checkAccounts(); fetchCounts(); }} />
        )}
      </div>
    </div>
  );
}
