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
import { anthropic, getModel } from "@/lib/agent/client";
import type {
  SenderProfile,
  CategoryConfig,
  ExplicitRule,
  EmailCategory,
  UrgencyLevel,
  ClassifiedEmail,
} from "./types";

// ── Cached config (loaded once per pipeline run) ──

let senderProfileCache: SenderProfile[] | null = null;
let categoryConfigCache: Map<string, CategoryConfig> | null = null;
let explicitRulesCache: ExplicitRule[] | null = null;

export async function loadClassifierConfig() {
  const supabase = createServiceClient();

  const [{ data: profiles }, { data: categories }, { data: rules }] = await Promise.all([
    ea(supabase).from("sender_profiles").select("*"),
    ea(supabase).from("category_config").select("*"),
    ea(supabase).from("explicit_rules").select("*").eq("active", true),
  ]);

  senderProfileCache = profiles || [];
  categoryConfigCache = new Map(
    (categories || []).map((c: CategoryConfig) => [c.category_name, c])
  );
  explicitRulesCache = rules || [];
}

export function clearClassifierCache() {
  senderProfileCache = null;
  categoryConfigCache = null;
  explicitRulesCache = null;
}

// ── Sender Matching ──

function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

function findSenderProfile(senderEmail: string, domain: string): SenderProfile | null {
  if (!senderProfileCache) return null;

  // Exact email match first
  const exactMatch = senderProfileCache.find(
    (p) => p.sender_email && p.sender_email.toLowerCase() === senderEmail.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  // Domain match (may return multiple — pick highest importance)
  const domainMatches = senderProfileCache.filter(
    (p) => p.sender_domain.toLowerCase() === domain.toLowerCase()
  );

  if (domainMatches.length === 0) return null;
  return domainMatches.reduce((best, p) =>
    p.importance_weight > best.importance_weight ? p : best
  );
}

// ── Explicit Rule Matching ──

function matchesPattern(pattern: string, email: string, domain: string): boolean {
  // Pattern format: "*@domain.com" or exact email
  if (pattern.startsWith("*@")) {
    const patternDomain = pattern.slice(2).toLowerCase();
    return domain.toLowerCase() === patternDomain ||
           domain.toLowerCase().endsWith("." + patternDomain);
  }
  return email.toLowerCase() === pattern.toLowerCase();
}

function checkExplicitRules(senderEmail: string, domain: string): {
  alwaysSurface: boolean;
  autoSuppress: boolean;
  shareWith: string[];
} {
  if (!explicitRulesCache) return { alwaysSurface: false, autoSuppress: false, shareWith: [] };

  let alwaysSurface = false;
  let autoSuppress = false;
  const shareWith: string[] = [];

  for (const rule of explicitRulesCache) {
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

  // always_surface overrides auto_suppress
  if (alwaysSurface) autoSuppress = false;

  return { alwaysSurface, autoSuppress, shareWith };
}

// ── Deduplication Key ──

function generateDeduplicateKey(sender: string, subject: string | null): string {
  // Normalize subject: strip Re:, Fwd:, etc. and lowercase
  const normalized = (subject || "")
    .replace(/^(re|fwd|fw):\s*/gi, "")
    .toLowerCase()
    .trim();

  const domain = extractDomain(sender);
  return `${domain}::${normalized.slice(0, 60)}`;
}

// ── Rule-Based Classification (Pass 1) ──

interface RawEmail {
  gmail_message_id: string;
  gmail_thread_id?: string;
  received_at: string;
  sender: string;       // "Name <email@domain.com>" or just "email@domain.com"
  subject: string | null;
  snippet: string | null;
}

function parseSenderEmail(sender: string): string {
  const match = sender.match(/<([^>]+)>/);
  return match ? match[1] : sender;
}

export function classifyByRules(email: RawEmail): ClassifiedEmail | null {
  const senderEmail = parseSenderEmail(email.sender);
  const domain = extractDomain(senderEmail);
  const profile = findSenderProfile(senderEmail, domain);
  const rules = checkExplicitRules(senderEmail, domain);

  if (!profile) return null; // Unknown sender — needs AI classification

  const categoryConf = categoryConfigCache?.get(profile.category);

  return {
    gmail_message_id: email.gmail_message_id,
    gmail_thread_id: email.gmail_thread_id || null,
    received_at: email.received_at,
    sender: senderEmail,
    sender_domain: domain,
    subject: email.subject,
    snippet: email.snippet,
    category: profile.category as EmailCategory,
    urgency_score: (categoryConf?.urgency_default || 3) as UrgencyLevel,
    importance_score: rules.alwaysSurface ? 1.0 : rules.autoSuppress ? 0.1 : profile.importance_weight,
    deduplicate_key: generateDeduplicateKey(senderEmail, email.subject),
    share_with: [...new Set([...profile.share_with, ...rules.shareWith])],
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

Respond with ONLY a JSON object:
{"category": "...", "urgency": N, "importance": 0.XX}

importance is 0.0-1.0 based on how likely the user needs to see this.`;

export async function classifyByAI(emails: RawEmail[]): Promise<ClassifiedEmail[]> {
  if (emails.length === 0) return [];

  // Batch classify — up to 20 at a time to save API calls
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
      // Extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const classifications = JSON.parse(jsonMatch[0]) as Array<{
          category: string;
          urgency: number;
          importance: number;
        }>;

        for (let i = 0; i < batch.length && i < classifications.length; i++) {
          const email = batch[i];
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
            category: (cls.category || "other") as EmailCategory,
            urgency_score: Math.max(1, Math.min(4, cls.urgency || 3)) as UrgencyLevel,
            importance_score: Math.max(0, Math.min(1, cls.importance || 0.5)),
            deduplicate_key: generateDeduplicateKey(senderEmail, email.subject),
            share_with: [],
          });
        }
      }
    } catch (err) {
      console.error("[ea/classifier] AI classification failed:", err);
      // Fallback: classify unknowns as "other" with neutral scores
      for (const email of batch) {
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
          category: "other",
          urgency_score: 3,
          importance_score: 0.5,
          deduplicate_key: generateDeduplicateKey(senderEmail, email.subject),
          share_with: [],
        });
      }
    }
  }

  return results;
}

// ── Main classify function ──

export async function classifyEmails(rawEmails: RawEmail[]): Promise<ClassifiedEmail[]> {
  if (!senderProfileCache) await loadClassifierConfig();

  const classified: ClassifiedEmail[] = [];
  const needsAI: RawEmail[] = [];

  for (const email of rawEmails) {
    const result = classifyByRules(email);
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
