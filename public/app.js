const state = {
  user: null,
  view: 'market',
  tradeRole: 'owner',
  openTradeId: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function getCookie(name) {
  const match = document.cookie
    .split('; ')
    .find((r) => r.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : '';
}

async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = getCookie('cg_csrf');
  }
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers,
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

function renderTopbar() {
  const who = $('#who');
  const nav = $('#nav');
  const logoutBtn = $('#logoutBtn');
  if (state.user) {
    who.innerHTML = `Hi, <b>${esc(state.user.username)}</b> · <b>${state.user.coins}</b> coins`;
    nav.hidden = false;
    logoutBtn.hidden = false;
  } else {
    who.textContent = '';
    nav.hidden = true;
    logoutBtn.hidden = true;
  }
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === state.view));
}

function showBanner(html, { ok = false, autoDismissMs = 0 } = {}) {
  const b = $('#banner');
  b.innerHTML = html;
  b.hidden = false;
  b.classList.toggle('ok', ok);
  if (autoDismissMs) setTimeout(() => (b.hidden = true), autoDismissMs);
}
function hideBanner() {
  $('#banner').hidden = true;
}

function renderVerificationBanner() {
  if (!state.user) return hideBanner();
  if (state.user.verified) return hideBanner();
  $('#banner').hidden = false;
  $('#banner').classList.remove('ok');
  $('#banner').innerHTML = `
    <span>Your email <b>${esc(state.user.email)}</b> isn't verified yet. Posting listings and trading are disabled until you verify.</span>
    <button id="resendBtn">Get verify link</button>
  `;
  $('#resendBtn').addEventListener('click', async () => {
    try {
      const r = await api('/api/resend-verification', { method: 'POST' });
      showBanner(
        `Click to verify: <a href="${esc(r.verify_url)}">${esc(r.verify_url)}</a> <small>(dev mode — in production this would be emailed to you)</small>`,
        { autoDismissMs: 0 }
      );
    } catch (e) {
      alert(e.message);
    }
  });
}

function setView(view) {
  state.view = view;
  renderTopbar();
  if (!state.user) return renderAuth();
  if (view === 'market') return renderMarket();
  if (view === 'mine') return renderMine();
  if (view === 'trades') return renderTrades();
  if (view === 'wallet') return renderWallet();
}

function useTemplate(id) {
  const node = document.importNode($(id).content, true);
  app.replaceChildren(node);
}

// --- Auth ---

