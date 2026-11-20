#!/usr/bin/env python3
"""
Convert Marg's "Stock Valuation" report (batch-wise: Batch, M.R.P., Exp.Date, Stock, Rate, Value)
into ERPNext opening-stock CSVs.   python3 convert_stock_mrp.py <stock-valuation.xls> <items.csv> <outdir> [YYYY-MM-DD cutover]

Outputs (in outdir):
  opening_stock_v2.csv          in-date stock with positive quantity (item, batch, expiry, qty, rate, mrp)
  opening_stock_v2_expired.csv  positive stock whose expiry is on/before the cutover date (return to suppliers / write off)
  negative_stock_review.csv     Marg negative stock (sold before it was purchased) - NOT loaded, fix by hand
  batch_id_map.csv              ERPNext batch id <-> Marg batch number (ids are made unique when the same
                                Marg batch number is used by several items, or blank)
  stock_v2_report.txt           reconciliation against the Marg report total
"""
import calendar, collections, csv, datetime as dt, hashlib, os, re, sys
import xlrd

MON = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}


def norm(s):
    return re.sub(r"\s+", " ", str(s)).strip().upper()


def bstr(v):
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else str(v)
    return str(v).strip()


def num(x):
    x = str(x).strip().replace(",", "")
    if x in ("", "-"):
        return 0.0
    try:
        return float(x)
    except ValueError:
        return None


def expiry(s):
    m = re.match(r"\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\s*$", str(s))
    mo = MON.get(m.group(1).upper()) if m else None
    if not mo:
        return None
    y = int(m.group(2))
    return dt.date(y, mo, calendar.monthrange(y, mo)[1])


def split_pack(code):
    t = code.rsplit(" ", 1)
    return (t[0], t[1]) if len(t) == 2 else (code, "")


