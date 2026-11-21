#!/usr/bin/env python3
"""Attach the drug lines from Marg to the opening Sales Invoices (no accounting change).

    cd /home/frappe/frappe-bench/sites
    ../env/bin/python attach_bill_items.py --site erp.drkathiravan.uk --file /tmp/bill_items.csv [--commit]

Adds a read-only Long Text field "marg_items" on Sales Invoice (editable after submit) and fills it for each
bill in bill_items.csv. Dry run unless --commit. Safe to re-run. Afterwards re-run setup_pharma2.py so the
print format shows these lines instead of the single 'Opening Invoice Item' row.
"""
import argparse, csv
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ap = argparse.ArgumentParser()
ap.add_argument("--site", required=True); ap.add_argument("--file", required=True); ap.add_argument("--commit", action="store_true")
a = ap.parse_args()
frappe.init(site=a.site); frappe.connect()
if a.commit:
    create_custom_fields({"Sales Invoice": [dict(fieldname="marg_items", label="Items (from Marg)", fieldtype="Long Text",
        read_only=1, allow_on_submit=1, no_copy=1, print_hide=1, insert_after="items_section")]}, update=True)
    frappe.db.commit()
rows = list(csv.DictReader(open(a.file, encoding="utf-8")))
ok = miss = same = 0
for r in rows:
    name = frappe.db.get_value("Sales Invoice", {"name": r["invoice_no"]}) or frappe.db.get_value("Sales Invoice", {"name": ["like", r["marg_bill_no"] + "%"], "posting_date": r["posting_date"]})
    if not name:
        miss += 1; print("  not found:", r["invoice_no"]); continue
    if a.commit:
        if frappe.db.get_value("Sales Invoice", name, "marg_items") == r["items"]: same += 1; continue
        frappe.db.set_value("Sales Invoice", name, "marg_items", r["items"], update_modified=False)
    ok += 1
if a.commit: frappe.db.commit()
print("%s: %d bills %s, %d already done, %d not found" % ("COMMITTED" if a.commit else "DRY RUN", ok, "updated" if a.commit else "would be updated", same, miss))
