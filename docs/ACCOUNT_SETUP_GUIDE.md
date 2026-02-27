# Starbase — Account Setup Guide

Step-by-step instructions for setting up all external service accounts needed for the agentic platform. Estimated total time: 35 minutes.

---

## 1. Claude API Account (~5 minutes)

This gives you programmatic access to Claude for the agent brain. Separate from your Max subscription.

### Steps

1. Go to **https://console.anthropic.com**
2. Click **Sign Up** (use your Google account / plewis000@gmail.com for simplicity)
3. Once logged in, you'll land on the Dashboard
4. Go to **Settings → Billing**
5. Click **Add Payment Method** — add a credit card
6. Set a **monthly spending limit** — recommend starting at $50/month (you'll likely use $15-30 but this gives headroom)
7. Go to **Settings → API Keys**
8. Click **Create Key**
9. Name it: `starbase-agent`
10. Copy the key immediately — you won't see it again
11. Store it somewhere safe (password manager)

### What you'll give me
- The API key (I'll store it as a Vercel environment variable, never in code)

### Verify it worked
- The Dashboard should show your organization with $0.00 usage
- The API key should start with `sk-ant-`

---

## 2. Google Cloud Project (~15 minutes)

This creates OAuth credentials so the agent can access Gmail, Calendar, and Contacts on behalf of each user. The MCP connectors you use in Claude Code are session-specific — the server-side agent needs its own OAuth flow.

### Steps

#### 2A. Create the project

1. Go to **https://console.cloud.google.com**
2. Sign in with **plewis000@gmail.com**
3. Click the project dropdown at the top left (might say "Select a project")
4. Click **New Project**
5. Project name: `starbase`
6. Organization: leave as default (or "No organization")
7. Click **Create**
8. Wait 10 seconds, then select the `starbase` project from the dropdown

#### 2B. Enable the APIs

9. Go to **APIs & Services → Library** (left sidebar)
10. Search for and enable each of these (click each one, then click "Enable"):
    - **Gmail API**
    - **Google Calendar API**
    - **People API** (this is Google Contacts)
11. Wait for each to enable before moving to the next

#### 2C. Configure the OAuth consent screen

12. Go to **APIs & Services → OAuth consent screen**
13. Select **External** (even though it's just for you — Internal requires Google Workspace)
14. Click **Create**
15. Fill in:
    - App name: `Starbase`
    - User support email: `plewis000@gmail.com`
    - Developer contact email: `plewis000@gmail.com`
16. Click **Save and Continue**
17. On the **Scopes** page, click **Add or Remove Scopes**
18. Search for and check these scopes:
    - `https://www.googleapis.com/auth/gmail.readonly` (read emails)
    - `https://www.googleapis.com/auth/gmail.compose` (draft emails)
    - `https://www.googleapis.com/auth/calendar` (read + write calendar)
    - `https://www.googleapis.com/auth/contacts.readonly` (read contacts)
19. Click **Update**, then **Save and Continue**
20. On the **Test users** page, click **Add Users**
21. Add: `plewis000@gmail.com`
22. Add Lenale's Gmail address too (so she can connect later)
23. Click **Save and Continue**, then **Back to Dashboard**

#### 2D. Create OAuth credentials

24. Go to **APIs & Services → Credentials**
25. Click **Create Credentials → OAuth client ID**
26. Application type: **Web application**
27. Name: `Starbase Web`
28. Under **Authorized redirect URIs**, add:
    - `https://starbase-green.vercel.app/auth/google/callback`
    - `http://localhost:3000/auth/google/callback` (for local development)
29. Click **Create**
30. A dialog shows your **Client ID** and **Client Secret**
31. Copy both and store them safely

### What you'll give me
- Google OAuth Client ID
- Google OAuth Client Secret

### Important notes
- The app will be in "Testing" mode initially, which means only test users you added (step 21-22) can authorize. This is fine — it's a personal app.
- To remove the "Testing" limitation later, you'd submit for Google verification. Not needed unless you add users beyond your household.
- These credentials are NOT the same as the MCP connectors in Claude Code. Those are session-scoped. These are for the server-side agent.

---

## 3. Discord Server + Bot (~10 minutes)

### 3A. Create the Discord server (skip if using an existing one)

1. Open Discord (app or browser)
2. Click the **+** button in the left sidebar
3. Choose **Create My Own**
4. Choose **For me and my friends**
5. Server name: whatever you and Lenale decide (e.g., "Lewis HQ")
6. Click **Create**
7. Create these channels (right-click the channel category → Create Channel):
    - `#command` (text) — main agent interaction
    - `#daily-brief` (text) — automated posts
    - `#shopping` (text) — shared shopping list
    - `#budget` (text) — spending updates
    - `#tasks` (text) — task notifications
    - `#goals` (text) — goal/habit check-ins
    - `#feedback` (text) — improvement requests
    - `#logs` (text) — agent activity log
8. Invite Lenale to the server

### 3B. Create the Discord bot application

9. Go to **https://discord.com/developers/applications**
10. Sign in with your Discord account
11. Click **New Application**
12. Name: `Starbase`
13. Click **Create**
14. Go to the **Bot** tab (left sidebar)
15. Click **Reset Token** (or "Add Bot" if prompted)
16. Copy the **Bot Token** — store it safely, you won't see it again
17. Under **Privileged Gateway Intents**, enable:
    - **Message Content Intent** (required — the bot needs to read messages)
    - **Server Members Intent** (optional but useful)
18. Under **Bot Permissions**, the bot needs:
    - Send Messages
    - Read Message History
    - Embed Links
    - Attach Files
    - Add Reactions
    - Use Slash Commands

### 3C. Invite the bot to your server

19. Go to the **OAuth2** tab (left sidebar)
20. Under **OAuth2 URL Generator**, check:
    - Scopes: `bot`, `applications.commands`
    - Bot Permissions: same as step 18 (Send Messages, Read Message History, Embed Links, Attach Files, Add Reactions, Use Slash Commands)
21. Copy the generated URL at the bottom
22. Open the URL in your browser
23. Select your server from the dropdown
24. Click **Authorize**
25. The bot should now appear in your server's member list (offline until we deploy the code)

### What you'll give me
- Discord Bot Token
- Discord Server ID (right-click server name → Copy Server ID; enable Developer Mode in Discord settings if you don't see this option)
- Channel IDs for each channel (right-click channel → Copy Channel ID)

### Enable Developer Mode (if not already on)
- Discord Settings → Advanced → Developer Mode → toggle ON
- This lets you right-click to copy IDs

---

## 4. Plaid Account (~5 minutes)

### Steps

1. Go to **https://dashboard.plaid.com/signup**
2. Sign up with your email (plewis000@gmail.com)
3. Verify your email
4. Once logged in, you'll be in **Sandbox** mode by default (this is what we want)
5. Go to **Developers → Keys**
6. You'll see three values:
    - **Client ID**
    - **Sandbox Secret** (for testing with fake bank data)
    - **Development Secret** (grayed out until you apply — for real bank data)
7. Copy the **Client ID** and **Sandbox Secret**

### What you'll give me
- Plaid Client ID
- Plaid Sandbox Secret

### Upgrading to real bank data later
- When ready to link real accounts, go to **Account → Request Development Access**
- Plaid reviews the request (usually approved in 1-2 business days for personal projects)
- Once approved, the Development Secret becomes active
- We swap the Sandbox Secret for the Development Secret in the environment variables
- No code changes needed — just a key swap

---

## Summary: What I Need From You

Once you've completed all four setups, give me these values (I'll store them all as Vercel environment variables):

| Key | From | Example Format |
|-----|------|---------------|
| `ANTHROPIC_API_KEY` | Claude Console | `sk-ant-api03-...` |
| `GOOGLE_CLIENT_ID` | Google Cloud | `123456-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud | `GOCSPX-...` |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal | `MTIz...` |
| `DISCORD_SERVER_ID` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_COMMAND` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_BRIEF` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_SHOPPING` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_BUDGET` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_TASKS` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_GOALS` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_FEEDBACK` | Discord (right-click) | `1234567890` |
| `DISCORD_CHANNEL_LOGS` | Discord (right-click) | `1234567890` |
| `PLAID_CLIENT_ID` | Plaid Dashboard | `6543...` |
| `PLAID_SECRET` | Plaid Dashboard | `abc123...` |
| `PLAID_ENV` | (I set this) | `sandbox` → `development` later |

**Do NOT send these in plain text in chat.** When you have them ready, either:
- Add them directly in the Vercel dashboard (Settings → Environment Variables)
- Or tell me you have them ready and I'll walk you through adding them to Vercel

---

*This guide was generated for the Starbase agentic platform. Last updated: 2026-02-26.*
