const app = document.querySelector('#app');
const state = { meta: null, company: null, parties: [], items: [], invoices: [], toast: '' };

const UNITS = ['QTL', 'BAG', 'KGS', 'MTS', 'NOS'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function inr(value) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toast(message) {
  state.toast = message;
  let node = document.querySelector('#toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    node.className = 'toast';
    document.body.appendChild(node);
  }
  node.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    if (state.toast === message) {
      state.toast = '';
      node.remove();
    }
  }, 5000);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request fail');
  return data;
}

function shell(title, subtitle, body, extra = '') {
  const company = state.company || {};
  const env = company.env === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const hash = location.hash || '#home';
  const item = (href, label) => `<button data-go="${href}" class="${hash.startsWith(href) || (href === '#home' && (hash === '' || hash === '#home')) ? 'active' : ''}">${label}</button>`;
  return `
    <div class="app">
      <aside class="side">
        <div class="brand">
          <div class="mark" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 25V6" stroke="#fff8ee" stroke-width="1.6"/>
              <path d="M14 10c2.5-2 5-2 7-1-2 3-4.5 4-7 3Z" fill="#f3d48a"/>
              <path d="M14 15c-2.6-2-5.2-1.8-7.2-.6 2.2 2.8 4.8 3.6 7.2 2.4Z" fill="#fff8ee"/>
              <path d="M14 19c2.4-1.8 5-1.6 6.8-.4-2 2.6-4.4 3.4-6.8 2.2Z" fill="#f3d48a"/>
            </svg>
          </div>
          <div>
            <h1>Galla Bill</h1>
            <p>Local bill, government portal</p>
          </div>
        </div>
        <nav class="nav">
          ${item('#home', 'Aaj ke bill')}
          ${item('#new', 'Naya bill')}
          ${item('#parties', 'Party')}
          ${item('#items', 'Maal')}
          ${item('#settings', 'Settings')}
        </nav>
        <div class="meta">
          <div>${esc(company.trade_name || 'Firm set karein')}</div>
          <div>${esc(company.gstin || '')}</div>
          <div class="${company.env === 'production' ? 'env-live' : 'env-test'}">${env}</div>
        </div>
      </aside>
      <main class="main">
        <div class="top">
          <div>
            <h2>${title}</h2>
            <p>${subtitle}</p>
          </div>
          <div class="row no-print">${extra}</div>
        </div>
        ${body}
      </main>
    </div>`;
}

function go(hash) {
  location.hash = hash;
}

async function route() {
  const hash = location.hash || '#home';
  try {
    if (!state.company) {
      state.company = await api('/api/company');
      state.meta = await api('/api/meta');
    }
    if (hash === '#home' || hash === '') return renderHome();
    if (hash === '#new') return renderBillForm();
    if (hash.startsWith('#edit/')) return renderBillForm(hash.split('/')[1]);
    if (hash.startsWith('#bill/')) return renderBill(hash.split('/')[1]);
    if (hash === '#parties') return renderParties();
    if (hash === '#items') return renderItems();
    if (hash === '#settings') return renderSettings();
    return renderHome();
  } catch (error) {
    app.innerHTML = shell('Problem', error.message, `<div class="banner error">${esc(error.message)}</div>`);
  }
}

async function renderHome() {
  state.invoices = await api('/api/invoices');
  const rows = state.invoices.map((bill) => `
    <tr class="clicky" data-go="#bill/${bill.id}">
      <td>${esc(bill.number)}</td>
      <td>${esc(bill.doc_date)}</td>
      <td>${esc(bill.party_name || '')}</td>
      <td class="num">${inr(bill.total)}</td>
      <td>${statusChip(bill)}</td>
      <td>${esc(bill.irn ? bill.irn.slice(0, 12) + '…' : '')}</td>
      <td>${esc(bill.ewb_no || '')}</td>
    </tr>`).join('');
  const banner = state.company.irp_client_id
    ? ''
    : '<div class="banner">Bill yahin save hogi. IRN ke liye Settings mein e-Invoice portal ka API login bharein. Bina login ke portal call nahi hoti.</div>';
  app.innerHTML = shell('Counter', 'Bill local hai. e-Invoice aur e-Way button seedha government portal ko call karte hain.', `
    ${banner}
    <div class="card" style="margin-top:12px">
      <table>
        <thead><tr><th>Bill</th><th>Date</th><th>Buyer</th><th class="num">Amount</th><th>Status</th><th>IRN</th><th>e-Way</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7">Abhi koi bill nahi.</td></tr>'}</tbody>
      </table>
    </div>`, '<button class="primary" data-go="#new">Naya bill</button>');
}

