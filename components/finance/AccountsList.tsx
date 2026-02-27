"use client";

import { useEffect, useState } from "react";
import PlaidLink from "./PlaidLink";

interface Account {
  id: string;
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  active: boolean;
}

interface PlaidItem {
  id: string;
  institution_name: string;
  status: string;
  last_synced_at: string | null;
  accounts: Account[];
}

interface Props {
  onLink: () => void;
}

export default function AccountsList({ onLink }: Props) {
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      const res = await fetch("/api/plaid/accounts");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
      setLoading(false);
    };
    fetchAccounts();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    await fetch("/api/plaid/sync", { method: "POST" });
    // Refresh accounts
    const res = await fetch("/api/plaid/accounts");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items || []);
    }
    setSyncing(false);
  };

  const fmt = (n: number | null) =>
    n !== null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
      : "—";

  if (loading) return <div className="text-slate-400 text-sm">Loading accounts...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Linked Accounts</h3>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-xs px-3 py-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          )}
          <PlaidLink onSuccess={onLink} />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <p className="text-slate-400 text-sm">No bank accounts linked yet.</p>
          <p className="text-slate-500 text-xs">
            Connect your bank to automatically import transactions and track spending.
          </p>
        </div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-100">{item.institution_name}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  item.status === "active" ? "bg-green-500/20 text-green-400" :
                  item.status === "error" ? "bg-red-500/20 text-red-400" :
                  "bg-slate-700 text-slate-400"
                }`}>
                  {item.status}
                </span>
              </div>
              {item.last_synced_at && (
                <span className="text-xs text-slate-500">
                  Last sync: {new Date(item.last_synced_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-800">
              {item.accounts.map((acct) => (
                <div key={acct.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-slate-200">{acct.name}</span>
                    {acct.mask && (
                      <span className="text-xs text-slate-500 ml-2">****{acct.mask}</span>
                    )}
                    <span className="text-xs text-slate-500 ml-2 capitalize">{acct.type}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-slate-100">
                      {fmt(acct.current_balance)}
                    </div>
                    {acct.available_balance !== null && acct.available_balance !== acct.current_balance && (
                      <div className="text-xs text-slate-500">
                        Available: {fmt(acct.available_balance)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