function renderAuth() {
  useTemplate('#tpl-auth');
  let mode = 'login';
  const submit = $('#authSubmit');
  const emailField = $('#emailField');
  const emailInput = emailField.querySelector('input');
  $$('.tab', app).forEach((t) => {
    t.addEventListener('click', () => {
      mode = t.dataset.tab;
      $$('.tab', app).forEach((x) => x.classList.toggle('active', x === t));
      submit.textContent = mode === 'login' ? 'Log in' : 'Create account';
      emailField.hidden = mode !== 'register';
      emailInput.required = mode === 'register';
    });
  });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $('#authErr');
    err.hidden = true;
    const body = { username: fd.get('username'), password: fd.get('password') };
    if (mode === 'register') body.email = fd.get('email');
    try {
      const user = await api(`/api/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body,
      });
      state.user = user;
      if (mode === 'register' && user.verify_url) {
        showBanner(
          `Account created. Click to verify: <a href="${esc(user.verify_url)}">${esc(user.verify_url)}</a> <small>(dev mode — in production this would be emailed to you)</small>`
        );
      }
      setView('market');
      renderVerificationBanner();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

// --- Marketplace ---

async function renderMarket() {
  useTemplate('#tpl-market');
  const load = async () => {
    const params = new URLSearchParams();
    const q = $('#q').value.trim();
    const kind = $('#kindFilter').value;
    if (q) params.set('q', q);
    if (kind) params.set('kind', kind);
    const rows = await api('/api/listings?' + params.toString());
    const el = $('#listings');
    if (!rows.length) {
      el.innerHTML = '<p class="hint">No active listings yet. Be the first to post one!</p>';
      return;
    }
    el.innerHTML = rows.map(listingCard).join('');
    $$('.listing [data-propose]', el).forEach((b) =>
      b.addEventListener('click', () => openProposeModal(Number(b.dataset.propose)))
    );
  };
  $('#q').addEventListener('input', debounce(load, 250));
  $('#kindFilter').addEventListener('change', load);
  await load();
}

function listingCard(l, opts = {}) {
  const mine = state.user && state.user.id === l.user_id;
  const canPropose = !mine && l.status === 'active';
  const qtyLine =
    l.quantity > 1
      ? `<div class="meta">${l.quantity_available} of ${l.quantity} ${esc(l.unit)} available · by @${esc(l.owner_username || (mine ? state.user.username : '?'))}</div>`
      : `<div class="meta">${l.quantity} ${esc(l.unit)} · by @${esc(l.owner_username || (mine ? state.user.username : '?'))}</div>`;
  return `
    <div class="listing ${l.status !== 'active' ? 'inactive' : ''}">
      <span class="kind">${esc(l.kind)}</span>
      <h3>${esc(l.title)}</h3>
      ${l.description ? `<div class="desc">${esc(l.description)}</div>` : ''}
      ${qtyLine}
      <div class="foot">
        <div class="price">${l.value_coins} coins${l.quantity > 1 ? ' each' : ''}</div>
        <div class="row">
          <span class="badge ${l.status}">${l.status}</span>
          ${canPropose ? `<button data-propose="${l.id}">Propose trade</button>` : ''}
          ${opts.editable && l.status === 'active' ? `<button class="ghost" data-edit="${l.id}">Edit</button>` : ''}
          ${opts.cancellable && l.status === 'active' ? `<button class="ghost" data-cancel="${l.id}">Cancel</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

// --- My listings ---

async function renderMine() {
  useTemplate('#tpl-mine');
  $('#newListingBtn').addEventListener('click', () => openNewListingModal());
  const load = async () => {
    const rows = await api('/api/listings?mine=1');
    const el = $('#myListings');
    if (!rows.length) {
      el.innerHTML = '<p class="hint">You haven\'t posted anything yet.</p>';
      return;
    }
    el.innerHTML = rows.map((l) => listingCard(l, { cancellable: true, editable: true })).join('');
    $$('[data-cancel]', el).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Cancel this listing?')) return;
        try {
          await api('/api/listings/' + b.dataset.cancel, { method: 'DELETE' });
          await load();
        } catch (e) { alert(e.message); }
      })
    );
    $$('[data-edit]', el).forEach((b) =>
      b.addEventListener('click', () => openEditListingModal(Number(b.dataset.edit), rows, load))
    );
  };
  await load();
}

function listingForm({ kind = 'time', title = '', description = '', unit = '', quantity = 1, value_coins = 50 } = {}) {
  return `
    <form id="listForm">
      <label>Kind
        <select name="kind">
          <option value="time" ${kind==='time'?'selected':''}>Time (e.g. 1 hour of help)</option>
          <option value="item" ${kind==='item'?'selected':''}>Item (e.g. used bike)</option>
          <option value="service" ${kind==='service'?'selected':''}>Service (e.g. logo design)</option>
        </select>
      </label>
      <label>Title<input name="title" maxlength="120" required value="${esc(title)}" placeholder="1 hour of Spanish tutoring" /></label>
      <label>Description<textarea name="description" maxlength="2000" placeholder="What exactly are you offering?">${esc(description)}</textarea></label>
      <div class="row">
        <label style="flex:1">Quantity<input name="quantity" type="number" min="1" value="${quantity}" /></label>
        <label style="flex:1">Unit<input name="unit" maxlength="20" value="${esc(unit)}" placeholder="hour / piece / session" /></label>
      </div>
      <label>Value in coins (each)<input name="value_coins" type="number" min="0" value="${value_coins}" required /></label>
      <button type="submit">Save</button>
      <p class="err" id="listErr" hidden></p>
    </form>
  `;
}

function readListingForm() {
  const fd = new FormData($('#listForm'));
  return {
    kind: fd.get('kind'),
    title: fd.get('title'),
    description: fd.get('description'),
    unit: fd.get('unit') || undefined,
    quantity: Number(fd.get('quantity')) || 1,
    value_coins: Number(fd.get('value_coins')) || 0,
  };
}

function openNewListingModal() {
  openModal('<h2>New listing</h2>' + listingForm());
  $('#listForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#listErr'); err.hidden = true;
    try {
      await api('/api/listings', { method: 'POST', body: readListingForm() });
      closeModal();
      setView('mine');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

function openEditListingModal(id, rows, reload) {
  const l = rows.find((x) => x.id === id);
  if (!l) return;
  openModal('<h2>Edit listing</h2>' + listingForm(l));
  $('#listForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#listErr'); err.hidden = true;
    try {
      await api('/api/listings/' + id, { method: 'PATCH', body: readListingForm() });
      closeModal();
      await reload();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

// --- Propose trade ---

async function openProposeModal(listingId) {
  const listings = await api('/api/listings');
  const listing = listings.find((l) => l.id === listingId);
  if (!listing) return alert('Listing not found');
  const mine = await api('/api/listings?mine=1').catch(() => []);
  const tradable = mine.filter((l) => l.status === 'active' && l.id !== listingId);
  const maxQty = listing.quantity_available;

  openModal(`
    <h2>Propose a trade</h2>
    <div class="listing" style="margin-bottom:16px">
      <span class="kind">${esc(listing.kind)}</span>
      <h3>${esc(listing.title)}</h3>
      <div class="meta">by @${esc(listing.owner_username)} · ${listing.value_coins} coins each · ${listing.quantity_available} available</div>
    </div>
    <form id="propForm">
      <label>Quantity you want (max ${maxQty})
        <input name="quantity_requested" type="number" min="1" max="${maxQty}" value="1" />
      </label>
      <fieldset style="border:1px solid var(--border); padding:10px; border-radius:6px;">
        <legend style="color:var(--muted); font-size:12px; padding:0 6px;">Your offer (at least one required)</legend>
        <label>Coins to offer (you have ${state.user.coins})
          <input name="offer_coins" type="number" min="0" max="${state.user.coins}" value="${Math.min(listing.value_coins, state.user.coins)}" />
        </label>
        ${tradable.length ? `
        <label>+ One of your listings (optional)
          <select name="offer_listing_id">
            <option value="">— none —</option>
            ${tradable.map((l) => `<option value="${l.id}" data-avail="${l.quantity_available}">${esc(l.title)} — ${l.value_coins} coins (${l.quantity_available} avail)</option>`).join('')}
          </select>
        </label>
        <label id="offerQtyWrap" hidden>Quantity of your listing to offer
          <input name="offer_quantity" type="number" min="1" value="1" />
        </label>
        ` : '<p class="hint">Tip: create your own listings to swap instead of paying coins.</p>'}
      </fieldset>
      <label>Message (optional)<textarea name="message" maxlength="500" placeholder="Anything to add?"></textarea></label>
      <button type="submit">Send proposal</button>
      <p class="err" id="propErr" hidden></p>
    </form>
  `);

  const sel = $('#propForm select[name=offer_listing_id]');
  const offerQtyWrap = $('#offerQtyWrap');
  const offerQtyInput = offerQtyWrap ? offerQtyWrap.querySelector('input') : null;
  if (sel) {
    sel.addEventListener('change', () => {
      if (!sel.value) {
        offerQtyWrap.hidden = true;
      } else {
        offerQtyWrap.hidden = false;
        const max = Number(sel.selectedOptions[0].dataset.avail);
        offerQtyInput.max = max;
        if (Number(offerQtyInput.value) > max) offerQtyInput.value = max;
      }
    });
  }

  $('#propForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $('#propErr'); err.hidden = true;
    const body = {
      listing_id: listing.id,
      quantity_requested: Number(fd.get('quantity_requested')) || 1,
      offer_coins: Number(fd.get('offer_coins')) || 0,
      message: fd.get('message') || '',
    };
    const offerListingId = fd.get('offer_listing_id');
    if (offerListingId) {
      body.offer_listing_id = Number(offerListingId);
      body.offer_quantity = Number(fd.get('offer_quantity')) || 1;
    }
    try {
      await api('/api/trades', { method: 'POST', body });
      closeModal();
      setView('trades');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

// --- Trades ---

async function renderTrades() {
  useTemplate('#tpl-trades');
  $$('.tab', app).forEach((t) => {
    t.classList.toggle('active', t.dataset.trole === state.tradeRole);
    t.addEventListener('click', () => {
      state.tradeRole = t.dataset.trole;
      renderTrades();
    });
  });
  const rows = await api('/api/trades?role=' + state.tradeRole);
  const el = $('#tradeList');
  if (!rows.length) {
    el.innerHTML = '<p class="hint">No trades here yet.</p>';
    return;
  }
  el.innerHTML = rows.map(tradeCard).join('');
  $$('[data-accept]', el).forEach((b) => b.addEventListener('click', () => tradeAction(b.dataset.accept, 'accept')));
  $$('[data-reject]', el).forEach((b) => b.addEventListener('click', () => tradeAction(b.dataset.reject, 'reject')));
  $$('[data-cancel-trade]', el).forEach((b) => b.addEventListener('click', () => tradeAction(b.dataset.cancelTrade, 'cancel')));
  $$('[data-toggle-msgs]', el).forEach((b) => b.addEventListener('click', () => toggleMessages(Number(b.dataset.toggleMsgs))));
  if (state.openTradeId) await loadMessages(state.openTradeId);
}

function tradeCard(t) {
  const iAmOwner = state.user.id === t.owner_id;
  const other = iAmOwner ? t.proposer : t.owner;
  const qtyLabel = t.listing.quantity > 1 ? ` × ${t.quantity_requested}` : '';
  const offerParts = [];
  if (t.offer_coins > 0) offerParts.push(`<b>${t.offer_coins}</b> coins`);
  if (t.offer_listing) {
    const oq = t.offer_quantity > 1 ? ` × ${t.offer_quantity}` : '';
    offerParts.push(`their listing <b>${esc(t.offer_listing.title)}</b>${oq}`);
  }
  const offer = offerParts.join(' + ') || '(nothing)';
  const actions =
    t.status === 'pending'
      ? iAmOwner
        ? `<button data-accept="${t.id}">Accept</button>
           <button class="ghost" data-reject="${t.id}">Reject</button>`
        : `<button class="ghost" data-cancel-trade="${t.id}">Cancel proposal</button>`
      : '';
  const msgOpen = state.openTradeId === t.id;
  return `
    <div class="trade">
      <div class="title">
        <div><b>${esc(t.listing.title)}</b>${qtyLabel} <span class="meta">(${t.listing.value_coins} coins each)</span></div>
        <span class="badge ${t.status}">${t.status}</span>
      </div>
      <div class="offer">
        ${iAmOwner
          ? `@${esc(other.username)} offers ${offer} for your listing.`
          : `You offered ${offer} for @${esc(other.username)}'s listing.`}
      </div>
      ${t.message ? `<div class="meta" style="margin-top:8px">&ldquo;${esc(t.message)}&rdquo;</div>` : ''}
      <div class="actions">
        ${actions}
        <button class="ghost" data-toggle-msgs="${t.id}">
          ${msgOpen ? 'Hide' : 'Show'} messages${t.message_count ? ` (${t.message_count})` : ''}
        </button>
      </div>
      <div class="msgs" id="msgs-${t.id}" ${msgOpen ? '' : 'hidden'}>
        <div id="msglist-${t.id}"><p class="hint">Loading…</p></div>
        <form class="msg-compose" data-msg-form="${t.id}">
          <input name="body" maxlength="2000" placeholder="Send a message…" required />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  `;
}

async function toggleMessages(id) {
  state.openTradeId = state.openTradeId === id ? null : id;
  const el = $(`#msgs-${id}`);
  if (!el) return renderTrades();
  if (state.openTradeId === id) {
    el.hidden = false;
    await loadMessages(id);
  } else {
    el.hidden = true;
  }
  const btn = $(`[data-toggle-msgs="${id}"]`);
  if (btn) btn.textContent = state.openTradeId === id ? 'Hide messages' : 'Show messages';
}

async function loadMessages(id) {
  const container = $(`#msglist-${id}`);
  if (!container) return;
  try {
    const msgs = await api(`/api/trades/${id}/messages`);
    container.innerHTML = msgs.length
      ? msgs
          .map(
            (m) => `
      <div class="msg"><b>@${esc(m.username)}</b><span class="when">${esc(m.created_at)}</span><div>${esc(m.body)}</div></div>`
          )
          .join('')
      : '<p class="hint">No messages yet.</p>';
    const form = $(`[data-msg-form="${id}"]`);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[name=body]');
      const body = input.value.trim();
      if (!body) return;
      try {
        await api(`/api/trades/${id}/messages`, { method: 'POST', body: { body } });
        input.value = '';
        await loadMessages(id);
      } catch (ex) { alert(ex.message); }
    };
  } catch (e) {
    container.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}

async function tradeAction(id, action) {
  try {
    await api(`/api/trades/${id}/${action}`, { method: 'POST' });
    await refreshUser();
    renderTopbar();
    renderTrades();
  } catch (e) { alert(e.message); }
}

// --- Wallet ---

async function renderWallet() {
  useTemplate('#tpl-wallet');
  const load = async () => {
    const w = await api('/api/wallet');
    $('#balance').textContent = w.balance;
    const tbody = $('#txTable tbody');
    tbody.innerHTML = w.transactions
      .map(
        (tx) => `
        <tr>
          <td>${esc(tx.created_at)}</td>
          <td class="${tx.delta >= 0 ? 'pos' : 'neg'}">${tx.delta >= 0 ? '+' : ''}${tx.delta}</td>
          <td>${tx.balance_after}</td>
          <td>${esc(tx.reason)}${tx.trade_id ? ` (trade #${tx.trade_id})` : ''}</td>
        </tr>`
      )
      .join('');
  };
  $('#dailyBtn').addEventListener('click', async () => {
    const err = $('#dailyErr'); err.hidden = true;
    try {
      const r = await api('/api/wallet/daily', { method: 'POST' });
      state.user.coins = r.balance;
      renderTopbar();
      await load();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  await load();
}

// --- Modal helpers ---

function openModal(html) {
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modalBody').innerHTML = '';
}
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) closeModal();
});

// --- Utility ---

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function refreshUser() {
  try { state.user = await api('/api/me'); }
  catch { state.user = null; }
}

async function ensureCsrf() {
  if (!getCookie('cg_csrf')) {
    try { await api('/api/csrf'); } catch {}
  }
}

// --- Boot ---

$$('#nav a, #topbar h1 a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (!state.user) return renderAuth();
    setView(a.dataset.nav || 'market');
  });
});
$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  state.user = null;
  hideBanner();
  setView('market');
});

(async function boot() {
  await ensureCsrf();
  const params = new URLSearchParams(location.search);
  if (params.get('verified') === '1') {
    showBanner('Email verified. You can now post listings and trade.', { ok: true, autoDismissMs: 6000 });
    history.replaceState(null, '', location.pathname);
  }
  await refreshUser();
  renderVerificationBanner();
  setView('market');
})();
