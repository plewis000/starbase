/**
 * EA Brief Generator
 *
 * Takes classified emails + config → produces a formatted brief.
 * Two output formats: Discord (short, 2000 char limit) and full text.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { ea } from "@/lib/supabase/schemas";
import { sendMessage } from "@/lib/discord";
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
    // Sort by urgency (lowest=most urgent), then by received_at (newest first)
    const sorted = group.sort((a, b) => {
      if (a.urgency_score !== b.urgency_score) return a.urgency_score - b.urgency_score;
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    });
    const representative = sorted[0];

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

export function rankItems(
  items: BriefItem[],
  categoryConfig: Map<string, CategoryConfig>
): { surfaced: BriefItem[]; suppressed: BriefItem[] } {
  const surfaced: BriefItem[] = [];
  const suppressed: BriefItem[] = [];

  for (const item of items) {
    const catConf = categoryConfig.get(item.category);
    const catWeight = catConf?.weight || 0.5;
    const suppressThreshold = catConf?.suppress_threshold || 0.2;

    const effectiveScore = item.importance * catWeight;
    item.detail_level = (catConf?.detail_level || "summary") as DetailLevel;

    if (effectiveScore < suppressThreshold) {
      suppressed.push(item);
    } else {
      surfaced.push(item);
    }
  }

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

  const urgent = surfaced.filter((i) => i.urgency === 1);
  if (urgent.length > 0) {
    sections.push("**⚡ Act Today:**");
    urgent.forEach((item, i) => sections.push(formatBriefItemShort(item, i + 1)));
    sections.push("");
  }

  const action = surfaced.filter((i) => i.urgency === 2);
  if (action.length > 0) {
    sections.push("**📌 This Week:**");
    const offset = urgent.length;
    action.forEach((item, i) =>
      sections.push(formatBriefItemShort(item, offset + i + 1))
    );
    sections.push("");
  }

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

  sections.push("──────────────────────────");
  sections.push("Reply: **1** = useful | **2** = too noisy | **3** = missed something");

  let text = sections.join("\n");

  // Discord 2000 char limit — truncate FYI items if needed
  if (text.length > 1900) {
    // Rebuild without FYI snippets
    const compact = surfaced.map((item, i) => {
      const urgencyLabel = URGENCY_LABEL[item.urgency] || "";
      const emoji = CATEGORY_EMOJI[item.category] || "📧";
      const countSuffix = item.count > 1 ? ` (×${item.count})` : "";
      return `${i + 1}. ${urgencyLabel}${emoji} **${item.sender_name}**: ${item.subject}${countSuffix}`;
    });

    text = [
      header,
      "",
      ...compact,
      "",
      suppressedCount > 0 ? `*...and ${suppressedCount} other emails (noise)*` : "",
      "──────────────────────────",
      "Reply: **1** = useful | **2** = too noisy | **3** = missed something",
    ].filter(Boolean).join("\n");
  }

  // Final safety: hard truncate at 1950
  if (text.length > 1950) {
    text = text.slice(0, 1947) + "...";
  }

  return text;
}

// ── Main Pipeline ──

export async function generateBrief(
  classifiedEmails: ClassifiedEmail[],
  briefType: "daily" | "on_demand" | "weekly" = "daily"
): Promise<GeneratedBrief> {
  const supabase = createServiceClient();
  const { data: categories } = await ea(supabase)
    .from("category_config")
    .select("*");

  const categoryConfig = new Map(
    (categories || []).map((c: CategoryConfig) => [c.category_name, c])
  );

  const items = deduplicateEmails(classifiedEmails);
  const { surfaced, suppressed } = rankItems(items, categoryConfig);
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
  briefId: string | null,
  surfacedIds: Set<string>
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
    was_surfaced: surfacedIds.has(e.gmail_message_id),
  }));

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await ea(supabase)
      .from("email_signals")
      .upsert(batch, { onConflict: "gmail_message_id" });

    if (error) {
      console.error("[ea/brief] Failed to store signals batch:", error);
      // Don't throw — signal storage failure shouldn't break the pipeline
      // The brief was already generated and delivered
    }
  }
}
