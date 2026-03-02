/**
 * EA Email Classifier
 *
 * Classifies emails by category, urgency, and importance using:
 * 1. Sender profile lookup (fast, no AI needed)
 * 2. Claude Haiku for ambiguous cases (content analysis)
 *
 * The classifier works in two passes:
 * - Pass 1: Rule-based (sender_profiles + explicit_rules). Handles ~70% of emails.
 * - Pass 2: AI-based (Claude Haiku). Handles the rest.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { ea } from "@/lib/supabase/schemas";
import type {
  SenderProfile,
  CategoryConfig,
  ExplicitRule,
  EmailCategory,
  UrgencyLevel,
  ClassifiedEmail,
} from "./types";

const VALID_CATEGORIES = new Set<EmailCategory>([
  "health", "financial", "family", "household", "dev_infrastructure",
  "work_shuttle", "security_auth", "promotions", "community", "other",
]);

// ── Config loading (per-call, not cached across invocations) ──

interface ClassifierConfig {
  profiles: SenderProfile[];
  categories: Map<string, CategoryConfig>;
  rules: ExplicitRule[];
}

export async function loadClassifierConfig(): Promise<ClassifierConfig> {
  const supabase = createServiceClient();

  const [{ data: profiles }, { data: categories }, { data: rules }] = await Promise.all([
    ea(supabase).from("sender_profiles").select("*"),
    ea(supabase).from("category_config").select("*"),
    ea(supabase).from("explicit_rules").select("*").eq("active", true),
  ]);

  return {
    profiles: profiles || [],
    categories: new Map(
      (categories || []).map((c: CategoryConfig) => [c.category_name, c])
    ),
    rules: rules || [],
  };
}

// ── Sender Matching ──

function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return "unknown";
  return email.slice(at + 1).toLowerCase();
}

function findSenderProfile(
  senderEmail: string,
  domain: string,
  profiles: SenderProfile[]
): SenderProfile | null {
  // Exact email match first
  const exactMatch = profiles.find(
    (p) => p.sender_email && p.sender_email.toLowerCase() === senderEmail.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  // Domain match (may return multiple — pick highest importance)
  const domainMatches = profiles.filter(
    (p) => p.sender_domain.toLowerCase() === domain.toLowerCase()
  );

  if (domainMatches.length === 0) return null;
  return domainMatches.reduce((best, p) =>
    p.importance_weight > best.importance_weight ? p : best
  );
}

// ── Explicit Rule Matching ──

function matchesPattern(pattern: string, email: string, domain: string): boolean {
  if (pattern.startsWith("*@")) {
    const patternDomain = pattern.slice(2).toLowerCase();
    return domain.toLowerCase() === patternDomain ||
           domain.toLowerCase().endsWith("." + patternDomain);
  }
  return email.toLowerCase() === pattern.toLowerCase();
}

function checkExplicitRules(
  senderEmail: string,
  domain: string,
  rules: ExplicitRule[]
): {
  alwaysSurface: boolean;
  autoSuppress: boolean;
  shareWith: string[];
} {
  let alwaysSurface = false;
  let autoSuppress = false;
  const shareWith: string[] = [];

  for (const rule of rules) {
    if (!rule.sender_pattern) continue;
    if (!matchesPattern(rule.sender_pattern, senderEmail, domain)) continue;

    switch (rule.rule_type) {
      case "always_surface":
        alwaysSurface = true;
        break;
      case "auto_suppress":
        autoSuppress = true;
        break;
      case "share_flag":
        if (rule.action_value) shareWith.push(rule.action_value);
        break;
    }
  }

  if (alwaysSurface) autoSuppress = false;
  return { alwaysSurface, autoSuppress, shareWith };
}

// ── Deduplication Key ──

function generateDeduplicateKey(sender: string, subject: string | null): string {
  const normalized = (subject || "")
    .replace(/^(re|fwd|fw):\s*/gi, "")
    .toLowerCase()
    .trim();

  const domain = extractDomain(sender);
  return `${domain}::${normalized.slice(0, 60)}`;
}

// ── Rule-Based Classification (Pass 1) ──

export interface RawEmail {
  gmail_message_id: string;
  gmail_thread_id?: string;
  received_at: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
}

function parseSenderEmail(sender: string): string {
  const match = sender.match(/<([^>]+@[^>]+)>/);
  if (match) return match[1];
  // Fallback: if it looks like an email, use it
  if (sender.includes("@")) return sender.trim();
  return sender.trim() || "unknown@unknown";
}

function validateCategory(category: string): EmailCategory {
  return VALID_CATEGORIES.has(category as EmailCategory)
    ? (category as EmailCategory)
    : "other";
}

export function classifyByRules(email: RawEmail, config: ClassifierConfig): ClassifiedEmail | null {
  const senderEmail = parseSenderEmail(email.sender);
  const domain = extractDomain(senderEmail);
  const profile = findSenderProfile(senderEmail, domain, config.profiles);
  const rules = checkExplicitRules(senderEmail, domain, config.rules);

  if (!profile) return null;

  const categoryConf = config.categories.get(profile.category);
  const profileShareWith = Array.isArray(profile.share_with) ? profile.share_with : [];

  return {
    gmail_message_id: email.gmail_message_id,
    gmail_thread_id: email.gmail_thread_id || null,
    received_at: email.received_at,
    sender: senderEmail,
    sender_domain: domain,
    subject: email.subject,
    snippet: email.snippet,
    category: validateCategory(profile.category),
    urgency_score: (categoryConf?.urgency_default || 3) as UrgencyLevel,
    importance_score: rules.alwaysSurface ? 1.0 : rules.autoSuppress ? 0.1 : profile.importance_weight,
    deduplicate_key: generateDeduplicateKey(senderEmail, email.subject),
    share_with: [...new Set([...profileShareWith, ...rules.shareWith])],
  };
}

