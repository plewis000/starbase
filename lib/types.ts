export interface Tag {
  id: string;
  tag_id: string;
  tag: {
    name: string;
    display_color?: string;
    icon?: string;
  };
}

export interface ChecklistItem {
  id: string;
  title: string;
  checked: boolean;
  sort_order: number;
}

export interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  user?: {
    full_name: string;
    avatar_url?: string | null;
  };
}

export interface ActivityEntry {
  action: string;
  performed_at: string;
  metadata?: Record<string, unknown>;
}

export interface Dependency {
  blocks: string[];
  blocked_by: string[];
}

export interface Subtask {
  id: string;
  title: string;
  status?: {
    name: string;
  };
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status_id: string;
  priority_id: string;
  status: {
    id: string;
    name: string;
    icon?: string;
  };
  priority: {
    id: string;
    name: string;
    icon?: string;
  };
  assignee?: {
    id: string;
    full_name: string;
  };
  creator?: {
    id: string;
    full_name: string;
  };
  due_date?: string;
  tags: Tag[];
  checklist_items: ChecklistItem[];
  comments: Comment[];
  subtasks: Subtask[];
  dependencies: Dependency;
  activity: ActivityEntry[];
}

export interface TaskFormData {
  id?: string;
  title: string;
  description?: string;
  due_date?: string;
  status_id?: string;
  priority_id?: string;
  checklist_items?: ChecklistItem[];
}

// ---- GOALS ----

export type GoalStatus = "active" | "completed" | "abandoned" | "paused";
export type GoalProgressType = "manual" | "milestone" | "habit_driven" | "task_driven";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  owner_id: string;
  category_id?: string;
  timeframe_id?: string;
  status: GoalStatus;
  progress_type: GoalProgressType;
  progress_value: number;
  target_value?: number;
  current_value?: number;
  unit?: string;
  start_date: string;
  target_date?: string;
  completed_at?: string;
  parent_goal_id?: string;
  source: string;
  // Enriched fields (cross-schema)
  category?: ConfigItem | null;
  timeframe?: ConfigItem | null;
  owner?: UserSummary | null;
  // Related data (when fetched)
  milestones?: Milestone[];
  linked_habits?: LinkedHabit[];
  linked_tasks?: LinkedTask[];
  sub_goals?: GoalSummary[];
  activity?: ActivityEntry[];
}

export interface GoalSummary {
  id: string;
  title: string;
  status: GoalStatus;
  progress_value: number;
}

export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  description?: string;
  target_date?: string;
  completed_at?: string;
  sort_order: number;
}

export interface GoalFormData {
  title: string;
  description?: string;
  category_id?: string;
  timeframe_id?: string;
  start_date?: string;
  target_date?: string;
  progress_type?: GoalProgressType;
  target_value?: number;
  unit?: string;
  parent_goal_id?: string;
  milestones?: { title: string; target_date?: string }[];
  habit_ids?: string[];
  task_ids?: string[];
}

// ---- HABITS ----

export type HabitStatus = "active" | "paused" | "retired";
export type HabitMood = "great" | "good" | "neutral" | "tough" | "terrible";

export interface Habit {
  id: string;
  title: string;
  description?: string;
  owner_id: string;
  category_id?: string;
  frequency_id: string;
  target_count: number;
  time_preference_id?: string;
  specific_days?: number[];
  status: HabitStatus;
  started_on: string;
  paused_at?: string;
  retired_at?: string;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  last_completed_at?: string;
  source: string;
  // Enriched fields (cross-schema)
  category?: ConfigItem | null;
  frequency?: ConfigItem | null;
  time_preference?: ConfigItem | null;
  owner?: UserSummary | null;
  // Transient fields (computed per request)
  checked_today?: boolean;
  completions_this_week?: number;
  // Related data (when fetched)
  check_in_history?: CheckIn[];
  linked_goals?: GoalSummary[];
  activity?: ActivityEntry[];
  streak_context?: {
    target_type: string;
    target_count: number;
  };
}

export interface CheckIn {
  id?: string;
  habit_id: string;
  checked_by: string;
  check_date: string;
  value?: number;
  unit?: string;
  note?: string;
  mood?: HabitMood;
  source: string;
}

