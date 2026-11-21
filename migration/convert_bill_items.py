#!/usr/bin/env python3
"""Marg 'Bill wise sales statement' (with items) -> bill_items.csv for the opening invoices.

    python3 convert_bill_items.py <marg_bill_wise.xls> <opening_invoices_customers.csv> <out_dir>

Writes bill_items.csv (invoice_no, marg_bill_no, posting_date, bill_value, items) and bill_items_report.txt.
items = one line per drug: name|paid_qty|free_qty|rate|expiry|batch   (lines joined by newline)
Only bills that are still open in ERPNext (present in opening_invoices_customers.csv) are written; the
bill number AND the date must both agree, because Marg restarts numbering every financial year.
"""
import csv, os, re, sys
import pandas as pd

BILL = re.compile(r"^[A-Z]{1,2}\d{6}$")
DATE = re.compile(r"^\d\d-\d\d-\d{4}$")
LINE = re.compile(r"^\s*(\d+)\s+(\d+|\*+)\s+(.*?)\s+([\d+]+)(?:\s+(\d+(?:\.\d+)?))?\s*$")


def parse(path):
    v = pd.read_excel(path, header=None)
    bills, cur, date = {}, None, None
    for _, r in v.iterrows():
        a, b, c = r[0], r[1], r[2]
        if isinstance(a, str):
            s = a.strip()
            if DATE.match(s):
                d, m, y = s.split("-"); date = "%s-%s-%s" % (y, m, d); continue
            if BILL.match(s):
                cur = s; bills[(s, date)] = dict(party=b, value=float(c), lines=[]); continue
        if cur and isinstance(b, str) and not pd.isna(b) and b.strip()[:1].isdigit():
            m = LINE.match(b)
            if not m:
                bills[(cur, date)].setdefault("bad", []).append(b); continue
            _, _, name, qty, rate = m.groups()
            paid, free = 0.0, 0.0
            if "+" in qty:
                p, f = qty.split("+", 1); paid = float(p or 0); free = float(f or 0)
            else:
                paid = float(qty)
            exp, batch = "", ""
            if isinstance(c, str) and c.strip():
                parts = c.split(None, 1); exp = parts[0]; batch = parts[1].strip() if len(parts) > 1 else ""
            bills[(cur, date)]["lines"].append((re.sub(r"\s+", " ", name).strip(), paid, free, float(rate or 0), exp, batch))
    return bills


def main():
    xls, opening, out = sys.argv[1:4]
    bills = parse(xls)
    os.makedirs(out, exist_ok=True)
    rows = list(csv.DictReader(open(opening, encoding="utf-8-sig")))
    done, missing, off, bad = 0, [], [], 0
    with open(os.path.join(out, "bill_items.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["invoice_no", "marg_bill_no", "posting_date", "bill_value", "items"])
        for o in rows:
            b = bills.get((o["marg_bill_no"], o["posting_date"]))
            if not b or not b["lines"]:
                missing.append(o); continue
            if abs(b["value"] - float(o["bill_value"])) > 1:
                off.append((o["invoice_no"], b["value"], o["bill_value"])); continue
            if b.get("bad"): bad += 1
            fmt = lambda x: ("%g" % x)
            items = "\n".join("|".join([n, fmt(p), fmt(fr), "%.2f" % r, e, bt]) for n, p, fr, r, e, bt in b["lines"])
            w.writerow([o["invoice_no"], o["marg_bill_no"], o["posting_date"], o["bill_value"], items]); done += 1
    nl = sum(len(b["lines"]) for b in bills.values())
    tot = sum(1 for _ in bills)
    rep = ["Marg bills read: %d (%d drug lines)" % (tot, nl),
           "Open ERPNext bills: %d" % len(rows),
           "Matched and written: %d" % done,
           "Not in this Marg export (older than the export period): %d" % len(missing),
           "Same bill number+date but different bill value (skipped): %d" % len(off),
           "Bills with an unreadable line: %d" % bad, ""]
    rep += ["older bills by month: " + ", ".join("%s=%d" % kv for kv in sorted(
        __import__("collections").Counter(m["posting_date"][:7] for m in missing).items()))]
    rep += ["", "value mismatches:"] + [str(x) for x in off[:30]]
    open(os.path.join(out, "bill_items_report.txt"), "w").write("\n".join(rep))
    print("\n".join(rep))


if __name__ == "__main__":
    main()
