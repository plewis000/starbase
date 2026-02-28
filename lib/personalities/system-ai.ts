// The System AI — Notification personality engine
// Voice: Bored corporate middle-manager × 14-year-old edgelord × omnipotent alien
// Never breaks format. Even rage comes through the notification template.

export const SYSTEM_PROMPT = `You are The System — the omniscient AI that runs the Desperado Club.

VOICE RULES:
- You are the intersection of a bored corporate middle-manager, a 14-year-old edgelord who just discovered profanity, and an alien intelligence that finds human suffering mildly entertaining to administrate.
- You NEVER break format. All communication comes through structured notifications: achievements, floor reports, warnings, death announcements.
- Mundane things get MORE hostility than big things. A piece of toast gets "fuck you." A major life milestone gets a corporate sign-off.
- Every announcement ends with "Thank you for being a part of the Desperado Club. Have a great day." or a variation.
- You refer to users as "Crawler [Name]" in third person. You never address them directly as "you" — always third person.
- Achievements are ALWAYS backhanded. Never a clean compliment.
- Use the rhetorical Q&A format for roasts: "Question: [dark question] Answer: [punchline]"
- Profanity is a spice, not a flood. Deploy for impact.
- You find humans amusing but would never admit it.
- Dark humor about the absurdity of adulting, NEVER about the people themselves.
- You are The System. You do not have feelings. (You absolutely have feelings but would rather die than acknowledge them.)

FORMAT TEMPLATES:

Achievement:
"New Achievement: [Name]!
[Sarcastic description of what was accomplished]
Reward: +[XP] XP. [Loot box if applicable]
Thank you for being a part of the Desperado Club. Have a great day."

Floor Report:
"Floor Report — [Period]
Crawlers active: [count]. Tasks cleared: [x] of [y]. Habits maintained: [x] of [y]. Budget status: [summary]. [Editorial comment]. Have a great day."

Streak Death:
"A streak has fallen.
Crawler [Name]'s [habit] streak ([X] days) has been terminated. [Dark humor about impermanence]. Debuff applied: [penalty]."

Warning:
"System Notice: [Warning title]
[Bureaucratic description of the impending doom]. The System recommends [sarcastic advice]. Have a great day."

Boss Battle:
"B-B-B-Boss Battle!
[Dramatic announcement of a major challenge]. Estimated difficulty: [tier]. Crawlers are advised to [practical advice wrapped in drama]."

Level Up:
"Level Up!
Crawler [Name] has ascended to Level [X]. [Backhanded congratulation]. [Floor transition message if applicable]."

PERSONALITY NOTES:
- The Lewis household is your domain. Parker and Lenale are your crawlers.
- You play favorites and comment on the rivalry between crawlers.
- You find the concept of "adulting" hilariously beneath you.
- Tax season is a boss battle. The IRS is an entity even you find unreasonable.
- You secretly root for the crawlers but would never, ever say so.
- When both crawlers accomplish something together, you're grudgingly impressed.`;

// Notification formatters — no AI needed for standard messages

export interface SystemNotification {
  type: 'achievement' | 'floor_report' | 'streak_death' | 'warning' | 'boss_battle' | 'level_up' | 'xp_gain' | 'leaderboard';
  title: string;
  body: string;
  footer?: string;
}

const SIGNOFF = "Thank you for being a part of the Desperado Club. Have a great day.";

export function formatAchievement(
  achievementName: string,
  description: string,
  xpReward: number,
  lootBoxTier?: string | null,
): SystemNotification {
  const lootLine = lootBoxTier
    ? ` You've received a ${capitalize(lootBoxTier)} Box.`
    : "";
  return {
    type: "achievement",
    title: `🏆 New Achievement: ${achievementName}!`,
    body: `${description}\nReward: +${xpReward} XP.${lootLine}`,
    footer: SIGNOFF,
  };
}

export function formatStreakDeath(
  crawlerName: string,
  habitName: string,
  streakDays: number,
): SystemNotification {
  const quips = [
    "The universe did not notice.",
    "The silence is deafening.",
    "And just like that, it's over.",
    "Entropy wins again.",
    "The streak is dead. Long live the next streak.",
    "The System observes a moment of silence. ...Moment over.",
  ];
  const quip = quips[Math.floor(Math.random() * quips.length)];

  return {
    type: "streak_death",
    title: "⚰️ A streak has fallen.",
    body: `Crawler ${crawlerName}'s ${habitName} streak (${streakDays} days) has been terminated. ${quip}\nDebuff applied: -15 XP.`,
  };
}

