# PU Bingo

A mobile-first Telegram Mini App with solo practice, shared multiplayer rooms (up to 450 players), random 75-ball draws, automatic or manual card marking, server-validated wins, persistent play points, profiles, and leaderboard. No packages required. Points have no cash value.

## Run locally

Install Node.js 22.9 or newer, then:

```sh
npm start
```

Open http://localhost:3000. Browser guests work only outside production. On Windows where npm.ps1 is blocked, use `npm.cmd start`. Run tests with `npm.cmd test` or `node --test`.

## Connect Telegram

1. Create a bot with @BotFather using `/newbot`.
2. Copy `.env.example` to `.env`. Set `BOT_TOKEN`, `BOT_USERNAME`, and `NODE_ENV=production`. Never commit your token.
3. Host this Node server behind a public HTTPS domain. Use a host with a persistent disk, set its working directory to this repository, and persist the `data/` directory.
4. In @BotFather, configure the bot's Main Mini App and menu button to open your HTTPS URL.
5. Open the app from the bot. The server verifies Telegram's signed initData and rejects data older than an hour. Reopen the app to refresh an expired session.
6. Create a friends table and share its copied URL. Friends must open the link inside Telegram in production. Alternatively they can open your bot's Mini App and enter the room code.

Telegram reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

## Game rules

Five columns use standard B/I/N/G/O ranges, 1–75. The center is free. A server-owned deck draws every four seconds, even if clients disconnect. Complete two distinct lines on the same cartela (rows, columns, or diagonals) and claim bingo. First valid claim ends the game. Winner earns 100 play points; other players earn 10. Unclaimed games end after all 75 numbers have been displayed. Cards and claims are checked on the server; manual marking is a visual aid.

## Deployment boundaries

This is a single-instance application. Profiles persist to `data/profiles.json` using serialized atomic writes. Active rooms and authentication sessions are in memory and reset when the server restarts. Do not run multiple replicas without moving room state and sessions to a shared transactional store. Add ingress rate limiting and monitoring before a public high-traffic launch. Rooms expire after six hours of inactivity. No deposits, withdrawals, payments, or cash prizes are implemented.

The Telegram SDK is loaded from Telegram; fonts use Google Fonts with local fallbacks. No bot token reaches the browser. Browser preview identities are not verified and must remain disabled in production.

## Cartelas and repeating rounds

Each room offers 450 numbered cartelas. A cartela number identifies the same card throughout that room's lifetime. Each player has a selected preview card and may buy multiple cards during the 30-second selection period in test-stake rooms. Purchased cards stay reserved even when the preview changes. Taken cards are unavailable to others. The server locks cards when play starts.

Rounds start automatically after selection. Results show the winner's cartela for eight seconds, then another 30-second selection period opens automatically. Existing players keep their reserved cartela. B is gold, I green, N blue, G red, and O purple on cards and called numbers. The full 1–75 board tracks the shared draw.

## Test deposit walkthrough (no real money)

1. Copy `.env.example` to `.env` if you have not already. Keep `NODE_ENV=development`.
2. Set `TEST_ADMIN_KEY` to a random secret of at least 24 characters. Keep it private; never commit `.env`. Restart with `npm.cmd start`.
3. Open **Test wallet** in the app. Submit a fictional amount such as `20` and reference `TEST-ABC123`. Do not transfer money or enter real transaction details.
4. In the administrator section, enter your test admin key and load the queue. Approve or reject the request.
5. Refresh the wallet. Approved requests add fictional test units exactly once; rejected requests add nothing. References cannot be reused across players. Up to five pending requests per player are allowed.

Requests are saved separately to `data/test-deposits.json`, including player ID, amount in integer hundredths, reference, creation/review timestamps, status, and reviewing account ID. The displayed test balance includes approved deposits minus stakes, plus prizes and refunds. Admin keys are not stored in the browser. This is a single-process development simulator; all test-wallet endpoints are disabled in production. It is connected to simulated stakes and prizes, but not to Telebirr, real cash balances, or withdrawals. A real-money system needs a transactional ledger, verified provider integration, authorization for the business use, and production access controls.


## Simulated 20-per-cartela game

1. Start with `npm.cmd start` and open http://localhost:3000. A local ignored `.env` has been created with a random `TEST_ADMIN_KEY` if no environment file existed. Open that file privately to use its key in the test admin screen.
2. In **Test wallet**, submit a fictional deposit such as 100 with a unique TEST reference. Approve it using the test admin key. Never transfer real money for this simulator.
3. On **Play**, select **Join test-stake table**. Use a different browser for a second player, approve that player's fictional deposit, and join by room code.
4. Each player chooses a cartela and presses **Buy selected cartela ? 20 test units**. The purchase is explicit for each round. Duplicate requests do not charge again, and purchased cards remain owned for the round; select another available card to buy more.
5. At the end of selection, two or more paid players start the game. A lone paid player receives a full refund and the round moves to results. Unpaid room members can watch but cannot win the test prize.
6. The first valid bingo receives 80% of paid stakes. The house receives 20%. With 91 purchased cards, total 1,820, prize 1,456, house 364. There are up to 450 players with multiple purchased cartelas each per round (450 cards total per room).
7. The wallet lists stake debits, prizes, and refunds. The admin review screen also shows total house test earnings and settled-round count. No-winner rounds refund all stakes and generate no house earnings.
8. Results display for eight seconds, then another selection period opens. Rebuy manually to enter; keeping a selected card does not authorize another charge.

