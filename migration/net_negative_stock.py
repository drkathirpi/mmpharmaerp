#!/usr/bin/env python3
"""Net Marg's negative-stock lines against the same item's positive batches.

Marg lets you bill a batch that has no stock (purchase entered later, or billed under the wrong batch), so
an item can show -8 in one batch and +20 in another. Marg's item total is then really 12.
Rule per item: take the sum of its negative lines and remove that quantity from its in-date batches
(earliest expiry first), then from its expired batches. Whatever is still left over was sold with no purchase
ever entered -> stock stays 0 and the item goes on negative_unresolved.csv for the owner.

usage: net_negative_stock.py <dir with opening_stock_v2*.csv + negative_stock_review.csv> <outdir>
writes: stock_adjust.csv (in-date batches reduced), opening_stock_v2_expired_net.csv,
        negative_unresolved.csv, net_negative_report.txt
"""
import csv, sys, os, collections

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
rd = lambda f: list(csv.DictReader(open(os.path.join(src, f), encoding="utf-8-sig")))
ind, exp, neg = rd("opening_stock_v2.csv"), rd("opening_stock_v2_expired.csv"), rd("negative_stock_review.csv")

need = collections.defaultdict(float)
val = collections.defaultdict(float)
for r in neg:
    need[r["item_code"]] += -float(r["qty"])
    val[r["item_code"]] += float(r["value"])
by_in, by_ex = collections.defaultdict(list), collections.defaultdict(list)
for r in ind: by_in[r["item_code"]].append(r)
for r in exp: by_ex[r["item_code"]].append(r)
key = lambda r: r["expiry_date"] or "9999-12-31"

adjust, unresolved = [], []
used_in = used_ex = 0.0
used_in_v = used_ex_v = 0.0
newq = {}
for item, n in need.items():
    rem = n
    for pool, tag in ((by_in[item], "in"), (by_ex[item], "ex")):
        for r in sorted(pool, key=key):
            if rem <= 0: break
            q = float(r["qty"]); take = min(q, rem)
            if take <= 0: continue
            nq = q - take; rem -= take
            r["_new"] = nq
            v = take * float(r["valuation_rate"])
            if tag == "in":
                used_in += take; used_in_v += v
                adjust.append(dict(item_code=item, batch_no=r["batch_no"], old_qty=q, new_qty=nq, valuation_rate=r["valuation_rate"]))
            else:
                used_ex += take; used_ex_v += v
    if rem > 1e-9:
        unresolved.append(dict(item_code=item, unsold_qty=round(rem, 3), marg_negative_value=round(val[item], 2)))

w = lambda f, rows, cols: (lambda fh: (lambda cw: (cw.writeheader(), cw.writerows(rows)))(csv.DictWriter(fh, cols)))(open(os.path.join(out, f), "w", newline="", encoding="utf-8-sig"))
w("stock_adjust.csv", adjust, ["item_code", "batch_no", "old_qty", "new_qty", "valuation_rate"])
exp_net = []
for rows in by_ex.values():
    for r in rows:
        q = r.get("_new", float(r["qty"]))
        if q > 0:
            r = {k: v for k, v in r.items() if not k.startswith("_")}; r["qty"] = ("%g" % q); exp_net.append(r)
w("opening_stock_v2_expired_net.csv", exp_net, ["item_code", "batch_no", "expiry_date", "qty", "uom", "valuation_rate", "mrp"])
w("negative_unresolved.csv", unresolved, ["item_code", "unsold_qty", "marg_negative_value"])
ev = sum(float(r["qty"]) * float(r["valuation_rate"]) for r in exp_net)
open(os.path.join(out, "net_negative_report.txt"), "w").write(
    "items with negative lines: %d\nnetted against in-date batches: qty %g value %.2f (%d batch reductions)\n"
    "netted against expired batches: qty %g value %.2f\nexpired file after netting: %d lines value %.2f\n"
    "unresolved items (no purchase ever entered): %d  total qty %g\n" % (
        len(need), used_in, used_in_v, len(adjust), used_ex, used_ex_v, len(exp_net), ev, len(unresolved), sum(u["unsold_qty"] for u in unresolved)))
print(open(os.path.join(out, "net_negative_report.txt")).read())
