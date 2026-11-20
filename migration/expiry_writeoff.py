#!/usr/bin/env python3
"""
Write off everything left in the "Expired Stock" warehouse (Stock Entry, Material Issue), charged to the
account "Expired Stock Written Off". Run it ONLY after you have returned to suppliers whatever they will take
(Purchase Return from the Expired Stock warehouse). Dry run by default.

    cd /home/frappe/frappe-bench/sites
    ../env/bin/python expiry_writeoff.py --site erp.example.com --company "MM Pharma Distributors" [--commit]
"""
import argparse
import frappe
from erpnext.stock.doctype.batch.batch import get_batch_qty


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--company", required=True)
    ap.add_argument("--warehouse", default="Expired Stock")
    ap.add_argument("--commit", action="store_true")
    a = ap.parse_args()
    frappe.init(site=a.site, sites_path=".")
    frappe.connect()
    frappe.set_user("Administrator")
    abbr = frappe.db.get_value("Company", a.company, "abbr")
    wh = "%s - %s" % (a.warehouse, abbr)
    acct = "Expired Stock Written Off - %s" % abbr
    cc = frappe.db.get_value("Company", a.company, "cost_center")
    rows = []
    for b in get_batch_qty(warehouse=wh) or []:
        if (b.get("qty") or 0) > 0:
            rows.append((frappe.db.get_value("Batch", b["batch_no"], "item"), b["batch_no"], b["qty"]))
    rows.sort()
    print("  %d batches to write off from %s -> %s" % (len(rows), wh, acct))
    n = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i:i + 100]
        # never split an item across two entries
        while i + len(chunk) < len(rows) and rows[i + len(chunk)][0] == chunk[-1][0]:
            chunk.append(rows[i + len(chunk)])
        if i and rows[i][0] == rows[i - 1][0]:
            continue
        doc = frappe.get_doc(dict(
            doctype="Stock Entry", stock_entry_type="Material Issue", company=a.company, from_warehouse=wh,
            items=[dict(item_code=it, s_warehouse=wh, qty=q, batch_no=bt, use_serial_batch_fields=1,
                        expense_account=acct, cost_center=cc) for it, bt, q in chunk]))
        doc.insert()
        doc.submit()
        n += len(chunk)
    print("  written off: %d batches" % n)
    if a.commit:
        frappe.db.commit(); print("COMMITTED")
    else:
        frappe.db.rollback(); print("DRY RUN - rolled back")
    frappe.destroy()


if __name__ == "__main__":
    main()