The simulator stores deposits and all stake/settlement records together using serialized atomic file replacement. Restart recovery refunds unfinished rounds because active games are held in memory. Settlements are idempotent. Failed settlement writes are retried by the game loop, and room mutations are serialized while purchases or settlements run. Only one server process may use this store. This file-based simulator must not be used as a real-money ledger.

### Still needed for a real launch

Verified Telebirr merchant integration and confirmation that the business use is accepted; the required paid-game operating authorization; a transactional production database and wallet ledger; durable game recovery; production administrator accounts; withdrawal and reconciliation processes; a configured operator/support contact; deployment and mobile Telegram testing. The current deposit and paid-cartela simulator is intentionally disabled in production. Free play remains available.


## Telegram bot chat (screenshot-style entry flow)

The bot chat is implemented in `bot.js` and runs in the same server process as the test ledger. It is disabled by default. No Telegram messages are sent unless you configure and enable it.

1. Create your own bot in @BotFather. Put its token in `.env` as `BOT_TOKEN`; keep it secret.
2. Host this server at a public HTTPS URL. Set `MINI_APP_URL` to that URL. Set an optional `SUPPORT_CONTACT` belonging to your service.
3. Set `BOT_POLLING=true` and restart. Use only one polling process for this bot and the ledger. Existing webhooks must be resolved before polling; the code checks and refuses to replace them automatically.
4. In a private chat with the bot, send `/start`. Share your own phone if desired, or use `/skip`. Phone sharing is not required for free or simulated play. Shared contacts belonging to other people are rejected.
5. Use `/play` to open the Mini App. In development, the **Play 20 ? TEST ONLY** button opens the shared simulated table, with late arrivals watching until they can buy in the next selection period. In production, the button opens free play.
6. Use `/deposit` for test-wallet instructions, `/balance` for test balance, `/rules` and `/privacy` for information, and `/help` for the command list. Pasted payment SMS messages never credit funds. Production does not offer deposits.
7. Use `/forgetphone` to remove the bot's stored phone record. The original Telegram contact message is separate and can be deleted in Telegram.

Optional phone numbers are stored in `data/bot-contacts.json`, keyed by Telegram ID. Polling progress is stored in `data/bot-offset.txt`. The bot does not save arbitrary chat messages, SMS content, or screenshots. It does not verify Telebirr payments. Configure the Mini App domain/menu in @BotFather as part of deployment.

Protocol reference: https://core.telegram.org/bots/api (KeyboardButton, InlineKeyboardButton, getUpdates).

## Number-call voice

In a game, tap **Voice OFF** to enable spoken calls. Each newly drawn number is announced once, using device speech synthesis. Amharic UI selects an installed Amharic voice when available; otherwise the app displays an English fallback notice. Availability and pronunciation depend on the browser, Telegram webview, OS voices, and sound settings. Speech starts muted, requires a user tap, and stops when leaving the game or muting. No recorded Amharic audio is bundled. Verify audio on the intended Telegram devices before launch.


Auto ON marks called numbers and submits a bingo claim when two distinct lines are complete. Auto OFF requires a manual claim. The app must stay open and connected for automatic claims. The server still validates membership, paid entry where applicable, and the two-line rule; the first valid claim received wins.

## Simulated withdrawals

Use **Test wallet → Request test withdrawal**. Enter an amount from 1 to 10,000 (up to two decimal places) and a fictional recipient such as `TEST-TELEBIRR`. Do not enter a real phone number. Submission reserves the amount from available balance. Repeated submission with the same request key returns the same request instead of reserving twice. Pending requests and holds survive restarts.

Enter the test admin key and load the review queue. The withdrawal section supports **Approve withdrawal**, then **Mark simulated paid** with a unique fictional reference such as `TEST-PAYOUT123`. No money is actually sent. Pending or approved requests can be rejected with a reason; this releases the hold exactly once. Completed requests cannot be reopened or rejected. Each transition records the reviewer and time. Users see available balance, reserved balance, and request history. Bot command `/withdraw` opens this test wallet.

Withdrawals, deposits, purchases, prizes, and refunds share the serialized simulation ledger, so concurrent spending cannot consume held units. Withdrawal endpoints are disabled in production. Real payout integrations, reconciliation, production administrator identity, and durable transactional storage are still required for actual cash-out.

## Simplified player navigation

The home screen shows a single main **Join game** action, test balance, free practice, and three short playing steps. Friends rooms are under **Play with friends**. The wallet has **Deposit**, **Withdraw**, and **History** tabs. Administrator controls are on a separate screen opened through **Administrator** in the footer (or `?screen=admin`); the private key is still required.

During card selection, use **Pick an available card** or find a cartela by number. A purchase bar shows the selected card and its price. Purchased cards remain green. The full 75-number board is collapsed until opened; it is hidden during selection. Countdown polling preserves form input when the game state has not changed. English and Amharic labels are provided for the main flow.
