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
{%- set co = frappe.db.get_value("Company", doc.company, ["company_name","phone_no","drug_licence_1","drug_licence_2","fssai_no","gstin","bank_details_print","upi_qr","print_address"], as_dict=True) or {} -%}
{%- set cu = frappe.db.get_value("Customer", doc.customer, ["drug_licence_1","drug_licence_2","mobile_no","area"], as_dict=True) or {} -%}
{%- set ad = namespace(t="") -%}
{%- if doc.address_display -%}{%- set ad.t = doc.address_display|striptags -%}
{%- else -%}{%- for a in frappe.get_all("Address", filters=[["Dynamic Link", "link_name", "=", doc.customer], ["Dynamic Link", "link_doctype", "=", "Customer"]], fields=["address_line1", "address_line2", "city", "pincode"], limit_page_length=1) -%}{%- set ad.t = [a.address_line1, a.address_line2, a.city, a.pincode]|select|join("\\n") -%}{%- endfor -%}{%- endif -%}
{%- set billed_by = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner -%}
{%- set pdc = namespace(v=0) -%}
{%- for pe in frappe.get_all("Payment Entry", filters=[["party_type", "=", "Customer"], ["party", "=", doc.customer], ["docstatus", "=", 1], ["reference_date", ">", doc.posting_date], ["clearance_date", "is", "not set"]], fields=["paid_amount"]) -%}{%- set pdc.v = pdc.v + pe.paid_amount -%}{%- endfor -%}
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
{%- set pend = frappe.get_all("Sales Invoice", filters={"customer": doc.customer, "docstatus": 1, "outstanding_amount": [">", 0], "name": ["!=", doc.name]}, fields=["name", "posting_date", "due_date", "grand_total", "outstanding_amount"], order_by="posting_date asc", limit_page_length=500) -%}
{%- set tot_due = pend|sum(attribute="outstanding_amount") -%}
{%- set fmt = "dd-MM-yyyy" -%}
<style>
  .print-format {margin-top: 4mm; margin-bottom: 9mm; margin-left: 5mm; margin-right: 5mm; page-size: A4; orientation: Landscape;}
  .inv {font-family: "Times New Roman", Times, serif; font-size:9.5pt; color:#000; line-height:1.25;}
  .inv table {border-collapse:collapse; width:100%; table-layout:auto;} .inv table.it {table-layout:fixed;} .inv td, .inv th {padding:1px 3px; vertical-align:top;}
  .inv .main {margin-right:22%;} .inv .strip {position:fixed; top:0; bottom:0; right:0; width:21%;}
  .inv .bx {border:1.3px solid #000;} .inv .gy {background:#d9d9d9;}
  .inv .r {text-align:right;} .inv .c {text-align:center;} .inv .b {font-weight:bold;}
  .inv .h {font-size:12.5pt; font-weight:bold;} .inv .big {font-size:15pt; font-weight:bold;}
  .inv .u {text-decoration:underline; font-style:italic; font-weight:bold;}
  .inv .nb td, .inv .nb th {border:none; padding:0 3px;}
  .inv .it th {border:1px solid #000; background:#e8e8e8; padding:3px; text-align:left;}
  .inv .it td {border-left:1px solid #000; border-right:1px solid #000; padding:2px 3px; font-weight:bold; font-size:8.5pt;}
  .inv .it tr.last td {border-bottom:1px solid #000;}
  .inv thead {display:table-header-group;} .inv tr {page-break-inside:avoid;}
  .inv .tb {border:1.3px solid #000; border-top:none;} .inv .nw td {white-space:nowrap;}
</style>
<div class="inv">
<div class="strip">
  <table class="bx gy" style="margin-bottom:2px"><tr><td class="b" style="font-size:8.5pt">{{ co.company_name or doc.company }}<br>{{ (co.print_address or "")|replace("\\n", ", ") }}</td></tr>
  <tr><td class="b" style="font-size:8.5pt; border-top:1px solid #000">{{ doc.customer_name }}<br>{{ ad.t|replace("\\n", ", ") }}{% if doc.place_of_supply %} State : {{ doc.place_of_supply[:2] }}{% endif %}<br>{{ cu.mobile_no or "" }}</td></tr></table>
  <div class="c u" style="font-size:11pt">Pending Bills</div>
  <table class="nb" style="font-size:8.5pt"><tr><td class="u">Bill No</td><td class="u c">Date</td><td class="u r">Balance</td></tr>
  {%- for p in pend[:16] -%}<tr><td style="font-size:7.5pt">{{ "*" if p.due_date and p.due_date < doc.posting_date else "" }}{{ p.name }}</td><td class="c b">{{ frappe.utils.formatdate(p.posting_date, fmt) }}</td><td class="r b">{{ "%.2f"|format(p.outstanding_amount) }}</td></tr>{%- endfor -%}</table>
  <table class="bx" style="margin-top:4px; font-size:9pt"><tr><td class="b" style="width:46%">Bill No<br>Date<br>Type<br>Route<br>Due Date<br>Bill Disc</td>
    <td class="b">: {{ doc.name }}<br>: {{ frappe.utils.formatdate(doc.posting_date, fmt) }}<br>: {{ "CASH" if cash else "CREDIT" }}<br>: {{ cu.area or "" }}<br>: {{ frappe.utils.formatdate(doc.due_date, fmt) if doc.due_date else "" }}<br>: </td></tr>
    {%- if co.upi_qr -%}<tr><td colspan="2" class="c"><img src="{{ co.upi_qr }}" style="width:45%"></td></tr>{%- endif -%}</table>
  <table class="bx gy" style="margin-top:2px"><tr><td class="b">Net Amt : <span class="big">{{ "%.2f"|format(doc.rounded_total or doc.grand_total) }}</span></td></tr></table>
  <div style="margin-top:3px"><img src="__TAMIL_A__" style="width:98%"></div>
  <div class="b" style="position:absolute; bottom:0; left:0; font-size:10pt">Party Signature with Seal</div>
</div>
<div class="main">
<table class="it">
 <colgroup><col style="width:3%"><col style="width:24%"><col style="width:5.5%"><col style="width:8%"><col style="width:6%"><col style="width:10%"><col style="width:5.5%"><col style="width:5%"><col style="width:4%"><col style="width:7%"><col style="width:7%"><col style="width:4%"><col style="width:4%"><col style="width:7%"></colgroup>
 <thead>
  <tr><td colspan="14" style="padding:0">
   <table style="margin-bottom:2px"><tr>
    <td class="bx gy" style="width:62%; padding:2px 4px"><table class="nb"><tr><td style="width:15mm"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5"><rect x="8" y="2" width="8" height="20" rx="2"/><rect x="2" y="8" width="20" height="8" rx="2"/></svg></td>
      <td><span class="h">{{ co.company_name or doc.company }}</span><br>{{ (co.print_address or "")|replace("\\n", "<br>")|safe }}<br>{% if co.phone_no %}Phone : {{ co.phone_no }}<br>{% endif %}DL.No:{{ co.drug_licence_1 or "" }}{% if co.drug_licence_2 %} {{ co.drug_licence_2 }}{% endif %}<br>GSTIN : {{ doc.company_gstin or co.gstin or "" }}{% if co.fssai_no %} &nbsp; FSSAI : {{ co.fssai_no }}{% endif %}</td></tr></table></td>
    <td style="width:1%"></td>
    <td class="bx" style="padding:0"><table class="nb" style="font-size:9.5pt"><tr><td class="h" colspan="2">{{ "CREDIT NOTE" if doc.is_return else "GST INVOICE" }}</td><td class="h" colspan="2">{{ "CASH BILL" if cash else "CREDIT BILL" }}</td></tr>
      <tr><td class="b">Invoice No</td><td class="h">: {{ doc.name }}</td><td class="b">BILL TIME :</td><td>{{ (doc.posting_time|string)[:5] }}</td></tr>
      <tr><td class="b">Invoice Date</td><td class="b">: {{ frappe.utils.formatdate(doc.posting_date, fmt) }}</td><td class="b">GRN Date :</td><td>{{ frappe.utils.formatdate(doc.posting_date, fmt) }}</td></tr>
      <tr><td class="b">EWay Bill No</td><td>: {{ doc.get("ewaybill") or "" }}</td><td class="b">Due Date :</td><td>{{ frappe.utils.formatdate(doc.due_date, fmt) if doc.due_date else "" }}</td></tr>
      <tr><td class="b">Cases</td><td>: {{ doc.get("cases") or "" }}</td><td></td><td></td></tr>
      <tr><td class="b">Billed By</td><td>: {{ billed_by }}</td><td></td><td></td></tr>
      <tr><td class="b">Transport</td><td>: {{ doc.get("transporter_name") or "" }}</td><td></td><td></td></tr></table></td>
   </tr></table>
   <table style="margin-bottom:2px"><tr>
    <td class="bx" style="width:62%; padding:2px 4px"><table class="nb"><tr><td><span class="h" style="font-size:12pt">{{ doc.customer_name }}</span><br><b>{{ ad.t|replace("\\n", "<br>")|safe }}{% if doc.place_of_supply %} State : {{ doc.place_of_supply[:2] }}{% endif %}</b><br><b>{% if cu.mobile_no %}Phone No : {{ cu.mobile_no }}<br>{% endif %}DL.No. : {{ cu.drug_licence_1 or "" }}{% if cu.drug_licence_2 %} {{ cu.drug_licence_2 }}{% endif %}{% if doc.billing_address_gstin %}<br>GSTIN : {{ doc.billing_address_gstin }}{% endif %}</b></td>
      {%- if co.upi_qr -%}<td style="width:26mm" class="r"><img src="{{ co.upi_qr }}" style="width:25mm"></td>{%- endif -%}</tr></table></td>
    <td style="width:1%"></td>
    <td class="bx" style="padding:2px 4px"><span class="u" style="font-size:10.5pt">Pending Bill Details &nbsp; OUTSTANDING: {{ "%.2f"|format(tot_due) }}</span>
      <table class="nb" style="font-size:8.5pt"><tr><td class="u">Bill No</td><td class="u">Bill Date</td><td class="u r">Bill Amount</td><td class="u r">Outstanding</td></tr>
      {%- for p in pend[:5] -%}<tr><td style="font-size:7.5pt">{{ "*" if p.due_date and p.due_date < doc.posting_date else "" }}{{ p.name }}</td><td class="b">{{ frappe.utils.formatdate(p.posting_date, fmt) }}</td><td class="r b">{{ "%.2f"|format(p.grand_total) }}</td><td class="r b">{{ "%.2f"|format(p.outstanding_amount) }}</td></tr>{%- endfor -%}</table>
      <span class="u">TOTAL BILLS DUE : {{ pend|length }}</span></td>
   </tr></table>
  </td></tr>
  <tr class="it"><th style="width:3%">S.No</th><th style="width:24%">PARTICULARS</th><th style="width:5.5%">MFR</th><th style="width:8%">H.S.N</th><th style="width:6%">PACK</th><th style="width:10%">BATCH</th><th style="width:5.5%">E.D</th><th class="r" style="width:5%">QTY</th><th class="r" style="width:4%">F/R</th><th class="r" style="width:7%">M.R.P</th><th class="r" style="width:7%">RATE</th><th class="r" style="width:4%">DIS %</th><th class="r" style="width:4%">GST %</th><th class="r" style="width:7%">AMOUNT</th></tr>
 </thead>
 <tbody class="it">
  {%- for x in rows.l -%}
  <tr{% if loop.last %} class="last"{% endif %}><td class="r">{{ loop.index }}</td><td>{{ x.name }}</td><td>{{ x.mfr }}</td><td>{{ x.hsn }}</td><td>{{ x.pack }}</td><td>{{ x.batch }}</td><td>{{ x.exp }}</td>
    <td class="r">{{ "%g"|format(x.qty) }}</td><td class="r">{{ "%g"|format(x.free) if x.free else "-" }}</td><td class="r">{{ x.mrp }}</td>
    <td class="r">{{ "%.2f"|format(x.rate) }}</td><td class="r">{{ "%.2f"|format(x.dis) if x.dis else "-" }}</td><td class="r">{{ "%.2f"|format(x.gst) if x.gst != "" else "" }}</td><td class="r">{{ "%.2f"|format(x.amt) }}</td></tr>
  {%- endfor -%}
 </tbody>
</table>
<div style="margin-top:3px; page-break-inside:avoid">
<div><img src="__TAMIL_B__" style="height:4.6mm"> <b>{{ co.phone_no or "" }}</b></div>
<table class="bx" style="margin-top:2px"><tr>
  <td style="width:60%; padding:0">
    {%- if rows.slab -%}
    <table class="nw" style="width:100%"><tr class="gy"><td class="b">GST HEAD</td>{% for k in [0,5,12,18,28] %}<td class="b r">GST {{ "%.2f"|format(k) }} %</td>{% endfor %}</tr>
      <tr><td class="b">SALE VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r b">{{ "%.2f"|format(rows.slab[k].v) if k in rows.slab else "" }}</td>{% endfor %}</tr>
      <tr><td class="b">SGST VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r b">{{ "%.2f"|format(rows.slab[k].t / 2) if k in rows.slab else "" }}</td>{% endfor %}</tr>
      <tr><td class="b">CGST VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r b">{{ "%.2f"|format(rows.slab[k].t / 2) if k in rows.slab else "" }}</td>{% endfor %}</tr>
      <tr><td class="b">GST VALUE</td>{% for k in [0,5,12,18,28] %}<td class="r b">{{ "%.2f"|format(rows.slab[k].t) if k in rows.slab else "" }}</td>{% endfor %}</tr></table>
    {%- endif -%}
    <div class="b" style="padding:2px 3px">Tot Item / Qty &nbsp; {{ rows.l|length }} / {{ "%g"|format(rows.qty) }} &nbsp;&nbsp;&nbsp; PDC PENDING &nbsp;&nbsp; {{ "%.2f"|format(pdc.v) }}</div>
  </td>
  <td class="gy" style="padding:0"><table class="nb" style="width:100%">
    <tr><td class="b">Goods Value :</td><td class="r b">{{ "%.2f"|format(doc.net_total) }}</td></tr>
    <tr><td class="b">Tot GST amt :</td><td class="r b">{{ "%.2f"|format(doc.total_taxes_and_charges or 0) }}</td></tr>
    <tr><td class="b">Round.off Val :</td><td class="r b">{{ "%.2f"|format(doc.rounding_adjustment or 0) }}</td></tr>
    <tr><td class="h">Net Amount :</td><td class="big r">{{ "%.2f"|format(doc.rounded_total or doc.grand_total) }}</td></tr></table></td>
</tr><tr><td colspan="2" class="b" style="border-top:1px solid #000">{{ doc.in_words }}</td></tr></table>
<table class="tb"><tr>
  <td style="width:30%"><b><i><u>Terms and Conditions</u></i></b><br><b style="font-size:8pt">Goods once sold will not be taken back or exchanged.<br>Bills not paid due date will attract 24% interest.<br>All disputes subject to TIRUPUR Jurisdiction only.</b></td>
  <td style="width:33%; border-left:1px solid #000; font-size:8pt"><b>Bank Details- {{ co.company_name or doc.company }}</b><br><b>{{ (co.bank_details_print or "")|replace("\\n", "<br>")|safe }}</b></td>
  <td class="c" style="border-left:1px solid #000"><b>For {{ co.company_name or doc.company }}<br><br><br>Authorised Signatory</b></td>
</tr></table>
</div>
</div>
</div>
<div id="footer-html" class="visible-pdf"><div style="text-align:right; font-size:8pt; margin-right:22%">Page <span class="page"></span> of <span class="topage"></span></div></div>
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


def custom_fields(bank, qr="", addr="", phone=""):
    from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
    create_custom_fields({
        "Company": [dict(fieldname="bank_details_print", label="Bank details (printed on invoices)", fieldtype="Small Text", insert_after="fssai_no"),
                    dict(fieldname="print_address", label="Address (printed on invoices)", fieldtype="Small Text", insert_after="upi_qr"),
                    dict(fieldname="upi_qr", label="UPI QR image (data URI, printed on invoices)", fieldtype="Long Text", insert_after="bank_details_print")],
        "Sales Invoice": [dict(fieldname="cases", label="Cases", fieldtype="Data", insert_after="due_date", print_hide=1)],
    }, update=True)
    for c in frappe.get_all("Company", pluck="name"):
        if addr: frappe.db.set_value("Company", c, "print_address", addr.replace("\\n", "\n"))
        if phone: frappe.db.set_value("Company", c, "phone_no", phone)
    if qr:
        for c in frappe.get_all("Company", pluck="name"):
            frappe.db.set_value("Company", c, "upi_qr", "data:image/png;base64," + qr)
        print("  UPI QR saved on Company")
    if bank:
        for c in frappe.get_all("Company", pluck="name"):
            frappe.db.set_value("Company", c, "bank_details_print", bank.replace("\\n", "\n"))
        print("  bank details saved on Company")


def print_format():
    html = PRINT_HTML.replace("__TAMIL_A__", "data:image/png;base64,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").replace("__TAMIL_B__", "data:image/png;base64,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")
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
    ap.add_argument("--company-address", default="")
    ap.add_argument("--company-phone", default="")
    ap.add_argument("--upi-qr", default="", help="base64 PNG of the UPI QR")
    ap.add_argument("--bank", default="", help="bank lines printed on invoices; use \\n between lines")
    a = ap.parse_args()
    frappe.init(site=a.site)
    frappe.connect()
    frappe.set_user("Administrator")
    try:
        print("custom fields"); custom_fields(a.bank, getattr(a, "upi_qr", ""), a.company_address, a.company_phone)
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
