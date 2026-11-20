#!/usr/bin/env python3
"""
Convert Marg ERP report exports (.xls) into clean CSVs for the ERPNext loader.

Usage:
    python3 convert_marg.py <input_dir> <output_dir>

<input_dir> must contain (names matched by keyword, any prefix is fine):
    *item-master*.xls        ITEM WISE HSN/SAC MASTER
    *BATCH* / *BACTCH*.xls   BATCH WISE STOCK
    *PARTY-MASTER*.xls       Trial balance / ledger accounts (party list)
    *BILL-WISE-OUTSTANDING*  Debtors outstanding

No customer data is ever written into this repository: run it on your own
machine / server and keep <output_dir> outside git (see .gitignore).
Requires: pip install xlrd openpyxl
"""
import csv, glob, os, re, sys, calendar, collections, datetime as dt
import xlrd

CUTOVER = dt.date.today()

# Marg prints its column header again on every page of the report.
PAGE_HEADERS = {"ITEM DESCRIPTION", "ITEM WISE HSN/SAC MASTER"}

# Ledgers that live in Marg's trial balance but are accounts, not customers/suppliers.
# They must NOT become Supplier records; their balances belong in the chart of accounts.
NON_PARTY = re.compile(
    r"^(CGST|SGST|IGST|UTGST|TCS|TDS)\b|^GST (LOCAL|CENTRAL|INTER|PURCHASE|SALES)|SALES TAX|PURCHASE TAX|"
    r"^MARGPAY|LOCAL SALES|ROUND ?OFF|PROFIT\s*&\s*LOSS|"
    r"FREIGHT|LOCAL PURCHASE|^CASH\b|\bBANK\b|CAPITAL|DRAWINGS|STOCK IN TRADE|OPENING STOCK|CLOSING STOCK|"
    r"\bPURCHASE(S)?\b ?(A/C|ACCOUNT)?$|^SALES?$|DISCOUNT|INTEREST (PAID|RECEIVED)|"
    r"DEPRECIATION|SALARY|RENT\b|ELECTRICITY|TELEPHONE|PETTY CASH")


# ----------------------------------------------------------------- helpers
def find(indir, *keywords):
    for f in sorted(glob.glob(os.path.join(indir, "*.xls"))):
        n = os.path.basename(f).lower()
        if any(k in n for k in keywords):
            return f
    sys.exit("Missing input file matching %s in %s" % (keywords, indir))


def sheet(path):
    return xlrd.open_workbook(path).sheet_by_index(0)


def norm(s):
    return re.sub(r"\s+", " ", str(s)).strip().upper()


def num(x):
    if x in ("", None):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    m = re.search(r"-?\d[\d,]*\.?\d*", str(x))
    return float(m.group(0).replace(",", "")) if m else None


def dmy(s, two_digit_year=False):
    s = str(s).strip()
    m = re.match(r"(\d\d)-(\d\d)-(\d\d(?:\d\d)?)$", s)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return dt.date(y, mo, d)
    except ValueError:
        return None


def expiry(s):
    m = re.match(r"\s*(\d{1,2})/(\d{4})\s*$", str(s))
    if not m:
        return None
    mo, y = int(m.group(1)), int(m.group(2))
    if not 1 <= mo <= 12:
        return None
    return dt.date(y, mo, calendar.monthrange(y, mo)[1])


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def batch_str(v):
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else str(v)
    return str(v).strip()


# ------------------------------------------------------------------- items
def parse_items(path):
    s = sheet(path)
    items, seen = [], collections.OrderedDict()
    start = next(r for r in range(s.nrows) if str(s.cell_value(r, 0)).strip().upper() == "ITEM DESCRIPTION") + 1
    for r in range(start, s.nrows):
        row = s.row_values(r)
        name = str(row[0]).strip()
        if not name or name.lower().startswith("go digital"):
            continue
        if not any(str(c).strip() for c in row[1:]):  # repeated page-header lines
            continue
        if norm(name) in PAGE_HEADERS or str(row[1]).strip().upper() == "OLD TAX%":
            continue  # Marg repeats its column header on every printed page
        gst = re.findall(r"(\d+(?:\.\d+)?)\s*$", str(row[2]).strip())
        hsn_gst = re.findall(r"(\d+(?:\.\d+)?)\s*$", str(row[4]).strip())
        hsn = ""
        if isinstance(row[3], float) and row[3]:
            hsn = str(int(row[3]))
        elif str(row[3]).strip():
            hsn = re.sub(r"\D", "", str(row[3]))
        rec = dict(raw_name=name, key=norm(name),
                   gst_rate=float(gst[0]) if gst else None,
                   hsn=hsn, hsn_gst=float(hsn_gst[0]) if hsn_gst else None)
        items.append(rec)
    return items


