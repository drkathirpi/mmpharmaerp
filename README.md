# MM Pharma ERP

ERPNext v15 + India Compliance (GST) + Webshop (customer ordering portal), deployed with
Coolify, replacing Marg ERP for MM Pharma Distributors.

```
apps.json                      which Frappe apps go into the image
.github/workflows/build.yml    builds the image on GitHub and pushes it to ghcr.io
docker-compose.yaml            the stack Coolify runs (ERPNext, MariaDB, Redis, daily backup)
.env.example                   the few settings you give Coolify
migration/convert_marg.py      Marg .xls exports  ->  clean CSVs + QA report
migration/load_erpnext.py      CSVs -> ERPNext (dry run by default)
```

No business data lives in this repo (`.gitignore` blocks `*.xls` and `*.csv`).

## 1. Build the image (once, then whenever apps.json changes)

Pushing to `main` starts the **build-image** workflow (Actions tab, ~20-40 min the first time).
It publishes `ghcr.io/drkathirpi/mmpharmaerp:v15`.

The package starts **private**. Either:
- GitHub -> your profile -> Packages -> `mmpharmaerp` -> Package settings -> change visibility to
  **Public** (the image holds only open-source ERPNext code, no data) - simplest; or
- keep it private and run `docker login ghcr.io` on the VPS with a read-packages token.

## 2. Deploy in Coolify

1. New Resource -> **Docker Compose** -> from this GitHub repo, branch `main`, file `/docker-compose.yaml`.
2. Environment variables: set `SITE_NAME` (e.g. `erp.drkathiravan.uk`). Coolify generates
   `SERVICE_PASSWORD_DB` and `SERVICE_PASSWORD_ADMIN` itself.
3. On the `frontend` service set the **domain** to the same hostname (DNS A record -> the VPS).
4. Deploy. First start takes several minutes (it creates the site and installs the three apps).
   Log in as `Administrator` with the generated `SERVICE_PASSWORD_ADMIN`.
5. Run the setup wizard: country India, currency INR, your company name, the financial year.

If the very first deploy fails half-way, delete the `sites` and `db-data` volumes before retrying
(a half-created site is not repaired automatically).

Upgrading: change `IMAGE_TAG`, redeploy, then in the backend container run
`bench --site YOUR_SITE migrate`.

## 3. Backups (do this before real data goes in)

The `backup` service writes database + files daily into the `sites` volume, keeping
`BACKUP_KEEP_DAYS`. That protects against mistakes, **not** against losing the server, so also copy
them off it, e.g. a nightly host cron using `rclone` on
`/var/lib/docker/volumes/<project>_sites/_data/<SITE_NAME>/private/backups`. Then restore one onto a
spare site and make sure it opens. An untested backup is not a backup.

## 4. Migrating from Marg

Export from Marg (as .xls): item master (HSN/GST), batch-wise stock, party master (trial balance),
bill-wise outstanding. Then, on any machine with Python and `pip install xlrd openpyxl`:

```
python3 migration/convert_marg.py  <folder-with-xls>  <output-folder>
```

Open `QA-report.xlsx` first - it lists every row that needs a human decision. Copy the CSVs into the
backend container and load them in order (always dry-run first, then add `--commit`):

```
cd /home/frappe/frappe-bench/sites
../env/bin/python /path/load_erpnext.py --site SITE --dir /path/csv --company "COMPANY NAME" --stage items
#   stages in order: items, customers, suppliers, cust-invoices, sup-invoices, unallocated
```

`unallocated` also needs `--cutover YYYY-MM-DD`. After each stage compare the totals printed against
the Marg report (customer outstanding must equal the Debtors report total).

`load_erpnext.py` has been written for ERPNext v15 but **not yet run against a live site** - rehearse
the whole sequence on a throwaway site first.

### What the converter does about known Marg quirks
- Marg repeats its column header on every printed page - those rows are dropped.
- The party "master" is really a trial balance: GST, cash, bank, P&L and round-off ledgers are
  separated into `ledgers_not_parties.csv` (these become opening balances in the chart of accounts,
  not Suppliers).
- Marg bill numbers restart every financial year, so numbers repeat across customers. Each opening
  invoice gets the FY appended (`A000063/24-25`); the original is kept in `marg_bill_no`.
- Open bills do not add up to the ledger balance when money was received/paid "on account".
  `opening_unallocated.csv` holds the difference per party so every balance ties to the trial balance.
- Positive stock is split into `opening_stock.csv` (in date) and `opening_stock_expired.csv`;
  negative stock is NOT importable and is listed in the QA report for a physical count.

### Not done yet
- **Opening stock**: Marg's stock export has quantities but no purchase rate or MRP, and ERPNext
  needs a valuation rate. Export batch-wise stock *with purchase rate and MRP* from Marg, and decide
  a batch-ID scheme for the ~20 batch numbers reused by different items.
- GSTINs, pincodes, and per-customer rates/schemes are not in the exports.
- Cut over on the first day of a month: re-export everything that day and re-run the converter.

### Deployment notes (learned the hard way)
- `SITE_NAME` must be set in Coolify to exactly your hostname (e.g. `erp.drkathiravan.uk`).
- frappe_docker's layered Containerfile reads the app list from a BuildKit **secret** `apps_json`
  (not the old `APPS_JSON_BASE64` build arg); the workflow passes `--secret=id=apps_json,src=apps.json`.
- `apps.json` must include `frappe/payments` (required by webshop / india-compliance).
- If `create-site` ever fails part-way, the next run says "already exists - nothing to do". Remove the
  half-built `sites/<site>` folder in the backend container AND drop its database from the db container
  (`DROP DATABASE`, name is in the error), then restart. Only do this on a site with no real data.
- After first login, finish the setup wizard (India / INR / company / FY); it also turns the scheduler on.
