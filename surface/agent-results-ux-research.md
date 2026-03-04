# UX Research: Household Task Management App for Couples

**Research Date:** March 2, 2026
**Context:** Parker + Lenale household task management app (Starbase/Sisyphus project)
**Scope:** Best practices from consumer task apps, household/family chore apps, and onboarding patterns

---

## 1. What Makes Task Apps Sticky vs. Abandoned

### The Core Tension: Simplicity vs. Power

The single biggest predictor of whether someone sticks with a task app is **how well it matches their mental model**. The "perfect" task app is simply the one a user will actually use consistently.

**Apps that survive:**
- **Todoist** — Natural language input ("buy groceries Friday") removes friction from task creation. Cross-platform sync is flawless. AI breaks large tasks into subtasks without interrupting flow.
- **Things 3** — Opinionated minimalism. The interface "never feels cluttered." Magic Plus button lets you drag to insert tasks anywhere. Quick Entry captures thoughts without leaving your current app.
- **TickTick** — Bundles task lists, calendar views, Pomodoro timer, habit tracker, and Eisenhower Matrix — but the tradeoff is a denser, less refined interface.
- **Apple Reminders** — Wins through ecosystem integration and location-based reminders. Zero learning curve for Apple users.
- **Google Tasks** — Wins through Gmail/Calendar integration. One-screen workspace, minimal cognitive overhead.

**Apps that get abandoned:**
- Tools where adding a task requires navigating through 3+ menus
- Apps that force a single organizational paradigm (only lists, only boards, only calendars)
- Tools with stale data because the system is too complex to maintain
- Apps with sync delays (even 10-minute sync lag causes abandonment)

### Key Stickiness Patterns

| Pattern | Why It Works | Example |
|---------|-------------|---------|
| **Sub-second task capture** | If it's slower than a sticky note, people use sticky notes | Things 3 Quick Entry, Todoist NLP |
| **Flexible organization** | Different brains organize differently | Todoist (lists, labels, filters), TickTick (lists + calendar + matrix) |
| **Real-time sync** | Trust that the system is the source of truth | Todoist, Apple Reminders |
| **Daily planning nudge** | Prevents "forget to check the app" abandonment | Any.do "Plan My Day", TickTick daily review |
| **Visual completion feedback** | Dopamine hit for checking things off | Todoist confetti, Things 3 satisfying animations |

### Actionable Takeaways for Sisyphus

1. **Task creation must be faster than opening a notes app.** Target: 1 tap to open capture, type, done. No mandatory fields beyond the task name.
2. **Sync must be instant and trustworthy.** If Parker adds a task, Lenale should see it within seconds, not minutes.
3. **Offer multiple views without forcing one.** A simple list is the default, but allow filtering by person, room, or urgency.
4. **Include a daily nudge.** A morning "here's what's on deck today" notification or in-app prompt prevents abandonment.
5. **Make completion feel good.** Animation, sound, or visual feedback when tasks are checked off.