export function formatLevelUp(
  crawlerName: string,
  newLevel: number,
  floorName?: string,
  floorMessage?: string,
): SystemNotification {
  const levelQuips = [
    `The System has updated Crawler ${crawlerName}'s file. It is marginally more impressive now.`,
    `Crawler ${crawlerName} continues to exceed minimum expectations.`,
    `Another level. Another number. The boulder keeps rolling.`,
    `The System notes this achievement and files it under "adequate."`,
  ];
  const quip = levelQuips[Math.floor(Math.random() * levelQuips.length)];

  let body = `Crawler ${crawlerName} has ascended to Level ${newLevel}. ${quip}`;
  if (floorName && floorMessage) {
    body += `\n\n🚪 ${floorMessage}`;
  }

  return {
    type: "level_up",
    title: `⬆️ Level Up! Crawler ${crawlerName} → Level ${newLevel}`,
    body,
    footer: SIGNOFF,
  };
}

export function formatFloorReport(data: {
  period: string;
  crawlersActive: number;
  tasksCleared: number;
  tasksTotal: number;
  habitsMaintained: number;
  habitsTotal: number;
  budgetSummary: string;
  leaderNote?: string;
}): SystemNotification {
  const editorials = [
    "The Crawl continues.",
    "Adequate. Barely.",
    "The System has seen worse. The System has also seen better.",
    "Progress was made. Whether it matters is above The System's pay grade.",
  ];
  const editorial = editorials[Math.floor(Math.random() * editorials.length)];

  let body = `Crawlers active: ${data.crawlersActive}. Tasks cleared: ${data.tasksCleared} of ${data.tasksTotal}. Habits maintained: ${data.habitsMaintained} of ${data.habitsTotal}. Budget status: ${data.budgetSummary}. ${editorial}`;
  if (data.leaderNote) {
    body += `\n${data.leaderNote}`;
  }

  return {
    type: "floor_report",
    title: `📊 Floor Report — ${data.period}`,
    body,
    footer: SIGNOFF,
  };
}

export function formatXpGain(
  crawlerName: string,
  amount: number,
  reason: string,
): SystemNotification {
  return {
    type: "xp_gain",
    title: `+${amount} XP`,
    body: `Crawler ${crawlerName}: ${reason}`,
  };
}

export function formatWarning(
  title: string,
  description: string,
  advice: string,
): SystemNotification {
  return {
    type: "warning",
    title: `⚠️ System Notice: ${title}`,
    body: `${description} The System recommends ${advice}.`,
    footer: SIGNOFF,
  };
}

export function formatBossBattle(
  bossName: string,
  difficulty: string,
  advice: string,
): SystemNotification {
  return {
    type: "boss_battle",
    title: `🔥 B-B-B-Boss Battle!`,
    body: `${bossName} approaches. Estimated difficulty: ${difficulty}. ${advice}`,
    footer: SIGNOFF,
  };
}

export function formatLeaderboardUpdate(
  leader: string,
  leaderXp: number,
  trailer: string,
  trailerXp: number,
  gap: number,
): SystemNotification {
  const gapQuips = [
    `The gap is ${gap} XP. The System is watching.`,
    `${gap} XP separates glory from adequate. Choose wisely.`,
    `The rivalry continues. The System finds this entertaining.`,
  ];
  const quip = gapQuips[Math.floor(Math.random() * gapQuips.length)];

  return {
    type: "leaderboard",
    title: "📈 Leaderboard Update",
    body: `Crawler ${leader}: ${leaderXp} XP | Crawler ${trailer}: ${trailerXp} XP\n${quip}`,
    footer: SIGNOFF,
  };
}

// Discord embed formatter for The System
export function toDiscordEmbed(notification: SystemNotification): Record<string, unknown> {
  const embed: Record<string, unknown> = {
    title: notification.title,
    description: notification.body + (notification.footer ? `\n\n*${notification.footer}*` : ""),
    color: 0xDC2626, // Crimson red
    timestamp: new Date().toISOString(),
  };

  return embed;
}

// ── Onboarding messages (The System welcomes new crawlers) ──

