# MM Pharma: Marg features in ERPNext and the app

Site: https://erp.drkathiravan.uk  (ERPNext desk)
App: "MM Pharma ERP" (release app-v6 or later)

In the desk, press **Ctrl+K** (Cmd+K on Mac) to search for any page by name, for example "Sales Invoice List".
In the app, almost everything is under the **More** tab. The first four shortcut buttons on **Home** are New bill, Receipt, Purchase bill and Find a bill. You can change them in More → Shortcuts.

Status note: the app screens were built and released but are new. Test each once with a small entry before relying on it.

---

## 1. Sales

### 1. New bill
- **App:** More → New bill. Choose the customer, set the date and credit days, choose Same state GST or Other state IGST, then Add item. For each item pick the batch (earliest expiry is listed first), enter quantity, free quantity, rate and discount %. Tap Save bill. Use Save draft to post it later.
- **ERPNext:** Sales Invoice → New. Tick Update Stock, add items with batch numbers, choose the tax template (Output GST In-state or Out-state), Save, then Submit.

### 2. Bill modification
- **App:** More → Sales bills (or the party page) → open the bill → Edit bill. Change the lines and tap Save changes. A posted bill is cancelled and a corrected bill is created from it, so the bill number changes (it gets a -1 suffix). If saving fails after the cancel, fix the problem and save again.
- Bills brought from Marg as opening balances cannot be edited.
- **ERPNext:** open the invoice. A draft can be edited and saved. A submitted bill needs Cancel, then Amend, then Submit.

### 3. Sales return
- **App:** open the bill → Return goods, enter the quantity coming back for each item and Save return. For a return without the original bill, use More → Sales return.
- **ERPNext:** open the submitted invoice → Create → Return / Credit Note.

### 4. E-receipt for customer
- **App:** More → Customer receipt (or Collect on the party page). Enter the amount and mode and Save receipt. Then use Share e-receipt for the PDF, or WhatsApp.
- **ERPNext:** Payment Entry → Print → format "MM Pharma Receipt".

### 5. E-way bill
- **App:** open the bill → E-way bill. Enter the transporter, vehicle number and distance. Generate e-way bill sends it to the GST portal. This only works after the GST API credentials are set in GST Settings. Otherwise use Download JSON and upload that file at ewaybillgst.gov.in under Bulk Generation.
- **ERPNext:** open the submitted invoice → Create → E-Waybill.

### 6. PDF bill download
- **App:** open the bill → Share PDF. It uses the Marg-style landscape print format.
- **ERPNext:** open the invoice → Print → "MM Pharma Tax Invoice" → PDF.

### 7. Excel bill download
- **App:** open the bill → Excel. The file is shared like the PDF.
- **ERPNext:** Menu → Export on the list view (use the Report view for the columns you want).

---

## 2. Purchase

### 8. Purchase bill entry
- **App:** More → Purchase bill. Choose the supplier and enter the supplier's bill number and date. For each item enter the batch, expiry month, MRP, quantity, free quantity and purchase rate, then Save purchase.
- **ERPNext:** Purchase Invoice → New. Tick Update Stock, add items with batch and expiry, set the Input GST template, Save and Submit.

### 9. Purchase return
- **App:** open the purchase bill → Return goods. For expired stock, use More → Purchase return and choose "From Expired stock".
- **ERPNext:** open the submitted Purchase Invoice → Create → Return / Debit Note.

---

## 3. Money

### 10. Payment entry for customer
- **App:** More → Customer receipt, or the Collect button on a party. It clears the oldest bills first, and any extra stays as an advance.
- **ERPNext:** Payment Entry → New → type Receive, party type Customer.

### 11. Payment entry for supplier
- **App:** More → Supplier payment, or the Pay supplier button on a purchase bill.
- **ERPNext:** Payment Entry → New → type Pay, party type Supplier.

---

## 4. Masters

### 12. New item
- **App:** More → Create new → Item. Fill the name, unit, HSN, GST rate, salt and manufacturer. Batch and expiry tracking are switched on automatically.
- **ERPNext:** Item → New.

### 13. New HSN code
- **App:** More → Create new → HSN code.
- **ERPNext:** GST HSN Code → New.

### 14. New salt
- **App:** More → Create new → Salt. The salt picker on New item uses this list. The list starts empty because your items have no salt details yet.
- **ERPNext:** Salt → New.

