#!/usr/bin/env python3
"""
Pharma setup, part 2 (run after setup_pharma.py). Safe to re-run.

    cd /home/frappe/frappe-bench/sites
    ../env/bin/python setup_pharma2.py --site erp.example.com [--commit]

  * Print format "MM Pharma Tax Invoice" (Sales Invoice): company + customer drug licences,
    GSTIN, batch / expiry / MRP per line, tax summary, amount in words. Made the default for Sales Invoice.
  * Report "Schedule Drug Sales Register": every sale of Schedule H / H1 / X / Narcotic items
    with date, invoice, buyer, buyer licence, batch and quantity (filter by date and schedule).
"""
import argparse
import frappe

PRINT_NAME = "MM Pharma Tax Invoice"

PRINT_HTML = """
{%- set co = frappe.db.get_value("Company", doc.company, ["company_name","drug_licence_1","drug_licence_2","fssai_no","gstin"], as_dict=True) or {} -%}
{%- set cu = frappe.db.get_value("Customer", doc.customer, ["drug_licence_1","drug_licence_2"], as_dict=True) or {} -%}
<style>
  .inv {font-size:11px;} .inv table {width:100%; border-collapse:collapse;}
  .inv th, .inv td {border:1px solid #444; padding:3px 4px;} .inv th {background:#eee;}
  .inv .r {text-align:right;} .inv .nb td {border:none; padding:1px 2px;}
</style>
<div class="inv">
  <table class="nb"><tr>
    <td style="width:60%"><b style="font-size:15px">{{ co.company_name or doc.company }}</b><br>
      {% if doc.company_address_display %}{{ doc.company_address_display }}<br>{% endif %}
      GSTIN: {{ doc.company_gstin or co.gstin or "" }}<br>
      D.L. No: {{ co.drug_licence_1 or "" }}{% if co.drug_licence_2 %} , {{ co.drug_licence_2 }}{% endif %}
      {% if co.fssai_no %}<br>FSSAI: {{ co.fssai_no }}{% endif %}</td>
    <td class="r"><b>{{ "CREDIT NOTE" if doc.is_return else "TAX INVOICE" }}</b><br>
      No: <b>{{ doc.name }}</b><br>Date: {{ frappe.utils.formatdate(doc.posting_date) }}<br>
      Due: {{ frappe.utils.formatdate(doc.due_date) if doc.due_date else "" }}</td>
  </tr></table>
  <table class="nb" style="margin-top:4px"><tr><td>
    <b>Bill to:</b> {{ doc.customer_name }}<br>{{ doc.address_display or "" }}<br>
    GSTIN: {{ doc.billing_address_gstin or "" }}<br>
    D.L. No: {{ cu.drug_licence_1 or "" }}{% if cu.drug_licence_2 %} , {{ cu.drug_licence_2 }}{% endif %}
  </td></tr></table>
  <table style="margin-top:4px">
    <thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Batch</th><th>Exp</th><th class="r">MRP</th>
      <th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc%</th><th class="r">Amount</th></tr></thead>
    <tbody>
    {%- for row in doc.items -%}
      {%- set b = frappe.db.get_value("Batch", row.batch_no, ["expiry_date","batch_mrp"], as_dict=True) if row.batch_no else {} -%}
      <tr><td>{{ loop.index }}</td><td>{{ row.item_name }}</td><td>{{ row.gst_hsn_code or "" }}</td>
        <td>{{ row.batch_no or "" }}</td>
        <td>{{ frappe.utils.formatdate(b.expiry_date, "MM/yy") if b and b.expiry_date else "" }}</td>
        <td class="r">{{ "%.2f"|format(b.batch_mrp) if b and b.batch_mrp else "" }}</td>
        <td class="r">{{ row.get_formatted("qty") }} {{ row.uom }}</td>
        <td class="r">{{ "%.2f"|format(row.rate) }}</td>
        <td class="r">{{ "%.1f"|format(row.discount_percentage or 0) }}</td>
        <td class="r">{{ "%.2f"|format(row.amount) }}</td></tr>
    {%- endfor -%}
    </tbody>
  </table>
  <table class="nb" style="margin-top:4px"><tr>
    <td style="width:55%">Amount in words:<br><b>{{ doc.in_words }}</b><br><br>
      Goods once sold will not be taken back except near-expiry returns as agreed.<br>
      Subject to local jurisdiction.</td>
    <td><table>
      <tr><td>Taxable value</td><td class="r">{{ "%.2f"|format(doc.net_total) }}</td></tr>
      {%- for t in doc.taxes -%}
      <tr><td>{{ t.description }}</td><td class="r">{{ "%.2f"|format(t.tax_amount) }}</td></tr>
      {%- endfor -%}
      {%- if doc.rounding_adjustment -%}<tr><td>Round off</td><td class="r">{{ "%.2f"|format(doc.rounding_adjustment) }}</td></tr>{%- endif -%}
      <tr><td><b>Grand total</b></td><td class="r"><b>{{ "%.2f"|format(doc.rounded_total or doc.grand_total) }}</b></td></tr>
    </table></td>
  </tr></table>
  <p class="r" style="margin-top:20px">For {{ co.company_name or doc.company }}<br><br>Authorised signatory</p>
</div>
"""

