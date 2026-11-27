/* entries.js: bills, purchase bills, returns, payments, stock adjustment, e-way bill, files (PDF/Excel) */

/* ---------- files: share a PDF, an .xlsx or any text file ---------- */
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  const u16 = v => [v & 255, v >> 8 & 255], u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255];
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), c = crc32(d);
    const h = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0x21, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), 0, 0]);
    parts.push(h, n, d);
    cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0x21, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), n);
    off += h.length + n.length + d.length;
  }
  let cl = 0; cen.forEach(x => cl += x.length);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), 0, 0]);
  const all = [...parts, ...cen, end], out = new Uint8Array(all.reduce((a, x) => a + x.length, 0)); let p = 0; all.forEach(x => { out.set(x, p); p += x.length; });
  return out;
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const colName = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const xe = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function makeXlsx(rows, sheet = 'Sheet1') {
  const w = []; rows.forEach(r => r.forEach((v, i) => { w[i] = Math.max(w[i] || 8, Math.min(48, String(v ?? '').length + 2)); }));
  const sd = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => { const ref = colName(ci) + (ri + 1); if (v === '' || v == null) return ''; return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`; }).join('')}</row>`).join('');
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zipStore([
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xe(sheet.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', X + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${w.map((x, i) => `<col min="${i + 1}" max="${i + 1}" width="${x}" customWidth="1"/>`).join('')}</cols><sheetData>${sd}</sheetData></worksheet>`],
  ]);
}
async function shareFile(file, data, title, mime) { /* data: base64 string */
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (P && P.Filesystem && P.Share) { const w = await P.Filesystem.writeFile({ path: file, data, directory: 'CACHE' }); await P.Share.share({ title, text: title, url: w.uri, dialogTitle: title }); }
  else { const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u], { type: mime })); a.download = file; a.click(); }
}
async function shareXlsx(rows, name, title) {
  try { await shareFile(name.replace(/[^A-Za-z0-9_-]+/g, '_') + '.xlsx', b64(makeXlsx(rows, name)), title || name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
  catch (e) { if (!/cancel/i.test(e.message)) toast(e.message || 'Could not share the file', 6000); }
}
async function shareText(file, text, title) { try { await shareFile(file, btoa(unescape(encodeURIComponent(text))), title || file, 'text/plain'); } catch (e) { if (!/cancel/i.test(e.message)) toast(e.message, 6000); } }

/* Excel copy of one bill */
function billRows(d, purchase) {
  const rows = [[S.company], [purchase ? 'PURCHASE BILL' : 'TAX INVOICE'], [], [purchase ? 'Supplier' : 'Customer', d.customer_name || d.supplier_name || ''], ['Bill no', d.name], purchase && d.bill_no ? ['Supplier bill no', d.bill_no] : null, ['Date', d.posting_date], ['Due date', d.due_date || ''], [], ['S.No', 'Particulars', 'Batch', 'Expiry', 'Qty', 'Free', 'Rate', 'Disc %', 'Amount']].filter(Boolean);
  if (d.marg_items) d.marg_items.split('\n').forEach((l, i) => { const f = l.split('|'); rows.push([i + 1, f[0], f[5] || '', f[4] || '', +f[1] || 0, +f[2] || 0, +f[3] || 0, 0, +((+f[1] || 0) * (+f[3] || 0)).toFixed(2)]); });
  else d.items.filter(i => !i.is_free_item).forEach((i, n) => rows.push([n + 1, i.item_name, i.batch_no || '', '', i.qty, d.items.filter(x => x.is_free_item && x.item_code === i.item_code).reduce((a, x) => a + x.qty, 0), i.price_list_rate || i.rate, i.discount_percentage || 0, i.amount]));
  rows.push([], ['', 'Total before tax', '', '', '', '', '', '', d.net_total]);
  (d.taxes || []).filter(t => t.tax_amount).forEach(t => rows.push(['', String(t.description).replace(/ - [A-Z]+$/, ''), '', '', '', '', '', '', t.tax_amount]));
  if (d.rounding_adjustment) rows.push(['', 'Round off', '', '', '', '', '', '', d.rounding_adjustment]);
  rows.push(['', 'Bill total', '', '', '', '', '', '', d.rounded_total || d.grand_total]);
  return rows;
}

/* ---------- batches ---------- */
async function ensureBatch(item, id, expiry, mrp) {
  const ex = await list('Batch', { fields: ['name', 'item'], filters: [['name', '=', id]] });
  if (ex.length && ex[0].item === item) return id;
  const bid = ex.length ? id + '-' + (item.replace(/[^A-Z0-9]/gi, '').slice(0, 4) || 'X') : id;
  if (ex.length) { const e2 = await list('Batch', { fields: ['name'], filters: [['name', '=', bid]] }); if (e2.length) return bid; }
  await post('Batch', { batch_id: bid, item, expiry_date: expiry || undefined, batch_mrp: mrp || 0 });
  return bid;
}
const batchesOf = async (item, wh) => {
  const bq = await method('erpnext.stock.doctype.batch.batch.get_batch_qty', { item_code: item, warehouse: wh });
  const ids = (bq || []).filter(b => b.qty > 0.0001).map(b => b.batch_no); if (!ids.length) return [];
  const meta = await list('Batch', { fields: ['name', 'expiry_date', 'batch_mrp', 'purchase_rate', 'cost_price'], filters: [['name', 'in', ids]], limit_page_length: 200 });
  return bq.filter(b => b.qty > 0.0001).map(b => { const m = meta.find(x => x.name === b.batch_no) || {}; return { id: b.batch_no, qty: b.qty, exp: b.expiry_date || m.expiry_date, mrp: m.batch_mrp, pr: m.purchase_rate || 0, cp: m.cost_price || 0 }; }).sort((a, b) => (a.exp || '9999') < (b.exp || '9999') ? -1 : 1);
};
const monthTxt = e => e ? String(new Date(e + 'T00:00:00').getMonth() + 1).padStart(2, '0') + '/' + String(e).slice(2, 4) : '';

/* ---------- save through the same call the ERPNext desk uses ---------- */
async function saveDoc(doc, action) {
  const r = await call('frappe.desk.form.save.savedocs', { doc: JSON.stringify(doc), action });
  return (r.docs || [])[0] || r;
}

/* ---------- bill and purchase editors ---------- */
let ED = null;
const edNew = (kind, ret) => ({ kind, ret: !!ret, party: null, items: [], tax: 'in', date: today(), billNo: '', billDate: today(), days: kind === 'sales' ? 15 : 30, wh: WH(), edit: null, against: null, cancelled: false });
const lineAmt = l => l.qty * l.rate * (1 - (l.disc || 0) / 100);

async function buildDoc() {
  const E = ED, sales = E.kind === 'sales', dt = sales ? 'Sales Invoice' : 'Purchase Invoice';
  const tmpl = (sales ? (E.tax === 'in' ? 'Output GST In-state - ' : 'Output GST Out-state - ') : (E.tax === 'in' ? 'Input GST In-state - ' : 'Input GST Out-state - ')) + S.abbr;
  const taxes = await method('erpnext.controllers.accounts_controller.get_taxes_and_charges', { master_doctype: sales ? 'Sales Taxes and Charges Template' : 'Purchase Taxes and Charges Template', master_name: tmpl });
  const KEEP = ['item_name', 'description', 'uom', 'stock_uom', 'conversion_factor', 'income_account', 'expense_account', 'cost_center', 'item_tax_template', 'item_tax_rate', 'gst_hsn_code', 'gst_treatment', 'is_nil_exempt', 'is_non_gst'];
  const sign = E.ret ? -1 : 1, items = [], det = {};
  for (const l of E.items) {
    if (!det[l.item_code]) det[l.item_code] = await method('erpnext.stock.get_item_details.get_item_details', { args: { item_code: l.item_code, company: S.company, doctype: dt, [sales ? 'customer' : 'supplier']: E.party.name, currency: 'INR', price_list: sales ? 'Standard Selling' : 'Standard Buying', plc_conversion_rate: 1, conversion_rate: 1, qty: 1, transaction_date: E.date, ignore_pricing_rule: 1, warehouse: E.wh, update_stock: 1, set_warehouse: E.wh } });
    const base = {}; KEEP.forEach(k => { if (det[l.item_code][k] != null) base[k] = det[l.item_code][k]; });
    const row = { ...base, item_code: l.item_code, warehouse: E.wh, batch_no: l.batch_no, use_serial_batch_fields: 1 };
    items.push({ ...row, qty: sign * l.qty, price_list_rate: l.rate, discount_percentage: l.disc || 0, rate: +(l.rate * (1 - (l.disc || 0) / 100)).toFixed(4) });
    if (l.free > 0) items.push({ ...row, qty: sign * l.free, price_list_rate: 0, discount_percentage: 0, rate: 0, is_free_item: 1 });
  }
  const due = addDays(E.kind === 'sales' ? E.date : E.billDate, E.days);
  const doc = { doctype: dt, company: S.company, posting_date: E.date, set_posting_time: 1, update_stock: 1, set_warehouse: E.wh, is_return: E.ret ? 1 : 0, return_against: E.against || undefined, taxes_and_charges: tmpl, taxes, items, due_date: E.ret ? E.date : due, ...(sales ? { customer: E.party.name } : { supplier: E.party.name, bill_no: E.billNo, bill_date: E.billDate }) };
  if (E.amend) doc.amended_from = E.amend;
  if (E.edit && E.editStatus === 0) { doc.name = E.edit; doc.creation = E.editCreation; doc.modified = E.editModified; doc.owner = E.editOwner; }
  return doc;
}

async function edSave(post) {
  const E = ED, sales = E.kind === 'sales', dt = sales ? 'Sales Invoice' : 'Purchase Invoice';
  const doc = await buildDoc();
  if (E.edit && E.editStatus === 1 && !E.cancelled) {
    await call('frappe.client.cancel', { doctype: dt, name: E.edit });
    E.cancelled = true; E.amend = E.edit;
    doc.amended_from = E.edit;
  }
  const r = await saveDoc(doc, post ? 'Submit' : 'Save');
  return r;
}

function edScreen() {
  const E = ED, sales = E.kind === 'sales', who = sales ? 'customer' : 'supplier', tot = E.items.reduce((a, l) => a + lineAmt(l), 0), ok = E.party && E.items.length && (sales || E.billNo);
  view.innerHTML = `<section class="sec"><div class="row tap" id="pc" role="button"><div class="grow"><div class="t2">${sales ? 'Customer' : 'Supplier'}</div><div class="t1" style="font-size:17px">${E.party ? esc(E.party.title) : 'Choose ' + who}</div></div>${ic('chev', 18)}</div></section>
  <div class="two"><div>${fld('dt', sales ? 'Bill date' : 'Entry date', E.date, 'date')}</div><div>${sales ? fld('dy', 'Credit days', E.days, 'num') : fld('bd', 'Supplier bill date', E.billDate, 'date')}</div></div>
  ${sales ? '' : `<div class="two"><div>${fld('bn', 'Supplier bill no', E.billNo, 'text', { req: 1 })}</div><div>${fld('dy', 'Credit days', E.days, 'num')}</div></div>`}
  <div class="seg" id="tx"><button data-t="in" class="${E.tax === 'in' ? 'on' : ''}">Same state GST</button><button data-t="out" class="${E.tax === 'out' ? 'on' : ''}">Other state IGST</button></div>
  ${!sales && E.ret ? `<div class="seg" id="wh"><button data-w="${WH()}" class="${E.wh === WH() ? 'on' : ''}">From Stores</button><button data-w="${EXPWH()}" class="${E.wh === EXPWH() ? 'on' : ''}">From Expired stock</button></div>` : ''}
  <section class="sec"><h2>Items<button class="link" id="ai">+ Add item</button></h2>${E.items.map((l, n) => `<div class="row tap" data-e="${n}"><div class="grow"><div class="t1">${esc(l.item_name)}</div><div class="t2">${num(l.qty)}${l.free ? ' + ' + num(l.free) + ' free' : ''} × ${inr(l.rate)}${l.disc ? ' · ' + num(l.disc) + '% off' : ''} · ${esc(l.batch_no)}${l.expiry ? ' · exp ' + monthTxt(l.expiry) : ''}</div></div><b>${inr0(lineAmt(l))}</b><button class="ib" data-d="${n}" aria-label="Remove ${esc(l.item_name)}">${ic('x', 18)}</button></div>`).join('') || empty('No items yet', 'Tap Add item to start.')}
  ${E.items.length ? `<div class="ld sum"><span>Total before GST</span><i></i><b>${inr0(tot)}</b></div><div style="height:8px"></div>` : ''}</section>
  <div class="acts"><button class="btn out" id="sd" ${ok ? '' : 'disabled'}>Save draft</button><button class="btn" id="sp" ${ok ? '' : 'disabled'}>${E.ret ? 'Save return' : E.edit ? 'Save changes' : sales ? 'Save bill' : 'Save purchase'}</button></div>
  <div class="pad t2">${E.ret ? 'Quantities are returned to stock' + (sales ? '' : ' or sent back to the supplier') + '. GST is reversed automatically.' : 'GST is added from each item\'s rate when the bill is saved.'}${E.edit && E.editStatus === 1 ? ' The old bill is cancelled and a corrected bill is made in its place.' : ''}</div>`;
  $('#pc').onclick = () => pickParty(sales ? 'Customer' : 'Supplier', (c, n) => { E.party = { name: c, title: n || c }; edScreen(); });
  const sync = () => { E.date = val('dt') || E.date; E.days = numv('dy'); if (sales) { } else { E.billDate = val('bd') || E.billDate; E.billNo = val('bn'); } };
  ['dt', 'dy', 'bd', 'bn'].forEach(i => { if ($('#' + i)) $('#' + i).onchange = sync; });
  $$('#tx button').forEach(b => b.onclick = () => { sync(); E.tax = b.dataset.t; edScreen(); });
  $$('#wh button').forEach(b => b.onclick = () => { sync(); if (E.items.length && E.wh !== b.dataset.w && !confirm('Changing the stock location clears the items. Continue?')) return; E.items = E.items.length ? [] : E.items; E.wh = b.dataset.w; edScreen(); });
  $('#ai').onclick = () => { sync(); edItem(); };
  $$('[data-e]').forEach(e => e.onclick = ev => { if (ev.target.closest('[data-d]')) return; sync(); edLine(E.items[e.dataset.e], +e.dataset.e); });
  $$('[data-d]').forEach(b => b.onclick = () => { sync(); E.items.splice(b.dataset.d, 1); edScreen(); });
  const go1 = async post => {
    sync(); if (!E.party) return toast('Choose the ' + who); if (!E.items.length) return toast('Add at least one item'); if (!sales && !E.billNo) return toast('Enter the supplier bill number');
    $('#sd').disabled = $('#sp').disabled = true;
    try {
      const r = await edSave(post); toast(r.name + (post ? ' saved' : ' saved as draft'), 4000); memo.clear(); ED = null;
      go((sales ? '/inv/' : '/pinv/') + encodeURIComponent(r.name));
    } catch (e) { toast(e.message, 9000); $('#sd').disabled = $('#sp').disabled = false; if (E.cancelled) toast('The old bill was cancelled. Fix the problem and save again to finish the correction.', 12000); }
  };
  $('#sd').onclick = () => go1(false); $('#sp').onclick = () => go1(true);
}

function edItem() {
  const E = ED;
  pickDoc('Add item', 'Item', { fields: ['name', 'item_name', 'stock_uom', 'salt_composition', 'manufacturer_company'], search: ['item_name', 'item_code', 'salt_composition', 'manufacturer_company'], filters: [['disabled', '=', 0]], order: 'item_name asc', ph: 'Search item, salt or company', label: r => `<div class="grow"><div class="t1">${esc(r.item_name)}</div><div class="t2">${esc(r.manufacturer_company || '')}${r.salt_composition ? ' · ' + esc(r.salt_composition) : ''}</div></div>`, create: 'New item', onCreate: () => go('/new/item') }, r => edLine({ item_code: r.name, item_name: r.item_name, qty: 1, free: 0, rate: 0, disc: 0 }, -1));
}
async function edLine(l, idx) {
  const E = ED, sales = E.kind === 'sales', purchase = !sales, pickBatch = sales || (E.ret && purchase) || E.ret;
  openSheet(l.item_name, `<div id="lb">${skeleton(2)}</div>`, async root => {
    let batches = [];
    try { batches = pickBatch ? await batchesOf(l.item_code, E.wh) : []; if (sales && !E.ret) batches = batches.filter(b => !b.exp || b.exp >= today()); } catch (e) { /* none */ }
    if (E.ret && sales) { const all = await list('Batch', { fields: ['name', 'expiry_date', 'batch_mrp'], filters: [['item', '=', l.item_code]], order_by: 'expiry_date desc', limit_page_length: 30 }); batches = all.map(b => ({ id: b.name, qty: 0, exp: b.expiry_date, mrp: b.batch_mrp })); }
    const sel = batches.find(b => b.id === l.batch_no) || batches[0];
    const known = !pickBatch ? await list('Batch', { fields: ['name', 'expiry_date', 'batch_mrp'], filters: [['item', '=', l.item_code]], order_by: 'creation desc', limit_page_length: 20 }) : [];
    let rate = l.rate, hint = '';
    const mk = sales && !E.ret;   // Marg-style: rate = batch purchase rate + customer margin %
    let margin = 20, it = {};
    if (mk) {
      try {
        const [cu, ii] = await Promise.all([E.party ? list('Customer', { fields: ['default_margin_percent'], filters: [['name', '=', E.party.name]] }) : [], list('Item', { fields: ['manufacturer_company', 'salt_composition', 'gst_hsn_code', 'drug_schedule'], filters: [['name', '=', l.item_code]] })]);
        if (cu[0] && cu[0].default_margin_percent != null) margin = +cu[0].default_margin_percent; it = ii[0] || {};
      } catch (e) { /* defaults */ }
    }
    const sellRate = b => b && b.pr ? +(b.pr * (1 + margin / 100)).toFixed(2) : 0;
    const infoHtml = b => !mk ? '' : `<div class="t2" style="line-height:1.6;padding:6px 0"><b>Pur ${b && b.pr ? inr(b.pr) : '-'}</b> · Cost ${b && b.cp ? inr(b.cp) : '-'} · MRP ${b && b.mrp ? inr(b.mrp) : '-'}${b && b.pr ? ` · Sell ${inr(sellRate(b))} (+${num(margin)}%)` : ''}<br>Margin on cost ${b && b.cp && b.pr ? num((sellRate(b) - b.cp) / b.cp * 100) + '%' : '-'} · Exp ${b ? monthTxt(b.exp) || '-' : '-'}<br>${esc(it.manufacturer_company || '')}${it.salt_composition ? ' · ' + esc(it.salt_composition) : ''}<br>HSN ${esc(it.gst_hsn_code || '-')}${it.drug_schedule ? ' · Schedule ' + esc(it.drug_schedule) : ''}</div>`;
    if (mk && !rate && sel && sel.pr) { rate = sellRate(sel); hint = `Purchase rate ${inr(sel.pr)} + ${num(margin)}% margin.`; }
    if (!rate) {
      try {
        if (sales) { const [rd, last] = await Promise.all([method('erpnext.stock.get_item_details.get_item_details', { args: { item_code: l.item_code, customer: E.party && E.party.name, company: S.company, doctype: 'Sales Invoice', currency: 'INR', price_list: 'Standard Selling', plc_conversion_rate: 1, conversion_rate: 1, qty: 1, transaction_date: today(), ignore_pricing_rule: 1 } }).catch(() => ({})), E.party ? lastSoldRate(E.party.name, l.item_code).catch(() => null) : null]); rate = (last && last.rate) || rd.price_list_rate || rd.rate || 0; hint = last ? `Last sold to this party at ${inr(last.rate)} on ${fmtDate(last.date)}.` : (rd.rate ? `List rate ${inr(rd.rate)}.` : 'No rate set for this item.'); }
        else { const lp = await list('Purchase Invoice Item', { parent: 'Purchase Invoice', fields: ['rate', 'parent'], filters: [['item_code', '=', l.item_code], ['docstatus', '=', 1]], order_by: 'creation desc', limit_page_length: 1 }); if (lp.length) { rate = lp[0].rate; hint = `Last bought at ${inr(rate)}.`; } }
      } catch (e) { /* manual */ }
    }
    $('#lb', root).innerHTML = `${pickBatch ? `<div class="cap">Batch ${sales && !E.ret ? '(earliest expiry first)' : ''}</div>${mk && batches.length > 1 ? '<div class="pad t2" style="padding-top:0">To sell from more than one batch, type a quantity on each batch. Each becomes its own line on the bill.</div>' : ''}<div id="bl">${batches.length ? batches.map(b => `<div class="row tap bsel ${sel && sel.id === b.id ? 'on' : ''}" data-b="${esc(b.id)}"><div class="grow"><div class="t1">${esc(b.id)}</div><div class="t2">Exp ${monthTxt(b.exp) || '-'} · MRP ${inr(b.mrp)}${mk && b.pr ? ` · Pur ${inr(b.pr)} · Sell ${inr(sellRate(b))}` : ''}</div></div>${b.qty ? `<b>${num(b.qty)}</b>` : ''}${mk ? `<input class="bq" type="number" inputmode="decimal" min="0" data-b="${esc(b.id)}" placeholder="qty" aria-label="Quantity from batch ${esc(b.id)}" style="width:64px;margin-left:10px;text-align:right;padding:6px;border:1px solid var(--line,#ccc);border-radius:8px;background:transparent;color:inherit">` : ''}</div>`).join('') : empty('No stock in this batch list', E.ret && sales ? 'Type the batch below.' : 'Nothing available to pick here.')}</div>${E.ret && sales ? fld('bx', 'Or type a batch no', '', 'text') : ''}`
      : `${fld('bx', 'Batch no', l.batch_no || '', 'text', { req: 1, list: known.map(b => b.name) })}${fld('ex', 'Expiry (month)', l.expiry ? l.expiry.slice(0, 7) : '', 'month', { req: 1 })}${fld('mr', 'MRP', l.mrp || '', 'num')}`}
      <div id="inf">${infoHtml(sel)}</div>
      <div class="pad" style="display:flex;gap:12px;align-items:center;justify-content:space-between"><span>Quantity</span>${stepper('qy', l.qty || 1)}</div>
      <div class="pad" style="display:flex;gap:12px;align-items:center;justify-content:space-between"><span>Free quantity</span>${stepper('fr', l.free || 0)}</div>
      ${fld('rt', purchase ? 'Purchase rate' : 'Rate', rate || '', 'num')}${fld('dc', 'Discount %', l.disc || '', 'num')}
      <div class="pad t2" id="ht" style="padding-top:0">${esc(hint)}</div><div class="acts"><button class="btn" id="ok">${idx >= 0 ? 'Update item' : 'Add to bill'}</button></div>`;
    wireSteppers(root);
    let chosen = sel ? sel.id : '';
    $$('.bsel', root).forEach(e => e.onclick = () => {
      chosen = e.dataset.b; $$('.bsel', root).forEach(x => x.classList.toggle('on', x === e));
      const cb = batches.find(x => x.id === chosen);
      if (mk && cb) { $('#inf', root).innerHTML = infoHtml(cb); if (cb.pr) { $('#rt', root).value = sellRate(cb); $('#ht', root).textContent = `Purchase rate ${inr(cb.pr)} + ${num(margin)}% margin.`; } }
    });
    $$('.bq', root).forEach(i => { i.onclick = ev => ev.stopPropagation(); });
    if (!pickBatch && known.length) { const k = $('#bx', root); k.onchange = () => { const m = known.find(b => b.name === k.value); if (m) { $('#ex', root).value = (m.expiry_date || '').slice(0, 7); $('#mr', root).value = m.batch_mrp || ''; } }; }
    $('#ok', root).onclick = async () => {
      // several batches: one bill line per batch with a quantity typed against it
      const multi = mk ? $$('.bq', root).map(i => ({ b: batches.find(x => x.id === i.dataset.b), q: +i.value || 0 })).filter(x => x.b && x.q > 0) : [];
      if (multi.length) {
        const free0 = numv('fr', root), dc0 = numv('dc', root), r0 = numv('rt', root);
        const over = multi.find((x, n) => x.q + (n === 0 ? free0 : 0) > x.b.qty + 0.0001);
        if (over) return toast(`Only ${num(over.b.qty)} in batch ${over.b.id}`);
        const lines = multi.map((x, n) => ({ ...l, batch_no: x.b.id, qty: x.q, free: n === 0 ? free0 : 0, rate: x.b.pr ? sellRate(x.b) : r0, disc: dc0, expiry: x.b.exp, mrp: x.b.mrp }));
        if (idx >= 0) E.items.splice(idx, 1, ...lines); else E.items.push(...lines);
        hideSheet(); history.back(); setTimeout(edScreen, 60);
        return;
      }
      const qty = numv('qy', root), free = numv('fr', root), r = numv('rt', root), dc = numv('dc', root); if (qty <= 0) return toast('Enter a quantity');
      let bno = chosen, exp = '', mrp = 0;
      if (E.ret && sales && val('bx', root)) bno = val('bx', root);
      if (!pickBatch) { bno = val('bx', root); exp = val('ex', root); if (!bno || !exp) return toast('Enter the batch and expiry'); exp = exp + '-' + String(new Date(+exp.slice(0, 4), +exp.slice(5, 7), 0).getDate()).padStart(2, '0'); mrp = numv('mr', root); }
      if (!bno) return toast('Choose a batch');
      const b = batches.find(x => x.id === bno);
      if (sales && !E.ret && b && qty + free > b.qty + 0.0001) return toast(`Only ${num(b.qty)} in this batch`);
      if (E.ret && purchase && b && qty + free > b.qty + 0.0001) return toast(`Only ${num(b.qty)} in this batch`);
      $('#ok', root).disabled = true;
      try {
        if (!pickBatch) bno = await ensureBatch(l.item_code, bno, exp, mrp);
        const nl = { ...l, batch_no: bno, qty, free, rate: r, disc: dc, expiry: (b && b.exp) || exp, mrp: (b && b.mrp) || mrp };
        if (idx >= 0) E.items[idx] = nl; else E.items.push(nl);
        hideSheet(); history.back(); setTimeout(edScreen, 60);
      } catch (e) { toast(e.message, 6000); $('#ok', root).disabled = false; }
    };
  });
}

const edStart = (kind, ret) => { ED = edNew(kind, ret); };
on(/^\/bill\/new$/, () => { if (!ED || ED.kind !== 'sales' || ED.ret || ED.edit) edStart('sales'); edScreen(); }, { title: 'New bill' });
on(/^\/bill\/return$/, () => { if (!ED || ED.kind !== 'sales' || !ED.ret || ED.against) edStart('sales', true); edScreen(); }, { title: 'Sales return' });
on(/^\/pur\/new$/, () => { if (!ED || ED.kind !== 'purchase' || ED.ret || ED.edit) edStart('purchase'); edScreen(); }, { title: 'Purchase bill' });
on(/^\/pur\/return$/, () => { if (!ED || ED.kind !== 'purchase' || !ED.ret) edStart('purchase', true); edScreen(); }, { title: 'Purchase return' });
on(/^\/(bill|pur)\/edit\/(.+)$/, async (k, name) => {
  const sales = k === 'bill', dt = sales ? 'Sales Invoice' : 'Purchase Invoice', d = await getDoc(dt, name);
  if (d.docstatus === 2) { view.innerHTML = empty('Cancelled bill', 'A cancelled bill cannot be changed.'); return; }
  if (d.marg_items || (d.items.length === 1 && /^Opening Invoice/i.test(d.items[0].item_name))) { view.innerHTML = empty('Opening balance bill', 'This bill was brought from Marg as a balance, so it has no stock lines to change.'); return; }
  const E = ED = edNew(sales ? 'sales' : 'purchase', !!d.is_return);
  E.edit = name; E.editStatus = d.docstatus; E.editCreation = d.creation; E.editModified = d.modified; E.editOwner = d.owner; E.date = d.posting_date; E.wh = d.set_warehouse || WH(); E.tax = /Out-state/.test(d.taxes_and_charges || '') ? 'out' : 'in'; E.billNo = d.bill_no || ''; E.billDate = d.bill_date || d.posting_date; E.against = d.return_against || null;
  E.days = d.due_date ? Math.max(0, daysBetween(d.due_date, sales ? d.posting_date : (d.bill_date || d.posting_date))) : E.days;
  E.party = sales ? { name: d.customer, title: d.customer_name } : { name: d.supplier, title: d.supplier_name };
  const sg = d.is_return ? -1 : 1, meta = await list('Batch', { fields: ['name', 'expiry_date', 'batch_mrp'], filters: [['name', 'in', [...new Set(d.items.map(i => i.batch_no).filter(Boolean))]]], limit_page_length: 300 });
  d.items.filter(i => !i.is_free_item).forEach(i => { const m = meta.find(b => b.name === i.batch_no) || {}; E.items.push({ item_code: i.item_code, item_name: i.item_name, batch_no: i.batch_no, qty: sg * i.qty, free: sg * d.items.filter(f => f.is_free_item && f.item_code === i.item_code && f.batch_no === i.batch_no).reduce((a, f) => a + f.qty, 0), rate: i.price_list_rate || i.rate, disc: i.discount_percentage || 0, expiry: m.expiry_date, mrp: m.batch_mrp }); });
  setTitle('Edit ' + name); edScreen();
}, { title: 'Edit bill' });

/* ---------- bills: list, view, actions ---------- */
on(/^\/bills$/, async () => {
  view.innerHTML = `<label class="field s">${ic('search', 20)}<input id="bs" placeholder="Bill number or party" autocomplete="off" aria-label="Search bills"></label><div id="bl">${skeleton(6)}</div>`;
  const run = async () => {
    const v = $('#bs').value.trim(), r = await list('Sales Invoice', { fields: ['name', 'customer_name', 'posting_date', 'grand_total', 'outstanding_amount', 'docstatus', 'is_return'], filters: [['docstatus', '<', 2]], or_filters: v ? [['name', 'like', '%' + v + '%'], ['customer_name', 'like', '%' + v + '%']] : [], order_by: 'posting_date desc, creation desc', limit_page_length: 40 });
    $('#bl').innerHTML = r.length ? `<section class="sec">${r.map(b => `<div class="row tap" data-i="${esc(b.name)}"><div class="grow"><div class="t1">${esc(b.customer_name)}</div><div class="t2">${esc(b.name)} · ${fmtDate(b.posting_date)}${b.docstatus === 0 ? ' · draft' : ''}${b.is_return ? ' · return' : ''}</div></div><div class="r"><b>${inr0(b.grand_total)}</b>${b.outstanding_amount > 0 && b.docstatus === 1 ? `<div class="t2 red">${inr0(b.outstanding_amount)} due</div>` : ''}</div></div>`).join('')}</section>` : empty('No bills found', '');
    $$('#bl [data-i]').forEach(e => e.onclick = () => go('/inv/' + encodeURIComponent(e.dataset.i)));
  };
  $('#bs').oninput = debounce(run, 300); run();
}, { title: 'Bills', fab: undefined });
on(/^\/purchases$/, async () => {
  view.innerHTML = `<label class="field s">${ic('search', 20)}<input id="bs" placeholder="Supplier or bill number" autocomplete="off" aria-label="Search purchases"></label><div id="bl">${skeleton(6)}</div>`;
  const run = async () => {
    const v = $('#bs').value.trim(), r = await list('Purchase Invoice', { fields: ['name', 'supplier_name', 'bill_no', 'posting_date', 'grand_total', 'outstanding_amount', 'docstatus', 'is_return'], filters: [['docstatus', '<', 2]], or_filters: v ? [['name', 'like', '%' + v + '%'], ['supplier_name', 'like', '%' + v + '%'], ['bill_no', 'like', '%' + v + '%']] : [], order_by: 'posting_date desc, creation desc', limit_page_length: 40 });
    $('#bl').innerHTML = r.length ? `<section class="sec">${r.map(b => `<div class="row tap" data-i="${esc(b.name)}"><div class="grow"><div class="t1">${esc(b.supplier_name)}</div><div class="t2">${esc(b.bill_no || b.name)} · ${fmtDate(b.posting_date)}${b.docstatus === 0 ? ' · draft' : ''}${b.is_return ? ' · return' : ''}</div></div><div class="r"><b>${inr0(b.grand_total)}</b>${b.outstanding_amount > 0 && b.docstatus === 1 ? `<div class="t2 red">${inr0(b.outstanding_amount)} due</div>` : ''}</div></div>`).join('')}</section>` : empty('No purchase bills yet', 'Tap Purchase bill to enter the first one.');
    $$('#bl [data-i]').forEach(e => e.onclick = () => go('/pinv/' + encodeURIComponent(e.dataset.i)));
  };
  $('#bs').oninput = debounce(run, 300); run();
}, { title: 'Purchase bills' });
on(/^\/pinv\/(.+)$/, async name => {
  const d = await getDoc('Purchase Invoice', name); setTitle(d.bill_no || d.name);
  view.innerHTML = `<div class="pad" style="padding-top:0"><div class="mid">${esc(d.supplier_name)}</div><div class="t2">Bill ${esc(d.bill_no || '')} · ${fmtDate(d.bill_date || d.posting_date)} · entered ${esc(d.name)}</div><div style="margin-top:8px">${d.docstatus === 2 ? '<span class="stamp exp">Cancelled</span>' : d.docstatus === 0 ? '<span class="stamp n30">Draft</span>' : d.outstanding_amount > 0 ? `<span class="stamp n30">${inr0(d.outstanding_amount)} to pay</span>` : '<span class="stamp ok">Paid</span>'}${d.is_return ? ' <span class="stamp n90">Return</span>' : ''}</div></div>
  <div class="acts"><button class="btn" id="pdf">${ic('share', 20)}Share PDF</button><button class="btn out" id="xl">Excel</button></div>
  <section class="sec"><h2>Items</h2>${d.items.map(i => `<div class="row"><div class="grow"><div class="t1">${esc(i.item_name)}</div><div class="t2">${num(i.qty)} × ${inr(i.rate)}${i.batch_no ? ' · batch ' + esc(i.batch_no) : ''}${i.is_free_item ? ' · free' : ''}</div></div><b>${inr(i.amount)}</b></div>`).join('')}
    <div class="ld" style="padding-top:12px"><span>Total before tax</span><i></i><b>${inr(d.net_total)}</b></div>${(d.taxes || []).filter(x => x.tax_amount).map(x => `<div class="ld"><span>${esc(String(x.description).replace(/ - [A-Z]+$/, ''))}</span><i></i><b>${inr(x.tax_amount)}</b></div>`).join('')}
    <div class="ld sum"><span>Bill total</span><i></i><b>${inr(d.rounded_total || d.grand_total)}</b></div><div style="height:8px"></div></section>
  <div class="acts">${d.docstatus < 2 && !d.is_return ? '<button class="btn out" id="ed">Edit</button>' : ''}${d.docstatus === 1 && !d.is_return ? '<button class="btn out" id="rt">Return goods</button>' : ''}${d.docstatus === 1 && d.outstanding_amount > 0 ? '<button class="btn out" id="py">Pay supplier</button>' : ''}</div>
  <div class="acts">${d.docstatus === 0 ? '<button class="btn" id="po">Post this bill</button>' : ''}${d.docstatus === 1 ? '<button class="btn out" id="cn">Cancel bill</button>' : ''}</div>`;
  $('#pdf').onclick = () => sharePdf('Purchase Invoice', d.name, 'Standard'); $('#xl').onclick = () => shareXlsx(billRows(d, true), 'Purchase_' + (d.bill_no || d.name));
  if ($('#ed')) $('#ed').onclick = () => go('/pur/edit/' + encodeURIComponent(d.name));
  if ($('#rt')) $('#rt').onclick = () => go('/ret/pi/' + encodeURIComponent(d.name));
  if ($('#py')) $('#py').onclick = () => paySheet('Supplier', d.supplier);
  if ($('#po')) $('#po').onclick = async () => { try { await call('frappe.client.submit', { doc: d }); toast('Posted', 3000); memo.clear(); route(); } catch (e) { toast(e.message, 7000); } };
  if ($('#cn')) $('#cn').onclick = () => cancelDoc('Purchase Invoice', d.name);
}, { title: '' });
function cancelDoc(dt, name) {
  openSheet('Cancel ' + name + '?', `<div class="pad">The bill is cancelled and its stock and accounts entries are reversed. This cannot be undone, but you can make a new bill.</div><div class="acts"><button class="btn out" data-close>Keep it</button><button class="btn" id="yes" style="background:var(--red,#b3261e)">Cancel bill</button></div>`, root => {
    $('#yes', root).onclick = async () => { try { await call('frappe.client.cancel', { doctype: dt, name }); hideSheet(); history.back(); toast(name + ' cancelled', 4000); memo.clear(); setTimeout(route, 80); } catch (e) { toast(e.message, 8000); } };
  });
}

/* extra buttons on the sales bill screen */
function billActions(d) {
  if (d.docstatus === 2) return '';
  return `<div class="acts"><button class="btn out" id="xl">Excel</button>${d.docstatus < 2 ? '<button class="btn out" id="ed">Edit bill</button>' : ''}${d.docstatus === 1 && !d.is_return ? '<button class="btn out" id="rt">Return goods</button>' : ''}</div>
  <div class="acts">${d.docstatus === 1 && !d.is_return ? '<button class="btn out" id="ew">E-way bill</button>' : ''}${d.docstatus === 0 ? '<button class="btn" id="po">Post this bill</button>' : ''}${d.docstatus === 1 ? '<button class="btn out" id="cn">Cancel bill</button>' : ''}</div>`;
}
function wireBill(d) {
  const g = i => $('#' + i);
  if (g('xl')) g('xl').onclick = () => shareXlsx(billRows(d, false), 'Bill_' + d.name);
  if (g('ed')) g('ed').onclick = () => go('/bill/edit/' + encodeURIComponent(d.name));
  if (g('rt')) g('rt').onclick = () => go('/ret/si/' + encodeURIComponent(d.name));
  if (g('ew')) g('ew').onclick = () => go('/eway/' + encodeURIComponent(d.name));
  if (g('po')) g('po').onclick = async () => { try { await call('frappe.client.submit', { doc: d }); toast('Posted', 3000); memo.clear(); route(); } catch (e) { toast(e.message, 7000); } };
  if (g('cn')) g('cn').onclick = () => cancelDoc('Sales Invoice', d.name);
}

/* ---------- returns made from an existing bill ---------- */
on(/^\/ret\/(si|pi)\/(.+)$/, async (k, name) => {
  const sales = k === 'si', dt = sales ? 'Sales Invoice' : 'Purchase Invoice';
  const doc = await method(`erpnext.accounts.doctype.${sales ? 'sales' : 'purchase'}_invoice.${sales ? 'sales_invoice' : 'purchase_invoice'}.make_${sales ? 'sales' : 'purchase'}_return`, { source_name: name });
  const rows = doc.items.map((i, n) => ({ ...i, max: Math.abs(i.qty), qtyIn: 0 }));
  const draw = () => {
    const tot = rows.reduce((a, r) => a + r.qtyIn * (r.rate || 0), 0);
    view.innerHTML = `<div class="pad" style="padding-top:0"><div class="t2">${sales ? 'Return against bill' : 'Return against purchase'} ${esc(name)}</div><div class="t2">Enter the quantity coming back for each item.</div></div>
    <section class="sec">${rows.map((r, n) => `<div class="row"><div class="grow"><div class="t1">${esc(r.item_name)}</div><div class="t2">Billed ${num(r.max)} × ${inr(r.rate)}${r.batch_no ? ' · ' + esc(r.batch_no) : ''}</div></div>${stepper('q' + n, r.qtyIn)}</div>`).join('')}<div class="ld sum"><span>Return value before GST</span><i></i><b id="rv">${inr0(tot)}</b></div><div style="height:8px"></div></section>
    <div class="acts"><button class="btn" id="sv">Save return</button></div>`;
    wireSteppers(view);
    rows.forEach((r, n) => { const i = $('#q' + n); i.onchange = i.oninput = () => { r.qtyIn = Math.min(r.max, Math.max(0, parseFloat(i.value) || 0)); $('#rv').textContent = inr0(rows.reduce((a, x) => a + x.qtyIn * (x.rate || 0), 0)); }; });
    $$('[data-st]', view).forEach(b => b.addEventListener('click', () => setTimeout(() => rows.forEach((r, n) => { r.qtyIn = Math.min(r.max, Math.max(0, parseFloat($('#q' + n).value) || 0)); $('#q' + n).value = r.qtyIn; $('#rv').textContent = inr0(rows.reduce((a, x) => a + x.qtyIn * (x.rate || 0), 0)); }), 0)));
    $('#sv').onclick = async () => {
      rows.forEach((r, n) => { r.qtyIn = Math.min(r.max, Math.max(0, parseFloat($('#q' + n).value) || 0)); });
      const keep = rows.filter(r => r.qtyIn > 0); if (!keep.length) return toast('Enter a return quantity for at least one item');
      $('#sv').disabled = true;
      try {
        const d = { ...doc, items: keep.map(r => { const { max, qtyIn, ...x } = r; return { ...x, qty: -qtyIn, stock_qty: -qtyIn * (x.conversion_factor || 1), amount: -qtyIn * x.rate }; }) };
        const r = await saveDoc(d, 'Submit'); toast(r.name + ' return saved', 4500); memo.clear(); go((sales ? '/inv/' : '/pinv/') + encodeURIComponent(r.name));
      } catch (e) { toast(e.message, 9000); $('#sv').disabled = false; }
    };
  };
  draw();
}, { title: 'Return goods' });

/* ---------- payments: customer receipt and supplier payment, with a shareable e-receipt ---------- */
async function collectSheet(party, inv) { return paySheet('Customer', party, inv); }
async function paySheet(type, party, inv) {
  const sales = type === 'Customer', dt = sales ? 'Sales Invoice' : 'Purchase Invoice';
  try {
    inv = inv || await list(dt, { fields: ['name', 'due_date', 'outstanding_amount'], filters: [[sales ? 'customer' : 'supplier', '=', party], ['docstatus', '=', 1], ['outstanding_amount', '>', 0]], order_by: 'due_date asc', limit_page_length: 300 });
    const modes = await list('Mode of Payment', { fields: ['name'], limit_page_length: 20 }), total = inv.reduce((a, i) => a + i.outstanding_amount, 0);
    openSheet(sales ? 'Collect payment' : 'Pay supplier', `<div class="pad"><div class="t2">${esc(party)}</div><div class="mid">${inr0(total)} ${sales ? 'outstanding' : 'to pay'}</div></div>
      <label class="field"><input id="am" type="number" inputmode="decimal" placeholder="Amount ${sales ? 'received' : 'paid'}" value="${total || ''}" aria-label="Amount"></label>
      <label class="field"><select id="md" class="in" aria-label="Mode of payment">${modes.map(m => `<option ${m.name === 'Cash' ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field"><input id="rf" placeholder="Reference or cheque number (optional)" aria-label="Reference"></label>
      <label class="field"><input id="pd" type="date" value="${today()}" aria-label="Date"></label>
      <div class="pad t2" id="al"></div><div class="acts"><button class="btn" id="sv">${sales ? 'Save receipt' : 'Save payment'}</button></div>`, root => {
      const alloc = () => { let r = parseFloat($('#am', root).value) || 0; const a = []; for (const i of inv) { if (r <= 0) break; const x = Math.min(r, i.outstanding_amount); a.push({ reference_doctype: dt, reference_name: i.name, allocated_amount: +x.toFixed(2) }); r -= x; } return { a, extra: r }; };
      const upd = () => { const { a, extra } = alloc(); $('#al', root).textContent = a.length ? `Clears ${a.length} bill${a.length > 1 ? 's' : ''}, oldest first${extra > 0.009 ? `; ${inr(extra)} stays as advance` : ''}.` : ''; };
      $('#am', root).oninput = upd; upd();
      $('#sv', root).onclick = async () => {
        const amt = parseFloat($('#am', root).value) || 0; if (amt <= 0) return toast('Enter the amount');
        $('#sv', root).disabled = true;
        try {
          const mode = $('#md', root).value, pd = $('#pd', root).value || today();
          const [pa, bank] = await Promise.all([method('erpnext.accounts.party.get_party_account', { party_type: type, party, company: S.company }), method('erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account', { mode_of_payment: mode, company: S.company })]);
          const r = await saveDoc({ doctype: 'Payment Entry', payment_type: sales ? 'Receive' : 'Pay', company: S.company, posting_date: pd, party_type: type, party, mode_of_payment: mode, paid_from: sales ? pa : bank.account, paid_to: sales ? bank.account : pa, paid_from_account_currency: 'INR', paid_to_account_currency: 'INR', paid_amount: amt, received_amount: amt, source_exchange_rate: 1, target_exchange_rate: 1, reference_no: $('#rf', root).value.trim() || undefined, reference_date: pd, references: alloc().a }, 'Submit');
          hideSheet(); history.back(); memo.clear(); setTimeout(() => receiptSheet(r, party, amt, type), 120);
        } catch (e) { toast(e.message, 8000); $('#sv', root).disabled = false; }
      };
    });
  } catch (e) { toast(e.message, 5000); }
}
async function receiptSheet(r, party, amt, type) {
  const sales = type === 'Customer', ph = sales ? (await list('Customer', { fields: ['mobile_no'], filters: [['name', '=', party]] }).catch(() => []))[0] : null;
  openSheet(sales ? 'Receipt saved' : 'Payment saved', `<div class="pad"><div class="mid">${esc(r.name)}</div><div class="t2">${esc(party)} · ${inr(amt)}</div></div><div class="acts"><button class="btn" id="pd">${ic('share', 20)}Share ${sales ? 'e-receipt' : 'voucher'}</button><a class="btn out" id="wa" href="#">${ic('chat', 20)}WhatsApp</a></div><div class="acts" style="padding-top:0"><button class="btn out" data-close>Done</button></div>`, root => {
    $('#pd', root).onclick = () => sharePdf('Payment Entry', r.name, 'MM Pharma Receipt');
    $('#wa', root).href = waLink(ph && ph.mobile_no, sales ? `Receipt ${r.name}\nReceived ${inr(amt)} from ${party} on ${fmtDate(r.posting_date)}${r.mode_of_payment ? ' by ' + r.mode_of_payment : ''}.\nThank you.\n${S.company}` : `Payment ${r.name}: ${inr(amt)} to ${party}`);
    $('[data-close]', root).onclick = () => { closeSheet(); setTimeout(route, 120); };
  });
}
on(/^\/pay$/, () => { pickParty('Supplier', (c) => paySheet('Supplier', c)); view.innerHTML = empty('Pay a supplier', 'Choose the supplier to pay.'); }, { title: 'Supplier payment' });
on(/^\/receipt$/, () => { pickParty('Customer', (c) => paySheet('Customer', c)); view.innerHTML = empty('Customer receipt', 'Choose the customer who paid.'); }, { title: 'Customer receipt' });

/* ---------- stock adjustment ---------- */
let ADJ = null;
on(/^\/adjust$/, async () => {
  ADJ = ADJ || { add: false, reason: 'Stock correction', items: [] };
  const draw = () => {
    view.innerHTML = `<div class="seg" id="md"><button data-a="0" class="${ADJ.add ? '' : 'on'}">Remove stock</button><button data-a="1" class="${ADJ.add ? 'on' : ''}">Add stock</button></div>
    ${fld('rs', 'Reason', ADJ.reason, 'sel', { opts: ['Stock correction', 'Damaged or broken', 'Expired, written off', 'Sample given', 'Found in stock take', 'Other'] })}
    <section class="sec"><h2>Items<button class="link" id="ai">+ Add item</button></h2>${ADJ.items.map((l, n) => `<div class="row"><div class="grow"><div class="t1">${esc(l.item_name)}</div><div class="t2">${num(l.qty)} · batch ${esc(l.batch_no)}</div></div><button class="ib" data-d="${n}" aria-label="Remove">${ic('x', 18)}</button></div>`).join('') || empty('No items yet', 'Tap Add item.')}</section>
    <div class="acts"><button class="btn" id="sv" ${ADJ.items.length ? '' : 'disabled'}>Post adjustment</button></div>`;
    $$('#md button').forEach(b => b.onclick = () => { ADJ.add = b.dataset.a === '1'; ADJ.reason = val('rs'); ADJ.items = []; draw(); });
    $('#rs').onchange = () => ADJ.reason = val('rs');
    $('#ai').onclick = () => pickDoc('Add item', 'Item', { fields: ['name', 'item_name'], search: ['item_name', 'item_code'], filters: [['disabled', '=', 0]], order: 'item_name asc', ph: 'Search item', label: r => `<div class="t1">${esc(r.item_name)}</div>` }, r => adjLine(r, draw));
    $$('[data-d]').forEach(b => b.onclick = () => { ADJ.items.splice(b.dataset.d, 1); draw(); });
    $('#sv').onclick = async () => {
      $('#sv').disabled = true;
      try {
        const co = (await list('Company', { fields: ['stock_adjustment_account', 'cost_center'], limit_page_length: 1 }))[0];
        const doc = { doctype: 'Stock Entry', stock_entry_type: ADJ.add ? 'Material Receipt' : 'Material Issue', purpose: ADJ.add ? 'Material Receipt' : 'Material Issue', company: S.company, posting_date: today(), set_posting_time: 1, remarks: ADJ.reason, [ADJ.add ? 'to_warehouse' : 'from_warehouse']: ADJ.wh || WH(),
          items: ADJ.items.map(l => ({ item_code: l.item_code, qty: l.qty, uom: l.uom, stock_uom: l.uom, conversion_factor: 1, transfer_qty: l.qty, [ADJ.add ? 't_warehouse' : 's_warehouse']: l.wh || WH(), batch_no: l.batch_no, use_serial_batch_fields: 1, basic_rate: ADJ.add ? l.rate : undefined, allow_zero_valuation_rate: ADJ.add && !l.rate ? 1 : 0, expense_account: co.stock_adjustment_account, cost_center: co.cost_center })) };
        const r = await saveDoc(doc, 'Submit'); toast(r.name + ' posted', 4000); memo.clear(); ADJ = null; go('/more');
      } catch (e) { toast(e.message, 9000); $('#sv').disabled = false; }
    };
  };
  draw();
}, { title: 'Stock adjustment' });
async function adjLine(it, done) {
  const add = ADJ.add, wh = WH(), uom = (await list('Item', { fields: ['stock_uom'], filters: [['name', '=', it.name]] }))[0].stock_uom;
  openSheet(it.item_name, `<div id="ab">${skeleton(2)}</div>`, async root => {
    const bs = add ? [] : await batchesOf(it.name, wh), known = add ? await list('Batch', { fields: ['name', 'expiry_date', 'batch_mrp'], filters: [['item', '=', it.name]], order_by: 'creation desc', limit_page_length: 20 }) : [];
    let chosen = bs[0] ? bs[0].id : '';
    $('#ab', root).innerHTML = `${add ? `${fld('bx', 'Batch no', '', 'text', { req: 1, list: known.map(b => b.name) })}${fld('ex', 'Expiry (month)', '', 'month', { req: 1 })}${fld('mr', 'MRP', '', 'num')}${fld('rt', 'Cost rate per unit', '', 'num')}` : `<div class="cap">Batch</div>${bs.map(b => `<div class="row tap bsel ${b.id === chosen ? 'on' : ''}" data-b="${esc(b.id)}"><div class="grow"><div class="t1">${esc(b.id)}</div><div class="t2">Exp ${monthTxt(b.exp) || '-'}</div></div><b>${num(b.qty)}</b></div>`).join('') || empty('No stock', 'This item has no stock to remove.')}`}
      <div class="pad" style="display:flex;gap:12px;align-items:center;justify-content:space-between"><span>Quantity</span>${stepper('qy', 1)}</div><div class="acts"><button class="btn" id="ok">Add to adjustment</button></div>`;
    wireSteppers(root);
    $$('.bsel', root).forEach(e => e.onclick = () => { chosen = e.dataset.b; $$('.bsel', root).forEach(x => x.classList.toggle('on', x === e)); });
    $('#ok', root).onclick = async () => {
      const qty = numv('qy', root); if (qty <= 0) return toast('Enter a quantity');
      let bno = chosen, rate = 0;
      if (add) { bno = val('bx', root); let ex = val('ex', root); if (!bno || !ex) return toast('Enter the batch and expiry'); ex += '-' + String(new Date(+ex.slice(0, 4), +ex.slice(5, 7), 0).getDate()).padStart(2, '0'); rate = numv('rt', root); try { bno = await ensureBatch(it.name, bno, ex, numv('mr', root)); } catch (e) { return toast(e.message, 6000); } }
      else { const b = bs.find(x => x.id === bno); if (!b) return toast('Choose a batch'); if (qty > b.qty + 0.0001) return toast('Only ' + num(b.qty) + ' in this batch'); }
      ADJ.items.push({ item_code: it.name, item_name: it.item_name, batch_no: bno, qty, rate, uom, wh }); hideSheet(); history.back(); setTimeout(done, 60);
    };
  });
}

/* ---------- e-way bill ---------- */
on(/^\/eway\/(.+)$/, async name => {
  const d = await getDoc('Sales Invoice', name), ev = x => d[x] || '';
  view.innerHTML = `<div class="pad" style="padding-top:0"><div class="mid">E-way bill for ${esc(d.name)}</div><div class="t2">${esc(d.customer_name)} · ${inr0(d.rounded_total || d.grand_total)}. Needed for goods worth more than ₹50,000 moving by road.</div></div>
  ${fld('tn', 'Transporter name', ev('transporter_name'), 'text')}${fld('tg', 'Transporter GSTIN or ID', ev('gst_transporter_id'), 'text')}
  ${fld('md', 'Mode', 'Road', 'sel', { opts: ['Road', 'Rail', 'Air', 'Ship'] })}${fld('vn', 'Vehicle number', ev('vehicle_no'), 'text', { ph: 'TN39AB1234' })}${fld('km', 'Distance in km', ev('distance'), 'num')}${fld('lr', 'LR number (optional)', ev('lr_no'), 'text')}
  <div class="acts"><button class="btn" id="gen">Generate e-way bill</button></div><div class="acts" style="padding-top:0"><button class="btn out" id="jsn">Download JSON for the e-way bill portal</button></div>
  <div class="pad t2">Generating needs the GST API turned on in ERPNext (GST Settings, with your GST portal API credentials). Without it, download the JSON and upload it at ewaybillgst.gov.in under Bulk Generation.</div><div id="ew" class="pad"></div>`;
  const vals = () => ({ transporter: val('tn') || undefined, gst_transporter_id: val('tg') || undefined, mode_of_transport: val('md'), vehicle_no: val('vn').replace(/\s/g, '').toUpperCase() || undefined, vehicle_type: 'Regular', distance: numv('km') });
  $('#gen').onclick = async () => {
    $('#gen').disabled = true; $('#ew').textContent = '';
    try { const r = await call('india_compliance.gst_india.utils.e_waybill.generate_e_waybill', { doctype: 'Sales Invoice', docname: d.name, values: JSON.stringify(vals()) }); toast('E-way bill generated', 5000); $('#ew').innerHTML = `<b>${esc(typeof r === 'object' ? (r.ewaybill || r.e_waybill_no || JSON.stringify(r)) : r)}</b>`; }
    catch (e) { $('#ew').innerHTML = `<div class="err"><b>Could not generate</b>${esc(e.message)}</div>`; }
    $('#gen').disabled = false;
  };
  $('#jsn').onclick = async () => {
    try { const r = await call('india_compliance.gst_india.utils.e_waybill.generate_e_waybill_json', { doctype: 'Sales Invoice', docnames: JSON.stringify([d.name]), values: JSON.stringify(vals()) }); await shareText('EWB_' + d.name.replace(/[^A-Za-z0-9]+/g, '_') + '.json', typeof r === 'string' ? r : JSON.stringify(r), 'E-way bill JSON'); }
    catch (e) { $('#ew').innerHTML = `<div class="err"><b>Could not make the JSON</b>${esc(e.message)}</div>`; }
  };
}, { title: 'E-way bill' });


/* ---------- salt screen: products with a salt, batch-wise, exact combination or with other salts; item ledger ---------- */
const saltParts = s => { const out = []; String(s || '').toUpperCase().split(/\+|&|,/).forEach(c => { const n = c.split(/(?:\s|-)(?=\.?\d)|\(/)[0].replace(/\s+/g, ' ').trim(); if (n && !out.includes(n)) out.push(n); }); return out; };
let saltMode = 'exact';
on(/^\/salt\/(.+)$/, async raw => {
  const salt = decodeURIComponent(raw), want = saltParts(salt), names = want.length ? want : [salt.toUpperCase()];
  setTitle(salt.length > 28 ? salt.slice(0, 28) + '...' : salt);
  view.innerHTML = skeleton(6);
  try {
    const items = (await list('Item', { fields: ['name', 'item_name', 'manufacturer_company', 'salt_composition'], filters: [['disabled', '=', 0], ...names.map(n => ['salt_composition', 'like', '%' + n + '%'])], order_by: 'item_name asc', limit_page_length: 500 }))
      .map(x => ({ ...x, c: want.length ? saltParts(x.salt_composition) : [String(x.salt_composition || '').toUpperCase()] })).filter(x => names.every(n => x.c.includes(n)));
    const exact = items.filter(x => x.c.length === names.length), more = items.filter(x => x.c.length > names.length);
    const bt = items.length ? await list('Batch', { fields: ['name', 'item', 'expiry_date', 'batch_qty', 'batch_mrp', 'purchase_rate', 'cost_price'], filters: [['item', 'in', items.map(x => x.name)], ['batch_qty', '>', 0]], order_by: 'expiry_date asc', limit_page_length: 2000 }) : [];
    const by = {}; bt.forEach(b => (by[b.item] = by[b.item] || []).push(b));
    const draw = () => {
      const list_ = saltMode === 'exact' ? exact : exact.concat(more);
      let units = 0, val = 0, nb = 0;
      const body = list_.map(x => {
        const bs = by[x.name] || [], extra = x.c.length > names.length ? `<div class="t2">+ ${esc(x.c.filter(n => !names.includes(n)).join(' + '))}</div>` : '';
        bs.forEach(b => { units += b.batch_qty; val += b.batch_qty * (b.purchase_rate || 0); nb++; });
        return `<section class="sec"><div class="row tap" data-led="${esc(x.name)}" role="button"><div class="grow"><div class="t1">${esc(x.item_name)}</div><div class="t2">${esc(x.manufacturer_company || '')}</div>${extra}</div><span class="link">Ledger</span></div>
          ${bs.map(b => { const pr = b.purchase_rate || 0, sell = pr * 1.2, ex = b.expiry_date && b.expiry_date < today(); return `<div class="row tap" data-i="${esc(x.name)}"><div class="grow"><div class="t1">${esc(b.name)}</div><div class="t2">MRP ${inr(b.batch_mrp)}${pr ? ` · Pur ${inr(pr)} · Cost ${inr(b.cost_price)} · Sell ${inr(sell)}` : ''}</div></div>${stamp(b.expiry_date)}<b class="nw ${ex ? 'red' : ''}" style="min-width:40px;text-align:right">${num(b.batch_qty)}</b></div>`; }).join('') || '<div class="pad red t2">No stock</div>'}</section>`;
      }).join('');
      $('#sb').innerHTML = `<div class="pad t2">${list_.length} products · ${nb} batches · ${num(units)} units · purchase value ${inr0(val)} · sell rate = purchase + 20%</div>${body || empty('No products', 'No product has this salt.')}`;
      $$('#sb [data-led]').forEach(e => e.onclick = () => go('/ledger/' + encodeURIComponent(e.dataset.led)));
      $$('#sb [data-i]').forEach(e => e.onclick = () => go('/item/' + encodeURIComponent(e.dataset.i)));
    };
    view.innerHTML = `<div class="chips" id="sm"><button class="chip ${saltMode === 'exact' ? 'on' : ''}" data-m="exact">${names.length > 1 ? 'Only this combination' : 'This salt alone'} (${exact.length})</button><button class="chip ${saltMode === 'more' ? 'on' : ''}" data-m="more">With other salts added (${exact.length + more.length})</button></div><div id="sb"></div>`;
    $$('#sm .chip').forEach(b => b.onclick = () => { saltMode = b.dataset.m; $$('#sm .chip').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    draw();
  } catch (e) { if (e.auth) return loginView(e.message); view.innerHTML = errBox(e); }
}, { title: 'Salt' });

on(/^\/ledger\/(.+)$/, async raw => {
  const code = decodeURIComponent(raw); setTitle(code); view.innerHTML = skeleton(6);
  try {
    const fy = (() => { const t = new Date(); return (t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1) + '-04-01'; })();
    const sle = await list('Stock Ledger Entry', { fields: ['posting_date', 'voucher_type', 'voucher_no', 'actual_qty', 'incoming_rate'], filters: [['item_code', '=', code], ['is_cancelled', '=', 0]], order_by: 'posting_date asc, posting_time asc, creation asc', limit_page_length: 5000 });
    const g = {}; sle.forEach(s => { const k = s.voucher_type + '|' + s.voucher_no; (g[k] = g[k] || { ...s, actual_qty: 0 }).actual_qty += s.actual_qty; });
    const rows = Object.values(g);
    const sales = rows.filter(r => r.voucher_type === 'Sales Invoice').map(r => r.voucher_no), pur = rows.filter(r => r.voucher_type === 'Purchase Invoice').map(r => r.voucher_no);
    const [sp, pp] = await Promise.all([sales.length ? list('Sales Invoice', { fields: ['name', 'customer_name'], filters: [['name', 'in', sales]], limit_page_length: 2000 }) : [], pur.length ? list('Purchase Invoice', { fields: ['name', 'supplier_name'], filters: [['name', 'in', pur]], limit_page_length: 2000 }) : []]);
    const party = {}; sp.forEach(x => party[x.name] = x.customer_name); pp.forEach(x => party[x.name] = x.supplier_name);
    let bal = 0, open = 0; const out = [];
    rows.forEach(r => { bal += r.actual_qty; if (r.posting_date < fy) open = bal; else out.push({ ...r, bal }); });
    const route = r => r.voucher_type === 'Sales Invoice' ? '/inv/' + encodeURIComponent(r.voucher_no) : r.voucher_type === 'Purchase Invoice' ? '/pinv/' + encodeURIComponent(r.voucher_no) : '';
    view.innerHTML = `<div class="pad t2">From ${fmtDate(fy)} · opening ${num(open)} · tap a bill to open it</div><section class="sec">${out.map(r => `<div class="row ${route(r) ? 'tap' : ''}" data-r="${esc(route(r))}"><div class="grow"><div class="t1">${esc(r.voucher_no)}</div><div class="t2">${fmtDate(r.posting_date)} · ${esc(party[r.voucher_no] || (r.voucher_type === 'Stock Reconciliation' ? 'Opening stock' : r.voucher_type))}</div></div><div class="r"><b class="${r.actual_qty < 0 ? 'red' : 'green'}">${r.actual_qty > 0 ? '+' : ''}${num(r.actual_qty)}</b><div class="t2">balance ${num(r.bal)}</div></div></div>`).reverse().join('') || empty('No entries', 'Nothing moved this year.')}</section>`;
    $$('[data-r]').forEach(e => { if (e.dataset.r) e.onclick = () => go(e.dataset.r); });
  } catch (e) { if (e.auth) return loginView(e.message); view.innerHTML = errBox(e); }
}, { title: 'Ledger' });
