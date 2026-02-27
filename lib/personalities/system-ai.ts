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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
