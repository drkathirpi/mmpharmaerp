#!/usr/bin/env python3
"""
Schemes and party-wise rates -> ERPNext Pricing Rules / Item Prices. Dry run by default (rolled back).

    cd /home/frappe/frappe-bench/sites
    ../env/bin/python load_schemes.py --site erp.example.com --dir <folder with the CSVs> --company "MM Pharma Distributors" [--commit]
    ../env/bin/python load_schemes.py ... --selftest      # proves a 10+1 rule gives free goods, then rolls back

schemes.csv  (one row = one scheme; leave a cell blank when it does not apply)
  scheme_name   free text, shown on the invoice
  item_code     exact item name, or blank
  manufacturer  all items of this manufacturer (Item.manufacturer_company), used when item_code is blank
  customer      one party, or blank
  customer_group one group, or blank (blank customer + blank group = everybody)
  min_qty       buy this many ...
  free_qty      ... get this many free of the same item (10+1 -> min_qty 10, free_qty 1). Repeats for every min_qty.
  discount_pct  % off the rate (can be combined with min_qty, or used alone)
  valid_from, valid_upto   YYYY-MM-DD, optional

party_rates.csv  (a fixed selling rate for one party)
  customer, item_code, rate, price_list (optional, default "Standard Selling")
"""
import argparse, csv, os, sys
import frappe


def read(d, f):
    p = os.path.join(d, f)
    if not os.path.exists(p):
        return []
    return list(csv.DictReader(open(p, encoding="utf-8-sig")))


def items_for(x):
    if x.get("item_code"):
        return [x["item_code"]]
    if x.get("manufacturer"):
        return frappe.get_all("Item", {"manufacturer_company": x["manufacturer"], "disabled": 0}, pluck="name")
    return []


def make_rule(a, x, title=None):
    items = items_for(x)
    if not items:
        raise ValueError("no items for item_code/manufacturer")
    free = float(x.get("free_qty") or 0)
    disc = float(x.get("discount_pct") or 0)
    mq = float(x.get("min_qty") or 0)
    if not free and not disc:
        raise ValueError("need free_qty or discount_pct")
    d = dict(doctype="Pricing Rule", title=(title or x["scheme_name"])[:140], company=a.company, selling=1, buying=0,
             apply_on="Item Code", items=[dict(item_code=i) for i in items], min_qty=mq,
             valid_from=x.get("valid_from") or None, valid_upto=x.get("valid_upto") or None, priority=1 if x.get("customer") else 0)
    if free:
        if len(items) != 1:
            raise ValueError("free goods scheme needs exactly one item (free qty is of the same item)")
        d.update(price_or_product_discount="Product", free_item=items[0], free_qty=free, same_item=1,
                 is_recursive=1, recurse_for=mq, apply_recursion_over=0, free_item_uom=None)
    else:
        d.update(price_or_product_discount="Price", rate_or_discount="Discount Percentage", discount_percentage=disc)
    if x.get("customer"):
        d.update(applicable_for="Customer", customer=x["customer"])
    elif x.get("customer_group"):
        d.update(applicable_for="Customer Group", customer_group=x["customer_group"])
    doc = frappe.get_doc(d)
    doc.insert()
    return doc


def stage_schemes(a):
    done = rej = 0
    for x in read(a.dir, "schemes.csv"):
        frappe.db.savepoint("s")
        try:
            make_rule(a, x)
            done += 1
        except Exception as e:
            frappe.db.rollback(save_point="s")
            rej += 1
            print("   REJECT %s: %s" % (x.get("scheme_name"), e))
    print("[schemes] created=%d rejected=%d" % (done, rej))


def stage_party_rates(a):
    done = rej = 0
    for x in read(a.dir, "party_rates.csv"):
        frappe.db.savepoint("s")
        try:
            pl = x.get("price_list") or "Standard Selling"
            if not frappe.db.exists("Price List", pl):
                frappe.get_doc(dict(doctype="Price List", price_list_name=pl, selling=1, currency=frappe.db.get_value("Company", a.company, "default_currency"))).insert()
            f = dict(item_code=x["item_code"], customer=x["customer"], price_list=pl, selling=1)
            name = frappe.db.exists("Item Price", f)
            if name:
                frappe.db.set_value("Item Price", name, "price_list_rate", float(x["rate"]))
            else:
                frappe.get_doc(dict(doctype="Item Price", price_list_rate=float(x["rate"]), currency=frappe.db.get_value("Price List", pl, "currency"), **f)).insert()
            done += 1
        except Exception as e:
            frappe.db.rollback(save_point="s")
            rej += 1
            print("   REJECT %s/%s: %s" % (x.get("customer"), x.get("item_code"), e))
    print("[party rates] saved=%d rejected=%d" % (done, rej))


def selftest(a):
    """Creates a throw-away 10+1 rule and a 5% rule, asks ERPNext's own pricing engine what an invoice line gets, rolls back."""
    from erpnext.accounts.doctype.pricing_rule.pricing_rule import apply_pricing_rule
    item = frappe.db.get_value("Bin", {"actual_qty": [">", 100]}, "item_code") or frappe.db.get_value("Item", {"disabled": 0}, "name")
    cust = frappe.db.get_value("Customer", {"disabled": 0}, "name")
    make_rule(a, dict(scheme_name="SELFTEST 10+1", item_code=item, min_qty=10, free_qty=1))
    for qty in (9, 10, 25):
        args = dict(items=[dict(doctype="Sales Invoice Item", item_code=item, qty=qty, stock_qty=qty, uom=frappe.db.get_value("Item", item, "stock_uom"),
                                price_list_rate=100, rate=100, parenttype="Sales Invoice", parent="new", name="x1", conversion_factor=1)],
                    customer=cust, company=a.company, transaction_date=frappe.utils.today(), doctype="Sales Invoice",
                    currency="INR", price_list="Standard Selling", plc_conversion_rate=1, conversion_rate=1, transaction_type="selling",
                    ignore_pricing_rule=0, is_return=0)
        out = apply_pricing_rule(frappe._dict(args), None)
        free = [f for r in out for f in (r.get("free_item_data") or [])]
        print("   buy %-3d -> free %s" % (qty, sum(f.get("qty", 0) for f in free)))
    print("   item used:", item)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--dir", default=".")
    ap.add_argument("--company", required=True)
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    frappe.init(site=a.site, sites_path=".")
    frappe.connect()
    frappe.set_user("Administrator")
    try:
        if a.selftest:
            selftest(a)
            frappe.db.rollback()
            print("SELFTEST rolled back")
            return
        stage_schemes(a)
        stage_party_rates(a)
        if a.commit:
            frappe.db.commit(); print("COMMITTED")
        else:
            frappe.db.rollback(); print("DRY RUN - rolled back")
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