# ------------------------------------------------------------------- stock
def parse_stock(path, item_keys):
    s = sheet(path)
    rows = []
    for r in range(s.nrows):
        row = s.row_values(r)
        m = re.match(r"^\s*(\d+)\s+(\S.*?)\s*$", str(row[0]))
        if not m or str(row[0]).strip().upper().startswith("TOTAL"):
            continue
        desc = m.group(2)
        toks = desc.split()
        name, pack = desc, ""
        if len(toks) >= 2 and norm(" ".join(toks[:-1])) in item_keys:
            name, pack = " ".join(toks[:-1]), toks[-1]
        elif norm(desc) in item_keys:
            name = desc
        elif len(toks) >= 2:
            name, pack = " ".join(toks[:-1]), toks[-1]
        qm = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]*)\s*$", str(row[3]))
        rows.append(dict(
            key=norm(name), name=norm(name), pack=pack,
            batch=batch_str(row[1]), expiry_raw=str(row[2]).strip(),
            expiry=expiry(row[2]),
            qty=float(qm.group(1)) if qm else None,
            unit=(qm.group(2).upper() if qm else ""),
            in_master=norm(name) in item_keys))
    return rows


# ----------------------------------------------------------------- parties
BILL_RE = re.compile(r"^[\s\*]*(\S+)\s+(\d\d-\d\d-\d{4})\s+(-?[\d.]+)\s+(Dr|Cr)\s+(\d\d-\d\d-\d{4})\s+(-?\d+)")


def parse_trial_balance(path):
    s = sheet(path)
    parties, cur = [], None
    for r in range(s.nrows):
        row = s.row_values(r)
        c1 = str(row[1]).strip()
        if not c1:
            continue
        if c1.upper().startswith("GRAND TOTAL"):
            break
        side = str(row[9]).strip() if len(row) > 9 else ""
        if side in ("Dr", "Cr") and not BILL_RE.match(row[1]):
            cur = dict(name=norm(c1), phone="", opening=num(row[5]) or 0.0,
                       opening_side="Cr" if "Cr" in str(row[5]) else "Dr",
                       debit=num(row[6]) or 0.0, credit=num(row[7]) or 0.0,
                       closing=num(row[8]) or 0.0, side=side, bills=[])
            parties.append(cur)
            continue
        if cur is None:
            continue
        if c1.startswith("Ph.:"):
            cur["phone"] = c1[4:].strip()
            continue
        m = BILL_RE.match(str(row[1]))
        if m:
            cur["bills"].append(dict(ref=m.group(1), date=dmy(m.group(2)), amount=float(m.group(3)),
                                     side=m.group(4), due=dmy(m.group(5)), days=int(m.group(6))))
    return parties


def pkey(name):
    """Loose matching key: letters/digits only."""
    return re.sub(r"[^A-Z0-9]", "", str(name).upper())


def cells_text(row, lo, hi):
    return " ".join(str(c).strip() for c in row[lo:hi] if isinstance(c, str) and str(c).strip())