// ── AI Classification (Pass 2 — for unknown senders) ──

const CLASSIFICATION_PROMPT = `You are an email classifier for a personal email inbox. Classify the email into exactly one category and assign urgency.

Categories:
- health: Medical, prescriptions, doctor messages, insurance claims
- financial: Bank, investment, tax, bills, invoices, payments
- family: Personal/family correspondence
- household: HOA, utilities, packages, home services, deliveries
- dev_infrastructure: GitHub, Vercel, Supabase, dev tool notifications
- work_shuttle: Work email forwarded to personal
- security_auth: Login codes, password resets, security alerts
- promotions: Marketing, newsletters, retail offers
- community: Nextdoor, local alerts, neighborhood
- other: Doesn't fit any category

Urgency (1-4):
1 = Act today (bills due, doctor messages, security incidents)
2 = This week (tax forms, important correspondence)
3 = Awareness only (statements, tracking, deploy notifications)
4 = Archive (expired codes, resolved threads, marketing)

Respond with ONLY a JSON array of objects, one per email:
[{"category": "...", "urgency": N, "importance": 0.XX}]

importance is 0.0-1.0 based on how likely the user needs to see this.`;

function fallbackClassify(email: RawEmail): ClassifiedEmail {
  const senderEmail = parseSenderEmail(email.sender);
  const domain = extractDomain(senderEmail);
  return {
    gmail_message_id: email.gmail_message_id,
    gmail_thread_id: email.gmail_thread_id || null,
    received_at: email.received_at,
    sender: senderEmail,
    sender_domain: domain,
    subject: email.subject,
    snippet: email.snippet,
    category: "other",
    urgency_score: 3,
    importance_score: 0.5,
    deduplicate_key: generateDeduplicateKey(senderEmail, email.subject),
    share_with: [],
  };
}

export async function classifyByAI(emails: RawEmail[]): Promise<ClassifiedEmail[]> {
  if (emails.length === 0) return [];

  // Lazy import to avoid crashing routes that don't need AI
  const { anthropic, getModel } = await import("@/lib/agent/client");

  // Batch classify — up to 10 at a time
  const batches: RawEmail[][] = [];
  for (let i = 0; i < emails.length; i += 10) {
    batches.push(emails.slice(i, i + 10));
  }

  const results: ClassifiedEmail[] = [];

  for (const batch of batches) {
    const emailDescriptions = batch.map((e, i) =>
      `Email ${i + 1}:\n  From: ${e.sender}\n  Subject: ${e.subject || "(no subject)"}\n  Preview: ${(e.snippet || "").slice(0, 150)}`
    ).join("\n\n");

    try {
      const response = await anthropic.messages.create({
        model: getModel("fast"),
        max_tokens: 1024,
        system: CLASSIFICATION_PROMPT,
        messages: [
          {
            role: "user",
            content: `Classify these ${batch.length} emails. Return a JSON array of objects, one per email, in order:\n\n${emailDescriptions}`,
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        // AI didn't return valid JSON — fall back for entire batch
        console.warn("[ea/classifier] AI returned no JSON array, falling back for batch");
        results.push(...batch.map(fallbackClassify));
        continue;
      }

      const classifications = JSON.parse(jsonMatch[0]) as Array<{
        category: string;
        urgency: number;
        importance: number;
      }>;

      for (let i = 0; i < batch.length; i++) {
        const email = batch[i];

        if (i >= classifications.length) {
          // AI returned fewer classifications than emails — fallback for remainder
          console.warn(`[ea/classifier] AI returned ${classifications.length}/${batch.length} classifications`);
          results.push(fallbackClassify(email));
          continue;
        }

        const cls = classifications[i];
        const senderEmail = parseSenderEmail(email.sender);
        const domain = extractDomain(senderEmail);

        results.push({
          gmail_message_id: email.gmail_message_id,
          gmail_thread_id: email.gmail_thread_id || null,
          received_at: email.received_at,
          sender: senderEmail,
          sender_domain: domain,
          subject: email.subject,
          snippet: email.snippet,
          category: validateCategory(cls.category || "other"),
          urgency_score: Math.max(1, Math.min(4, cls.urgency || 3)) as UrgencyLevel,
          importance_score: Math.max(0, Math.min(1, cls.importance || 0.5)),
          deduplicate_key: generateDeduplicateKey(senderEmail, email.subject),
          share_with: [],
        });
      }
    } catch (err) {
      console.error("[ea/classifier] AI classification failed:", err);
      results.push(...batch.map(fallbackClassify));
    }
  }

  return results;
}

// ── Main classify function ──

export async function classifyEmails(rawEmails: RawEmail[]): Promise<ClassifiedEmail[]> {
  // Always load fresh config (no stale cache across serverless invocations)
  const config = await loadClassifierConfig();

  const classified: ClassifiedEmail[] = [];
  const needsAI: RawEmail[] = [];

  for (const email of rawEmails) {
    const result = classifyByRules(email, config);
    if (result) {
      classified.push(result);
    } else {
      needsAI.push(email);
    }
  }

  if (needsAI.length > 0) {
    const aiResults = await classifyByAI(needsAI);
    classified.push(...aiResults);
  }

  return classified;
}
