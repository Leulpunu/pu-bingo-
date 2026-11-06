# cPanel deployment

Use a new subdomain, for example `bingo.nilestockmgmt.com`. The app currently uses root-relative asset and API URLs; do not mount it at `/bingo` under an existing website.

## Create the subdomain

In cPanel **Domains → Create A New Domain**, add your chosen subdomain, disable sharing the existing site's document root, and use a separate document root such as `/home/<account>/pu-bingo/public`. Enable SSL/AutoSSL for that subdomain. DNS must point to your hosting server. Keep the server source and `data/` outside the public document root.

## Upload source

Clone or upload the repository into `/home/<account>/pu-bingo`. Include `app.cjs`, `server.js`, `package.json`, all application modules, and `public/`. Do not upload your local `.env`, test player data, `.git` folder, or Cloudflare tunnel executable into the public document root. No npm dependencies or build step are required.

## Node.js application form

| Field | Value |
| --- | --- |
| Node.js version | 24.x, or 22.16+ |
| Application mode | Production |
| Application root | `pu-bingo` (relative to the hosting account home) |
| Application URL | Your dedicated subdomain; leave the path blank |
| Application startup file | `app.cjs` |

Add environment variables privately in cPanel:

```text
BOT_TOKEN=<current token from BotFather>
BOT_USERNAME=pu_bingo_game_bot
MINI_APP_URL=https://bingo.nilestockmgmt.com
BOT_POLLING=false
SUPPORT_CONTACT=<your support contact>
```

The Production application mode sets `NODE_ENV=production`. Do not set a fixed `PORT` unless your provider requires one; Passenger manages routing. `app.cjs` bridges Passenger's CommonJS startup loader to this project's ES modules and sets the application working directory for persistent data.

Create/start the application. Open its HTTPS address and check the page and assets load. Open through Telegram to verify real signed authentication. Change both the **Main App** and **Menu Button** URLs in BotFather to the permanent HTTPS address.

## Scope and hosting checks

Production runs free play only; all simulated wallet, stake, and withdrawal endpoints are disabled. Optional manual ETB deposits require the separate configuration below; paid game entry and real cash withdrawals remain unimplemented.

Use a single application process. Room state is currently in memory, so multiple Passenger workers cannot share one round. Confirm with the hosting provider that the application can use one long-lived worker and that background timers continue between requests. Process restarts lose active rooms, and test stakes are refunded on recovery. This shared-hosting deployment does not make the app a production cash-game service.

Leave bot polling disabled unless the provider explicitly supports one continuously running poller. The Mini App can launch through BotFather's configured menu without bot-chat polling. Persistent profiles require the application account to have write access to `data/`. Never make this directory public or world-writable.

If deployment fails, inspect the application's Passenger/stderr log and report the error without environment secrets. Actual cPanel/Passenger compatibility must be verified on your host.

## Bot-chat menu and webhook

The command menu provides `/play`, `/balance`, `/deposit`, `/withdraw`, `/change_username`, `/agent`, and `/support`, plus rules, privacy, help, and phone removal. `/change_username` changes the game display name only. `/agent` provides an operator-configured contact; no agent commission or registration system is implemented.

To enable replies on cPanel:

1. Upload the updated source, including `telegram-webhook.js`, `bot.js`, `server.js`, `public/app.js`, and `scripts/configure-telegram.mjs`. Preserve the private environment and existing `data/`.
2. Keep `BOT_POLLING=false`. Set `MINI_APP_URL=https://bingo.nilestockmgmt.com`.
3. Add a private `BOT_WEBHOOK_SECRET` of 32–256 letters, digits, hyphens or underscores in cPanel. To generate a random value privately in your own terminal, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Do not send this secret in chat or commit it.
4. Set `SUPPORT_CONTACT` to your own support contact. Optionally set `AGENT_CONTACT` for agent enquiries.
5. Save and restart the application. `https://bingo.nilestockmgmt.com/api/telegram/webhook` should return `{"enabled":true}`. This page does not expose the secret.
6. On your local computer, privately set the same `BOT_WEBHOOK_SECRET`, permanent `MINI_APP_URL`, current `BOT_TOKEN`, and `BOT_USERNAME` in `.env`. Keep polling false. Then run:

   ```text
   node --env-file=.env scripts/configure-telegram.mjs --webhook
   ```

   This checks server readiness, publishes the command menu, and registers Telegram's webhook with its secret header. It does not send a chat message or transfer money. The menu button lists commands; `/play` supplies the Mini App launch button. BotFather's Main App remains available.

7. In a private chat with your bot, send `/start`, `/play`, and `/balance` to verify replies. Use `/change_username Your Name` to change the game display name. If replies fail, check cPanel's error log without sharing credentials.

Production replies explain that real deposits and withdrawals are unavailable and launch free play. Development replies are explicitly simulated; they never treat pasted payment messages as verified transactions. The receiver validates `X-Telegram-Bot-Api-Secret-Token`, serializes updates, and suppresses duplicate successful updates within the current worker's recent-update cache. That cache resets on restart; it is not a durable exactly-once financial processing system.


## Optional manual ETB deposit update

See [MANUAL-DEPOSITS.md](MANUAL-DEPOSITS.md) for the five-step manual deposit workflow, private receiving-account configuration, verified Telegram administrator access, and SQLite backup instructions. It is disabled until configured. Test units are never converted to ETB. This deposit feature does not enable real-money game spending or cash withdrawals.
