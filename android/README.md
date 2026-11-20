# MM Pharma Android app

A small Android app (Capacitor) that talks to your ERPNext over its normal REST API. No server changes needed.

Screens: Home (sales, to-collect, overdue, stock value, expiring/expired), Stock (search by item / salt / company, batches with expiry and MRP, selling rates), Parties (outstanding and overdue, unpaid bills, call, new order), New order (saves a draft Sales Order with the rate ERPNext gives), Expiry (expired / 30-180 days, from the "Expiry Register" report).

Install: open https://github.com/drkathirpi/mmpharmaerp/releases/latest/download/MMPharma.apk on the phone, allow "install unknown apps" for the browser when asked. Updates install over the old app (fixed signing key).

Build: GitHub Actions builds it on every change under `android/` (see .github/workflows/android.yml). Local check of the UI: open `www/index.html` in a browser.

`debug.keystore` is the standard public Android debug key, kept only so updates install over older versions.
