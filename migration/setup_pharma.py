#!/usr/bin/env python3
"""
Pharma-distribution setup for ERPNext v15 (MM Pharma Distributors). Safe to re-run.

Run INSIDE the backend container from the bench `sites` folder:
    cd /home/frappe/frappe-bench/sites
    ../env/bin/python setup_pharma.py --site erp.example.com [--commit]

Without --commit it validates and rolls back. What it sets up:
  * Price lists  PTR, PTS, MRP (selling) and "Standard Buying"-style Purchase Rate
  * Item fields   Salt / composition, Manufacturer (company), Drug schedule (H, H1, X, Narcotic, ...)
                  and Item search by salt and manufacturer too
  * Batch fields  MRP and PTR per batch
  * Customer      Drug licence 1 & 2, Salesman, Area, interest % on overdue,
                  "Allow billing when overdue" override
  * Company       Drug licence numbers + GST details printed on invoices
  * Overdue-party billing block (Server Script on Sales Invoice)
"""
import argparse
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

OVERDUE_GRACE_DAYS = 45

CUSTOM_FIELDS = {
    "Item": [
        dict(fieldname="pharma_section", label="Pharma", fieldtype="Section Break", insert_after="description"),
        dict(fieldname="salt_composition", label="Salt / Composition", fieldtype="Small Text", insert_after="pharma_section", in_standard_filter=0, translatable=0),
        dict(fieldname="manufacturer_company", label="Company (Manufacturer)", fieldtype="Data", insert_after="salt_composition", in_list_view=0, in_standard_filter=1),
        dict(fieldname="drug_schedule", label="Drug Schedule", fieldtype="Select", insert_after="manufacturer_company",
             options="\nNone\nH\nH1\nX\nNarcotic\nOTC", in_standard_filter=1),
    ],
    "Batch": [
        dict(fieldname="batch_mrp", label="MRP", fieldtype="Currency", insert_after="expiry_date", in_list_view=1),
        dict(fieldname="batch_ptr", label="PTR", fieldtype="Currency", insert_after="batch_mrp"),
    ],
    "Customer": [
        dict(fieldname="pharma_section", label="Pharma", fieldtype="Section Break", insert_after="customer_details"),
        dict(fieldname="drug_licence_1", label="Drug Licence No. 1", fieldtype="Data", insert_after="pharma_section"),
        dict(fieldname="drug_licence_2", label="Drug Licence No. 2", fieldtype="Data", insert_after="drug_licence_1"),
        dict(fieldname="pharma_col", fieldtype="Column Break", insert_after="drug_licence_2"),
        dict(fieldname="salesman", label="Salesman", fieldtype="Data", insert_after="pharma_col", in_standard_filter=1),
        dict(fieldname="area", label="Area", fieldtype="Data", insert_after="salesman", in_standard_filter=1),
        dict(fieldname="overdue_interest_pct", label="Interest % on overdue (per month)", fieldtype="Percent", insert_after="area"),
        dict(fieldname="allow_overdue_billing", label="Allow billing even when overdue", fieldtype="Check", insert_after="overdue_interest_pct", default="0"),
    ],
    "Company": [
        dict(fieldname="pharma_section", label="Licences (printed on invoices)", fieldtype="Section Break", insert_after="company_description"),
        dict(fieldname="drug_licence_1", label="Drug Licence No. 1 (e.g. 20)", fieldtype="Data", insert_after="pharma_section"),
        dict(fieldname="drug_licence_2", label="Drug Licence No. 2 (e.g. 21)", fieldtype="Data", insert_after="drug_licence_1"),
        dict(fieldname="fssai_no", label="FSSAI No.", fieldtype="Data", insert_after="drug_licence_2"),
    ],
}

OVERDUE_SCRIPT = '''
# Block billing to a party that has bills overdue beyond the grace period.
if not doc.is_return and not doc.get("is_opening") == "Yes":
    cust = frappe.db.get_value("Customer", doc.customer, ["allow_overdue_billing"], as_dict=True)
    if cust and not cust.allow_overdue_billing:
        limit = frappe.utils.add_days(frappe.utils.nowdate(), -%(grace)d)
        rows = frappe.get_all(
            "Sales Invoice",
            filters={"customer": doc.customer, "docstatus": 1, "outstanding_amount": [">", 0.5],
                     "due_date": ["<", limit], "name": ["!=", doc.name]},
            fields=["name", "due_date", "outstanding_amount"],
            order_by="due_date asc", limit_page_length=50)
        if rows:
            total = sum(r.outstanding_amount for r in rows)
            frappe.throw(
                "Billing blocked: %%s has %%d bill(s) overdue by more than %(grace)d days (Rs %%s outstanding, oldest %%s). "
                "Collect payment, or tick 'Allow billing even when overdue' on the customer." %%
                (doc.customer, len(rows), "{:,.2f}".format(total), rows[0].due_date))
''' % dict(grace=OVERDUE_GRACE_DAYS)


def price_lists():
    for name, buying, selling in [("PTR", 0, 1), ("PTS", 0, 1), ("MRP", 0, 1), ("Purchase Rate", 1, 0)]:
        if not frappe.db.exists("Price List", name):
            frappe.get_doc(dict(doctype="Price List", price_list_name=name, enabled=1, buying=buying, selling=selling,
                                currency="INR")).insert()
            print("  price list created:", name)


def item_search():
    # Let the item picker search by salt and manufacturer, not only name/code.
    frappe.make_property_setter(dict(doctype="Item", doctype_or_field="DocType", property="search_fields",
                                     value="item_name,salt_composition,manufacturer_company", property_type="Data"))
    frappe.make_property_setter(dict(doctype="Item", doctype_or_field="DocType", property="show_title_field_in_link",
                                     value="1", property_type="Check"))


def overdue_block():
    name = "Block billing to overdue parties"
    if not frappe.conf.get("server_script_enabled"):
        print("  NOTE: server scripts are disabled on this bench; run  bench set-config -g server_script_enabled true  and restart.")
    if frappe.db.exists("Server Script", name):
        d = frappe.get_doc("Server Script", name)
        d.script, d.disabled = OVERDUE_SCRIPT, 0
        d.save()
    else:
        frappe.get_doc(dict(doctype="Server Script", name=name, script_type="DocType Event",
                            reference_doctype="Sales Invoice", doctype_event="Before Save",
                            script=OVERDUE_SCRIPT, disabled=0)).insert()
    print("  overdue billing block installed (grace %d days past due date)" % OVERDUE_GRACE_DAYS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--commit", action="store_true")
    a = ap.parse_args()
    frappe.init(site=a.site)
    frappe.connect()
    frappe.set_user("Administrator")
    try:
        print("custom fields"); create_custom_fields(CUSTOM_FIELDS, update=True)
        print("price lists"); price_lists()
        print("item search"); item_search()
        print("overdue block"); overdue_block()
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