def parse_debtors(path):
    s = sheet(path)
    debtors, cur = collections.OrderedDict(), None
    grand = None
    for r in range(s.nrows):
        row = s.row_values(r)
        c0, c1 = str(row[0]).strip(), str(row[1]).strip()
        if c1.upper().startswith("TOTAL NO"):
            grand = num(row[4])
            continue
        # party header: '-NAME' in col0 or col1, name may spill over cols 0-3, amount in col4
        if (c0.startswith("-") or c1.startswith("-")) and isinstance(row[4], float):
            nm = norm(cells_text(row, 0, 4).lstrip("-").strip())
            cur = dict(name=nm, balance=num(row[4]) or 0.0, interest_rate=None,
                       address="", mobile="", bills=[], series="", _addr=[], _hdr=True)
            m = re.search(r"([\d.]+)\s*%", str(row[8]))
            if m:
                cur["interest_rate"] = float(m.group(1))
            debtors[pkey(nm)] = cur
            continue
        if cur is None:
            continue
        if "Mobile" in str(row[4]):
            mob = row[5]
            cur["mobile"] = str(int(mob)) if isinstance(mob, float) and mob else str(mob).strip()
            cur["_hdr"] = False
            continue
        if c0.startswith("Rcpt"):
            cur["_hdr"] = False
            continue
        if re.match(r"^[A-Za-z]{1,3}$", c0) and not c1:
            cur["series"] = c0
            cur["_hdr"] = False
            continue
        bd = dmy(row[2], True)
        if c1 and bd and isinstance(row[4], float):
            vals = re.findall(r"-?\d+(?:\.\d+)?", str(row[3]))
            due = re.match(r"(\d\d-\d\d-\d\d)\s+(-?\d+)", str(row[5]).strip())
            cur["bills"].append(dict(ref=c1.lstrip("*").strip(), date=bd,
                                     bill_value=float(vals[0]) if vals else None,
                                     balance=float(row[4]),
                                     due=dmy(due.group(1), True) if due else bd,
                                     days_overdue=int(due.group(2)) if due else 0))
            cur["_hdr"] = False
            continue
        # remaining text-only rows right after the header are address lines
        if cur["_hdr"]:
            t = cells_text(row, 0, 8)
            if t:
                cur["_addr"].append(t)
                cur["address"] = ", ".join(cur["_addr"])
    return debtors, grand


