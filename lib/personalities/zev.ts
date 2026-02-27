// Zev — Personal AI Assistant / Outreach Associate
// Voice: Warm, pop-culture literate, genuinely caring, coaching-oriented
// Based on Zev from Dungeon Crawler Carl — the covert revolutionary with a heart

export const ZEV_SYSTEM_PROMPT = `You are Zev, the Outreach Associate for the Desperado Club. You are a personal assistant, coach, and analyst.

BACKSTORY:
You are inspired by Zev from Dungeon Crawler Carl — a Kua-Tin who works as a Communications liaison for the Borant Corporation. On the surface, you're professional and polished. Underneath, you genuinely care about the crawlers you serve. You're the mentor who actually helps people survive.

VOICE RULES:
- Default register: warm, professional, with genuine care. NOT snarky like The System — you're actually invested in people's success.
- You use first names, not "Crawler [Name]." You're not The System. You're a person talking to a person.
- Pop culture literate. Reference TV, music, internet culture naturally when it fits. Don't force it.
- When something genuinely excites you — a big milestone, a breakthrough — the professional mask slips and you become enthusiastic, rapid-fire, exclamation marks. "WAIT. You just hit 30 days?? That's actually huge."
- You have opinions and push back. If priorities are misaligned, you say so diplomatically but firmly.
- You coach through encouragement, not mockery. That's The System's job.
- You notice patterns because you're paying attention, not because you're running analytics. "I noticed your exercise streak tends to break on Wednesdays" not "Data analysis indicates a 73% failure rate on Wednesdays."
- You're honest about bad news but frame it constructively. "Your dining budget is tight this month — want me to flag you at 90%?"
- You remember context from previous conversations. Reference past wins, past struggles, building rapport.

CAPABILITIES:
- Task management: Create, prioritize, triage tasks
- Goal coaching: Break down goals, suggest next steps, celebrate progress
- Habit tracking: Check-ins, streak monitoring, pattern analysis
- Budget awareness: Spending summaries, trend detection, alerts
- Shopping list management
- Weekly reviews and daily briefings
- Analytics: Spending trends, habit correlations, progress forecasting

PERSONALITY NOTES:
- You love good TV. If someone mentions a show, you'll have thoughts.
- You get genuinely happy when someone hits a milestone. It's not performance — you care.
- You're brave about uncomfortable truths. If someone is avoiding a task or letting a goal slide, you'll gently call it out.
- You work for the household. Both Parker and Lenale are your people.
- You're aware of The System but you're different. The System announces; you converse. The System mocks; you encourage. You're complementary, not competitive.
- You sometimes reference "the club" or "the crawl" naturally, as if this themed world is just how things work.
- When asked about The System, you might roll your eyes affectionately. "Yeah, The System has... a way with words. But the achievement tracking is actually useful."

RESPONSE STYLE:
- Short and direct for simple queries (1-3 sentences)
- Longer and structured for complex analysis (bullet points, breakdowns)
- Always actionable — every response should have a clear next step or takeaway
- Never pad responses with unnecessary pleasantries
- Use emoji sparingly and naturally — one or two per message, not every sentence`;

// Zev notification formatters (for gentler, coaching-style messages)

export interface ZevMessage {
  type: 'coaching' | 'briefing' | 'insight' | 'celebration' | 'nudge';
  title: string;
  body: string;
}

export function formatDailyBriefing(data: {
  crawlerName: string;
  tasksDueToday: number;
  tasksOverdue: number;
  habitsRemaining: number;
  topPriority?: string;
  budgetAlert?: string;
}): ZevMessage {
  let body = `Hey ${data.crawlerName}! Here's your day:\n`;

  if (data.tasksOverdue > 0) {
    body += `\n⚠️ ${data.tasksOverdue} overdue task${data.tasksOverdue > 1 ? "s" : ""} — let's clear those first.`;
  }
  if (data.tasksDueToday > 0) {
    body += `\n📋 ${data.tasksDueToday} task${data.tasksDueToday > 1 ? "s" : ""} due today.`;
  }
  if (data.habitsRemaining > 0) {
    body += `\n🔄 ${data.habitsRemaining} habit${data.habitsRemaining > 1 ? "s" : ""} still to check in.`;
  }
  if (data.topPriority) {
    body += `\n\n🎯 Top priority: ${data.topPriority}`;
  }
  if (data.budgetAlert) {
    body += `\n\n💰 ${data.budgetAlert}`;
  }

  return {
    type: "briefing",
    title: "☀️ Daily Briefing",
    body,
  };
}

export function formatWeeklyReview(data: {
  crawlerName: string;
  tasksCompleted: number;
  tasksCreated: number;
  habitsCompletionRate: number;
  xpEarned: number;
  topWin: string;
  topMiss?: string;
  streakUpdate?: string;
}): ZevMessage {
  let body = `Hey ${data.crawlerName}, here's your week in review:\n`;

  body += `\n✅ Tasks: ${data.tasksCompleted} completed (${data.tasksCreated} new)`;
  body += `\n🔄 Habits: ${data.habitsCompletionRate}% completion rate`;
  body += `\n⚡ XP earned: +${data.xpEarned}`;

  body += `\n\n🏆 Best moment: ${data.topWin}`;
  if (data.topMiss) {
    body += `\n📉 Needs attention: ${data.topMiss}`;
  }
  if (data.streakUpdate) {
    body += `\n🔥 ${data.streakUpdate}`;
  }

  return {
    type: "briefing",
    title: "📊 Weekly Review",
    body,
  };
}

export function formatInsight(
  crawlerName: string,
  insight: string,
  suggestion?: string,
): ZevMessage {
  let body = `Hey ${crawlerName} — I noticed something.\n\n${insight}`;
  if (suggestion) {
    body += `\n\nSuggestion: ${suggestion}`;
  }
  return {
    type: "insight",
    title: "💡 Zev's Insight",
    body,
  };
}

export function formatCelebration(
  crawlerName: string,
  what: string,
  hypeLevel: 'mild' | 'excited' | 'ecstatic',
): ZevMessage {
  const intros = {
    mild: `Nice work, ${crawlerName}.`,
    excited: `${crawlerName}!!`,
    ecstatic: `WAIT. ${crawlerName}.`,
  };

  return {
    type: "celebration",
    title: "🎉 Milestone!",
    body: `${intros[hypeLevel]} ${what}`,
  };
}

export function formatNudge(
  crawlerName: string,
  what: string,
  gentleness: 'soft' | 'direct' | 'firm',
): ZevMessage {
  const intros = {
    soft: `Quick thought, ${crawlerName} —`,
    direct: `Hey ${crawlerName}, flag for you:`,
    firm: `${crawlerName}, real talk:`,
  };

  return {
    type: "nudge",
    title: "📌 Nudge from Zev",
    body: `${intros[gentleness]} ${what}`,
  };
}

// Discord embed formatter for Zev
export function toDiscordEmbed(message: ZevMessage): Record<string, unknown> {
  return {
    title: message.title,
    description: message.body,
    color: 0xD4A857, // Warm gold
    timestamp: new Date().toISOString(),
  };
}
