#!/usr/bin/env python3
"""
Load the CSVs produced by convert_marg.py into ERPNext v15.

Run INSIDE the ERPNext backend container, from the bench `sites` folder, with the
bench virtualenv's python. Defaults to a DRY RUN (everything is validated, then rolled
back); add --commit to really write.

    cd /home/frappe/frappe-bench/sites
    ../env/bin/python /path/load_erpnext.py --site erp.example.com \
        --dir /path/to/csv --company "MM Pharma Distributors" --stage items

Stages (run in this order, each is safe to re-run - existing records are skipped):
    items          UOMs, GST HSN codes, Items (batch + expiry tracking on)
    customers      Customers
    suppliers      Suppliers
    cust-invoices  Opening sales invoices (bill-wise outstanding) via Opening Invoice Creation Tool
    sup-invoices   Opening purchase invoices via the same tool
    unallocated    On-account balances as opening Journal Entries (ties each party to the ledger)

NOTE: written against ERPNext/Frappe v15 APIs and NOT yet executed against a live site.
Do the first run on a throwaway site and read every line of the dry-run output.
Rejected rows are written to rejects_<stage>.csv next to the input files.
"""
import argparse, csv, os, sys
import frappe


def read(d, name):
    with open(os.path.join(d, name), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


class Run:
    def __init__(self, a):
        self.a, self.done, self.skipped, self.rejects = a, 0, 0, []

    def reject(self, row, why):
        self.rejects.append(dict(row, _error=str(why)[:300]))

    def finish(self, stage):
        if self.a.commit:
            frappe.db.commit()
        else:
            frappe.db.rollback()
        print("[%s] created=%d skipped(existing)=%d rejected=%d  (%s)" % (
            stage, self.done, self.skipped, len(self.rejects), "COMMITTED" if self.a.commit else "DRY RUN - rolled back"))
        if self.rejects:
            path = os.path.join(self.a.dir, "rejects_%s.csv" % stage)
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=list(self.rejects[0].keys()))
                w.writeheader()
                w.writerows(self.rejects)
            print("    rejected rows -> %s" % path)
            for r in self.rejects[:5]:
                print("    e.g.", r.get("item_code") or r.get("name") or r.get("party") or r.get("customer") or r.get("supplier"), "->", r["_error"])

    def insert(self, doc, row, key_field=None):
        frappe.db.savepoint("row")
        try:
            frappe.get_doc(doc).insert()
            self.done += 1
            if self.a.commit and self.done % 100 == 0:
                frappe.db.commit()
        except Exception as e:
            frappe.db.rollback(save_point="row")  # undo only this row, keep earlier ones
            self.reject(row, e)


def first_leaf(doctype):
    return frappe.db.get_value(doctype, {"is_group": 0}, "name")


# ------------------------------------------------------------------ stages
def stage_items(a):
    r = Run(a)
    # Pharma goods are mostly HSN 3004 (4 digits). India Compliance defaults to 6/8 digits;
    # 4 digits is legal up to Rs 5 crore turnover - switch to 6 in GST Settings if above that.
    if frappe.db.get_single_value("GST Settings", "validate_hsn_code"):
        frappe.db.set_single_value("GST Settings", "min_hsn_digits", "4")
        frappe.db.commit()  # a harmless setting; saved even in a dry run (India Compliance reads it from cache)
        frappe.clear_document_cache("GST Settings", "GST Settings")
        frappe.clear_cache(doctype="GST Settings")
    for u in read(a.dir, "uoms.csv"):
        if not frappe.db.exists("UOM", u["uom_name"]):
            frappe.get_doc(dict(doctype="UOM", uom_name=u["uom_name"])).insert()
    abbr = frappe.db.get_value("Company", a.company, "abbr")
    templates = {}
    for it in read(a.dir, "items.csv"):
        code = it["item_code"]
        if frappe.db.exists("Item", code):
            r.skipped += 1
            continue
        hsn = it["gst_hsn_code"]
        if hsn and len(hsn) in (4, 6, 8):
            if not frappe.db.exists("GST HSN Code", hsn):
                frappe.get_doc(dict(doctype="GST HSN Code", hsn_code=hsn, description="Imported from Marg")).insert()
        else:
            hsn = ""  # invalid in Marg too; see QA-report 'Items_bad_HSN' and fix by hand
        doc = dict(doctype="Item", item_code=code, item_name=code, item_group="Products",
                   stock_uom=it["stock_uom"], is_stock_item=1, has_batch_no=1, create_new_batch=1,
                   has_expiry_date=1, shelf_life_in_days=730, gst_hsn_code=hsn, description=code)
        rate = it.get("gst_rate")
        if rate:
            key = str(int(float(rate))) if float(rate).is_integer() else rate
            if key not in templates:
                templates[key] = frappe.db.get_value("Item Tax Template", {"gst_rate": float(rate), "company": a.company}, "name")
            if templates[key]:
                doc["taxes"] = [dict(item_tax_template=templates[key])]
        r.insert(doc, it)
    missing = [k for k, v in templates.items() if not v]
    if missing:
        print("    WARNING: no Item Tax Template found for GST %s%% - items were created without tax template; "
              "run GST setup for the company, then re-assign." % ", ".join(missing))
    r.finish("items")


