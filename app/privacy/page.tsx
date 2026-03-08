import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - The Keep",
  description: "Privacy policy for The Keep household management application",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dungeon-950 text-slate-200 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gold-400 mb-2">Privacy Policy</h1>
        <p className="text-slate-400 mb-8">Last updated: March 8, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <Section title="1. Overview">
            <p>
              The Keep (&quot;we,&quot; &quot;our,&quot; or &quot;the application&quot;) is a private, invitation-only
              household management application operated by Parker Lewis. This policy describes how we
              collect, use, store, and protect your personal information, including financial data
              obtained through our integration with Plaid.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p className="font-medium text-slate-100 mb-2">Account Information</p>
            <ul className="list-disc pl-5 space-y-1 mb-4">
              <li>Name and email address</li>
              <li>Authentication credentials (securely hashed)</li>
              <li>Household membership and role</li>
            </ul>

            <p className="font-medium text-slate-100 mb-2">Application Data</p>
            <ul className="list-disc pl-5 space-y-1 mb-4">
              <li>Tasks, habits, goals, and shopping lists you create</li>
              <li>Check-in history and activity data</li>
              <li>Preferences and settings</li>
              <li>Conversations with the AI assistant (Zev)</li>
            </ul>

            <p className="font-medium text-slate-100 mb-2">Financial Data (via Plaid)</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Bank account names, types, and masked account numbers</li>
              <li>Account balances</li>
              <li>Transaction history (amounts, dates, merchant names, categories)</li>
              <li>Institution names</li>
            </ul>
            <p className="mt-2 text-slate-400">
              We do not collect or store your bank login credentials. Financial institution
              authentication is handled entirely by Plaid. See{" "}
              <a href="https://plaid.com/legal" className="text-gold-400 underline" target="_blank" rel="noopener noreferrer">
                Plaid&apos;s privacy policy
              </a>{" "}
              for details on their data handling practices.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide household management features (tasks, habits, budgets, shopping)</li>
              <li>Generate personalized AI-powered briefings and suggestions</li>
              <li>Categorize and summarize financial transactions for budgeting</li>
              <li>Send notifications and reminders via the app and Discord</li>
              <li>Track gamification progress (XP, achievements, streaks)</li>
            </ul>
          </Section>

          <Section title="4. Data Storage and Security">
            <ul className="list-disc pl-5 space-y-1">
              <li>All data is stored on Supabase (SOC 2 Type II compliant) with AES-256 encryption at rest</li>
              <li>All data in transit is encrypted using TLS 1.2 or higher</li>
              <li>Plaid access tokens are stored in Supabase Vault (additional encryption layer)</li>
              <li>Row-level security (RLS) policies enforce data isolation between users</li>
              <li>The application is hosted on Vercel (SOC 2 Type II compliant)</li>
              <li>Database access requires authenticated sessions with role-based permissions</li>
            </ul>
          </Section>

          <Section title="5. Data Sharing">
            <p>
              We do not sell, rent, or share your personal information with third parties,
              except as necessary to provide the service:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Plaid</strong> — to connect your financial accounts and retrieve transaction data</li>
              <li><strong>Anthropic</strong> — conversation data sent to the AI assistant for generating responses (not stored by Anthropic beyond the API call)</li>
              <li><strong>Supabase</strong> — infrastructure provider for data storage</li>
              <li><strong>Vercel</strong> — infrastructure provider for application hosting</li>
            </ul>
            <p className="mt-2">
              Household members in your household can see shared data (tasks, shopping lists,
              household metrics) as part of normal application functionality.
            </p>
          </Section>

          <Section title="6. Data Retention and Deletion">
            <ul className="list-disc pl-5 space-y-1">
              <li>Account data is retained as long as your account is active</li>
              <li>Financial transaction data is retained while your Plaid connection is active</li>
              <li>When you disconnect a financial institution, the associated access token is deleted from Vault</li>
              <li>You may request complete deletion of your data at any time by contacting plewis000@gmail.com</li>
              <li>Upon account deletion, all personal data, financial records, and AI conversation history will be permanently removed within 30 days</li>
              <li>Aggregated, anonymized data may be retained for system improvement purposes</li>
            </ul>
          </Section>

          <Section title="7. Your Rights">
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Access all personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Disconnect financial accounts at any time</li>
              <li>Revoke Plaid access through your financial institution</li>
              <li>Export your data in a machine-readable format</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at plewis000@gmail.com.
            </p>
          </Section>

          <Section title="8. Plaid Integration">
            <p>
              By connecting a financial account through Plaid, you authorize The Keep to
              retrieve your financial data as described in this policy. You can revoke this
              access at any time by disconnecting the account within the application or by
              contacting your financial institution directly.
            </p>
            <p className="mt-2">
              Plaid&apos;s services are governed by their own{" "}
              <a href="https://plaid.com/legal/#end-user-privacy-policy" className="text-gold-400 underline" target="_blank" rel="noopener noreferrer">
                End User Privacy Policy
              </a>.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this policy from time to time. Changes will be reflected on this
              page with an updated &quot;Last updated&quot; date. Continued use of the application
              constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              For questions about this privacy policy or your data, contact:<br />
              Parker Lewis — plewis000@gmail.com
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 text-center text-xs text-slate-500">
          <a href="/" className="text-gold-400 hover:underline">Back to The Keep</a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-100 mb-3">{title}</h2>
      <div className="text-slate-300">{children}</div>
    </section>
  );
}
