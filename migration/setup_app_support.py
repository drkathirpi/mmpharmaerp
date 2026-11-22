#!/usr/bin/env python3
"""
Server support for the app's new screens. Safe to re-run.

    cd /home/frappe/frappe-bench/sites
    ../env/bin/python setup_app_support.py --site erp.example.com [--commit]

  * DocType "Salt": the salt master (Marg's "salt creation"). Filled from the salt_composition already on items,
    one row per distinct salt (items keep their free-text salt_composition; the app's salt picker reads this list).
  * Print Format "MM Pharma Receipt" for Payment Entry: the e-receipt for a customer payment (and the voucher
    for a supplier payment), small A5 landscape, with company details, party, amount, mode, bills cleared,
    amount in words and a signature line.
Without --commit everything is rolled back and the numbers are printed.
"""
import argparse
import re
import frappe

RECEIPT_HTML = """
{%- set co = frappe.db.get_value("Company", doc.company, ["company_name","phone_no","print_address","gstin","drug_licence_1","drug_licence_2"], as_dict=True) or {} -%}
<style>
  .print-format {margin-top: 8mm; margin-bottom: 8mm; margin-left: 8mm; margin-right: 8mm; page-size: A5; orientation: Landscape;}
  .rc {font-family: "DejaVu Sans", Arial, sans-serif; font-size: 9pt; color: #000;}
  .rc table {width: 100%; border-collapse: collapse;} .rc td, .rc th {padding: 3px 5px; vertical-align: top;}
  .rc .bx {border: 1.3px solid #000;} .rc .g {background: #e6e6e6;} .rc .r {text-align: right;} .rc .c {text-align: center;} .rc .b {font-weight: bold;}
  .rc .big {font-size: 14pt; font-weight: bold;}
  .rc .ln td {border-bottom: 1px solid #999;}
</style>
<div class="rc">
<table class="bx g"><tr><td style="width:62%"><span class="big">{{ co.company_name or doc.company }}</span><br>{{ (co.print_address or "")|replace("\\n", ", ") }}<br>{% if co.phone_no %}Phone : {{ co.phone_no }} &nbsp; {% endif %}DL.No : {{ co.drug_licence_1 or "" }} {{ co.drug_licence_2 or "" }}<br>GSTIN : {{ co.gstin or "" }}</td>
<td class="c"><span class="big">{{ "PAYMENT RECEIPT" if doc.payment_type == "Receive" else "PAYMENT VOUCHER" }}</span><br>No : <b>{{ doc.name }}</b><br>Date : <b>{{ frappe.utils.formatdate(doc.posting_date, "dd-MM-yyyy") }}</b></td></tr></table>
<table class="bx" style="margin-top:4px"><tr><td style="width:18%" class="b">{{ "Received from" if doc.payment_type == "Receive" else "Paid to" }}</td><td class="b" style="font-size:11pt">{{ doc.party_name or doc.party }}</td>
<td style="width:16%" class="b">Mode</td><td style="width:22%">{{ doc.mode_of_payment }}{% if doc.reference_no %} / {{ doc.reference_no }}{% endif %}</td></tr>
<tr><td class="b">Amount</td><td class="big">&#8377; {{ "{:,.2f}".format(doc.paid_amount) }}</td><td class="b">Status</td><td>{{ "Posted" if doc.docstatus == 1 else "Draft" }}</td></tr>
<tr><td class="b">In words</td><td colspan="3">{{ frappe.utils.money_in_words(doc.paid_amount, "INR") }}</td></tr></table>
{%- if doc.references -%}
<table class="bx" style="margin-top:4px"><tr class="g"><th style="text-align:left">Against bill</th><th class="c">Bill date</th><th class="r">Bill amount</th><th class="r">Cleared now</th></tr>
{%- for r in doc.references -%}<tr class="ln"><td>{{ r.reference_name }}</td><td class="c">{{ frappe.utils.formatdate(frappe.db.get_value(r.reference_doctype, r.reference_name, "posting_date"), "dd-MM-yyyy") }}</td><td class="r">{{ "{:,.2f}".format(r.total_amount or 0) }}</td><td class="r b">{{ "{:,.2f}".format(r.allocated_amount) }}</td></tr>{%- endfor -%}</table>
{%- endif -%}
<table style="margin-top:22px"><tr><td class="c" style="width:50%">Receiver's signature</td><td class="c">For {{ co.company_name or doc.company }}<br><br>Authorised Signatory</td></tr></table>
</div>
"""


def salt_doctype():
    if not frappe.db.exists("DocType", "Salt"):
        frappe.get_doc({
            "doctype": "DocType", "name": "Salt", "module": "Stock", "custom": 1, "autoname": "field:salt_name",
            "naming_rule": "By fieldname", "sort_field": "modified", "sort_order": "ASC", "track_changes": 0,
            "fields": [{"fieldname": "salt_name", "label": "Salt", "fieldtype": "Data", "reqd": 1, "unique": 1, "in_list_view": 1, "in_standard_filter": 1}],
            "permissions": [{"role": r, "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1}
                            for r in ("System Manager", "Stock Manager", "Stock User", "Item Manager")],
        }).insert(ignore_permissions=True)
        print("  created DocType Salt")
    else:
        print("  DocType Salt exists")
    have = set(frappe.get_all("Salt", pluck="name"))
    new = set()
    for (s,) in frappe.db.sql("SELECT DISTINCT salt_composition FROM `tabItem` WHERE IFNULL(salt_composition,'') <> ''"):
        for part in re.split(r"\s*[+;/]\s*|\s*,\s*", s):
            part = re.sub(r"\s+", " ", part).strip().upper()
            if 3 <= len(part) <= 140 and part not in have:
                new.add(part)
    for n in sorted(new):
        frappe.get_doc({"doctype": "Salt", "salt_name": n}).insert(ignore_permissions=True)
    print("  salts added: %d (total %d)" % (len(new), len(have) + len(new)))


def receipt_format():
    name = "MM Pharma Receipt"
    d = frappe.get_doc("Print Format", name) if frappe.db.exists("Print Format", name) else frappe.new_doc("Print Format")
    d.update({"name": name, "doc_type": "Payment Entry", "module": "Accounts", "custom_format": 1, "print_format_type": "Jinja",
              "standard": "No", "disabled": 0, "html": RECEIPT_HTML, "default_print_language": "en"})
    d.save(ignore_permissions=True) if d.get("creation") else d.insert(ignore_permissions=True)
    print("  print format ready:", name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--commit", action="store_true")
    a = ap.parse_args()
    frappe.init(site=a.site, sites_path=".")
    frappe.connect()
    frappe.set_user("Administrator")
    print("salt master"); salt_doctype()
    print("receipt print format"); receipt_format()
    if a.commit:
        frappe.db.commit(); print("COMMITTED")
    else:
        frappe.db.rollback(); print("DRY RUN, rolled back (add --commit)")


if __name__ == "__main__":
    main()