export interface HabitFormData {
  title: string;
  description?: string;
  category_id?: string;
  frequency_id: string;
  target_count?: number;
  time_preference_id?: string;
  specific_days?: number[];
  started_on?: string;
  goal_ids?: string[];
}

export interface CheckInFormData {
  check_date?: string;
  value?: number;
  unit?: string;
  note?: string;
  mood?: HabitMood;
}

// ---- LINKING ----

export interface LinkedHabit {
  id: string;
  title: string;
  status: HabitStatus;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  weight: number;
}

export interface LinkedTask {
  id: string;
  title: string;
  status_id: string;
  completed_at?: string;
}

// ---- SHARED / CONFIG ----

export interface ConfigItem {
  id: string;
  name: string;
  slug?: string;
  display_color?: string;
  icon?: string;
  sort_order?: number;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UserSummary {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
}

// ---- STREAKS ----

export interface StreakResult {
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  last_completed_at: string | null;
  completion_rate_30d: number;
  completion_rate_7d: number;
}

// ---- DASHBOARD ----

export interface DashboardSummary {
  goals: {
    active: number;
    completed_30d: number;
    upcoming_deadlines: number;
  };
  habits: {
    active: number;
    checked_today: number;
    today_completion_rate: number;
    total_checkins_7d: number;
  };
  tasks: {
    overdue: number;
    due_today: number;
  };
}

// ---- COMMENTS (Polymorphic, v2) ----

export type CommentEntityType = "task" | "goal" | "habit";

export interface CommentV2 {
  id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  user_id: string;
  body: string;
  body_html?: string;
  parent_id?: string;
  is_edited: boolean;
  is_pinned: boolean;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  // Enriched
  author?: UserSummary | null;
  reactions?: Record<string, number>;
  user_reactions?: string[];
  replies?: CommentV2[];
  reply_count?: number;
  mentions?: ParsedMention[];
  edit_history?: CommentEdit[];
}

export interface CommentEdit {
  id: string;
  comment_id: string;
  previous_body: string;
  edited_at: string;
  edited_by: string;
}

export interface ParsedMention {
  raw: string;
  identifier: string;
  userId: string | null;
}

// ---- REACTIONS ----

export interface Reaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// ---- ENTITY WATCHERS ----

export type WatchLevel = "all" | "mentions_only" | "muted";

export interface EntityWatcher {
  id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  user_id: string;
  watch_level: WatchLevel;
  created_at: string;
  // Enriched
  user?: UserSummary | null;
  is_current_user?: boolean;
}

// ---- NOTIFICATIONS (v2) ----

export type NotifyEventType =
  | "task_assigned"
  | "task_commented"
  | "task_overdue"
  | "task_completed"
  | "task_handed_off"
  | "task_status_changed"
  | "goal_commented"
  | "goal_completed"
  | "goal_milestone_completed"
  | "habit_commented"
  | "habit_streak_milestone"
  | "mention"
  | "checklist_complete"
  | "recurrence_created"
  | "entity_updated"
  | "system";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body?: string;
  source: string;
  entity_type?: string;
  entity_id?: string;
  event_type?: NotifyEventType;
  group_key?: string;
  is_grouped?: boolean;
  group_count?: number;
  metadata?: Record<string, unknown>;
  read_at?: string;
  sent_at?: string;
  created_at: string;
}

export interface NotificationSubscription {
  id?: string;
  event_type: NotifyEventType;
  enabled: boolean;
}

export interface QuietHours {
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_days?: number[];
  timezone: string;
}

// ---- TAG ASSOCIATIONS ----

export interface GoalTag {
  id: string;
  goal_id: string;
  tag_id: string;
  created_at: string;
  tag?: {
    id: string;
    name: string;
    slug: string;
    display_color?: string;
    icon?: string;
  };
}

export interface HabitTag {
  id: string;
  habit_id: string;
  tag_id: string;
  created_at: string;
  tag?: {
    id: string;
    name: string;
    slug: string;
    display_color?: string;
    icon?: string;
  };
}

// ---- GAMIFICATION (Desperado Club) ----

export type AchievementTier = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type AchievementCategory = "productivity" | "finance" | "health" | "streak" | "social" | "meta" | "party" | "seasonal";
export type LootBoxTierSlug = "bronze" | "silver" | "gold" | "platinum";