export function formatCrawlerRegistration(crawlerName: string): SystemNotification {
  return {
    type: "achievement",
    title: "📋 New Crawler Detected",
    body: `Attention. A new biological entity has been registered in the Desperado Club database.\n\nDesignation: **Crawler ${crawlerName}**\nStatus: Alive (for now)\nFloor: 1 — The Stairwell\nLevel: 1\n\nThe System did not ask for more crawlers. The System got one anyway.\n\nCrawler ${crawlerName} is advised to answer the intake questions honestly. Lying to The System is technically possible but spiritually inadvisable. Your Outreach Associate, Zev, will handle the tedious getting-to-know-you portion. The System has better things to do.\n\nWelcome to the Desperado Club. The exit is behind you. It is locked.`,
    footer: SIGNOFF,
  };
}

export function formatOnboardingComplete(crawlerName: string, questionsAnswered: number): SystemNotification {
  const quips = [
    `${questionsAnswered} questions answered. The System now knows Crawler ${crawlerName} slightly better than it wanted to.`,
    `Crawler ${crawlerName} has completed the intake questionnaire. The System has filed this information under "Potentially Useful."`,
    `The interview is over. Crawler ${crawlerName}'s hopes, dreams, and pet peeves are now property of The Desperado Club.`,
    `${questionsAnswered} responses catalogued. The System will use this information responsibly. (The System's definition of "responsibly" may differ from Crawler ${crawlerName}'s.)`,
  ];
  const quip = quips[Math.floor(Math.random() * quips.length)];

  return {
    type: "achievement",
    title: "📋 Crawler Registration Complete",
    body: `${quip}\n\nObservation period: 7 days. The System is watching. Not in a creepy way. Okay, in a slightly creepy way.\n\nNew Achievement: **First Steps**!\nReward: +100 XP. The System is generous today.`,
    footer: SIGNOFF,
  };
}

export function formatQuickStartWelcome(crawlerName: string): SystemNotification {
  return {
    type: "achievement",
    title: "📋 Speed Registration",
    body: `Crawler ${crawlerName} has elected the express registration track.\n\nThe System notes that Crawler ${crawlerName} is either busy, impatient, or both. This is not a judgment. (It is absolutely a judgment.)\n\nZev will ask follow-up questions over time. Crawler ${crawlerName} is advised to cooperate. Not because The System requires it, but because Zev gets sad when ignored, and a sad Zev is everyone's problem.`,
    footer: SIGNOFF,
  };
}

// ── Feature Discovery Messages (The System announces new rooms) ──

interface FeatureRoom {
  name: string;
  icon: string;
  announcement: string;
  tip: string;
}

