#!/usr/bin/env python3
"""
Pharma setup, part 3: expired / near-expiry stock handling. Safe to re-run.

    cd /home/frappe/frappe-bench/sites
    ../env/bin/python setup_pharma3.py --site erp.example.com [--commit]

  * Account "Expired Stock Written Off" (Expense) - where a write-off of expired stock is charged.
  * Report "Expiry Register": every batch with stock whose expiry is on or before today + N days
    (filter within_days, default 0 = already expired; 90 = expired + expiring in 3 months), any warehouse
    or one warehouse, with qty, MRP, cost value and manufacturer. This is the list to send to suppliers
    for expiry returns, and the list to check before writing stock off.
Expired stock lives in the "Expired Stock" warehouse so it can never be billed; returning it to a supplier
is a Purchase Return from that warehouse, writing it off is migration/expiry_writeoff.py.
"""
import argparse
import frappe

REPORT_NAME = "Expiry Register"
SQL = """
SELECT sbe.batch_no AS "Batch:Link/Batch:130",
       sle.item_code AS "Item:Link/Item:230",
       sle.warehouse AS "Warehouse:Link/Warehouse:150",
       b.expiry_date AS "Expiry:Date:90",
       DATEDIFF(b.expiry_date, CURDATE()) AS "Days left:Int:70",
       SUM(sbe.qty) AS "Qty:Float:70",
       b.batch_mrp AS "MRP:Currency:80",
       SUM(sbe.stock_value_difference) AS "Cost value:Currency:100",
       i.manufacturer_company AS "Manufacturer::140"
FROM `tabSerial and Batch Entry` sbe
JOIN `tabStock Ledger Entry` sle ON sle.serial_and_batch_bundle = sbe.parent AND sle.is_cancelled = 0
JOIN `tabBatch` b ON b.name = sbe.batch_no
JOIN `tabItem` i ON i.name = sle.item_code
WHERE b.expiry_date IS NOT NULL
  AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL IFNULL(NULLIF(%(within_days)s, ''), 0) DAY)
  AND (IFNULL(%(warehouse)s, '') = '' OR sle.warehouse = %(warehouse)s)
GROUP BY sbe.batch_no, sle.item_code, sle.warehouse
HAVING SUM(sbe.qty) > 0.0001
ORDER BY b.expiry_date, sle.item_code
"""


def account(company):
    abbr = frappe.db.get_value("Company", company, "abbr")
    name = "Expired Stock Written Off - %s" % abbr
    if frappe.db.exists("Account", name):
        print("  account exists:", name)
        return
    parent = "Stock Expenses - %s" % abbr
    if not frappe.db.exists("Account", parent):
        parent = frappe.db.get_value("Account", {"company": company, "root_type": "Expense", "is_group": 1}, "name")
    frappe.get_doc(dict(doctype="Account", account_name="Expired Stock Written Off", company=company,
                        parent_account=parent, root_type="Expense", report_type="Profit and Loss", is_group=0)).insert()
    print("  account created:", name)


def report():
    vals = dict(doctype="Report", report_name=REPORT_NAME, ref_doctype="Batch", report_type="Query Report",
                is_standard="No", module="Stock", query=SQL.strip(), add_total_row=1)
    if frappe.db.exists("Report", REPORT_NAME):
        d = frappe.get_doc("Report", REPORT_NAME)
        d.query = vals["query"]
        d.set("filters", [])
    else:
        d = frappe.get_doc(vals)
    d.append("filters", dict(fieldname="within_days", label="Expires within (days)", fieldtype="Int", default="0", mandatory=0))
    d.append("filters", dict(fieldname="warehouse", label="Warehouse", fieldtype="Link", options="Warehouse", mandatory=0))
    d.save() if d.get("creation") else d.insert()
    print("  report ready:", REPORT_NAME)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--company", required=True)
    ap.add_argument("--commit", action="store_true")
    a = ap.parse_args()
    frappe.init(site=a.site, sites_path=".")
    frappe.connect()
    frappe.set_user("Administrator")
    try:
        account(a.company)
        report()
        if a.commit:
            frappe.db.commit(); frappe.clear_cache(); print("COMMITTED")
        else:
            frappe.db.rollback(); print("DRY RUN - rolled back")
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