export interface CrawlerProfile {
  id: string;
  user_id: string;
  crawler_name: string;
  total_xp: number;
  current_level: number;
  current_floor_id?: string;
  xp_to_next_level: number;
  login_streak: number;
  longest_login_streak: number;
  last_login_date?: string;
  showcase_achievement_ids: string[];
  title?: string;
  created_at: string;
  updated_at: string;
  // Enriched
  floor?: {
    floor_number: number;
    name: string;
    icon: string;
    color: string;
  };
  // Computed
  level?: number;
  xp_progress?: number;
  xp_in_level?: number;
  xp_to_next?: number;
  floor_number?: number;
}

export interface Achievement {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  xp_reward: number;
  icon?: string;
  loot_box_tier?: LootBoxTierSlug;
  is_hidden: boolean;
  is_party: boolean;
  is_repeatable: boolean;
  // Unlock status (merged from user data)
  unlocked: boolean;
  unlocked_at?: string;
  unlock_count: number;
}

export interface XpLedgerEntry {
  id: string;
  user_id: string;
  amount: number;
  action_type: string;
  source_entity_type?: string;
  source_entity_id?: string;
  description: string;
  multiplier: number;
  created_at: string;
}

export interface LootBox {
  id: string;
  user_id: string;
  tier_id: string;
  source_achievement_id?: string;
  source_description: string;
  opened: boolean;
  opened_at?: string;
  reward_id?: string;
  reward_redeemed: boolean;
  redeemed_at?: string;
  created_at: string;
  // Enriched
  tier?: {
    slug: string;
    name: string;
    color: string;
    icon: string;
  };
  reward?: {
    name: string;
    description?: string;
    icon?: string;
  };
}

export interface LootBoxReward {
  id: string;
  user_id: string;
  tier_id: string;
  name: string;
  description?: string;
  icon?: string;
  is_household: boolean;
  active: boolean;
  times_won: number;
  created_at: string;
  tier?: {
    slug: string;
    name: string;
    color: string;
    icon: string;
  };
}

export interface LootBoxTier {
  id: string;
  slug: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  sort_order: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  crawler_name: string;
  total_xp?: number;
  xp_earned?: number;
  level: number;
  login_streak?: number;
  title?: string;
  achievements_unlocked?: number;
  is_current_user: boolean;
}

export interface Buff {
  id: string;
  name: string;
  streak: number;
}

export interface Debuff {
  id: string;
  name: string;
  due_date: string;
}

// ---- HOUSEHOLD ----

export type HouseholdRole = "admin" | "member";

export interface Household {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  created_at: string;
  updated_at: string;
  // Enriched
  members?: HouseholdMember[];
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  display_name?: string;
  joined_at: string;
  // Enriched
  user?: UserSummary | null;
}

// ---- RESPONSIBILITIES & DELEGATION ----

export type OwnershipType = "fixed" | "rotating" | "shared" | "flexible";
export type DelegationStatus = "pending" | "accepted" | "declined" | "active" | "completed" | "cancelled";
export type DelegationType = "temporary" | "permanent" | "one_time";
export type ResponsibilityChangeAction = "assigned" | "rotated" | "delegated" | "reclaimed" | "swapped" | "created";

export interface Responsibility {
  id: string;
  household_id: string;
  name: string;
  description?: string;
  category: string;
  current_owner_id: string;
  ownership_type: OwnershipType;
  effort_weight: number;
  default_recurrence?: string;
  icon?: string;
  rotate_every_days?: number;
  last_rotated_at?: string;
  next_rotation_at?: string;
  created_at: string;
  updated_at: string;
  // Enriched
  current_owner?: UserSummary | null;
  history?: ResponsibilityHistory[];
  linked_entities?: ResponsibilityLink[];
  active_delegation?: Delegation | null;
}

export interface ResponsibilityHistory {
  id: string;
  responsibility_id: string;
  user_id: string;
  action: ResponsibilityChangeAction;
  previous_owner_id?: string;
  new_owner_id?: string;
  reason?: string;
  source: string;
  created_at: string;
  // Enriched
  user?: UserSummary | null;
  previous_owner?: UserSummary | null;
  new_owner?: UserSummary | null;
}

