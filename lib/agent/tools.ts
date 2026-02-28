import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Messages.Tool;

// All tool definitions for the Starbase agent
// Organized by domain. Each tool maps to an internal API call.

export const AGENT_TOOLS: Tool[] = [
  // ── TASKS ──
  {
    name: "list_tasks",
    description: "List tasks with optional filters. Returns task title, status, priority, due date, and assigned user.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by status name (e.g., 'todo', 'in_progress', 'done')" },
        priority: { type: "string", description: "Filter by priority name (e.g., 'high', 'medium', 'low')" },
        due_today: { type: "boolean", description: "Only show tasks due today" },
        search: { type: "string", description: "Search in title and description" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "create_task",
    description: "Create a new task. Returns the created task.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title (required)" },
        description: { type: "string", description: "Task description" },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
        priority: { type: "string", description: "Priority: 'high', 'medium', 'low', or priority config ID" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing task (change status, priority, due date, etc.)",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID (required)" },
        title: { type: "string", description: "New title" },
        status: { type: "string", description: "New status name or ID" },
        priority: { type: "string", description: "New priority name or ID" },
        due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
        description: { type: "string", description: "New description" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as complete",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID to complete (required)" },
      },
      required: ["task_id"],
    },
  },

  // ── HABITS ──
  {
    name: "list_habits",
    description: "List habits with streak info. Shows title, frequency, current streak, and status.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter: 'active', 'paused', 'retired'" },
        include_streaks: { type: "boolean", description: "Include streak calculations (default true)" },
      },
      required: [],
    },
  },
  {
    name: "check_in_habit",
    description: "Record a habit check-in for today (or a specific date)",
    input_schema: {
      type: "object" as const,
      properties: {
        habit_id: { type: "string", description: "Habit ID (required)" },
        date: { type: "string", description: "Check-in date YYYY-MM-DD (default: today)" },
        value: { type: "number", description: "Numeric value (e.g., minutes, reps)" },
        note: { type: "string", description: "Optional note" },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "create_habit",
    description: "Create a new habit to track",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Habit title (required)" },
        description: { type: "string", description: "Description" },
        frequency: { type: "string", description: "Frequency: 'daily', 'weekly', etc." },
        target_count: { type: "number", description: "Target per period (default 1)" },
      },
      required: ["title"],
    },
  },

  // ── GOALS ──
  {
    name: "list_goals",
    description: "List goals with progress. Shows title, status, progress percentage, and target date.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter: 'active', 'completed', 'paused', 'abandoned'" },
        include_progress: { type: "boolean", description: "Include progress calculation (default true)" },
      },
      required: [],
    },
  },
  {
    name: "update_goal_progress",
    description: "Update a goal's progress value",
    input_schema: {
      type: "object" as const,
      properties: {
        goal_id: { type: "string", description: "Goal ID (required)" },
        progress_value: { type: "number", description: "New progress value" },
        current_value: { type: "number", description: "Current value toward target" },
      },
      required: ["goal_id"],
    },
  },

  // ── SHOPPING ──
  {
    name: "list_shopping",
    description: "List all shopping lists with item counts",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_shopping_list",
    description: "Get a specific shopping list with all items",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "Shopping list ID (required)" },
      },
      required: ["list_id"],
    },
  },
  {
    name: "add_shopping_items",
    description: "Add items to a shopping list",
    input_schema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "Shopping list ID (required)" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "string" },
            },
            required: ["name"],
          },
          description: "Items to add",
        },
      },
      required: ["list_id", "items"],
    },
  },

  // ── BUDGET / FINANCE ──
  {
    name: "get_spending_summary",
    description: "Get spending summary for a period — total spending, income, net, breakdown by category with budget comparison",
    input_schema: {
      type: "object" as const,
      properties: {
        period: { type: "string", description: "Period: 'week', 'month', 'year' (default 'month')" },
        month: { type: "string", description: "Specific month YYYY-MM (for monthly period)" },
      },
      required: [],
    },
  },
  {
    name: "list_transactions",
    description: "List recent transactions with optional filters",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Search merchant name or description" },
        category: { type: "string", description: "Filter by category ID" },
        reviewed: { type: "boolean", description: "Filter by reviewed status" },
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "categorize_transaction",
    description: "Assign a category to a transaction and mark it as reviewed. Also creates a merchant rule for future auto-classification.",
    input_schema: {
      type: "object" as const,
      properties: {
        transaction_id: { type: "string", description: "Transaction ID (required)" },
        category_id: { type: "string", description: "Expense category ID (required)" },
      },
      required: ["transaction_id", "category_id"],
    },
  },
  {
    name: "get_budgets",
    description: "Get active budgets with current spending for each category",
    input_schema: {
      type: "object" as const,
      properties: {
        month: { type: "string", description: "Month YYYY-MM (default: current month)" },
      },
      required: [],
    },
  },
  {
    name: "create_budget",
    description: "Create or update a budget for a spending category",
    input_schema: {
      type: "object" as const,
      properties: {
        category_id: { type: "string", description: "Expense category ID (required)" },
        monthly_amount: { type: "number", description: "Monthly budget amount (required)" },
      },
      required: ["category_id", "monthly_amount"],
    },
  },

  // ── FEEDBACK ──
  {
    name: "submit_feedback",
    description: "Submit feedback, bug report, or feature request",
    input_schema: {
      type: "object" as const,
      properties: {
        body: { type: "string", description: "Feedback text (required)" },
        type: { type: "string", description: "Type: 'bug', 'feature_request', 'improvement', 'complaint'" },
        priority: { type: "string", description: "Priority: 'low', 'medium', 'high'" },
      },
      required: ["body"],
    },
  },

  // ── DASHBOARD ──
  {
    name: "get_dashboard",
    description: "Get a unified overview: today's tasks, active goals with progress, habit streaks, upcoming due dates",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ── NOTIFICATIONS ──
  {
    name: "get_notifications",
    description: "Get unread notifications",
    input_schema: {
      type: "object" as const,
      properties: {
        unread: { type: "boolean", description: "Only unread (default true)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
  },

  // ── CONFIG ──
  {
    name: "get_expense_categories",
    description: "List all expense categories (for budget and transaction classification)",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ── AI MEMORY (self-awareness) ──
  {
    name: "recall_observations",
    description: "Search your memory — retrieve things you've learned about the user (preferences, patterns, facts). Use this to personalize responses and avoid asking questions you already know the answer to.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "Filter by observation type (e.g., 'preference', 'routine', 'personality', 'relationship', 'goal', 'boundary')" },
        layer: { type: "string", description: "Filter by source: 'declared' (user said), 'observed' (you noticed), 'inferred' (you concluded)" },
        search: { type: "string", description: "Search in observation content" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "store_observation",
    description: "Remember something new about the user. Use this when you learn a preference, pattern, or important fact during conversation. Don't over-observe — only store things that will be useful later.",
    input_schema: {
      type: "object" as const,
      properties: {
        observation_type: { type: "string", description: "Type: 'preference', 'routine', 'personality', 'relationship', 'goal', 'boundary', 'context', 'feedback_pattern'" },
        content: { type: "string", description: "What you observed (required)" },
        confidence: { type: "number", description: "How confident (0-1, default 0.7)" },
        layer: { type: "string", description: "Source: 'declared' (user told you), 'observed' (from behavior), 'inferred' (your conclusion). Default: 'observed'" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorization" },
      },
      required: ["observation_type", "content"],
    },
  },
  {
    name: "get_user_model",
    description: "Get the structured user model — key attributes, preferences, and personality traits you've built up over time. Use for high-level understanding of who this person is.",
    input_schema: {
      type: "object" as const,
      properties: {
        attribute_key: { type: "string", description: "Filter by specific attribute key (e.g., 'communication_style', 'work_schedule')" },
      },
      required: [],
    },
  },

  // ── AI SUGGESTIONS ──
  {
    name: "get_suggestions",
    description: "Retrieve pending AI suggestions for the user. Check what's already been suggested before creating new ones.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter: 'pending', 'accepted', 'dismissed', 'snoozed' (default: 'pending')" },
        category: { type: "string", description: "Filter by category" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: [],
    },
  },
  {
    name: "create_suggestion",
    description: "Proactively suggest something to the user — a new habit, goal adjustment, schedule change, etc. Only suggest when you have evidence from observations or behavioral data.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Category: 'habit_adjustment', 'goal_suggestion', 'schedule_optimization', 'delegation_suggestion', 'financial_insight', 'general'" },
        title: { type: "string", description: "Short suggestion title (required)" },
        description: { type: "string", description: "Detailed description of what you're suggesting and why (required)" },
        reasoning: { type: "string", description: "Your reasoning based on observations/data" },
        priority: { type: "number", description: "Priority 1-10 (default 5)" },
        confidence: { type: "number", description: "How confident in this suggestion (0-1, default 0.6)" },
        source_observation_ids: { type: "array", items: { type: "string" }, description: "IDs of observations that led to this suggestion" },
      },
      required: ["category", "title", "description"],
    },
  },

  // ── BEHAVIORAL AGGREGATES ──
  {
    name: "get_behavioral_summary",
    description: "Get a behavioral summary for the user — activity patterns, productivity metrics, engagement trends. Use to understand user patterns before making suggestions.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "number", description: "Look back period in days (default 7, max 90)" },
      },
      required: [],
    },
  },

  // ── ONBOARDING ──
  {
    name: "get_onboarding_state",
    description: "Check a user's onboarding status — whether they've started, what phase they're in, what question is next, and if there are deferred questions to ask. ALWAYS check this for new or returning users before starting a conversation.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "start_onboarding",
    description: "Start the onboarding process for a new user. Use 'quick' track to get them active immediately (ask questions gradually later), or 'full' for the complete 10-question interview up front.",
    input_schema: {
      type: "object" as const,
      properties: {
        track: { type: "string", description: "Track: 'quick' (recommended — start fast, learn gradually) or 'full' (10-question interview)" },
        display_name: { type: "string", description: "User's preferred display name" },
      },
      required: ["track"],
    },
  },
  {
    name: "submit_onboarding_response",
    description: "Submit a user's answer to an onboarding interview question. The question_key must match the current question from get_onboarding_state. Pass the user's natural-language response — don't restructure it.",
    input_schema: {
      type: "object" as const,
      properties: {
        question_key: { type: "string", description: "The question_key of the question being answered (required)" },
        response: { type: "string", description: "The user's response in their own words (required)" },
      },
      required: ["question_key", "response"],
    },
  },
];
