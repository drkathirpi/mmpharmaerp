#!/usr/bin/env python3
"""Submit Stock Reconciliations left as Draft (ERPNext queues submits of >100 lines to a background worker).
usage: submit_drafts.py <site>   (run from the sites folder)"""
import sys, frappe
frappe.init(site=sys.argv[1], sites_path=".")
frappe.connect()
frappe.set_user("Administrator")
for n in frappe.get_all("Stock Reconciliation", {"docstatus": 0}, pluck="name", order_by="creation"):
    d = frappe.get_doc("Stock Reconciliation", n)
    d._submit()
    frappe.db.commit()
    print("submitted", n, len(d.items), flush=True)
print("ALL DONE", flush=True)