def main(xls, items_csv, out, cutover):
    os.makedirs(out, exist_ok=True)
    master = {r["item_code"]: r for r in csv.DictReader(open(items_csv, encoding="utf-8-sig"))}
    by_pack = collections.defaultdict(list)
    for code in master:
        n, p = split_pack(code)
        by_pack[p].append((n, code))

    def resolve(code):
        if code in master:
            return code, ""
        n, p = split_pack(code)
        c = sorted({k for nn, k in by_pack.get(p, []) if nn.startswith(n) or n.startswith(nn)})
        if len(c) == 1:
            return c[0], "prefix-match"
        return None, "ambiguous: " + " | ".join(c[:4]) if c else "no match"

    s = xlrd.open_workbook(xls).sheet_by_index(0)
    rows, problems, total_value, total_qty = [], [], 0.0, 0.0
    for r in range(s.nrows):
        v = s.row_values(r)
        m = re.match(r"^\s*(\d+)\s+(\S.*?)\s*$", str(v[0]))
        if not m or str(v[0]).strip().upper().startswith(("TOTAL", "S.NO")):
            continue
        mrp, qty, rate, val = num(v[2]), num(v[4]), num(v[5]), num(v[6])
        if None in (mrp, qty, rate, val):
            problems.append("unreadable numbers, row %d" % (r + 1))
            continue
        total_value += val
        total_qty += qty
        if qty == 0:
            continue
        code, how = resolve(norm(m.group(2)))
        if not code:
            problems.append("item %s: %s" % (norm(m.group(2)), how))
            continue
        rows.append(dict(item_code=code, batch=bstr(v[1]), mrp=mrp, expiry=expiry(v[3]), qty=qty, rate=rate, value=val))

    # merge duplicate item+batch lines (weighted rate)
    merged = collections.OrderedDict()
    for x in rows:
        k = (x["item_code"], x["batch"], x["qty"] > 0)
        if k in merged:
            y = merged[k]
            tot = y["qty"] + x["qty"]
            y["rate"] = (y["rate"] * y["qty"] + x["rate"] * x["qty"]) / tot if tot else y["rate"]
            y["qty"], y["value"] = tot, y["value"] + x["value"]
        else:
            merged[k] = dict(x)
    rows = list(merged.values())

    # batch ids: unique per item
    users = collections.defaultdict(set)
    for x in rows:
        if x["qty"] > 0:
            users[x["batch"]].add(x["item_code"])
    seen = collections.defaultdict(int)
    idmap = []
    for x in sorted((x for x in rows if x["qty"] > 0), key=lambda z: (z["batch"], z["item_code"])):
        b = x["batch"]
        if not b:
            bid = "NB-" + hashlib.md5(x["item_code"].encode()).hexdigest()[:6].upper()
        elif len(users[b]) == 1:
            bid = b
        else:
            seen[b] += 1
            bid = b if seen[b] == 1 else "%s~%d" % (b, seen[b])
        x["batch_id"] = bid
        idmap.append(dict(batch_id=bid, marg_batch=b, item_code=x["item_code"]))

    pos = [x for x in rows if x["qty"] > 0]
    neg = [x for x in rows if x["qty"] < 0]
    fields = ["item_code", "batch_no", "expiry_date", "qty", "uom", "valuation_rate", "mrp"]

    def line(x):
        return dict(item_code=x["item_code"], batch_no=x["batch_id"], expiry_date=x["expiry"].isoformat() if x["expiry"] else "",
                    qty=("%g" % x["qty"]), uom=master[x["item_code"]]["stock_uom"], valuation_rate="%.4f" % x["rate"], mrp="%.2f" % x["mrp"])

    def write(name, data, flds):
        with open(os.path.join(out, name), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=flds, extrasaction="ignore")
            w.writeheader()
            w.writerows(data)

    live = [x for x in pos if not x["expiry"] or x["expiry"] > cutover]
    dead = [x for x in pos if x["expiry"] and x["expiry"] <= cutover]
    write("opening_stock_v2.csv", [line(x) for x in live], fields)
    write("opening_stock_v2_expired.csv", [line(x) for x in dead], fields)
    write("negative_stock_review.csv", [dict(item_code=x["item_code"], marg_batch=x["batch"], qty=x["qty"], rate=x["rate"], value=x["value"]) for x in neg],
          ["item_code", "marg_batch", "qty", "rate", "value"])
    write("batch_id_map.csv", idmap, ["batch_id", "marg_batch", "item_code"])

    sv = lambda xs: sum(x["value"] for x in xs)
    rep = [
        "Marg report total: qty %.2f  value %.2f" % (total_qty, total_value),
        "In-date positive stock : %d lines, value %.2f" % (len(live), sv(live)),
        "Expired positive stock : %d lines, value %.2f" % (len(dead), sv(dead)),
        "Negative stock (not loaded): %d lines, value %.2f" % (len(neg), sv(neg)),
        "Check: in-date + expired + negative = %.2f (should equal Marg total %.2f unless lines were unmatched)" % (sv(live) + sv(dead) + sv(neg), total_value),
        "Lines without expiry (item will be set to no-expiry tracking): %d" % sum(1 for x in live if not x["expiry"]),
        "Zero purchase rate lines: %d   Zero MRP lines: %d" % (sum(1 for x in live + dead if x["rate"] == 0), sum(1 for x in live + dead if x["mrp"] == 0)),
        "Batch ids made unique (shared/blank Marg batch numbers): %d" % sum(1 for m in idmap if m["batch_id"] != m["marg_batch"]),
        "Problems: %d" % len(problems)] + ["  " + p for p in problems[:40]]
    open(os.path.join(out, "stock_v2_report.txt"), "w").write("\n".join(rep) + "\n")
    print("\n".join(rep))


if __name__ == "__main__":
    cut = dt.date.fromisoformat(sys.argv[4]) if len(sys.argv) > 4 else dt.date.today()
    main(sys.argv[1], sys.argv[2], sys.argv[3], cut)