function statusChip(bill) {
  if (bill.status === 'cancelled') return '<span class="chip bad">Cancelled</span>';
  if (bill.irn && bill.ewb_no) return '<span class="chip ok">IRN + e-Way</span>';
  if (bill.irn) return '<span class="chip ok">IRN</span>';
  if (bill.ewb_no) return '<span class="chip ok">e-Way</span>';
  if (bill.portal_error) return '<span class="chip bad">Portal error</span>';
  return '<span class="chip warn">Local draft</span>';
}

async function renderBillForm(id) {
  const [parties, items, next, existing] = await Promise.all([
    api('/api/parties'),
    api('/api/items'),
    api('/api/invoices/next-number'),
    id ? api(`/api/invoices/${id}`) : null,
  ]);
  state.parties = parties;
  state.items = items;
  const bill = existing || {
    number: next.number,
    doc_date: state.meta.today,
    party_id: parties[0]?.id || '',
    broker: '',
    vehicle_no: '',
    distance: '',
    driver_name: '',
    bilti_no: '',
    bilti_date: '',
    freight_note: 'To pay',
    cash_discount: 0,
    other_charges: 0,
    lines: [blankLine(items[0])],
  };
  if (existing?.irn) {
    go(`#bill/${id}`);
    return;
  }
  app.innerHTML = shell(id ? `Bill ${esc(bill.number)}` : 'Naya bill', 'Qty quintal mein, bags sirf aapke print ke liye.', `
    <form id="bill-form" class="grid-2" data-id="${esc(id || '')}">
      <div class="stack">
        <div class="card grid-3">
          <label>Bill no.<input name="number" value="${esc(bill.number)}" required></label>
          <label>Date<input type="date" name="doc_date" value="${esc(bill.doc_date)}" required></label>
          <label>Broker<input name="broker" value="${esc(bill.broker || '')}"></label>
          <label>Buyer
            <select name="party_id">${parties.map((party) => `<option value="${party.id}" ${String(party.id) === String(bill.party_id) ? 'selected' : ''}>${esc(party.name)} ${esc(party.gstin || '')}</option>`).join('')}</select>
          </label>
          <label>Freight note
            <select name="freight_note">
              ${['To pay', 'Paid', 'Less'].map((item) => `<option ${bill.freight_note === item ? 'selected' : ''}>${item}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="card">
          <table class="line-table">
            <thead><tr><th>Maal</th><th>HSN</th><th>Bags</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST %</th><th></th></tr></thead>
            <tbody id="lines">${bill.lines.map((line) => lineRow(line, items)).join('')}</tbody>
          </table>
          <button type="button" class="ghost" id="add-line" style="margin-top:10px">Line jodein</button>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="grid-2">
            <label>Vehicle no.<input name="vehicle_no" value="${esc(bill.vehicle_no || '')}" placeholder="RJ09GC7788"></label>
            <label>Distance km<input name="distance" value="${esc(bill.distance || '')}" placeholder="0 = auto"></label>
            <label>Driver<input name="driver_name" value="${esc(bill.driver_name || '')}"></label>
            <label>Bilti no.<input name="bilti_no" value="${esc(bill.bilti_no || '')}"></label>
            <label>Bilti date<input type="date" name="bilti_date" value="${esc(bill.bilti_date || '')}"></label>
            <label>Cash discount ₹<input name="cash_discount" type="number" step="0.01" value="${esc(bill.cash_discount || 0)}"></label>
            <label>Other charges ₹<input name="other_charges" type="number" step="0.01" value="${esc(bill.other_charges || 0)}"></label>
          </div>
        </div>
        <div class="card" id="totals"><p class="muted">Hisab ho raha hai…</p></div>
        <div class="actions">
          <button class="ghost" type="submit">Bill save</button>
          <button class="green" type="button" id="gen-einvoice">e-Invoice + e-Way</button>
          <button class="primary" type="button" id="gen-eway">Sirf e-Way</button>
        </div>
        <div id="ready"></div>
      </div>
    </form>`, id ? `<button class="ghost" data-go="#bill/${id}">Bill dekhein</button>` : '');
  document.querySelector('#add-line').onclick = () => {
    document.querySelector('#lines').insertAdjacentHTML('beforeend', lineRow(blankLine(state.items[0]), state.items));
    refreshTotals();
  };
  document.querySelector('#bill-form').addEventListener('input', (event) => {
    if (event.target.classList.contains('item-pick')) applyItem(event.target);
    refreshTotals();
  });
  document.querySelector('#bill-form').onsubmit = (event) => submitBill(event, false);
  document.querySelector('#gen-einvoice').onclick = () => submitBill(null, 'einvoice');
  document.querySelector('#gen-eway').onclick = () => submitBill(null, 'eway');
  refreshTotals();
}

function blankLine(item) {
  return {
    item_id: item?.id || '',
    description: item?.name || '',
    hsn: item?.hsn || '',
    bags: '',
    qty: '',
    unit: item?.unit || 'QTL',
    rate: '',
    gst_rate: item?.gst_rate ?? 0,
  };
}

function lineRow(line, items) {
  return `<tr>
    <td>
      <select class="item-pick">${items.map((item) => `<option value="${item.id}" ${String(item.id) === String(line.item_id) ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}<option value="" ${line.item_id ? '' : 'selected'}>Khud likhein</option></select>
      <input class="desc" value="${esc(line.description || '')}" placeholder="Maal ka naam">
    </td>
    <td><input class="hsn" value="${esc(line.hsn || '')}" style="width:96px"></td>
    <td><input class="bags" type="number" step="1" value="${esc(line.bags || '')}" style="width:72px"></td>
    <td><input class="qty" type="number" step="0.001" value="${esc(line.qty || '')}" style="width:90px"></td>
    <td><select class="unit">${UNITS.map((unit) => `<option ${line.unit === unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></td>
    <td><input class="rate" type="number" step="0.01" value="${esc(line.rate || '')}" style="width:90px"></td>
    <td><input class="gst" type="number" step="0.01" value="${esc(line.gst_rate || 0)}" style="width:70px"></td>
    <td><button type="button" class="ghost remove-line">×</button></td>
  </tr>`;
}

function applyItem(select) {
  const item = state.items.find((row) => String(row.id) === select.value);
  const row = select.closest('tr');
  if (!item) return;
  row.querySelector('.desc').value = item.name;
  row.querySelector('.hsn').value = item.hsn;
  row.querySelector('.unit').value = item.unit;
  row.querySelector('.gst').value = item.gst_rate;
}

function readBillForm() {
  const form = document.querySelector('#bill-form');
  const data = Object.fromEntries(new FormData(form).entries());
  data.lines = [...form.querySelectorAll('#lines tr')].map((row) => ({
    item_id: row.querySelector('.item-pick').value || null,
    description: row.querySelector('.desc').value,
    hsn: row.querySelector('.hsn').value,
    bags: Number(row.querySelector('.bags').value || 0),
    qty: Number(row.querySelector('.qty').value || 0),
    unit: row.querySelector('.unit').value,
    rate: Number(row.querySelector('.rate').value || 0),
    gst_rate: Number(row.querySelector('.gst').value || 0),
    discount: 0,
  }));
  data.cash_discount = Number(data.cash_discount || 0);
  data.other_charges = Number(data.other_charges || 0);
  return data;
}

let totalsTimer = 0;
function refreshTotals() {
  clearTimeout(totalsTimer);
  totalsTimer = setTimeout(async () => {
    const form = document.querySelector('#bill-form');
    if (!form) return;
    try {
      const calc = await api('/api/calculate', { method: 'POST', body: readBillForm() });
      const box = document.querySelector('#totals');
      if (!box) return;
      box.innerHTML = `
        <div class="totals">
          <div><span>Taxable</span><b>${inr(calc.taxable)}</b></div>
          <div><span>CGST</span><b>${inr(calc.cgst)}</b></div>
          <div><span>SGST</span><b>${inr(calc.sgst)}</b></div>
          <div><span>IGST</span><b>${inr(calc.igst)}</b></div>
          <div><span>Round off</span><b>${inr(calc.round_off)}</b></div>
          <div><span>Total</span><strong>${inr(calc.total)}</strong></div>
          <div class="words">${esc(calc.words || '')}</div>
        </div>`;
      const ready = document.querySelector('#ready');
      if (ready && calc.readiness) {
        const firstError = calc.errors?.[0] ? `<div class="banner error">${esc(calc.errors[0])}</div>` : '';
        ready.innerHTML = `${firstError}
          <div class="banner ${calc.readiness.einvoice.ok ? 'ok' : ''}">e-Invoice: ${esc(calc.readiness.einvoice.ok ? 'Portal call ke liye taiyar' : calc.readiness.einvoice.reason)}</div>
          <div class="banner ${calc.readiness.eway.ok ? 'ok' : ''}" style="margin-top:8px">e-Way: ${esc(calc.readiness.eway.ok ? (calc.readiness.eway.via === 'irp' ? 'IRN ke saath banega' : 'Alag e-way portal par banega') : calc.readiness.eway.reason)}</div>`;
      }
    } catch (error) {
      const box = document.querySelector('#totals');
      if (box) box.innerHTML = `<div class="banner error">${esc(error.message)}</div>`;
    }
  }, 180);
}

async function submitBill(event, mode) {
  if (event) event.preventDefault();
  const form = document.querySelector('#bill-form');
  const id = form.dataset.id;
  const body = readBillForm();
  if (mode === 'einvoice' && state.company.env === 'production') {
    const ok = confirm('Yeh asli GST portal par IRN banayega. IRN ke baad maal aur rate badal nahi sakte. Aage badhein?');
    if (!ok) return;
  }
  try {
    const saved = await api(id ? `/api/invoices/${id}` : '/api/invoices', { method: id ? 'PUT' : 'POST', body });
    form.dataset.id = saved.id;
    if (mode === 'einvoice' || mode === 'eway') {
      try {
        const filed = await api(`/api/invoices/${saved.id}/${mode}`, { method: 'POST', body });
        toast(filed.irn ? `IRN ban gaya${filed.ewb_no ? `, e-way ${filed.ewb_no}` : ''}.` : `e-Way ${filed.ewb_no} ban gaya.`);
      } catch (error) {
        toast(error.message);
      }
      go(`#bill/${saved.id}`);
      return;
    }
    toast('Bill is computer par save ho gayi.');
    go(`#bill/${saved.id}`);
  } catch (error) {
    toast(error.message);
    const ready = document.querySelector('#ready');
    if (ready) ready.insertAdjacentHTML('afterbegin', `<div class="banner error">${esc(error.message)}</div>`);
  }
}

async function renderBill(id) {
  const bill = await api(`/api/invoices/${id}`);
  const seller = bill.seller || state.company;
  const lines = bill.lines.map((line, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${esc(line.description)}</td>
      <td>${esc(line.hsn)}</td>
      <td class="num">${line.bags ? esc(line.bags) : ''}</td>
      <td class="num">${esc(line.qty)}</td>
      <td>${esc(line.unit)}</td>
      <td class="num">${inr(line.rate)}</td>
      <td class="num">${inr(line.taxable)}</td>
    </tr>`).join('');
  app.innerHTML = shell(`Bill ${esc(bill.number)}`, bill.words || '', `
    <div class="sheet" id="print-root">
      <div class="bill-head">
        <div>
          <h3>${esc(seller.trade_name || seller.legal_name)}</h3>
          <div>${esc(seller.address || '')}</div>
          <div>${esc(seller.location || '')} ${esc(seller.pincode || '')}</div>
          <div>GSTIN ${esc(seller.gstin || '')} · ${esc(seller.phone || '')}</div>
        </div>
        <div>
          <div><b>Tax Invoice</b></div>
          <div>No. ${esc(bill.number)}</div>
          <div>Date ${esc(bill.doc_date)}</div>
          <div>${statusChip(bill)}</div>
        </div>
      </div>
      <div class="boxes">
        <div class="box">
          <div class="muted">Buyer</div>
          <b>${esc(bill.party_name || '')}</b>
          <div>${esc(bill.party_address || '')}</div>
          <div>${esc(bill.party_location || '')} ${esc(bill.party_pincode || '')}</div>
          <div>GSTIN ${esc(bill.party_gstin || 'URP')} · State ${esc(bill.party_state || '')}</div>
        </div>
        <div class="box">
          <div>Broker: ${esc(bill.broker || '-')}</div>
          <div>Vehicle: ${esc(bill.vehicle_no || '-')}</div>
          <div>Driver: ${esc(bill.driver_name || '-')}</div>
          <div>Bilti: ${esc(bill.bilti_no || '-')} ${esc(bill.bilti_date || '')}</div>
          <div>Distance: ${esc(bill.distance || '0')} km · Freight ${esc(bill.freight_note || '')}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Description</th><th>HSN</th><th class="num">Bags</th><th class="num">Qty</th><th>UOM</th><th class="num">Rate</th><th class="num">Taxable</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <div class="boxes">
        <div class="box">
          <div>IRN</div>
          <div style="word-break:break-all">${esc(bill.irn || 'Abhi nahi bana')}</div>
          <div>Ack ${esc(bill.ack_no || '-')} · ${esc(bill.ack_date || '')}</div>
          <div>e-Way ${esc(bill.ewb_no || '-')} valid ${esc(bill.ewb_valid_till || '')}</div>
          ${bill.signed_qr ? `<img alt="IRN QR" src="/api/invoices/${bill.id}/qr" width="140" height="140">` : ''}
        </div>
        <div class="box totals">
          <div><span>CGST</span><b>${inr(bill.cgst)}</b></div>
          <div><span>SGST</span><b>${inr(bill.sgst)}</b></div>
          <div><span>IGST</span><b>${inr(bill.igst)}</b></div>
          <div><span>Round off</span><b>${inr(bill.round_off)}</b></div>
          <div><span>Total</span><strong>${inr(bill.total)}</strong></div>
          <div class="words">${esc(bill.words || '')}</div>
        </div>
      </div>
      <div class="muted">Bank: ${esc(seller.bank_name || '')} A/c ${esc(seller.account_no || '')} IFSC ${esc(seller.ifsc || '')} ${esc(seller.branch || '')}</div>
      ${bill.portal_error ? `<div class="banner error" style="margin-top:10px">${esc(bill.portal_error)}</div>` : ''}
      ${bill.portal_info ? `<div class="banner" style="margin-top:10px">${esc(bill.portal_info)}</div>` : ''}
    </div>
    <div class="actions no-print" style="margin-top:14px">
      ${bill.irn ? '' : `<button class="ghost" data-go="#edit/${bill.id}">Edit</button>`}
      <button class="ghost" id="print">Print</button>
      <button class="ghost" id="show-json">Portal JSON</button>
      ${bill.irn ? '' : '<button class="green" id="do-einvoice">e-Invoice portal</button>'}
      ${bill.ewb_no ? '' : '<button class="primary" id="do-eway">e-Way portal</button>'}
      ${bill.irn && bill.status !== 'cancelled' ? '<button class="danger" id="do-cancel">IRN cancel</button>' : ''}
      ${bill.irn || bill.ewb_no ? '' : `<button class="danger" id="do-delete">Draft delete</button>`}
    </div>
    <pre id="json-box" class="card no-print" style="display:none; white-space:pre-wrap"></pre>`, '');
  document.querySelector('#print').onclick = () => window.print();
  const jsonBtn = document.querySelector('#show-json');
  if (jsonBtn) jsonBtn.onclick = async () => {
    const payload = await api(`/api/invoices/${id}/payload`);
    const box = document.querySelector('#json-box');
    box.style.display = 'block';
    box.textContent = JSON.stringify(payload, null, 2);
  };
  const einvoice = document.querySelector('#do-einvoice');
  if (einvoice) einvoice.onclick = () => fileBill(id, 'einvoice');
  const eway = document.querySelector('#do-eway');
  if (eway) eway.onclick = () => fileBill(id, 'eway');
  const cancel = document.querySelector('#do-cancel');
  if (cancel) cancel.onclick = () => cancelBill(id);
  const remove = document.querySelector('#do-delete');
  if (remove) remove.onclick = async () => {
    if (!confirm('Local draft delete karein?')) return;
    await api(`/api/invoices/${id}`, { method: 'DELETE' });
    go('#home');
  };
}

async function fileBill(id, kind) {
  if (kind === 'einvoice' && state.company.env === 'production' && !confirm('Asli portal par IRN banega. Continue?')) return;
  try {
    const filed = await api(`/api/invoices/${id}/${kind}`, { method: 'POST', body: {} });
    toast(filed.irn ? 'Portal ne IRN de diya.' : `Portal ne e-way ${filed.ewb_no} de diya.`);
    renderBill(id);
  } catch (error) {
    toast(error.message);
    renderBill(id);
  }
}

async function cancelBill(id) {
  const remark = prompt('Cancel remark, jaise wrong weight');
  if (!remark) return;
  try {
    await api(`/api/invoices/${id}/cancel`, { method: 'POST', body: { reason: '2', remark } });
    toast('Portal ne IRN cancel kar diya.');
    renderBill(id);
  } catch (error) {
    toast(error.message);
  }
}

async function renderParties() {
  state.parties = await api('/api/parties');
  app.innerHTML = shell('Party', 'GSTIN likh kar portal se naam aur address kheench sakte hain.', `
    <div class="grid-2">
      <div class="card">
        <table>
          <thead><tr><th>Naam</th><th>GSTIN</th><th>Place</th><th></th></tr></thead>
          <tbody>${state.parties.map((party) => `<tr>
            <td>${esc(party.name)}</td><td>${esc(party.gstin || '')}</td><td>${esc(party.location || '')} ${esc(party.pincode || '')}</td>
            <td><button class="ghost" data-edit-party="${party.id}">Edit</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <form id="party-form" class="card stack">
        <input type="hidden" name="id">
        <label>Naam<input name="name" required></label>
        <label>GSTIN<input name="gstin" maxlength="15"></label>
        <button type="button" class="ghost" id="lookup">GSTIN portal se lao</button>
        <label>Address<textarea name="address"></textarea></label>
        <div class="grid-3">
          <label>City<input name="location"></label>
          <label>Pincode<input name="pincode" maxlength="6"></label>
          <label>State code<input name="state_code" maxlength="2"></label>
        </div>
        <label>Phone<input name="phone"></label>
        <button class="primary" type="submit">Party save</button>
      </form>
    </div>`);
  document.querySelector('#lookup').onclick = lookupParty;
  document.querySelector('#party-form').onsubmit = saveParty;
  document.querySelectorAll('[data-edit-party]').forEach((button) => {
    button.onclick = () => fillParty(state.parties.find((party) => String(party.id) === button.dataset.editParty));
  });
}

function fillParty(party) {
  const form = document.querySelector('#party-form');
  for (const [key, value] of Object.entries(party)) {
    if (form.elements[key]) form.elements[key].value = value ?? '';
  }
}

async function lookupParty() {
  const form = document.querySelector('#party-form');
  try {
    const found = await api('/api/parties/lookup', { method: 'POST', body: { gstin: form.gstin.value } });
    form.name.value = form.name.value || found.name;
    form.address.value = found.address || form.address.value;
    form.location.value = found.location || form.location.value;
    form.pincode.value = found.pincode || form.pincode.value;
    form.state_code.value = found.state_code || form.state_code.value;
    toast(found.name ? `Portal: ${found.name}` : 'Portal ne GSTIN de diya, naam khali tha.');
  } catch (error) {
    toast(error.message);
  }
}

async function saveParty(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    if (data.id) await api(`/api/parties/${data.id}`, { method: 'PUT', body: data });
    else await api('/api/parties', { method: 'POST', body: data });
    toast('Party save ho gayi.');
    renderParties();
  } catch (error) {
    toast(error.message);
  }
}

async function renderItems() {
  state.items = await api('/api/items');
  app.innerHTML = shell('Maal', 'HSN aur GST % yahin rakhein. Bill par qty aur rate har baar badalte hain.', `
    <div class="grid-2">
      <div class="card">
        <table>
          <thead><tr><th>Maal</th><th>HSN</th><th>Unit</th><th>GST %</th><th></th></tr></thead>
          <tbody>${state.items.map((item) => `<tr>
            <td>${esc(item.name)}</td><td>${esc(item.hsn)}</td><td>${esc(item.unit)}</td><td>${esc(item.gst_rate)}</td>
            <td><button class="ghost" data-edit-item="${item.id}">Edit</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <form id="item-form" class="card stack">
        <input type="hidden" name="id">
        <label>Naam<input name="name" required></label>
        <label>HSN<input name="hsn"></label>
        <label>Unit<select name="unit">${UNITS.map((unit) => `<option>${unit}</option>`).join('')}</select></label>
        <label>GST %<input name="gst_rate" type="number" step="0.01" value="5"></label>
        <button class="primary" type="submit">Maal save</button>
      </form>
    </div>`);
  document.querySelector('#item-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      if (data.id) await api(`/api/items/${data.id}`, { method: 'PUT', body: data });
      else await api('/api/items', { method: 'POST', body: data });
      toast('Maal save ho gaya.');
      renderItems();
    } catch (error) {
      toast(error.message);
    }
  };
  document.querySelectorAll('[data-edit-item]').forEach((button) => {
    button.onclick = () => {
      const item = state.items.find((row) => String(row.id) === button.dataset.editItem);
      const form = document.querySelector('#item-form');
      for (const [key, value] of Object.entries(item)) if (form.elements[key]) form.elements[key].value = value ?? '';
    };
  });
}

async function renderSettings() {
  const company = await api('/api/company');
  state.company = company;
  const field = (name, label, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${esc(company[name] || '')}"></label>`;
  app.innerHTML = shell('Settings', 'Software is computer par chalti hai. Login ke baad call seedha NIC portal par jaati hai.', `
    <form id="settings" class="stack">
      <div class="card stack">
        <h3>Firm</h3>
        <div class="grid-3">
          ${field('legal_name', 'Legal name')}
          ${field('trade_name', 'Bill par naam')}
          ${field('gstin', 'GSTIN')}
          ${field('pan', 'PAN')}
          ${field('phone', 'Phone')}
          ${field('email', 'Email')}
          ${field('location', 'City')}
          ${field('pincode', 'Pincode')}
          ${field('state_code', 'State code')}
        </div>
        <label>Address<textarea name="address">${esc(company.address || '')}</textarea></label>
        <div class="grid-3">
          ${field('bank_name', 'Bank')}
          ${field('account_no', 'Account')}
          ${field('ifsc', 'IFSC')}
          ${field('branch', 'Branch')}
        </div>
      </div>
      <div class="card stack">
        <h3>Portal</h3>
        <label>Environment
          <select name="env">
            <option value="sandbox" ${company.env !== 'production' ? 'selected' : ''}>Sandbox — test portal</option>
            <option value="production" ${company.env === 'production' ? 'selected' : ''}>Production — asli GST portal</option>
          </select>
        </label>
        <div class="banner">Sandbox GSTIN alag hota hai, aapka asli GSTIN wahan login nahi hoga. Production par bana IRN asli hota hai aur 24 ghante ke baad cancel nahi hota. Public key portal se download karke poori PEM yahan paste karein.</div>
        <h3>e-Invoice API</h3>
        <div class="grid-2">
          ${field('irp_client_id', 'Client id')}
          ${field('irp_client_secret', 'Client secret')}
          ${field('irp_username', 'API username')}
          ${field('irp_password', 'API password', 'password')}
        </div>
        <label>e-Invoice public key<textarea name="irp_public_key">${esc(company.irp_public_key || '')}</textarea></label>
        <button class="green" type="button" id="test-irp">e-Invoice portal test</button>
        <h3>e-Way Bill API</h3>
        <p class="muted">Tax wale B2B bill ka e-way IRN ke saath ban jata hai. Yeh alag login tab chahiye jab maal exempt ho, jaise bina GST ka makka.</p>
        <div class="grid-2">
          ${field('ewb_client_id', 'Client id')}
          ${field('ewb_client_secret', 'Client secret')}
          ${field('ewb_username', 'API username')}
          ${field('ewb_password', 'API password', 'password')}
        </div>
        <label>e-Way public key<textarea name="ewb_public_key">${esc(company.ewb_public_key || '')}</textarea></label>
        <button class="primary" type="button" id="test-eway">e-Way portal test</button>
      </div>
      <button class="primary" type="submit">Settings save</button>
    </form>`);
  document.querySelector('#settings').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      state.company = await api('/api/company', { method: 'PUT', body: data });
      toast('Settings save ho gayi.');
    } catch (error) {
      toast(error.message);
    }
  };
  document.querySelector('#test-irp').onclick = () => testPortal('/api/portal/test-irp');
  document.querySelector('#test-eway').onclick = () => testPortal('/api/portal/test-eway');
}

async function testPortal(url) {
  const form = document.querySelector('#settings');
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    state.company = await api('/api/company', { method: 'PUT', body: data });
    const result = await api(url, { method: 'POST', body: { force: true } });
    toast(result.message);
  } catch (error) {
    toast(error.message);
  }
}

document.body.addEventListener('click', (event) => {
  const remove = event.target.closest('.remove-line');
  if (remove) {
    const rows = document.querySelectorAll('#lines tr');
    if (rows.length === 1) return;
    remove.closest('tr').remove();
    refreshTotals();
    return;
  }
  const target = event.target.closest('[data-go]');
  if (!target) return;
  event.preventDefault();
  go(target.dataset.go);
});

window.addEventListener('hashchange', route);
route();
