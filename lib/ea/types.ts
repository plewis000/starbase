/**
 * Executive Assistant — Core Types
 *
 * Matches the ea.* Supabase schema exactly.
 */

// ── Sender Profiles ──

export interface SenderProfile {
  id: string;
  sender_email: string | null;
  sender_domain: string;
  display_name: string;
  category: EmailCategory;
  importance_weight: number;
  always_surface: boolean;
  auto_suppress: boolean;
  deduplicate: boolean;
  share_with: string[];
  learned_from: string;
  created_at: string;
  updated_at: string;
}

// ── Category Config ──

export interface CategoryConfig {
  id: string;
  category_name: EmailCategory;
  weight: number;
  detail_level: DetailLevel;
  suppress_threshold: number;
  urgency_default: UrgencyLevel;
  created_at: string;
  updated_at: string;
}

// ── Email Signals ──

export interface EmailSignal {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  received_at: string;
  sender: string;
  sender_domain: string;
  subject: string | null;
  snippet: string | null;
  category: EmailCategory;
  urgency_score: UrgencyLevel;
  importance_score: number;
  deduplicate_key: string | null;
  was_surfaced: boolean;
  brief_id: string | null;
  user_action: UserAction;
  action_timestamp: string | null;
  forwarded_to: string | null;
  share_with: string[];
  processed_at: string;
}

// ── Briefs ──

export interface Brief {
  id: string;
  generated_at: string;
  delivered_via: "discord" | "email" | "both";
  brief_type: "daily" | "on_demand" | "weekly";
  items_count: number;
  suppressed_count: number;
  discord_message: string | null;
  email_html: string | null;
  feedback_rating: 1 | 2 | 3 | null;
  feedback_detail: string | null;
  created_at: string;
}

// ── Explicit Rules ──

export interface ExplicitRule {
  id: string;
  rule_type: "always_surface" | "auto_suppress" | "share_flag" | "detail_override" | "category_override";
  sender_pattern: string | null;
  category: string | null;
  action_value: string | null;
  source: "user_explicit" | "learned" | "inferred" | "seed";
  active: boolean;
  created_at: string;
}

// ── Reminders ──

export interface Reminder {
  id: string;
  email_signal_id: string;
  reminder_after: string;
  reminder_category: string;
  reminded_count: number;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

// ── Lenale Messages ──

export interface LenaleMessage {
  id: string;
  brief_id: string | null;
  items: Array<{ email_signal_id: string; summary: string }>;
  discord_message_id: string | null;
  sent_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
}

// ── Scan State ──

export interface ScanState {
  id: string;
  last_scan_at: string;
  last_history_id: string | null;
  emails_processed: number;
}

// ── Enums ──

export type EmailCategory =
  | "health"
  | "financial"
  | "family"
  | "household"
  | "dev_infrastructure"
  | "work_shuttle"
  | "security_auth"
  | "promotions"
  | "community"
  | "other";

export type UrgencyLevel = 1 | 2 | 3 | 4;
// 1 = act today, 2 = this week, 3 = awareness only, 4 = archive

export type DetailLevel = "one_liner" | "summary" | "full_context";

export type UserAction = "pending" | "clicked" | "forwarded" | "replied" | "ignored" | "suppressed";

// ── Pipeline types ──

export interface ClassifiedEmail {
  gmail_message_id: string;
  gmail_thread_id: string | null;
  received_at: string;
  sender: string;
  sender_domain: string;
  subject: string | null;
  snippet: string | null;
  category: EmailCategory;
  urgency_score: UrgencyLevel;
  importance_score: number;
  deduplicate_key: string;
  share_with: string[];
}

export interface BriefItem {
  signal_id: string;
  category: EmailCategory;
  urgency: UrgencyLevel;
  importance: number;
  sender_name: string;
  subject: string;
  snippet: string;
  detail_level: DetailLevel;
  is_reminder: boolean;
  reminder_days?: number;
  share_with: string[];
  count: number;  // >1 means deduplicated group
}

export interface GeneratedBrief {
  items: BriefItem[];
  suppressed_count: number;
  discord_text: string;
  brief_type: "daily" | "on_demand" | "weekly";
}