### 15. New supplier
- **App:** More → Create new → Supplier. Fill the address, GSTIN and phone.
- **ERPNext:** Supplier → New.

### 16. New customer
- **App:** More → Create new → Customer. Fill the address, GSTIN, drug licence numbers and area.
- **ERPNext:** Customer → New.

---

## 5. Stock

### 17. Stock adjustment
- **App:** More → Stock adjustment. Choose Add stock or Remove stock, give a reason, add items with batch and quantity, and tap Post adjustment. It creates a Stock Entry.
- **ERPNext:** Stock Entry → New → type Material Receipt (add) or Material Issue (remove).

### 18. Current stock
- **App:** the Stock tab, or More → Reports → Current stock.
- **ERPNext:** Stock Balance report.

### 19. Batch wise stock summary
- **App:** More → Reports → Batch wise stock.
- **ERPNext:** Batch-Wise Balance History report.

### 20. Short expiry
- **App:** More → Reports → Short expiry (next 90 days), or the 30/60/90 day chips on the Expiry register.
- **ERPNext:** Expiry Register report with the within-days filter.

### 21. Expired products
- **App:** More → Reports → Expired products.
- **ERPNext:** Expiry Register report with the days filter set to 0.

---

## 6. Reports

### 22. Monthly turnover
- **App:** More → Reports → Monthly turnover. Choose the date range with the chips (This month, This year, Last year) or set your own dates. Excel is at the bottom.

### 23. Item wise turnover
- **App:** More → Reports → Item wise turnover.

### 24. Company wise turnover
- **App:** More → Reports → Company wise turnover. It groups sales by the manufacturer set on each item.
- **ERPNext (for 22 to 24):** Sales Register, or Sales Analytics grouped by Item or Item Group.

### 25. Gross sales report
- **App:** More → Reports → Gross sales report.
- **ERPNext:** Sales Register report.

### 26. Gross purchase report
- **App:** More → Reports → Gross purchase report.
- **ERPNext:** Purchase Register report.

### 27. Debtor ledger
- **App:** the party page → Ledger. Or More → Reports → Debtor ledger, then choose the customer. Share sends the statement by WhatsApp.
- **ERPNext:** General Ledger report with party type Customer and the party name.

### 28. Trial balance
- **App:** More → Reports → Trial balance.
- **ERPNext:** Trial Balance report.

### 29. Profit and loss
- **App:** More → Reports → Profit and loss.
- **ERPNext:** Profit and Loss Statement report.

### 30. Balance sheet
- **App:** More → Reports → Balance sheet.
- **ERPNext:** Balance Sheet report.

### 31. GST 1
- **App:** More → Reports → GSTR-1. Use the chips for B2B, B2C large, B2C small, credit notes, nil and exempt, and HSN summary. Excel exports each view.
- **ERPNext:** GSTR-1 report. Then use the GST Return tools from India Compliance if you file from ERPNext.

### 32. GST 3B
- **App:** More → Reports → GSTR-3B summary. It shows taxable value, output tax, input credit and the net tax payable, worked out from your bills.
- Check the figures against the GST portal before filing. Reverse-charge tax is left out, and credit is not matched against the supplier's GSTR-2B.
- **ERPNext:** GST Balance and GSTR-3B Details reports.

---

## 7. Shortcuts

### 33. Shortcut key creation
- **App:** More → Shortcuts. Tick the buttons you want at the top of Home. On a keyboard, Alt+N is a new bill, Alt+P a purchase, Alt+R a receipt, Alt+Y a supplier payment, Alt+S stock, Alt+B find a bill, Alt+L ledger, Alt+T turnover and Alt+I a new item.
- **ERPNext:** Ctrl+K opens the search bar. Press Ctrl+B for a new document from a list, and Ctrl+S to save.

---

## Daily routine (under 10 bills a day)

1. Morning: Home → check what is overdue, expiring and low in stock.
2. Billing: More → New bill, or New order from the party page.
3. Payments received: Collect on the party page, then Share e-receipt.
4. Goods received: More → Purchase bill.
5. Month end: Reports → GSTR-1 and GSTR-3B, Excel to your accountant, then Trial balance and Profit and loss.

## Known gaps

- Customer addresses and DL numbers on old bills are blank until the Marg party master export is loaded.
- MFR, HSN, pack and MRP columns are blank on old Marg bills, because Marg's bill export does not carry them.
- Opening bills from Marg cannot be edited.
- The salt list is empty. Add salts by hand.
