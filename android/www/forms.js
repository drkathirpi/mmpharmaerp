/* forms.js: shared form helpers and the master screens (customer, supplier, item, HSN, salt) */
const WH = () => 'Stores - ' + S.abbr, EXPWH = () => 'Expired Stock - ' + S.abbr;
const post = (dt, doc) => api('/api/resource/' + encodeURIComponent(dt), { method: 'POST', body: doc });
const put = (dt, name, doc) => api('/api/resource/' + encodeURIComponent(dt) + '/' + encodeURIComponent(name), { method: 'PUT', body: doc });
const call = (m, body) => api('/api/method/' + m, { method: 'POST', body });
const submitDoc = d => call('frappe.client.submit', { doc: d });
const STATES = ['Tamil Nadu', 'Andhra Pradesh', 'Telangana', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Delhi', 'Uttar Pradesh', 'Madhya Pradesh', 'West Bengal', 'Odisha', 'Bihar', 'Punjab', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Uttarakhand', 'Chhattisgarh', 'Jharkhand', 'Assam', 'Goa', 'Puducherry', 'Chandigarh'];

/* a labelled field of any kind; returns html. t: text, num, date, month, sel, area */
function fld(id, label, val, t = 'text', o = {}) {
  const v = val == null ? '' : val, cap = `<div class="cap">${esc(label)}${o.req ? ' *' : ''}</div>`;
  if (t === 'sel') return `${cap}<label class="field"><select id="${id}" class="in" aria-label="${esc(label)}">${(o.opts || []).map(x => { const [k, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
  if (t === 'area') return `${cap}<label class="field"><textarea id="${id}" class="in ta" rows="3" placeholder="${esc(o.ph || '')}" aria-label="${esc(label)}">${esc(v)}</textarea></label>`;
  const type = t === 'num' ? 'number' : t, extra = t === 'num' ? ' inputmode="decimal" step="any"' : '';
  return `${cap}<label class="field"><input id="${id}" type="${type}"${extra} value="${esc(v)}" placeholder="${esc(o.ph || '')}" autocomplete="off" ${o.list ? `list="${id}_l"` : ''} aria-label="${esc(label)}">${o.list ? `<datalist id="${id}_l">${o.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}</label>`;
}
const val = (id, root = document) => { const e = $('#' + id, root); return e ? e.value.trim() : ''; };
const numv = (id, root = document) => parseFloat(val(id, root)) || 0;

/* tap-to-search picker over any doctype; cb(row) */
function pickDoc(title, dt, o, cb) {
  const fields = o.fields || ['name'], labels = o.label || (r => `<div class="t1">${esc(r.name)}</div>`);
  openSheet(title, `<label class="field s" style="margin-top:8px">${ic('search', 20)}<input id="pk" placeholder="${esc(o.ph || 'Type to search')}" autocomplete="off" aria-label="Search"></label>${o.create ? `<div class="acts" style="padding-top:0"><button class="btn out sm" id="pkn">+ ${esc(o.create)}</button></div>` : ''}<div id="pkl"></div>`, root => {
    $('#pk', root).focus();
    const run = async () => {
      const v = $('#pk', root).value.trim(); if (v.length < (o.min ?? 2)) return;
      const f = (o.search || ['name']).map(k => [k, 'like', '%' + v + '%']);
      const rows = await list(dt, { fields, filters: o.filters || [], or_filters: f, limit_page_length: 25, order_by: o.order || 'modified desc' });
      $('#pkl', root).innerHTML = rows.map((r, i) => `<div class="row tap" data-i="${i}">${labels(r)}</div>`).join('') || empty('No match', '');
      $$('#pkl .row', root).forEach(e => e.onclick = () => { const r = rows[e.dataset.i]; hideSheet(); history.back(); setTimeout(() => cb(r), 60); });
    };
    $('#pk', root).oninput = debounce(run, 250);
    if (o.min === 0) run();
    if ($('#pkn', root)) $('#pkn', root).onclick = () => { const t = $('#pk', root).value.trim(); hideSheet(); history.back(); setTimeout(() => o.onCreate(t), 60); };
  });
}
const pickParty = (type, cb) => type === 'Supplier'
  ? pickDoc('Choose supplier', 'Supplier', { fields: ['name', 'supplier_name'], search: ['supplier_name', 'name'], filters: [['disabled', '=', 0]], ph: 'Search supplier name', label: r => `<div class="grow"><div class="t1">${esc(r.supplier_name)}</div></div>`, create: 'New supplier', onCreate: () => go('/new/supplier') }, r => cb(r.name, r.supplier_name))
  : partyPicker((c, _, n) => cb(c, n));

async function distinct(dt, field, ttl = 600000) {
  return memo('d_' + dt + field, async () => (await list(dt, { fields: [field + ' as v', 'count(name) as n'], filters: [[field, '!=', '']], group_by: field, order_by: 'n desc', limit_page_length: 600 })).map(x => x.v), ttl);
}

/* ---- address and contact attached to a new party ---- */
async function attachAddrContact(type, name, v) {
  const links = [{ link_doctype: type, link_name: name }], out = {};
  if (v.address_line1 || v.gstin) {
    const a = await post('Address', { address_title: name, address_type: 'Billing', address_line1: v.address_line1 || '-', address_line2: v.address_line2 || undefined, city: v.city || '-', state: v.state || 'Tamil Nadu', pincode: v.pincode || undefined, country: 'India', gstin: v.gstin || undefined, gst_category: v.gstin ? 'Registered Regular' : 'Unregistered', is_primary_address: 1, links });
    out[type === 'Customer' ? 'customer_primary_address' : 'supplier_primary_address'] = a.name;
  }
  if (v.phone) {
    const c = await post('Contact', { first_name: name.slice(0, 120), phone_nos: [{ phone: v.phone, is_primary_mobile_no: 1, is_primary_phone: 0 }], links });
    out[type === 'Customer' ? 'customer_primary_contact' : 'supplier_primary_contact'] = c.name;
  }
  if (Object.keys(out).length) await put(type, name, out);
}

function formScreen(html, bind) { view.innerHTML = `<div class="form">${html}</div>`; if (bind) bind(); wireSteppers(view); }
const partyFields = (t, v = {}) => `${fld('nm', t + ' name', v.nm, 'text', { req: 1, ph: 'Name as printed on bills' })}
  ${fld('ph', 'Mobile number', '', 'tel', { ph: '10-digit number' })}
  ${fld('a1', 'Address line 1', '', 'text')}${fld('a2', 'Address line 2', '', 'text')}
  ${fld('ci', 'City or town', '', 'text')}${fld('st', 'State', 'Tamil Nadu', 'sel', { opts: STATES })}${fld('pn', 'PIN code', '', 'text', { ph: '6 digits' })}
  ${fld('gs', 'GSTIN (leave empty if unregistered)', '', 'text', { ph: '15 characters' })}`;
const partyVals = () => ({ address_line1: val('a1'), address_line2: val('a2'), city: val('ci'), state: val('st'), pincode: val('pn'), gstin: val('gs').toUpperCase(), phone: val('ph').replace(/\D/g, '').slice(-10) });
const doneNote = (t, s, go1) => { toast(t, 4500); memo.clear(); if (go1) setTimeout(() => go(go1), 100); };

on(/^\/new\/customer$/, async () => {
  const areas = await distinct('Customer', 'area'), sm = await distinct('Customer', 'salesman');
  formScreen(`${partyFields('Customer')}${fld('dl1', 'Drug licence 1 (20B)', '', 'text')}${fld('dl2', 'Drug licence 2 (21B)', '', 'text')}${fld('ar', 'Area or route', '', 'text', { list: areas })}${fld('sm', 'Salesman', '', 'text', { list: sm })}
    <div class="acts"><button class="btn" id="sv">Create customer</button></div>`, () => {
    $('#sv').onclick = async () => {
      const nm = val('nm').toUpperCase(); if (!nm) return toast('Enter the customer name');
      const v = partyVals(); if (v.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(v.gstin)) return toast('GSTIN looks wrong. It has 15 characters, like 33ABCDE1234F1Z5');
      $('#sv').disabled = true;
      try {
        const c = await post('Customer', { customer_name: nm, customer_type: 'Company', customer_group: 'Commercial', territory: 'India', gst_category: v.gstin ? 'Registered Regular' : 'Unregistered', gstin: v.gstin || undefined, drug_licence_1: val('dl1') || undefined, drug_licence_2: val('dl2') || undefined, area: val('ar') || undefined, salesman: val('sm') || undefined });
        await attachAddrContact('Customer', c.name, v);
        doneNote('Customer ' + c.name + ' created', '', '/p/' + encodeURIComponent(c.name));
      } catch (e) { toast(e.message, 7000); $('#sv').disabled = false; }
    };
  });
}, { title: 'New customer' });

on(/^\/new\/supplier$/, async () => {
  formScreen(`${partyFields('Supplier')}${fld('sg', 'Supplier group', 'Pharmaceutical', 'sel', { opts: ['Pharmaceutical', 'Distributor', 'Local', 'Services'] })}
    <div class="acts"><button class="btn" id="sv">Create supplier</button></div>`, () => {
    $('#sv').onclick = async () => {
      const nm = val('nm').toUpperCase(); if (!nm) return toast('Enter the supplier name');
      const v = partyVals(); if (v.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(v.gstin)) return toast('GSTIN looks wrong. It has 15 characters, like 33ABCDE1234F1Z5');
      $('#sv').disabled = true;
      try {
        const s = await post('Supplier', { supplier_name: nm, supplier_type: 'Company', supplier_group: val('sg'), gst_category: v.gstin ? 'Registered Regular' : 'Unregistered', gstin: v.gstin || undefined });
        await attachAddrContact('Supplier', s.name, v);
        doneNote('Supplier ' + s.name + ' created', '', '/more');
      } catch (e) { toast(e.message, 7000); $('#sv').disabled = false; }
    };
  });
}, { title: 'New supplier' });

on(/^\/new\/hsn$/, async () => {
  formScreen(`${fld('hs', 'HSN code', '', 'text', { req: 1, ph: '4, 6 or 8 digits, e.g. 30049099' })}${fld('ds', 'Description', '', 'area', { ph: 'What goods this HSN covers' })}
    <div class="pad t2">The GST rate is set on the item, not on the HSN code.</div><div class="acts"><button class="btn" id="sv">Create HSN code</button></div>`, () => {
    $('#sv').onclick = async () => {
      const h = val('hs').replace(/\s/g, ''); if (!/^\d{4}(\d{2}|\d{4})?$/.test(h)) return toast('HSN must be 4, 6 or 8 digits');
      $('#sv').disabled = true;
      try { const r = await post('GST HSN Code', { hsn_code: h, description: val('ds') || 'Pharmaceutical goods' }); doneNote('HSN ' + r.name + ' created', '', '/more'); }
      catch (e) { toast(e.message, 7000); $('#sv').disabled = false; }
    };
  });
}, { title: 'New HSN code' });

on(/^\/new\/salt$/, async () => {
  formScreen(`${fld('sl', 'Salt name', '', 'text', { req: 1, ph: 'e.g. PARACETAMOL 500MG' })}<div class="pad t2">Pick salts from this list when you create an item, and search items by salt.</div><div class="acts"><button class="btn" id="sv">Create salt</button></div><section class="sec" id="ex"></section>`, () => {
    const showList = debounce(async () => { const v = val('sl'); if (v.length < 2) return; const r = await list('Salt', { fields: ['name'], filters: [['name', 'like', '%' + v + '%']], limit_page_length: 8 }); $('#ex').innerHTML = r.length ? `<h2>Already there</h2>${r.map(x => `<div class="row"><div class="t1">${esc(x.name)}</div></div>`).join('')}` : ''; }, 250);
    $('#sl').oninput = showList;
    $('#sv').onclick = async () => {
      const s = val('sl').toUpperCase().replace(/\s+/g, ' '); if (!s) return toast('Enter the salt name');
      $('#sv').disabled = true;
      try { await post('Salt', { salt_name: s }); doneNote(s + ' added', '', '/more'); }
      catch (e) { toast(/Duplicate|exists/i.test(e.message) ? 'That salt is already there' : e.message, 6000); $('#sv').disabled = false; }
    };
  });
}, { title: 'New salt' });

const GSTR = [['0', 'Exempted - ', 'Exempt (0%)'], ['5', 'GST 5% - ', '5%'], ['12', 'GST 12% - ', '12%'], ['18', 'GST 18% - ', '18%'], ['28', 'GST 28% - ', '28%']];
on(/^\/new\/item$/, async () => {
  const [mf, uoms] = await Promise.all([distinct('Item', 'manufacturer_company'), distinct('Item', 'stock_uom')]);
  let salts = [];
  formScreen(`${fld('nm', 'Item name', '', 'text', { req: 1, ph: 'Brand, strength and pack, e.g. PANTOS 40 TAB 15S' })}
    ${fld('um', 'Unit', uoms.includes('STR') ? 'STR' : uoms[0], 'sel', { opts: uoms })}
    ${fld('mf', 'Company (manufacturer)', '', 'text', { list: mf })}
    <div class="cap">HSN code *</div><div class="field"><div class="row tap in" id="hp" style="min-height:52px"><div class="grow t1" id="hv">Choose HSN code</div>${ic('chev', 18)}</div></div>
    ${fld('gr', 'GST rate', '12', 'sel', { opts: GSTR.map(g => [g[0], g[2]]) })}
    ${fld('ds', 'Drug schedule', 'None', 'sel', { opts: ['None', 'H', 'H1', 'X', 'Narcotic', 'OTC'] })}
    <div class="cap">Salt composition</div><div class="pad" style="padding-top:0"><div id="sc" class="t2">None added</div><button class="link" id="sa">+ Add salt</button></div>
    ${fld('sp', 'Selling rate (optional)', '', 'num', { ph: 'Default rate per unit' })}
    <div class="acts"><button class="btn" id="sv">Create item</button></div>`, () => {
    let hsn = '';
    $('#hp').onclick = () => pickDoc('Choose HSN code', 'GST HSN Code', { fields: ['name', 'description'], search: ['name', 'description'], ph: 'Type HSN number or words', label: r => `<div class="grow"><div class="t1">${esc(r.name)}</div><div class="t2">${esc((r.description || '').slice(0, 80))}</div></div>`, create: 'New HSN code', onCreate: () => go('/new/hsn') }, r => { hsn = r.name; $('#hv').textContent = r.name; });
    const drawSalts = () => { $('#sc').textContent = salts.length ? salts.join(' + ') : 'None added'; };
    $('#sa').onclick = () => pickDoc('Add salt', 'Salt', { fields: ['name'], ph: 'Search salt', label: r => `<div class="t1">${esc(r.name)}</div>`, create: 'New salt', onCreate: t => { if (t) post('Salt', { salt_name: t.toUpperCase() }).then(() => { salts.push(t.toUpperCase()); drawSalts(); }).catch(e => toast(e.message, 5000)); else go('/new/salt'); } }, r => { if (!salts.includes(r.name)) salts.push(r.name); drawSalts(); });
    $('#sv').onclick = async () => {
      const nm = val('nm').toUpperCase().replace(/\s+/g, ' '); if (!nm) return toast('Enter the item name'); if (!hsn) return toast('Choose the HSN code');
      const g = GSTR.find(x => x[0] === val('gr')), mfr = val('mf');
      $('#sv').disabled = true;
      try {
        const it = await post('Item', { item_code: nm, item_name: nm, item_group: 'Products', stock_uom: val('um'), is_stock_item: 1, has_batch_no: 1, has_expiry_date: 1, create_new_batch: 1, shelf_life_in_days: 730, end_of_life: '2099-12-31', is_purchase_item: 1, is_sales_item: 1, gst_hsn_code: hsn, salt_composition: salts.join(' + ') || undefined, manufacturer_company: mfr || undefined, drug_schedule: val('ds'), taxes: [{ item_tax_template: g[1] + S.abbr }], item_defaults: [{ company: S.company, default_warehouse: WH() }] });
        const sp = numv('sp'); if (sp > 0) await post('Item Price', { item_code: it.name, price_list: 'Standard Selling', price_list_rate: sp, currency: 'INR' }).catch(() => 0);
        doneNote('Item ' + it.name + ' created', '', '/item/' + encodeURIComponent(it.name));
      } catch (e) { toast(e.message, 7000); $('#sv').disabled = false; }
    };
  });
}, { title: 'New item' });
