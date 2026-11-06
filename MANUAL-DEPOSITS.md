# Manual Telebirr deposits — five-step workflow

This update implements manual ETB deposit accounting. It does not turn on real-money bingo entry, cash prizes, or withdrawals. No payment provider automatically verifies transfers. All test balances remain separate.

## Player flow

1. In Telegram, open **Wallet**, enter an amount from 1 to 10,000 ETB, and create a deposit request.
2. The database assigns one receiving account, rotating among the three configured numbers. The player sees the assigned phone, registered holder name, amount and request ID. They must check the recipient name in Telebirr before sending once.
3. The player submits only the transaction reference. The request changes to **Pending administrator review**. A pasted SMS or screenshot never credits a balance.
4. A configured payment administrator checks the actual incoming transaction in the receiving account. They enter the received amount, receiving number and reference, and explicitly confirm that they checked receipt. All three values must match the request. Administrators cannot review their own deposits.
5. Approval commits the status, ETB wallet credit, balancing clearing-account entry and audit record in one SQLite transaction. Repeated approval does not add another credit. Rejection records a reason and adds no credit. Confirmed credits remain after restarting.

The ledger has no debit route for game spending or withdrawals in this update. Do not advertise paid bingo or cash-out as enabled by this deposit feature. Confirm your collection arrangement and paid-game operating authorization before accepting money for paid bingo.

## Private receiving-account file

`manual-accounts.json` is a private, ignored file prepared using the three phone numbers and holder names you supplied. It is included in the separately prepared deployment ZIP, but is not committed to GitHub. Keep it in `/home/<account>/pu-bingo/manual-accounts.json`, outside `public/` and outside the subdomain's public document root. Check the holder-name spelling against Telebirr before enabling instructions. The account names are shown to players making requests.

For future configuration, the file format is an array of exactly three objects:

```json
[
  {"phone":"<first receiving number>","name":"<registered holder name>"},
  {"phone":"<second receiving number>","name":"<registered holder name>"},
  {"phone":"<third receiving number>","name":"<registered holder name>"}
]
```

Alternatively set the JSON array directly in `MANUAL_TELEBIRR_ACCOUNTS` and leave the file variable blank. The three configured receiving numbers must be distinct valid Ethiopian numbers; holder names cannot be blank or placeholders. Assignment details are saved with each request, so future name/configuration changes do not rewrite old requests.

## cPanel activation

1. Upload and extract the new deployment ZIP directly into `/home/<account>/pu-bingo/`. Preserve your existing `data/` and private environment. The ZIP does not contain `.env` or player data.
2. Keep Node 24 selected. This feature uses Node's bundled `node:sqlite`; Node 22.16 or newer is required. Verify that your hosting's Node build includes the module before activation.
3. Open the updated Mini App → **My profile**. Copy the numeric **Telegram ID** of each trusted payment administrator. This is not a bot token or username. Use a separate player account when testing deposit review.
4. Generate a new private administrator key in your own terminal:

   ```text
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Do not paste the key into chat or commit it.

5. Add these environment variables to the cPanel Node application:

   | Name | Value |
   | --- | --- |
   | `MANUAL_DEPOSITS_ENABLED` | `true` |
   | `MANUAL_TELEBIRR_ACCOUNTS_FILE` | `manual-accounts.json` |
   | `MANUAL_ADMIN_IDS` | Trusted numeric Telegram IDs, comma-separated |
   | `MANUAL_ADMIN_KEY` | The new private key (at least 32 characters) |

   Keep `NODE_ENV=production`, the current bot token, permanent app URL, and your existing webhook settings. Do not change `.env.example` as a way to configure the live app; it is only a template.

6. Save and restart. Missing or invalid administrator/account settings stop activation. In Telegram, **Wallet** should display **ETB · MANUAL DEPOSITS**. Browser guests cannot use these endpoints, even in development.
7. Open **Administrator** in the footer using an allowed Telegram account, enter the new manual payment key, and load pending deposits. Both the Telegram allowlist and the private key are required. The test administrator key does not authorize real ETB reviews.

## Storage and operation

The database is `data/manual-payments.sqlite`, with SQLite WAL files in the same directory. Keep these outside the public document root on persistent local storage with working SQLite locking. It records user IDs, amount in integer hundredths, assigned receiver snapshots, references, statuses, reviewer identities and timestamps. Ledger and audit rows cannot be changed through update/delete SQL statements. Access to the server files must be restricted to the operator.

Make consistent backups with `node scripts/backup-manual-payments.mjs`. Backups are written under `data/backups/`; protect them like the original database. Restore and reconciliation procedures must be tested before relying on the service. Never remove `data/` during an update or replace real records with local test data.

Pending requests and references do not prove that a customer has paid. The administrator is responsible for confirming actual receipt, payer identity where needed, the exact recipient, and the amount in the receiving-account history. Duplicate/conflicting references are held for support review; the system does not automatically transfer a reference to another user. No refunds or outgoing payments are initiated by this feature.

The existing game engine and test wallets still require one long-lived application worker. This update does not make in-memory game state durable across Passenger workers. The manual deposit ledger itself uses database transactions and uniqueness constraints to protect against duplicate credits, including separate database connections.
