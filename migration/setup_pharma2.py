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
{%- set co = frappe.db.get_value("Company", doc.company, ["company_name","phone_no","drug_licence_1","drug_licence_2","fssai_no","gstin","bank_details_print"], as_dict=True) or {} -%}
{%- set cu = frappe.db.get_value("Customer", doc.customer, ["drug_licence_1","drug_licence_2","mobile_no","area"], as_dict=True) or {} -%}
{%- set billed_by = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner -%}
{%- set cash = (doc.outstanding_amount or 0) <= 0 -%}
{#- items to print: paid rows, with free-goods rows folded into the F/R column -#}
{%- set free = namespace(d={}) -%}
{%- for r in doc.items if r.is_free_item -%}{%- set _ = free.d.update({r.item_code: free.d.get(r.item_code, 0) + r.qty}) -%}{%- endfor -%}
{%- set rows = namespace(l=[], qty=0, slab={}) -%}
{%- if doc.get("marg_items") -%}
  {%- for line in doc.marg_items.split("\\n") -%}{%- set f = line.split("|") -%}
    {%- set _ = rows.l.append({"name": f[0], "mfr": "", "hsn": "", "pack": "", "batch": f[5], "exp": f[4], "qty": f[1]|float, "free": f[2]|float, "mrp": "", "rate": f[3]|float, "dis": 0, "gst": "", "amt": f[1]|float * f[3]|float}) -%}
    {%- set rows.qty = rows.qty + f[1]|float -%}
  {%- endfor -%}
{%- else -%}
  {%- for r in doc.items if not r.is_free_item -%}
    {%- set it = frappe.db.get_value("Item", r.item_code, ["manufacturer_company"], as_dict=True) or {} -%}
    {%- set b = frappe.db.get_value("Batch", r.batch_no, ["expiry_date","batch_mrp"], as_dict=True) if r.batch_no else {} -%}
    {%- set rate_gst = (r.get("cgst_rate") or 0) + (r.get("sgst_rate") or 0) + (r.get("igst_rate") or 0) -%}
    {%- if not rate_gst and doc.net_total and doc.total_taxes_and_charges -%}{%- set rate_gst = (doc.total_taxes_and_charges / doc.net_total * 100)|round(0) -%}{%- endif -%}
    {%- set nm = r.item_name.split(" ") -%}
    {%- set has_pack = nm|length > 1 and nm[-1][0:1].isdigit() and nm[-1][-1:].isalpha() -%}
    {%- set amt = (r.net_amount or r.amount) * (1 + rate_gst / 100) -%}
    {%- set _ = rows.l.append({"name": nm[:-1]|join(" ") if has_pack else r.item_name, "mfr": (it.manufacturer_company or "")[:4]|upper, "hsn": r.gst_hsn_code or "", "pack": nm[-1] if has_pack else "", "batch": r.batch_no or "", "exp": frappe.utils.formatdate(b.expiry_date, "MM/yy") if b and b.expiry_date else "", "qty": r.qty, "free": free.d.get(r.item_code, 0), "mrp": ("%.2f"|format(b.batch_mrp)) if b and b.batch_mrp else "", "rate": r.rate, "dis": r.discount_percentage or 0, "gst": rate_gst, "amt": amt}) -%}
    {%- set rows.qty = rows.qty + r.qty -%}
    {%- set _ = rows.slab.update({rate_gst: rows.slab.get(rate_gst, {"v": 0, "t": 0})}) -%}
    {%- set _ = rows.slab[rate_gst].update({"v": rows.slab[rate_gst].v + (r.net_amount or r.amount), "t": rows.slab[rate_gst].t + (r.net_amount or r.amount) * rate_gst / 100}) -%}
  {%- endfor -%}
{%- endif -%}
{%- set pend = frappe.get_all("Sales Invoice", filters={"customer": doc.customer, "docstatus": 1, "outstanding_amount": [">", 0], "name": ["!=", doc.name]}, fields=["name", "posting_date", "grand_total", "outstanding_amount"], order_by="posting_date asc", limit_page_length=500) -%}
<meta name="pdf-orientation" content="Landscape">
<meta name="pdf-page-size" content="A4">
<meta name="pdf-margin-top" content="6mm"><meta name="pdf-margin-bottom" content="9mm">
<meta name="pdf-margin-left" content="6mm"><meta name="pdf-margin-right" content="6mm">
<style>
  .inv {font-size:10.5px; color:#000;} .inv table {width:100%; border-collapse:collapse;}
  .inv td, .inv th {padding:2px 4px; vertical-align:top;}
  .inv .box {border:1.4px solid #000;} .inv .g td, .inv .g th {border:1px solid #000;}
  .inv .g th {background:#eee; text-align:left;} .inv .r {text-align:right;} .inv .c {text-align:center;}
  .inv .h {font-size:15px; font-weight:bold;} .inv .big {font-size:20px; font-weight:bold;}
  .inv .nb td {border:none; padding:1px 3px;} .inv .u {text-decoration:underline; font-style:italic; font-weight:bold;}
</style>
<div class="inv">
<table style="margin-bottom:3px"><tr>
  <td class="box" style="width:46%">
    <span class="h">{{ co.company_name or doc.company }}</span><br>
    {{ (doc.company_address_display or "")|striptags if doc.company_address_display else "" }}<br>
    {% if co.phone_no %}Phone : {{ co.phone_no }}<br>{% endif %}
    DL.No: {{ co.drug_licence_1 or "" }}{% if co.drug_licence_2 %} {{ co.drug_licence_2 }}{% endif %}<br>
    GSTIN : {{ doc.company_gstin or co.gstin or "" }}{% if co.fssai_no %} &nbsp; FSSAI : {{ co.fssai_no }}{% endif %}
  </td>
  <td style="width:1%"></td>
  <td class="box" style="width:53%">
    <table class="nb"><tr><td class="h" colspan="2">{{ "CREDIT NOTE" if doc.is_return else "GST INVOICE" }}</td><td class="h r" colspan="2">{{ "CASH BILL" if cash else "CREDIT BILL" }}</td></tr>
    <tr><td><b>Invoice No</b></td><td class="h">: {{ doc.name }}</td><td><b>Bill Time</b></td><td>: {{ (doc.posting_time|string)[:5] }}</td></tr>
    <tr><td><b>Invoice Date</b></td><td>: {{ frappe.utils.formatdate(doc.posting_date, "dd-MM-yyyy") }}</td><td><b>Due Date</b></td><td>: {{ frappe.utils.formatdate(doc.due_date, "dd-MM-yyyy") if doc.due_date else "" }}</td></tr>
    <tr><td><b>EWay Bill No</b></td><td>: {{ doc.get("ewaybill") or "" }}</td><td><b>Cases</b></td><td>: {{ doc.get("cases") or "" }}</td></tr>
    <tr><td><b>Billed By</b></td><td>: {{ billed_by }}</td><td><b>Transport</b></td><td>: {{ doc.get("transporter_name") or "" }}</td></tr></table>
  </td></tr></table>
<table style="margin-bottom:3px"><tr>
  <td class="box" style="width:46%">
    <span class="h">{{ doc.customer_name }}</span><br>
    {{ (doc.address_display or "")|striptags }}
    {% if doc.place_of_supply %} State : {{ doc.place_of_supply[:2] }}{% endif %}<br>
    {% if cu.mobile_no %}Phone No : {{ cu.mobile_no }}<br>{% endif %}
    {% if doc.billing_address_gstin %}GSTIN : {{ doc.billing_address_gstin }}<br>{% endif %}
    DL.No. : {{ cu.drug_licence_1 or "" }}{% if cu.drug_licence_2 %} {{ cu.drug_licence_2 }}{% endif %}
  </td>
  <td style="width:1%"></td>
  <td class="box" style="width:53%">
    <span class="u">Pending Bill Details</span> &nbsp; <span class="u">OUTSTANDING : {{ "%.2f"|format(pend|sum(attribute="outstanding_amount")) }}</span>
    <table class="nb"><tr><td class="u">Bill No</td><td class="u">Bill Date</td><td class="u r">Bill Amount</td><td class="u r">Outstanding</td></tr>
    {%- for p in pend[:5] -%}<tr><td>{{ p.name }}</td><td>{{ frappe.utils.formatdate(p.posting_date, "dd-MM-yyyy") }}</td><td class="r">{{ "%.2f"|format(p.grand_total) }}</td><td class="r">{{ "%.2f"|format(p.outstanding_amount) }}</td></tr>{%- endfor -%}
    {%- if pend|length > 5 -%}<tr><td colspan="4">... and {{ pend|length - 5 }} more bills</td></tr>{%- endif -%}</table>
    <span class="u">TOTAL BILLS DUE : {{ pend|length }}</span>
  </td></tr></table>
<table class="g">
  <thead><tr><th>S.No</th><th>PARTICULARS</th><th>MFR</th><th>H.S.N</th><th>PACK</th><th>BATCH</th><th>E.D</th><th class="r">QTY</th><th class="r">F/R</th><th class="r">M.R.P</th><th class="r">RATE</th><th class="r">DIS %</th><th class="r">GST %</th><th class="r">AMOUNT</th></tr></thead>
  <tbody>
  {%- for x in rows.l -%}
  <tr><td class="r">{{ loop.index }}</td><td><b>{{ x.name }}</b></td><td>{{ x.mfr }}</td><td>{{ x.hsn }}</td><td>{{ x.pack }}</td><td>{{ x.batch }}</td><td>{{ x.exp }}</td>
    <td class="r">{{ "%g"|format(x.qty) }}</td><td class="r">{{ "%g"|format(x.free) if x.free else "-" }}</td><td class="r">{{ x.mrp }}</td>
    <td class="r">{{ "%.2f"|format(x.rate) }}</td><td class="r">{{ "%.2f"|format(x.dis) if x.dis else "-" }}</td><td class="r">{{ "%.2f"|format(x.gst) if x.gst != "" else "" }}</td><td class="r">{{ "%.2f"|format(x.amt) }}</td></tr>
  {%- endfor -%}
  </tbody>
</table>
<table class="g" style="margin-top:3px"><tr>
  <td style="width:62%; padding:0">
    {%- if rows.slab -%}
    <table class="g" style="border:none"><tr><th>GST HEAD</th>{% for k in [0,5,12,18,28] %}<th class="r">GST {{ "%.2f"|format(k) }} %</th>{% endfor %}</tr>
      <tr><td>SALE VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r">{{ "%.2f"|format(rows.slab[k].v) if k in rows.slab else "" }}</td>{% endfor %}</tr>
      <tr><td>SGST VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r">{{ "%.2f"|format(rows.slab[k].t / 2) if k in rows.slab else "" }}</td>{% endfor %}</tr>
      <tr><td>CGST VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r">{{ "%.2f"|format(rows.slab[k].t / 2) if k in rows.slab else "" }}</td>{% endfor %}</tr>
      <tr><td>GST VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r">{{ "%.2f"|format(rows.slab[k].t) if k in rows.slab else "" }}</td>{% endfor %}</tr></table>
    {%- endif -%}
    <div style="padding:3px 4px">Tot Item / Qty : <b>{{ rows.l|length }} / {{ "%g"|format(rows.qty) }}</b></div>
  </td>
  <td style="width:38%; padding:0"><table class="nb" style="width:100%">
    <tr><td>Goods Value :</td><td class="r">{{ "%.2f"|format(doc.net_total) }}</td></tr>
    <tr><td>Tot GST amt :</td><td class="r">{{ "%.2f"|format(doc.total_taxes_and_charges or 0) }}</td></tr>
    <tr><td>Round.off Val :</td><td class="r">{{ "%.2f"|format(doc.rounding_adjustment or 0) }}</td></tr>
    <tr><td class="h">Net Amount :</td><td class="big r">{{ "%.2f"|format(doc.rounded_total or doc.grand_total) }}</td></tr></table></td>
</tr><tr><td colspan="2"><b>{{ doc.in_words }}</b></td></tr></table>
<table style="margin-top:3px"><tr>
  <td class="box" style="width:38%"><b><i><u>Terms and Conditions</u></i></b><br>Goods once sold will not be taken back or exchanged.<br>Bills not paid due date will attract 24% interest.<br>All disputes subject to Jurisdiction only.</td>
  <td class="box" style="width:30%"><b>Bank Details- {{ co.company_name or doc.company }}</b><br>{{ (co.bank_details_print or "")|replace("\\n", "<br>")|safe }}</td>
  <td class="box r" style="width:32%">For {{ co.company_name or doc.company }}<br><br><br>Authorised Signatory</td>
</tr></table>
<table class="box" style="margin-top:3px"><tr>
  <td>Bill No : <b>{{ doc.name }}</b> &nbsp; Date : {{ frappe.utils.formatdate(doc.posting_date, "dd-MM-yyyy") }} &nbsp; Type : {{ "CASH" if cash else "CREDIT" }} &nbsp; Route : {{ cu.area or "" }} &nbsp; Due Date : {{ frappe.utils.formatdate(doc.due_date, "dd-MM-yyyy") if doc.due_date else "" }}</td>
  <td class="r">Net Amt : <span class="h">{{ "%.2f"|format(doc.rounded_total or doc.grand_total) }}</span></td>
  <td class="r" style="width:22%; padding-top:18px">Party Signature with Seal</td></tr></table>
</div>
<div id="footer-html" class="visible-pdf"><div style="text-align:right; font-size:9px">Page <span class="page"></span> of <span class="topage"></span></div></div>
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


def custom_fields(bank):
    from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
    create_custom_fields({
        "Company": [dict(fieldname="bank_details_print", label="Bank details (printed on invoices)", fieldtype="Small Text", insert_after="fssai_no")],
        "Sales Invoice": [dict(fieldname="cases", label="Cases", fieldtype="Data", insert_after="due_date", print_hide=1)],
    }, update=True)
    if bank:
        for c in frappe.get_all("Company", pluck="name"):
            frappe.db.set_value("Company", c, "bank_details_print", bank.replace("\\n", "\n"))
        print("  bank details saved on Company")


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
    ap.add_argument("--bank", default="", help="bank lines printed on invoices; use \\n between lines")
    a = ap.parse_args()
    frappe.init(site=a.site)
    frappe.connect()
    frappe.set_user("Administrator")
    try:
        print("custom fields"); custom_fields(a.bank)
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
