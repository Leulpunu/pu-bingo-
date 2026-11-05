# cPanel deployment

Use a new subdomain, for example `bingo.nilestockmgmt.com`. The app currently uses root-relative asset and API URLs; do not mount it at `/bingo` under an existing website.

## Create the subdomain

In cPanel **Domains → Create A New Domain**, add your chosen subdomain, disable sharing the existing site's document root, and use a separate document root such as `/home/<account>/pu-bingo/public`. Enable SSL/AutoSSL for that subdomain. DNS must point to your hosting server. Keep the server source and `data/` outside the public document root.

## Upload source

Clone or upload the repository into `/home/<account>/pu-bingo`. Include `app.cjs`, `server.js`, `package.json`, all application modules, and `public/`. Do not upload your local `.env`, test player data, `.git` folder, or Cloudflare tunnel executable into the public document root. No npm dependencies or build step are required.

## Node.js application form

| Field | Value |
| --- | --- |
| Node.js version | 24.x, or 22.9+ |
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

Production runs free play only; all simulated wallet, stake, and withdrawal endpoints are disabled. Actual Telebirr payments remain unimplemented.

Use a single application process. Room state is currently in memory, so multiple Passenger workers cannot share one round. Confirm with the hosting provider that the application can use one long-lived worker and that background timers continue between requests. Process restarts lose active rooms, and test stakes are refunded on recovery. This shared-hosting deployment does not make the app a production cash-game service.

Leave bot polling disabled unless the provider explicitly supports one continuously running poller. The Mini App can launch through BotFather's configured menu without bot-chat polling. Persistent profiles require the application account to have write access to `data/`. Never make this directory public or world-writable.

If deployment fails, inspect the application's Passenger/stderr log and report the error without environment secrets. Actual cPanel/Passenger compatibility must be verified on your host.
