#!/usr/bin/env python3
"""Cancel and delete every Stock Reconciliation of one purpose. usage: cancel_reconciliations.py <site> "<purpose>"
(Used to undo a stock-adjust run: purpose "Stock Reconciliation".)"""
import sys, frappe
frappe.init(site=sys.argv[1], sites_path=".")
frappe.connect()
frappe.set_user("Administrator")
for n in frappe.get_all("Stock Reconciliation", {"purpose": sys.argv[2]}, pluck="name"):
    d = frappe.get_doc("Stock Reconciliation", n)
    if d.docstatus == 1:
        d.cancel()
    frappe.delete_doc("Stock Reconciliation", n, force=1)
    frappe.db.commit()
    print("removed", n, flush=True)
print("CANCEL DONE", flush=True)
