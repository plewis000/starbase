/**
 * EA Brief Generator
 *
 * Takes classified emails + config → produces a formatted brief.
 * Two output formats: Discord (short, 2000 char limit) and full text.
 *
 * Uses Claude Sonnet for narrative synthesis (Zev's voice).
 */

import { createServiceClient } from "@/lib/supabase/service";
import { ea } from "@/lib/supabase/schemas";
import { anthropic, getModel } from "@/lib/agent/client";
import type {
  ClassifiedEmail,
  CategoryConfig,
  BriefItem,
  GeneratedBrief,
  EmailCategory,
  DetailLevel,
} from "./types";

// ── Deduplication ──

function deduplicateEmails(emails: ClassifiedEmail[]): BriefItem[] {
  const groups = new Map<string, ClassifiedEmail[]>();

  for (const email of emails) {
    const key = email.deduplicate_key || email.gmail_message_id;
    const existing = groups.get(key) || [];
    existing.push(email);
    groups.set(key, existing);
  }

  const items: BriefItem[] = [];
  for (const [, group] of groups) {
    // Take the most recent / highest urgency from the group
    const representative = group.reduce((best, e) =>
      e.urgency_score < best.urgency_score ? e : best
    );

    items.push({
      signal_id: representative.gmail_message_id,
      category: representative.category,
      urgency: representative.urgency_score,
      importance: representative.importance_score,
      sender_name: representative.sender,
      subject: representative.subject || "(no subject)",
      snippet: representative.snippet || "",
      detail_level: "summary",
      is_reminder: false,
      share_with: representative.share_with,
      count: group.length,
    });
  }

  return items;
}

// ── Ranking ──

function rankItems(
  items: BriefItem[],
  categoryConfig: Map<string, CategoryConfig>
): { surfaced: BriefItem[]; suppressed: BriefItem[] } {
  const surfaced: BriefItem[] = [];
  const suppressed: BriefItem[] = [];

  for (const item of items) {
    const catConf = categoryConfig.get(item.category);
    const catWeight = catConf?.weight || 0.5;
    const suppressThreshold = catConf?.suppress_threshold || 0.2;

    // Apply category weight to importance
    const effectiveScore = item.importance * catWeight;

    // Set detail level from config
    item.detail_level = (catConf?.detail_level || "summary") as DetailLevel;

    if (effectiveScore < suppressThreshold) {
      suppressed.push(item);
    } else {
      surfaced.push(item);
    }
  }

  // Sort surfaced by: urgency ASC (1=most urgent), then importance DESC
  surfaced.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency - b.urgency;
    return b.importance - a.importance;
  });

  return { surfaced, suppressed };
}

// ── Brief Formatting (Discord) ──

const CATEGORY_EMOJI: Record<EmailCategory, string> = {
  health: "🏥",
  financial: "💰",
  family: "👨‍👩‍👧‍👦",
  household: "🏠",
  dev_infrastructure: "🔧",
  work_shuttle: "💼",
  security_auth: "🔐",
  promotions: "📢",
  community: "🏘️",
  other: "📧",
};

const URGENCY_LABEL: Record<number, string> = {
  1: "⚡",
  2: "📌",
  3: "",
  4: "",
};

function formatBriefItemShort(item: BriefItem, index: number): string {
  const urgency = URGENCY_LABEL[item.urgency] || "";
  const emoji = CATEGORY_EMOJI[item.category] || "📧";
  const countSuffix = item.count > 1 ? ` (×${item.count})` : "";
  const shareSuffix = item.share_with.length > 0
    ? ` → ${item.share_with.join(", ")}`
    : "";

  if (item.detail_level === "one_liner") {
    return `${index}. ${urgency}${emoji} **${item.sender_name}**: ${item.subject}${countSuffix}${shareSuffix}`;
  }

  // summary level
  return `${index}. ${urgency}${emoji} **${item.sender_name}**: ${item.subject}${countSuffix}\n   ${item.snippet.slice(0, 100)}${shareSuffix}`;
}

