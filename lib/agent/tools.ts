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
];
