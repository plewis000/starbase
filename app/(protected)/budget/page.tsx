"use client";

import { useEffect, useState, useCallback } from "react";
import TransactionQueue from "@/components/finance/TransactionQueue";
import SpendingSummary from "@/components/finance/SpendingSummary";
import BudgetOverview from "@/components/finance/BudgetOverview";
import PlaidLink from "@/components/finance/PlaidLink";
import AccountsList from "@/components/finance/AccountsList";
import PageHeader from "@/components/ui/PageHeader";
import TabBar from "@/components/ui/TabBar";

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
        <PageHeader
          title="Budget"
          subtitle="Track spending, set budgets, stay accountable."
          action={
            hasAccounts === false ? (
              <PlaidLink onSuccess={() => { checkAccounts(); fetchCounts(); }} />
            ) : undefined
          }
        />

        <TabBar
          tabs={tabs.map((t) => ({ id: t.id, label: t.label, count: t.badge }))}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as Tab)}
        />

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