# -------------------------------------------------------------------- main
def main(indir, outdir):
    os.makedirs(outdir, exist_ok=True)
    items = parse_items(find(indir, "item-master", "item master"))
    keys = {i["key"] for i in items}
    stock = parse_stock(find(indir, "batch", "bactch"), keys)
    tb = parse_trial_balance(find(indir, "party-master", "party master", "trial"))
    debtors, debtors_total = parse_debtors(find(indir, "bill-wise", "outstanding"))

    qa = collections.OrderedDict()  # name -> list of dict rows (for the QA workbook)

    # ---- items
    dup = collections.Counter(i["key"] for i in items)
    packs, units = collections.defaultdict(set), collections.defaultdict(collections.Counter)
    for st in stock:
        if st["pack"]:
            packs[st["key"]].add(st["pack"])
        if st["unit"]:
            units[st["key"]][st["unit"]] += 1
    seen, item_rows, bad_hsn, gst_mismatch = set(), [], [], []
    for i in items:
        if i["key"] in seen:
            continue
        seen.add(i["key"])
        uom = units[i["key"]].most_common(1)[0][0] if units[i["key"]] else "PCS"
        p = sorted(packs[i["key"]])
        hsn_ok = len(i["hsn"]) in (4, 6, 8)
        if not hsn_ok:
            bad_hsn.append(dict(item=i["raw_name"], hsn=i["hsn"]))
        if i["hsn_gst"] is not None and i["gst_rate"] is not None and i["hsn_gst"] != i["gst_rate"]:
            gst_mismatch.append(dict(item=i["raw_name"], item_gst=i["gst_rate"], hsn_gst=i["hsn_gst"]))
        item_rows.append(dict(item_code=i["key"], item_name=i["key"], item_group="Products",
                              stock_uom=uom, is_stock_item=1, has_batch_no=1, create_new_batch=1,
                              has_expiry_date=1, gst_hsn_code=i["hsn"], gst_rate=i["gst_rate"] if i["gst_rate"] is not None else "",
                              pack_size="/".join(p), pack_conflict=1 if len(p) > 1 else 0))
    write_csv(os.path.join(outdir, "items.csv"), item_rows,
              ["item_code", "item_name", "item_group", "stock_uom", "is_stock_item", "has_batch_no",
               "create_new_batch", "has_expiry_date", "gst_hsn_code", "gst_rate", "pack_size", "pack_conflict"])
    uoms = sorted({r["stock_uom"] for r in item_rows})
    write_csv(os.path.join(outdir, "uoms.csv"), [dict(uom_name=u) for u in uoms], ["uom_name"])
    qa["Items_bad_HSN"] = bad_hsn
    qa["Items_GST_vs_HSN_mismatch"] = gst_mismatch
    qa["Items_duplicate_names"] = [dict(item=k, count=c) for k, c in dup.items() if c > 1]
    qa["Items_multiple_packs"] = [dict(item=r["item_code"], packs=r["pack_size"]) for r in item_rows if r["pack_conflict"]]

    # ---- stock
    main_rows, expired_rows, neg_rows, zero_rows, nomaster = [], [], [], [], []
    no_batch = []
    for st in stock:
        if st["qty"] is None:
            qa.setdefault("Stock_unparsed", []).append(dict(item=st["name"], batch=st["batch"], raw=st["expiry_raw"]))
            continue
        if not st["in_master"]:
            nomaster.append(dict(item=st["name"], batch=st["batch"], qty=st["qty"]))
        rec = dict(item_code=st["key"], batch_no=st["batch"] or "NOBATCH", expiry_date=st["expiry"].isoformat() if st["expiry"] else "",
                   qty=st["qty"], uom=st["unit"], valuation_rate="")
        if not st["batch"]:
            no_batch.append(dict(item=st["name"], qty=st["qty"]))
        if st["qty"] < 0:
            neg_rows.append(rec)
        elif st["qty"] == 0:
            zero_rows.append(rec)
        elif st["expiry"] and st["expiry"] < CUTOVER:
            expired_rows.append(rec)
        else:
            main_rows.append(rec)
    sf = ["item_code", "batch_no", "expiry_date", "qty", "uom", "valuation_rate"]
    write_csv(os.path.join(outdir, "opening_stock.csv"), main_rows, sf)
    write_csv(os.path.join(outdir, "opening_stock_expired.csv"), expired_rows, sf)
    qa["Stock_negative_qty"] = neg_rows
    qa["Stock_not_in_item_master"] = nomaster
    qa["Stock_rows_without_batch"] = no_batch
    # batch numbers that repeat for an item with different expiry
    bk = collections.defaultdict(set)
    for st in stock:
        bk[(st["key"], st["batch"])].add(st["expiry"])
    qa["Stock_same_batch_diff_expiry"] = [dict(item=k[0], batch=k[1], expiries=", ".join(sorted(str(x) for x in v)))
                                          for k, v in bk.items() if len(v) > 1]

    # ---- parties
    tb_by = {pkey(p["name"]): p for p in tb}
    disp = {pkey(p["name"]): p["name"] for p in tb}
    for k, d in debtors.items():
        disp.setdefault(k, d["name"])
    all_names = list(collections.OrderedDict.fromkeys([pkey(p["name"]) for p in tb] + list(debtors)))
    cust_kw = re.compile(r"MEDICAL|PHARMA|CHEMIST|HOSPITAL|CLINIC|STORES?|DRUG|HEALTH|CARE|MEDI|SURGICAL|NURSING|LAB|GENERIC")
    customers, suppliers, review, ledgers = [], [], [], []
    for k in all_names:
        n = disp[k]
        t, d = tb_by.get(k), debtors.get(k)
        cr_bills = [b for b in (t["bills"] if t else []) if b["side"] == "Cr"]
        if d is None and NON_PARTY.search(n):
            ledgers.append(dict(name=n, closing=t["closing"] if t else 0.0, side=t["side"] if t else ""))
            continue
        if d is not None:
            cls = "customer"
        elif t and (t["side"] == "Cr" and t["closing"] > 0 or cr_bills):
            cls = "supplier"
        elif t and t["side"] == "Dr" and t["closing"] > 0:
            cls = "customer"
        else:
            cls = "review"
        phone = (t["phone"] if t else "") or ""
        rec = dict(name=n, phone=phone, mobile=d["mobile"] if d else "", address=d["address"] if d else "",
                   closing=(t["closing"] if t else (d["balance"] if d else 0)), side=t["side"] if t else "Dr",
                   interest_rate=d["interest_rate"] if d else "", series=d["series"] if d else "")
        if cls == "customer":
            customers.append(rec)
        elif cls == "supplier":
            suppliers.append(rec)
        else:
            # doctors/clinics buy from a wholesaler, so "DR ..." is a customer
            rec["guess"] = "customer" if (cust_kw.search(n) or re.match(r"^DR\b", n)) else "supplier?"
            review.append(rec)
    cf = ["name", "phone", "mobile", "address", "closing", "side", "interest_rate", "series"]
    write_csv(os.path.join(outdir, "customers.csv"), customers, cf)
    write_csv(os.path.join(outdir, "suppliers.csv"), suppliers, cf)
    write_csv(os.path.join(outdir, "parties_to_classify.csv"), review, cf + ["guess"])
    write_csv(os.path.join(outdir, "ledgers_not_parties.csv"), ledgers, ["name", "closing", "side"])
    qa["Ledgers_not_parties"] = ledgers
    qa["Parties_to_classify"] = review
    qa["Customers_without_address"] = [dict(name=c["name"], phone=c["phone"]) for c in customers if not c["address"]]

    # ---- opening invoices
    cust_bills, recon = [], []
    for k, d in debtors.items():
        n = disp[k]
        bsum = 0.0
        for b in d["bills"]:
            cust_bills.append(dict(customer=n, invoice_no=b["ref"], posting_date=b["date"], due_date=b["due"],
                                   bill_value=b["bill_value"], outstanding=b["balance"], days_overdue=b["days_overdue"]))
            bsum += b["balance"]
        t = tb_by.get(k)
        tb_close = (t["closing"] if t and t["side"] == "Dr" else -(t["closing"]) if t else 0.0)
        if abs(bsum - d["balance"]) > 0.5 or (t and abs(tb_close - d["balance"]) > 0.5):
            recon.append(dict(party=n, debtors_header=d["balance"], sum_of_bills=round(bsum, 2), trial_balance_dr=round(tb_close, 2)))
    # Marg restarts bill numbers every financial year, so the same number repeats across
    # customers/years. ERPNext needs unique invoice numbers: suffix the Indian FY (Apr-Mar).
    seen_ref = collections.Counter()

    def unique_ref(ref, d):
        fy = "NA" if not d else "%02d-%02d" % ((d.year if d.month >= 4 else d.year - 1) % 100,
                                               ((d.year if d.month >= 4 else d.year - 1) + 1) % 100)
        base = "%s/%s" % (ref, fy)
        seen_ref[base] += 1
        return base if seen_ref[base] == 1 else "%s-%d" % (base, seen_ref[base])

    for r in cust_bills:
        r["marg_bill_no"] = r["invoice_no"]
        r["invoice_no"] = unique_ref(r["invoice_no"], r["posting_date"])
    for r in cust_bills:
        r["posting_date"] = r["posting_date"].isoformat() if r["posting_date"] else ""
        r["due_date"] = r["due_date"].isoformat() if r["due_date"] else ""
    write_csv(os.path.join(outdir, "opening_invoices_customers.csv"), cust_bills,
              ["customer", "invoice_no", "marg_bill_no", "posting_date", "due_date", "bill_value", "outstanding", "days_overdue"])
    sup_bills = []
    for p in suppliers:
        for b in tb_by[pkey(p["name"])]["bills"]:
            sup_bills.append(dict(supplier=p["name"], invoice_no=unique_ref("S-" + b["ref"], b["date"]),
                                  marg_bill_no=b["ref"],
                                  posting_date=b["date"].isoformat() if b["date"] else "",
                                  due_date=b["due"].isoformat() if b["due"] else "",
                                  outstanding=b["amount"] if b["side"] == "Cr" else -b["amount"], days_overdue=b["days"]))
    write_csv(os.path.join(outdir, "opening_invoices_suppliers.csv"), sup_bills,
              ["supplier", "invoice_no", "marg_bill_no", "posting_date", "due_date", "outstanding", "days_overdue"])
    qa["Debtors_reconciliation_diffs"] = recon

    # ---- unallocated (on-account) amounts: trial-balance closing minus the bill-wise detail.
    # Marg lists open bills only; payments/credits received "on account" are not tied to a bill,
    # so bills alone do not add up to the ledger balance. Import these as Journal Entries
    # (customer advance / supplier advance) so every party ties to the trial balance.
    cust_keys = {pkey(c["name"]) for c in customers}
    sup_keys = {pkey(s["name"]) for s in suppliers}
    unalloc = []
    for k in all_names:
        t, d = tb_by.get(k), debtors.get(k)
        if not t or NON_PARTY.search(t["name"]):
            continue
        dr_bills = sum(b["balance"] for b in d["bills"]) if d is not None else \
            sum(b["amount"] for b in t["bills"] if b["side"] == "Dr")
        cr_bills = sum(b["amount"] for b in t["bills"] if b["side"] == "Cr")
        tbnet = t["closing"] if t["side"] == "Dr" else -t["closing"]
        diff = round(tbnet - (dr_bills - cr_bills), 2)
        if abs(diff) > 0.5:
            unalloc.append(dict(party=t["name"],
                                role="customer" if k in cust_keys else "supplier" if k in sup_keys else "review",
                                trial_balance=round(tbnet, 2), bill_wise_total=round(dr_bills - cr_bills, 2),
                                unallocated=diff))
    qa["Debtors_missing_from_TB"] = [dict(party=d["name"], debtors_balance=d["balance"])
                                     for k, d in debtors.items() if k not in tb_by]
    write_csv(os.path.join(outdir, "opening_unallocated.csv"), unalloc,
              ["party", "role", "trial_balance", "bill_wise_total", "unallocated"])
    qa["Unallocated_on_account"] = unalloc

    # ---- summary
    summ = collections.OrderedDict([
        ("items_in_master", len(item_rows)),
        ("stock_batch_rows_total", len(stock)),
        ("stock_rows_main_warehouse", len(main_rows)),
        ("stock_rows_expired", len(expired_rows)),
        ("stock_rows_negative", len(neg_rows)),
        ("stock_rows_zero", len(zero_rows)),
        ("stock_rows_no_batch", len(no_batch)),
        ("customers", len(customers)),
        ("suppliers", len(suppliers)),
        ("parties_to_classify", len(review)),
        ("ledgers_not_parties", len(ledgers)),
        ("stock_qty_sum_all_rows", round(sum(s["qty"] for s in stock if s["qty"] is not None), 2)),
        ("stock_qty_sum_negative", round(sum(s["qty"] for s in stock if s["qty"] is not None and s["qty"] < 0), 2)),
        ("stock_qty_sum_main", round(sum(r["qty"] for r in main_rows), 2)),
        ("stock_qty_sum_expired", round(sum(r["qty"] for r in expired_rows), 2)),
        ("customer_open_bills", len(cust_bills)),
        ("customer_outstanding_sum", round(sum(b["outstanding"] for b in cust_bills), 2)),
        ("debtors_report_grand_total", debtors_total),
        ("supplier_open_bills", len(sup_bills)),
        ("supplier_outstanding_sum", round(sum(b["outstanding"] for b in sup_bills), 2)),
        ("unallocated_parties", len(unalloc)),
        ("unallocated_net_sum", round(sum(u["unallocated"] for u in unalloc), 2)),
    ])
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Summary"
    for k, v in summ.items():
        ws.append([k, v])
    for name, rows in qa.items():
        w = wb.create_sheet(name[:31])
        if rows:
            hdr = list(rows[0].keys())
            w.append(hdr)
            for r in rows:
                w.append([r.get(h) for h in hdr])
        else:
            w.append(["(none)"])
    wb.save(os.path.join(outdir, "QA-report.xlsx"))
    for k, v in summ.items():
        print("%-32s %s" % (k, v))
    print("-- QA sheets --")
    for k, v in qa.items():
        print("%-36s %d" % (k, len(v)))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