**Sources:**
- [Page Flows: Best Task Management Apps](https://pageflows.com/resources/best-task-management-apps/)
- [Todoist vs Things 3 vs TickTick](https://blog.rivva.app/p/todoist-vs-things-vs-ticktick)
- [What Drives Adoption in Task Management Apps](https://www.techwrix.com/task-management-apps-what-drives-adoption-efficiency-and-results/)
- [Zapier: Best To-Do List Apps 2026](https://zapier.com/blog/best-todo-list-apps/)
- [Finding Your Perfect Task Manager](https://www.oreateai.com/blog/finding-your-perfect-task-manager-beyond-the-sticky-note/48711e87b677b5ca5fc75b3b9acd0fab)

---

## 2. Household/Couples Task Management: What's Different

### The Fundamental Difference from Personal Productivity

Personal task apps optimize for **individual throughput**. Household task apps must solve a completely different problem: **equitable distribution of invisible labor between partners** — without creating a manager/employee dynamic.

The research is clear: the #1 problem isn't "we forget to do chores" — it's that **one partner becomes the household project manager**, tracking what needs doing, assigning it, and following up. This is the "mental load" problem, and it's the core UX challenge.

### Patterns from Household Apps

**Sweepy** (cleaning-focused)
- Rooms are the primary organizational unit, not generic lists
- Each task has a **visual dirtiness slider** (clean -> dirty) using color-coded bars (green to red)
- **Smart Schedule** auto-generates a daily cleaning list based on task urgency and your stated availability
- Pre-populated task templates per room (vacuum, dust surfaces, clean windows, etc.)
- Leaderboard creates friendly competition between household members
- Key insight: **visual progress bars** ("seeing those bars go from red to green") are more motivating than checkboxes

**Tody** (visual cleaning tracker)
- Abandons due dates entirely in favor of **"dirtiness indicators"** — color-coded bars showing how overdue each area is
- Highly effective for visual thinkers who find traditional checklists overwhelming
- Tasks are need-based, not schedule-based — clean what's dirtiest first

**OurHome** (family/kids-focused)
- Gamified point system for completing chores
- Organized by room with task assignment and recurring schedules
- Designed more for parent-child dynamics than couples

**Cozi** (family organizer)
- Color-coded shared family calendar + to-do lists + meal planning + grocery lists in one app
- Broad but shallow — tries to be everything for families

**Relia** (couples-specific, newer)
- Uses a **"pull" system** instead of "push" — instead of one partner assigning tasks, both partners claim tasks from a shared pile
- This is a critical UX distinction: it avoids the toxic "manager/helper" dynamic
- Reduces the feeling that one person is nagging the other

**Nipto** (couples gamification)
- Points-based system where the partner with the most points at week's end wins a reward (set by the couple)
- Transforms potential conflict into collaborative game

### The "Mental Load" Design Problem

Research shows mothers handle 71% of household mental load vs. 45% for fathers. 63% of women report doing more than their fair share. The invisible labor of **planning, scheduling, and remembering** is often heavier than the actual execution.

**Design solutions that address this:**

| Solution | How It Works | Why It Matters |
|----------|-------------|----------------|
| **Auto-rotation of recurring tasks** | App automatically alternates who's responsible | Removes the "assigner" role entirely |
| **Neutral notifications from the app** | "The bathroom needs cleaning" not "Lenale wants you to clean" | Shifts reminders from human nagging to system alerts |
| **Visible workload distribution** | Dashboard showing who's done what this week | Makes invisible labor visible without scorekeeping |
| **Pull-based task claiming** | Both partners see the shared pile and claim tasks | Eliminates manager/employee dynamic |
| **Joint setup required** | Both partners must participate in initial configuration | Prevents one person from "owning" the system |

### Critical Anti-Pattern: Scorekeeping

While fairness metrics are important, apps that feel like they're **keeping score in a negative way** can damage relationships. The UX must frame visibility as "transparency and balance" not "who's slacking."

One couple discovered through task tracking that their perceived 70/30 split was actually closer to 50/50 — the visibility alone sparked productive conversation. The design principle: **make invisible work visible, but frame it as partnership data, not a leaderboard**.

### Actionable Takeaways for Sisyphus

1. **Organize by room/area, not just flat lists.** Kitchen, bathroom, yard, errands, etc. Pre-populate rooms and common tasks.
2. **Use a pull-based model.** Show a shared task pool. Either Parker or Lenale claims tasks, rather than one person assigning to the other.
3. **Auto-rotate recurring tasks** so neither person becomes the permanent "rememberer."
4. **Notifications come from the app, never framed as from the other person.** "The kitchen floor is overdue" not "Parker wants you to mop."
5. **Show a simple weekly balance view** — not as a score, but as a shared snapshot. Frame it as "household stats" not "who did more."
6. **Support visual progress indicators** (Sweepy/Tody-style dirtiness bars) alongside checkboxes.
7. **Both Parker and Lenale must participate in onboarding setup.** Don't let one person configure everything alone.

**Sources:**
- [Best Chore Apps for Couples 2025 (Tidied)](https://www.tidied.app/blog/best-chore-apps-couples)
- [Tend Task: Relationship App for Couples Mental Load](https://tendtask.com/relationship-app-for-couples-mental-load-solution/)
- [BSIMB: Best Chore App for Couples](https://bsimbframes.com/blogs/bsimb-blogs/find-best-chore-app-for-your-family-couples)
- [Sweepy App Review (Apartment Therapy)](https://www.apartmenttherapy.com/sweepy-cleaning-app-review-37027260)
- [Mel Magazine: Could an App Help You Stop Fighting About Chores?](https://melmagazine.com/en-us/story/labor-of-love-app-household-chores-couples)
- [Productivity Parents: Household Chore Apps](https://productivityparents.com/10-best-apps-to-simplify-household-chores/)

---

## 3. Onboarding UX for Task Apps

### The Stakes

Bad onboarding causes up to **80% app abandonment**. Good onboarding increases retention by **50%**. For a two-person household app, you only get one shot with each user — if either Parker or Lenale bounces during setup, the whole system fails.

### Patterns That Work

**Progressive Disclosure (Critical)**
Don't show everything at once. Introduce features as they become relevant:
1. First: Create your first task (the core action)
2. Then: Introduce due dates and recurrence
3. Later: Show assignment, rooms, and balance views

**Pre-populated / Starter Content (Highly Recommended)**
- Sweepy pre-populates common cleaning tasks per room (vacuum, dust, clean windows)
- Basecamp pre-loads a sample project so the dashboard is never empty
- Dropbox pre-loads a "Getting Started" PDF that also demonstrates the core value prop
- Todoist historically started users with example tasks that taught features: "Swipe right to complete this task," "Swipe left to schedule this task"

The pattern: **avoid the blank screen entirely**. Seed the app with realistic household tasks so users can delete/modify rather than create from scratch.

**Interactive Walkthroughs (Better Than Tours)**
- Users click through passive tours without reading — modal tours fail
- Interactive walkthroughs that have users **perform real actions** (create a task, complete a task, assign a task) are significantly more effective
- "Learning by doing" with tooltips and highlighted UI elements

**Emotional Micro-Rewards**
- Todoist shows confetti animation when you complete onboarding
- Progress indicators during setup ("Step 2 of 4") reduce anxiety
- Celebrating the first completed task builds the habit loop

**What Todoist Specifically Did**
- Removed 2 steps from their onboarding to make it simpler
- Moved profile screen earlier in the flow
- For teams: drops users directly into the Workspace Overview after creating a team
- Pre-loaded example tasks that teach features through doing

### Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| Excessive form fields before showing value | Users bail before seeing the product |
| Dense text explanations | Nobody reads walls of text |
| Mandatory completion gates with no skip | Creates resentment, not engagement |
| Empty screens with no guidance | "Blank page anxiety" — users don't know where to start |
| Showing all features at once | Cognitive overload leads to abandonment |

### Actionable Takeaways for Sisyphus

1. **Pre-populate rooms and tasks.** On first launch, the app should already contain common household rooms (Kitchen, Bathroom, Bedroom, Living Room, Yard) with typical tasks per room. Users delete what doesn't apply rather than building from zero.
2. **Make the first action happen within 60 seconds.** The user should complete or claim their first task before they've spent a minute in the app.
3. **Use progressive disclosure.** Day 1: tasks and completion. Day 3: introduce recurrence and scheduling. Week 2: show balance/stats.
4. **Celebrate the first completion.** A small animation or visual reward when the first task is checked off.
5. **No mandatory signup before seeing value.** Let users interact with the pre-populated tasks before requiring account creation.
6. **Onboarding must involve both partners.** Invite flow should be dead simple — a share link or QR code, not an email invitation workflow.

**Sources:**
- [I Studied 200+ Onboarding Flows (DesignerUp)](https://designerup.co/blog/i-studied-the-ux-ui-of-over-200-onboarding-flows-heres-everything-i-learned/)
- [UX Onboarding Best Practices 2025 (UX Design Institute)](https://www.uxdesigninstitute.com/blog/ux-onboarding-best-practices-guide/)
- [Smashing Magazine: Empty States in User Onboarding](https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/)
- [Todoist Onboarding Redesign (Speaker Deck)](https://speakerdeck.com/fmerian/how-todoist-redesigned-its-user-onboarding)
- [Todoist Onboarding Flow (Page Flows)](https://pageflows.com/post/desktop-web/onboarding/todoist/)
- [NN/g: Designing Empty States](https://www.nngroup.com/articles/empty-state-interface-design/)
- [App Onboarding Design (Userpilot)](https://userpilot.com/blog/app-onboarding-design/)

---

## 4. Mobile-First Task Management Patterns

### Speed Is Everything

Research shows mobile workers using gesture-optimized apps complete tasks **20% faster** than those using traditional tap-based interfaces.

### Core Patterns

**Quick Capture**
- Things 3: Global Quick Entry accessible from anywhere on the device, auto-fills context (current webpage, email, etc.)
- Todoist: Natural language processing — "buy milk tomorrow" auto-parses the date
- Apple Reminders: Siri integration for zero-tap capture
- Pattern: **1 tap to open capture, type, done.** No mandatory fields, no menus.

**Swipe Actions**
- Todoist: Swipe right to complete, swipe left to schedule
- Apple Reminders: Swipe to delete/flag
- Best practice: **Limit to 1-2 swipe actions** to avoid accidental triggers
- Always provide **undo affordance** after destructive swipes
- Critical: swipe actions must be **taught during onboarding** — users won't discover hidden gestures on their own

**Thumb-Friendly Layout**
- Primary actions (add task, complete task) in the **bottom half of the screen** within thumb reach
- Floating Action Button (FAB) for task creation — positioned bottom-right for right-handed users
- Navigation via bottom tab bar, not hamburger menus
- **Minimum 48px tap targets** with adequate spacing to prevent mis-taps

**Bottom Navigation**
- Asana: Bottom nav for switching between tasks, projects, inbox
- Pattern: 3-5 tabs maximum. For a couples app: Today, All Tasks, Rooms, Stats

**Empty State as Onboarding**
- When a list is empty, show helpful guidance + clear CTA instead of a blank screen
- Dropbox pattern: empty folder prompts "Upload your first file"
- For tasks: "Nothing due today! Claim a task from the household pile?"

### Actionable Takeaways for Sisyphus

1. **FAB (Floating Action Button) for task creation.** Always visible, bottom-right, one tap to open capture.
2. **Swipe right to complete, swipe left to reschedule.** Teach these in onboarding with the pre-populated sample tasks.
3. **Bottom tab navigation:** Today | Tasks | Rooms | Us (stats/balance)
4. **All primary actions within thumb reach.** Nothing critical above the midpoint of the screen.
5. **Support voice/NLP capture.** "Clean the kitchen Saturday" should auto-parse room + date.
6. **Widget support** for both iOS and Android — glanceable "today's tasks" without opening the app.
7. **Undo on all destructive actions.** Snackbar with "Undo" for 5 seconds after completing/deleting.

**Sources:**
- [Mobile-First UX: Designing for Thumbs (DEV Community)](https://dev.to/prateekshaweb/mobile-first-ux-designing-for-thumbs-not-just-screens-339m)
- [Mobile Navigation UX Best Practices 2026](https://www.designstudiouiux.com/blog/mobile-navigation-ux/)
- [Designing Swipe Interactions (LogRocket)](https://blog.logrocket.com/ux-design/accessible-swipe-contextual-action-triggers/)
- [Improving Tap Targets for Better Mobile UX](https://blog.openreplay.com/improving-tap-targets-mobile-ux/)
- [Things 3 Gestures Support](https://culturedcode.com/things/support/articles/2803582/)
- [12 Mobile App Design Patterns That Boost Retention](https://procreator.design/blog/mobile-app-design-patterns-boost-retention/)

---

## 5. Why People Abandon Task Apps

### The Five Killers

**1. The Double Entry Problem**
When users must read information in one place (text, email, conversation) then manually re-enter it in the task app, adoption drops off after the first month. For a couples app: if Parker says "we need to fix the fence" in a text and then has to separately create a task in the app, it won't stick.

*Solution:* Share-sheet integration, voice capture, and ideally a way to turn conversations into tasks without re-typing.

**2. Notification Fatigue**
- ~65 notifications per day across all apps is the average for smartphone users
- 1-3 targeted notifications daily is optimal for engagement
- Excessive notifications → users disable all alerts → app becomes invisible → abandoned
- Over 70% of users want control over notification types and timing
- Research by Gloria Mark (UC Irvine): frequent interruptions double error rates and increase stress/anxiety

*Solution:* Default to minimal notifications. One morning summary ("3 tasks today") + deadline alerts only. Let users opt into more, never opt out of less.

**3. Complexity Creep**
- Notion's "infinite flexibility" becomes a part-time job to maintain
- Tools that require constant organizational overhead create guilt ("I should organize my task app") on top of guilt ("I should do my tasks")
- Feature-heavy apps create "artificial urgency and synthetic task lists that lead to guilt management rather than actual work"

*Solution:* Ship with strong defaults. Two views (Today and Everything), pre-set recurrence patterns, auto-generated schedules. Users can customize but shouldn't have to.

**4. Stale Data**
When the app doesn't reflect reality (overdue tasks pile up, completed tasks aren't cleared, the system gets out of sync), users lose trust and stop checking.

*Solution:* Auto-archive completed tasks. Gentle handling of overdue tasks (reschedule prompt, not guilt). Keep the "Today" view always fresh and actionable.

**5. The "Manager Tax"**
In couples apps specifically: if one person has to manage the system (add all tasks, assign them, follow up), that person burns out and abandons the app — taking the other person with them.

*Solution:* The pull-based model (both people claim from shared pool), auto-rotation, and app-generated reminders (not human-generated ones).

### The Abandonment Timeline

| Timeframe | What Happens | How to Prevent It |
|-----------|-------------|-------------------|
| Day 1 | User opens app, sees empty screen, closes it | Pre-populated content, instant value |
| Week 1 | Novelty wears off, forget to check the app | Daily nudge notification, widget |
| Month 1 | Double-entry friction builds up | Share-sheet capture, voice input, minimal required fields |
| Month 3 | Overdue tasks pile up, system feels broken | Auto-reschedule overdue tasks, "fresh start" option |
| Month 6+ | Life changes, app doesn't adapt | Flexible structure, easy to add/remove rooms and routines |

### Actionable Takeaways for Sisyphus

1. **Default to 1 notification per day per person.** Morning summary of today's tasks. Deadline alerts for time-sensitive items only.
2. **Let users control notification granularity** from day 1 — but start quiet, not loud.
3. **Auto-handle overdue tasks.** Don't let them pile up with red badges. Offer "reschedule to today" or "skip this week" with one tap.
4. **Keep the system self-maintaining.** Completed tasks auto-archive. Recurring tasks auto-regenerate. The Today view should never require manual curation.
5. **Provide a "fresh start" option.** If the system gets stale, one button to clear all overdue items and start clean — without guilt.
6. **Both partners should be able to add tasks equally easily.** No "admin" role, no setup asymmetry.

**Sources:**
- [Notification Frequency Impact on Engagement (Zigpoll)](https://www.zigpoll.com/content/how-do-varying-notification-frequencies-impact-user-engagement-and-perceived-value-within-mobile-project-management-applications)
- [Notification Fatigue Tanking Productivity (HR Dive)](https://www.hrdive.com/news/notification-fatigue-productivity-asana/623419/)
- [Why More Workplace Technology Creates Friction (Reworked)](https://www.reworked.co/digital-workplace/why-more-workplace-technology-creates-more-friction/)
- [Digital Fatigue: Fragmented Tools (Haiilo)](https://blog.haiilo.com/blog/digital-fatigue-how-fragmented-tools-are-hurting-your-team/)
- [Productivity Apps Fail Users (Find Articles)](https://www.findarticles.com/productivity-apps-fail-users-when-stakes-are-high/)
- [XDA: Deleted To-Do Apps for a Week](https://www.xda-developers.com/no-to-do-list-experiment/)

---

## 6. Conversational Onboarding Patterns

### What Conversational Onboarding Means

Instead of forms, settings screens, and configuration wizards, the app **talks to the user** — asking questions one at a time in a chat-like flow, and using the answers to seed the initial state of the app.

### Best-in-Class Examples

**Duolingo** (gold standard)
- Opens with the mascot (Duo the owl) and one question: "What language do you want to learn?"
- Follows with: "Why are you learning?" (travel, career, brain training, etc.)
- Then immediately drops you into a short proficiency test
- One question per screen, minimal cognitive load
- By the time you hit the main app, your experience is already personalized
- Key insight: **the user does something meaningful before they even create an account**

**Headspace** (wellness/habit)
- Opens by asking: "What do you want to improve?" (stress, sleep, focus)
- Immediately connects benefits to the user's stated goals
- Includes a short breathing exercise during onboarding — you experience value before setup is complete
- Pattern: **deliver value during the onboarding conversation itself, not after**

**Stream Chat (B2B pattern adapted for consumer)**
- Welcome Bot teaches features by having users actually use them
- Ghost text in empty input fields suggests what to type
- Just-in-time tips appear after first actions, not before
- Confetti/animations celebrate early actions
- Core principle: **get users into real interaction within 60 seconds**

### The Conversational Onboarding Flow for a Couples Task App

Based on the patterns above, here's a concrete flow:

```
[Screen 1 - Welcome]
"Hey! Let's set up your household in about 2 minutes."
[Continue]

[Screen 2 - Who's here?]
"Who lives in your household?"
[Text input: Name 1] [Text input: Name 2]
(Pre-fill if possible from device contacts or account name)

[Screen 3 - Your home]
"What rooms do you want to manage?"
[Pre-checked: Kitchen, Bathroom, Bedroom, Living Room]
[Unchecked: Yard, Garage, Laundry Room, Office, Kids Room]
[+ Add custom room]

[Screen 4 - Your tasks]
"Here are common tasks for your rooms. Uncheck anything that doesn't apply."
[Per room: pre-populated list of 4-6 common tasks with toggles]
Kitchen: Dishes, Wipe counters, Clean stovetop, Mop floor, Take out trash, Clean fridge
Bathroom: Clean toilet, Scrub shower, Wipe sink, Mop floor, Restock supplies

[Screen 5 - Frequency]
"How often do you want to tackle these?"
[Quick presets: "Tidy daily, deep clean weekly" / "Clean as needed" / "Let me customize"]

[Screen 6 - How you work together]
"How do you want to split tasks?"
[Take turns automatically / Claim from shared pool / Assign specific tasks to specific people]

[Screen 7 - Done!]
"Your household is set up! You have 23 tasks across 5 rooms."
[Show the app with pre-populated, personalized content]
[Confetti animation]
```

### Key Design Principles

1. **One question per screen.** Never show a form with 5 fields. Conversational = sequential.
2. **Pre-populate aggressively, let users subtract.** It's easier to uncheck 3 irrelevant tasks than to think of and type 15 relevant ones.
3. **Show progress.** "Step 3 of 6" or a progress bar reduces "how long will this take" anxiety.
4. **Deliver value during the conversation.** By the end of onboarding, the app should already be populated and useful — not empty and waiting.
5. **Skip option available** but not prominent. Let eager users skip to a pre-populated default state.
6. **AI follow-up potential.** If a user gives a vague answer, the app can ask a clarifying question — this feels natural in a conversational flow.

### Actionable Takeaways for Sisyphus

1. **Build a conversational onboarding flow, not a settings wizard.** One question per screen, chat-like tone.
2. **The onboarding IS the setup.** By the end of the conversation, the app is fully populated with rooms, tasks, frequencies, and assignment preferences.
3. **Pre-populate everything.** Rooms, tasks, frequencies — users subtract, not add.
4. **Target 6-8 screens, under 2 minutes.** Each screen should require at most one decision.
5. **Both partners go through a version of onboarding.** First person sets up the household. Second person gets a simplified flow: "Parker set up your household. Here's what's there — anything to add or change?"
6. **End with a populated, ready-to-use app** + celebration animation. The first "real" screen should never be empty.

**Sources:**
- [Duolingo Onboarding UX Breakdown (UserGuiding)](https://userguiding.com/blog/duolingo-onboarding-ux)
- [Duolingo Onboarding: Personalization & Gamification (AppCues)](https://goodux.appcues.com/blog/duolingo-user-onboarding)
- [Chat UX Best Practices: Onboarding to Re-Engagement (Stream)](https://getstream.io/blog/chat-ux/)
- [Conversational UX: From Chatbots to UX Design (Raw Studio)](https://raw.studio/blog/conversational-ux-from-chatbots-to-ux-design/)
- [Building Effective Onboarding: Lessons from Duolingo (Medium)](https://medium.com/@kotarina832/building-effective-onboarding-experiences-lessons-from-duolingo-7aa2af536020)
- [Sendbird: Top App Onboarding Examples](https://sendbird.com/blog/mobile-app-onboarding)

---

## Summary: Top 10 Design Decisions for Sisyphus

These are the highest-impact, most-supported-by-evidence design decisions, ranked by importance:

1. **Conversational onboarding that pre-populates the app.** Users subtract from smart defaults rather than building from zero. Both partners participate.

2. **Pull-based task model.** Shared pool of tasks where either person claims work, not one person assigning to the other. Eliminates the "household manager" dynamic.

3. **Sub-second task capture.** FAB + NLP input. "Mow the lawn Saturday" creates a task in the Yard room due Saturday with one interaction.

4. **Rooms as the primary organizational unit.** Kitchen, Bathroom, Yard — not abstract projects. Pre-populated with common tasks.

5. **Neutral, minimal notifications.** One morning summary per person. Reminders come from the app, never framed as from the partner. Default to quiet, let users opt into more.

6. **Visual progress indicators.** Sweepy/Tody-style visual bars showing room cleanliness, not just checkboxes. "The kitchen is at 60%" is more motivating than "3 of 7 tasks done."

7. **Auto-maintenance.** Recurring tasks regenerate automatically. Overdue tasks get a gentle reschedule prompt, not guilt. Completed tasks archive themselves. The Today view stays fresh without manual curation.

8. **Partnership framing, not scorekeeping.** Weekly balance view shows who did what, framed as "household stats" not competition. Visibility without judgment.

9. **Mobile-first with thumb-friendly layout.** Bottom nav, swipe actions (right=complete, left=reschedule), 48px+ tap targets, widget for glanceable daily view.

10. **Celebrate completions.** Small animations, progress bars moving, visual satisfaction. The dopamine hit of checking something off is the entire habit loop.