def stage_customers(a):
    r = Run(a)
    grp, terr = first_leaf("Customer Group"), first_leaf("Territory")
    for c in read(a.dir, "customers.csv"):
        if frappe.db.exists("Customer", {"customer_name": c["name"]}):
            r.skipped += 1
            continue
        details = " | ".join(x for x in [c["address"], "Ph: " + c["phone"] if c["phone"] else "",
                                          "Mob: " + c["mobile"] if c["mobile"] else "",
                                          "Marg interest %s%%" % c["interest_rate"] if c["interest_rate"] else "",
                                          "Marg series " + c["series"] if c["series"] else ""] if x)
        r.insert(dict(doctype="Customer", customer_name=c["name"], customer_type="Company",
                      customer_group=grp, territory=terr, customer_details=details), c)
    r.finish("customers")


def stage_suppliers(a):
    r = Run(a)
    grp = first_leaf("Supplier Group")
    for s in read(a.dir, "suppliers.csv"):
        if frappe.db.exists("Supplier", {"supplier_name": s["name"]}):
            r.skipped += 1
            continue
        r.insert(dict(doctype="Supplier", supplier_name=s["name"], supplier_type="Company",
                      supplier_group=grp, supplier_details=" | ".join(x for x in [s["address"], s["phone"]] if x)), s)
    r.finish("suppliers")


def _opening_invoices(a, fname, party_col, invoice_type, party_doctype, stage):
    r = Run(a)
    abbr = frappe.db.get_value("Company", a.company, "abbr")
    temp = "Temporary Opening - %s" % abbr
    if not frappe.db.exists("Account", temp):
        sys.exit("Account '%s' not found - check --company / chart of accounts" % temp)
    rows, total = read(a.dir, fname), 0.0
    tool = frappe.get_doc(dict(doctype="Opening Invoice Creation Tool", company=a.company,
                               invoice_type=invoice_type, create_missing_party=0))
    for b in rows:
        amt = float(b["outstanding"])
        if not frappe.db.exists(party_doctype, {("customer_name" if party_doctype == "Customer" else "supplier_name"): b[party_col]}):
            r.reject(b, "%s not created yet - run the parties stage first" % party_doctype)
            continue
        party = frappe.db.get_value(party_doctype, {("customer_name" if party_doctype == "Customer" else "supplier_name"): b[party_col]}, "name")
        tool.append("invoices", dict(party=party, temporary_opening_account=temp, posting_date=b["posting_date"],
                                     due_date=b["due_date"] or b["posting_date"], item_name="Opening Invoice Item",
                                     outstanding_amount=amt, invoice_number=b["invoice_no"], qty=1))
        total += amt
        r.done += 1
    print("    prepared %d bills, total Rs %.2f (compare with the Marg report total)" % (r.done, total))
    if a.commit and r.done:
        tool.make_invoices()  # may run as a background job for large batches; watch the 'long' queue
    r.finish(stage)


def stage_cust_invoices(a):
    _opening_invoices(a, "opening_invoices_customers.csv", "customer", "Sales", "Customer", "cust-invoices")


def stage_sup_invoices(a):
    _opening_invoices(a, "opening_invoices_suppliers.csv", "supplier", "Purchase", "Supplier", "sup-invoices")


def stage_unallocated(a):
    r = Run(a)
    abbr = frappe.db.get_value("Company", a.company, "abbr")
    temp = "Temporary Opening - %s" % abbr
    recv = frappe.db.get_value("Company", a.company, "default_receivable_account")
    pay = frappe.db.get_value("Company", a.company, "default_payable_account")
    for u in read(a.dir, "opening_unallocated.csv"):
        amt = float(u["unallocated"])
        ptype = "Customer" if u["role"] == "customer" else "Supplier" if u["role"] == "supplier" else None
        if not ptype:
            r.reject(u, "role must be customer or supplier - decide by hand")
            continue
        field = "customer_name" if ptype == "Customer" else "supplier_name"
        party = frappe.db.get_value(ptype, {field: u["party"]}, "name")
        if not party:
            r.reject(u, "%s not found" % ptype)
            continue
        dr = amt > 0  # + = party owes us (Dr); - = we owe party / advance (Cr)
        r.insert(dict(doctype="Journal Entry", voucher_type="Opening Entry", company=a.company, is_opening="Yes",
                      posting_date=a.cutover, user_remark="Marg on-account balance (not tied to a bill)",
                      accounts=[dict(account=recv if ptype == "Customer" else pay, party_type=ptype, party=party,
                                     debit_in_account_currency=abs(amt) if dr else 0,
                                     credit_in_account_currency=0 if dr else abs(amt), is_advance="No"),
                                dict(account=temp, debit_in_account_currency=0 if dr else abs(amt),
                                     credit_in_account_currency=abs(amt) if dr else 0)]), u)
    r.finish("unallocated")


STAGES = {"items": stage_items, "customers": stage_customers, "suppliers": stage_suppliers,
          "cust-invoices": stage_cust_invoices, "sup-invoices": stage_sup_invoices, "unallocated": stage_unallocated}

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--site", required=True)
    p.add_argument("--dir", required=True, help="folder with the CSVs from convert_marg.py")
    p.add_argument("--company", required=True, help="exact Company name in ERPNext")
    p.add_argument("--stage", required=True, choices=list(STAGES))
    p.add_argument("--cutover", help="YYYY-MM-DD posting date for opening journal entries (required for 'unallocated')")
    p.add_argument("--commit", action="store_true", help="really write (default: dry run, rolled back)")
    p.add_argument("--sites-path", default=".")
    a = p.parse_args()
    if a.stage == "unallocated" and not a.cutover:
        sys.exit("--cutover is required for the unallocated stage")
    frappe.init(site=a.site, sites_path=a.sites_path)
    frappe.connect()
    frappe.set_user("Administrator")
    STAGES[a.stage](a)
    frappe.destroy()