REPORT_NAME = "Schedule Drug Sales Register"
REPORT_SQL = """
SELECT si.posting_date AS "Date:Date:95",
       si.name AS "Invoice:Link/Sales Invoice:130",
       si.customer AS "Buyer:Link/Customer:200",
       c.drug_licence_1 AS "Buyer Licence::130",
       sii.item_code AS "Item:Link/Item:230",
       i.drug_schedule AS "Schedule::80",
       sii.batch_no AS "Batch:Link/Batch:110",
       sii.qty AS "Qty:Float:70",
       sii.uom AS "UOM::60"
FROM `tabSales Invoice` si
JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
JOIN `tabItem` i ON i.name = sii.item_code
LEFT JOIN `tabCustomer` c ON c.name = si.customer
WHERE si.docstatus = 1
  AND i.drug_schedule IN ('H', 'H1', 'X', 'Narcotic')
  AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
  AND (IFNULL(%(schedule)s, '') = '' OR i.drug_schedule = %(schedule)s)
ORDER BY si.posting_date, si.name
"""


def print_format():
    html = PRINT_HTML
    vals = dict(doctype="Print Format", name=PRINT_NAME, doc_type="Sales Invoice", module="Accounts",
                standard="No", custom_format=1, print_format_type="Jinja", html=html, disabled=0)
    if frappe.db.exists("Print Format", PRINT_NAME):
        d = frappe.get_doc("Print Format", PRINT_NAME)
        d.update(vals)
        d.save()
    else:
        frappe.get_doc(vals).insert()
    frappe.make_property_setter(dict(doctype="Sales Invoice", doctype_or_field="DocType", property="default_print_format",
                                     value=PRINT_NAME, property_type="Data"))
    print("  print format ready and set as Sales Invoice default")


def register_report():
    vals = dict(doctype="Report", report_name=REPORT_NAME, ref_doctype="Sales Invoice", report_type="Query Report",
                is_standard="No", module="Accounts", query=REPORT_SQL.strip(), add_total_row=0)
    exists = frappe.db.exists("Report", REPORT_NAME)
    if exists:
        d = frappe.get_doc("Report", REPORT_NAME)
        d.query = vals["query"]
        d.set("filters", [])
    else:
        d = frappe.get_doc(dict(vals, roles=[dict(role="Accounts User"), dict(role="Accounts Manager"), dict(role="System Manager")]))
    d.append("filters", dict(label="From Date", fieldname="from_date", fieldtype="Date", mandatory=1,
                             default="Today", wildcard_filter=0))
    d.append("filters", dict(label="To Date", fieldname="to_date", fieldtype="Date", mandatory=1,
                             default="Today", wildcard_filter=0))
    d.append("filters", dict(label="Schedule", fieldname="schedule", fieldtype="Select",
                             options="\nH\nH1\nX\nNarcotic", mandatory=0, wildcard_filter=0))
    if exists:
        d.save()
    else:
        d.insert()
    print("  report ready:", REPORT_NAME)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--commit", action="store_true")
    a = ap.parse_args()
    frappe.init(site=a.site)
    frappe.connect()
    frappe.set_user("Administrator")
    try:
        print("print format"); print_format()
        print("register report"); register_report()
        if a.commit:
            frappe.db.commit(); frappe.clear_cache()
            print("COMMITTED")
        else:
            frappe.db.rollback()
            print("DRY RUN - rolled back")
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