export interface Delegation {
  id: string;
  responsibility_id: string;
  from_user_id: string;
  to_user_id: string;
  delegation_type: DelegationType;
  status: DelegationStatus;
  reason?: string;
  starts_at?: string;
  ends_at?: string;
  accepted_at?: string;
  completed_at?: string;
  source: string;
  created_at: string;
  // Enriched
  responsibility?: { id: string; name: string; icon?: string };
  from_user?: UserSummary | null;
  to_user?: UserSummary | null;
}

export interface ResponsibilityLink {
  id: string;
  responsibility_id: string;
  entity_type: "task" | "habit" | "goal" | "shopping_list";
  entity_id: string;
  created_at: string;
}

export interface LoadSnapshot {
  id: string;
  household_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  total_effort_score: number;
  responsibility_count: number;
  household_share_pct: number;
  breakdown: Record<string, unknown>;
  computed_by: string;
  created_at: string;
  // Enriched
  user?: UserSummary | null;
}

// ---- RESPONSIBILITY TEMPLATES ----

export interface ResponsibilityTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  default_effort_weight: number;
  default_recurrence?: string;
  icon?: string;
  sort_order: number;
}

// ---- AI MEMORY ----

export type AiSourceLayer = "declared" | "observed" | "inferred";

export interface AiObservation {
  id: string;
  user_id: string;
  household_id?: string;
  observation_type: string;
  content: string;
  confidence: number;
  source_layer: AiSourceLayer;
  source_data?: Record<string, unknown>;
  tags?: string[];
  supersedes_id?: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

export interface AiDecision {
  id: string;
  user_id?: string;
  household_id?: string;
  decision_type: string;
  description: string;
  reasoning: string;
  action_taken?: string;
  outcome?: string;
  outcome_score?: number;
  model_used: string;
  tokens_used?: number;
  created_at: string;
}

export interface UserModelAttribute {
  id: string;
  user_id: string;
  attribute_key: string;
  attribute_value: Record<string, unknown>;
  source_layer: AiSourceLayer;
  confidence: number;
  version: number;
  previous_version_id?: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

// ---- CONFIG OVERRIDES ----

export type ConfigOverrideScope = "user" | "household";

export interface ConfigOverride {
  id: string;
  scope: ConfigOverrideScope;
  scope_id: string;
  config_key: string;
  config_value: Record<string, unknown>;
  reason?: string;
  original_instruction?: string;
  set_by: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConfigChangeLog {
  id: string;
  override_id?: string;
  action: string;
  config_key: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  natural_language_description: string;
  performed_by: string;
  created_at: string;
}

// ---- BEHAVIORAL AGGREGATES ----

export interface BehavioralAggregate {
  id: string;
  user_id: string;
  date: string;
  tasks_created: number;
  tasks_completed: number;
  avg_completion_hours?: number;
  habits_checked: number;
  habits_missed: number;
  goals_progressed: number;
  xp_earned: number;
  level_at: number;
  achievements_unlocked: number;
  transactions_logged?: number;
  total_spent?: number;
  peak_activity_hour?: number;
  active_minutes?: number;
  session_count: number;
  engagement_score?: number;
  mood_avg?: number;
  created_at: string;
}

// ---- ONBOARDING ----

export type OnboardingPhase = "not_started" | "interview" | "observation" | "refinement" | "active";

export interface OnboardingState {
  id: string;
  user_id: string;
  household_id: string;
  current_phase: OnboardingPhase;
  interview_completed_at?: string;
  observation_started_at?: string;
  observation_ends_at?: string;
  refinement_completed_at?: string;
  current_question_index: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OnboardingResponse {
  id: string;
  onboarding_id: string;
  question_key: string;
  raw_response: string;
  extracted_data?: Record<string, unknown>;
  confidence?: number;
  reviewed_by_user: boolean;
  created_at: string;
}

export interface OnboardingQuestion {
  id: string;
  question_key: string;
  question_text: string;
  category: string;
  phase: string;
  sort_order: number;
  extraction_schema: Record<string, unknown>;
  active: boolean;
}

// ---- AI SUGGESTIONS ----

export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "snoozed" | "expired" | "auto_applied";
export type SuggestionCategory =
  | "habit_adjustment" | "goal_suggestion" | "schedule_optimization"
  | "delegation_suggestion" | "gamification_tweak" | "responsibility_rebalance"
  | "boundary_suggestion" | "reward_suggestion" | "notification_optimization"
  | "financial_insight" | "general";

export interface AiSuggestion {
  id: string;
  user_id?: string;
  household_id?: string;
  category: SuggestionCategory;
  title: string;
  description: string;
  reasoning?: string;
  suggested_action?: Record<string, unknown>;
  priority: number;
  confidence: number;
  status: SuggestionStatus;
  snoozed_until?: string;
  responded_at?: string;
  user_feedback?: string;
  source_observation_ids?: string[];
  created_at: string;
  expires_at?: string;
}

// ---- USER BOUNDARIES ----

export type BoundaryCategory =
  | "topic" | "comparison" | "notification" | "auto_adjust"
  | "timing" | "tone" | "data" | "general";

export interface UserBoundary {
  id: string;
  user_id: string;
  category: BoundaryCategory;
  boundary_key: string;
  boundary_value: Record<string, unknown>;
  reason?: string;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---- LIFE EVENTS & SEASONS ----

export type LifeEventImpact = "positive" | "negative" | "neutral" | "mixed";

export interface LifeEvent {
  id: string;
  user_id?: string;
  household_id?: string;
  title: string;
  description?: string;
  event_type: string;
  impact: LifeEventImpact;
  started_at: string;
  ended_at?: string;
  is_ongoing: boolean;
  affected_categories?: string[];
  xp_multiplier?: number;
  ai_notes?: string;
  created_at: string;
}

export interface Season {
  id: string;
  slug: string;
  name: string;
  description?: string;
  theme?: string;
  starts_at: string;
  ends_at: string;
  xp_multiplier_category?: string;
  xp_multiplier: number;
  is_active?: boolean;
}

// ---- ENGAGEMENT TRACKING ----

export interface EngagementEvent {
  id: string;
  user_id: string;
  event_type: string;
  feature?: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ---- NOTIFICATION INTELLIGENCE ----

export interface NotificationIntelligence {
  id: string;
  user_id: string;
  current_daily_cap: number;
  sent_today: number;
  avg_open_rate_7d?: number;
  preferred_batch_time?: string;
  fatigue_score?: number;
  last_adjusted_at?: string;
  channel_effectiveness?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---- PROGRESS HISTORY ----

export interface GoalProgressHistory {
  id: string;
  goal_id: string;
  progress_value: number;
  current_value?: number;
  note?: string;
  source: string;
  recorded_at: string;
}

// ---- FEEDBACK SYSTEM ----

export type FeedbackType = "bug" | "wish" | "feedback" | "question";
export type FeedbackStatus = "new" | "acknowledged" | "planned" | "in_progress" | "done" | "wont_fix";
export type FeedbackSeverity = "critical" | "major" | "minor" | "cosmetic";
export type FeedbackSource = "chat" | "discord" | "web_form" | "system";

export interface Feedback {
  id: string;
  household_id?: string;
  submitted_by: string;
  type: FeedbackType;
  body: string;
  page_url?: string;
  screenshot_url?: string;
  // AI-populated
  ai_classified_type?: string;
  ai_classified_severity?: FeedbackSeverity;
  ai_extracted_feature?: string;
  related_feedback_ids?: string[];
  // Triage
  status: FeedbackStatus;
  priority?: number;
  response?: string;
  response_by?: string;
  resolution_notified: boolean;
  // Metadata
  tags?: string[];
  conversation_id?: string;
  source: FeedbackSource;
  task_id?: string;
  created_at: string;
  updated_at: string;
  // Enriched
  submitter?: UserSummary | null;
  vote_count?: number;
  voted_by_me?: boolean;
}

export interface FeedbackVote {
  id: string;
  feedback_id: string;
  user_id: string;
  created_at: string;
}

// ---- HOUSEHOLD INVITES ----

export interface HouseholdInvite {
  id: string;
  household_id: string;
  invite_code: string;
  created_by: string;
  role: HouseholdRole;
  max_uses: number;
  times_used: number;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}