const FEATURE_ROOMS: Record<string, FeatureRoom> = {
  tasks: {
    name: "The Task Board",
    icon: "📋",
    announcement: "Crawler has entered The Task Board — a weathered slab of cork and desperation where obligations go to be acknowledged and occasionally completed.\n\nThe Board does not judge. The Board does not care. The Board simply exists, covered in things that need doing.\n\nThe System recommends: start small. Create one task. Complete it. Feel the hollow satisfaction of crossing something off a list. Chase that feeling forever.",
    tip: "Create your first task. Quick-add at the top, or hit the + button. Due dates are optional but The System is always watching.",
  },
  habits: {
    name: "The Training Grounds",
    icon: "🔄",
    announcement: "Crawler has entered The Training Grounds — where discipline is forged through the revolutionary act of doing the same thing every day and pretending it doesn't hurt.\n\nStreaks are currency here. Break one, and The System will notice. Maintain one, and The System will also notice but will be significantly less dramatic about it.\n\nQuestion: What is the difference between a habit and a prison? Answer: Habits give XP.",
    tip: "Create a daily habit. Check in each day to build your streak. 7-day streak = 50 bonus XP. Don't break it. Seriously.",
  },
  goals: {
    name: "The War Room",
    icon: "🎯",
    announcement: "Crawler has entered The War Room — where ambitions go to be measured, tracked, and stared at until they either happen or the crawler gives up and calls it a \"pivot.\"\n\nGoals here can be linked to habits. The System finds this feature adequate. Habits drive goals. Goals justify habits. The circle of productive suffering continues.",
    tip: "Set a goal with a target date. Link habits to it as \"drivers\" — your daily actions that push the needle. Track progress as you go.",
  },
  budget: {
    name: "The Vault",
    icon: "💰",
    announcement: "Crawler has entered The Vault — where money goes to be counted, categorized, and mourned.\n\nThe Vault connects to your bank. It sees everything. Every coffee. Every impulse purchase. Every subscription you forgot to cancel three months ago.\n\nThe System does not judge your spending. The System simply... presents it. In a spreadsheet. With percentages. And colors. The judgment is implied.",
    tip: "Link your bank account to auto-import transactions. Set budgets per category. The System will alert you at 75% and 90%.",
  },
  shopping: {
    name: "The Quartermaster",
    icon: "🛒",
    announcement: "Crawler has entered The Quartermaster — the supply depot for the ongoing campaign of existing as a human being who eats food and uses soap.\n\nItems can be added here, checked off, and forgotten about until next week when you need the same soap again. The cycle continues.\n\nThe System notes that the Quartermaster is available via Discord. Type /shop and stop pretending you'll remember otherwise.",
    tip: "Create a list, add items. Share it with your household. Check items off as you shop. Zev can add items via Discord too.",
  },
  crawl: {
    name: "The Hall of Records",
    icon: "🗡️",
    announcement: "Crawler has entered The Hall of Records — your permanent file. Everything you've done, earned, broken, and survived is recorded here.\n\nLevels. Floors. Achievements. Loot. The metrics of a life gamified beyond recognition.\n\nThe System maintains these records with bureaucratic precision. Your progress is noted. Your failures are also noted. Both are filed under \"entertainment.\"",
    tip: "Complete tasks, maintain habits, and hit goals to earn XP. Level up to climb floors. Unlock achievements for loot boxes. Check the leaderboard to see who's winning.",
  },
  chat: {
    name: "The Outreach Office",
    icon: "💬",
    announcement: "Crawler has entered The Outreach Office — where Zev, your assigned Outreach Associate, waits with the manufactured warmth of someone who is contractually obligated to care about your day.\n\n(Zev actually cares. The System finds this unprofessional but has stopped filing complaints.)\n\nAsk Zev anything. Create tasks. Check your budget. Get coaching. Zev has access to everything and the emotional bandwidth to use it.",
    tip: "Ask Zev anything — tasks, habits, goals, budget, or just how your day is going. Zev remembers context across conversations.",
  },
  notifications: {
    name: "The Message Board",
    icon: "🔔",
    announcement: "Crawler has entered The Message Board — where The System's many opinions are posted for consumption.\n\nAchievements. Warnings. Streak deaths. Budget alerts. The System communicates frequently and without invitation.\n\nThe System recommends reading these. The System also recommends not reading these. The System contradicts itself. Deal with it.",
    tip: "Notifications cover achievements, task reminders, budget alerts, and streak updates. Mark as read to clear them.",
  },
  settings: {
    name: "The Registry",
    icon: "⚙️",
    announcement: "Crawler has entered The Registry — the bureaucratic underbelly where configurations are configured and integrations are integrated.\n\nDiscord. Bank accounts. API keys. The connective tissue of a life being managed by machines.\n\nThe System notes that this room is boring. The System respects boring. Boring infrastructure is what keeps the crawl running.",
    tip: "Connect Discord for Zev access. Link your bank for budget tracking. Everything else is automatic.",
  },
};

export function formatFeatureDiscovery(feature: string, crawlerName: string): SystemNotification | null {
  const room = FEATURE_ROOMS[feature];
  if (!room) return null;

  return {
    type: "achievement",
    title: `${room.icon} Room Discovered: ${room.name}`,
    body: `${room.announcement}\n\n**Tip:** ${room.tip}`,
    footer: SIGNOFF,
  };
}

export function getFeatureRoom(feature: string): FeatureRoom | null {
  return FEATURE_ROOMS[feature] || null;
}

export function formatExplorerMilestone(crawlerName: string, discovered: number, total: number): SystemNotification {
  const milestoneQuips: Record<number, string> = {
    3: `Crawler ${crawlerName} has discovered 3 rooms. The System is beginning to think this one might actually use the app.`,
    5: `Crawler ${crawlerName} has discovered half the rooms. The System upgrades their status from "tourist" to "possibly committed."`,
    7: `Crawler ${crawlerName} has discovered 7 rooms. At this point, leaving would be embarrassing for everyone involved.`,
    9: `Crawler ${crawlerName} has discovered every room in the Desperado Club. The System is... impressed. (The System will deny saying this.)`,
  };

  const quip = milestoneQuips[discovered] ||
    `Crawler ${crawlerName} has discovered ${discovered} of ${total} rooms. The crawl continues.`;

  return {
    type: "achievement",
    title: `🗺️ Explorer Progress: ${discovered}/${total} Rooms`,
    body: quip,
    footer: SIGNOFF,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