function buildDiscordBrief(
  surfaced: BriefItem[],
  suppressedCount: number,
  briefType: "daily" | "on_demand" | "weekly"
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const header = briefType === "daily"
    ? `☀️ **Daily Brief — ${dateStr}**`
    : briefType === "on_demand"
    ? `📋 **Brief — ${dateStr}**`
    : `📊 **Weekly Brief — ${dateStr}**`;

  const sections: string[] = [header, ""];

  // Urgent items (urgency 1)
  const urgent = surfaced.filter((i) => i.urgency === 1);
  if (urgent.length > 0) {
    sections.push("**⚡ Act Today:**");
    urgent.forEach((item, i) => sections.push(formatBriefItemShort(item, i + 1)));
    sections.push("");
  }

  // Action items (urgency 2)
  const action = surfaced.filter((i) => i.urgency === 2);
  if (action.length > 0) {
    sections.push("**📌 This Week:**");
    const offset = urgent.length;
    action.forEach((item, i) =>
      sections.push(formatBriefItemShort(item, offset + i + 1))
    );
    sections.push("");
  }

  // Awareness (urgency 3-4)
  const awareness = surfaced.filter((i) => i.urgency >= 3);
  if (awareness.length > 0) {
    sections.push("**📧 FYI:**");
    const offset = urgent.length + action.length;
    awareness.forEach((item, i) =>
      sections.push(formatBriefItemShort(item, offset + i + 1))
    );
    sections.push("");
  }

  if (surfaced.length === 0) {
    sections.push("Nothing notable since last brief. Inbox is quiet.");
    sections.push("");
  }

  if (suppressedCount > 0) {
    sections.push(
      `*...and ${suppressedCount} other email${suppressedCount !== 1 ? "s" : ""} (mostly noise)*`
    );
    sections.push("");
  }

  // Feedback prompt
  sections.push("──────────────────────────");
  sections.push("Reply: **1** = useful | **2** = too noisy | **3** = missed something");

  return sections.join("\n");
}

// ── Main Pipeline ──

export async function generateBrief(
  classifiedEmails: ClassifiedEmail[],
  briefType: "daily" | "on_demand" | "weekly" = "daily"
): Promise<GeneratedBrief> {
  // Load category config
  const supabase = createServiceClient();
  const { data: categories } = await ea(supabase)
    .from("category_config")
    .select("*");

  const categoryConfig = new Map(
    (categories || []).map((c: CategoryConfig) => [c.category_name, c])
  );

  // Step 1: Deduplicate
  const items = deduplicateEmails(classifiedEmails);

  // Step 2: Rank and split into surfaced vs suppressed
  const { surfaced, suppressed } = rankItems(items, categoryConfig);

  // Step 3: Format Discord brief
  const discordText = buildDiscordBrief(surfaced, suppressed.length, briefType);

  return {
    items: surfaced,
    suppressed_count: suppressed.length,
    discord_text: discordText,
    brief_type: briefType,
  };
}

// ── Store Brief ──

export async function storeBrief(brief: GeneratedBrief): Promise<string> {
  const supabase = createServiceClient();

  const { data, error } = await ea(supabase)
    .from("briefs")
    .insert({
      delivered_via: "discord",
      brief_type: brief.brief_type,
      items_count: brief.items.length,
      suppressed_count: brief.suppressed_count,
      discord_message: brief.discord_text,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ea/brief] Failed to store brief:", error);
    throw error;
  }

  return data.id;
}

// ── Store Signals ──

export async function storeEmailSignals(
  classified: ClassifiedEmail[],
  briefId: string | null
): Promise<void> {
  const supabase = createServiceClient();

  const records = classified.map((e) => ({
    gmail_message_id: e.gmail_message_id,
    gmail_thread_id: e.gmail_thread_id,
    received_at: e.received_at,
    sender: e.sender,
    sender_domain: e.sender_domain,
    subject: e.subject,
    snippet: e.snippet,
    category: e.category,
    urgency_score: e.urgency_score,
    importance_score: e.importance_score,
    deduplicate_key: e.deduplicate_key,
    share_with: e.share_with,
    brief_id: briefId,
    was_surfaced: e.importance_score >= 0.2, // rough threshold
  }));

  // Insert in batches of 50
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await ea(supabase)
      .from("email_signals")
      .upsert(batch, { onConflict: "gmail_message_id" });

    if (error) {
      console.error("[ea/brief] Failed to store signals batch:", error);
    }
  }
}
