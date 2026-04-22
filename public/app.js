const state = {
  user: null,
  view: 'market',
  tradeRole: 'owner',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
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
  $$('.tab', app).forEach((t) => {
    t.addEventListener('click', () => {
      mode = t.dataset.tab;
      $$('.tab', app).forEach((x) => x.classList.toggle('active', x === t));
      submit.textContent = mode === 'login' ? 'Log in' : 'Create account';
    });
  });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $('#authErr');
    err.hidden = true;
    try {
      const user = await api(`/api/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: { username: fd.get('username'), password: fd.get('password') },
      });
      state.user = user;
      setView('market');
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
  return `
    <div class="listing ${l.status !== 'active' ? 'inactive' : ''}">
      <span class="kind">${esc(l.kind)}</span>
      <h3>${esc(l.title)}</h3>
      ${l.description ? `<div class="desc">${esc(l.description)}</div>` : ''}
      <div class="meta">${esc(l.quantity)} ${esc(l.unit)} · by @${esc(l.owner_username || (mine ? state.user.username : '?'))}</div>
      <div class="foot">
        <div class="price">${l.value_coins} coins</div>
        <div class="row">
          <span class="badge ${l.status}">${l.status}</span>
          ${canPropose ? `<button data-propose="${l.id}">Propose trade</button>` : ''}
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
    el.innerHTML = rows.map((l) => listingCard(l, { cancellable: true })).join('');
    $$('[data-cancel]', el).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Cancel this listing?')) return;
        try {
          await api('/api/listings/' + b.dataset.cancel, { method: 'DELETE' });
          await load();
        } catch (e) {
          alert(e.message);
        }
      })
    );
  };
  await load();
}

function openNewListingModal() {
  openModal(`
    <h2>New listing</h2>
    <form id="listForm">
      <label>Kind
        <select name="kind">
          <option value="time">Time (e.g. 1 hour of help)</option>
          <option value="item">Item (e.g. used bike)</option>
          <option value="service">Service (e.g. logo design)</option>
        </select>
      </label>
      <label>Title<input name="title" maxlength="120" required placeholder="1 hour of Spanish tutoring" /></label>
      <label>Description<textarea name="description" maxlength="2000" placeholder="What exactly are you offering?"></textarea></label>
      <div class="row">
        <label style="flex:1">Quantity<input name="quantity" type="number" min="1" value="1" /></label>
        <label style="flex:1">Unit<input name="unit" maxlength="20" placeholder="hour / piece / session" /></label>
      </div>
      <label>Value in coins<input name="value_coins" type="number" min="0" value="50" required /></label>
      <button type="submit">Post listing</button>
      <p class="err" id="listErr" hidden></p>
    </form>
  `);
  $('#listForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $('#listErr');
    err.hidden = true;
    try {
      await api('/api/listings', {
        method: 'POST',
        body: {
          kind: fd.get('kind'),
          title: fd.get('title'),
          description: fd.get('description'),
          unit: fd.get('unit') || undefined,
          quantity: Number(fd.get('quantity')) || 1,
          value_coins: Number(fd.get('value_coins')) || 0,
        },
      });
      closeModal();
      setView('mine');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

// --- Propose trade ---

async function openProposeModal(listingId) {
  const listings = await api('/api/listings');
  const listing = listings.find((l) => l.id === listingId);
  if (!listing) return alert('Listing not found');
  const mine = await api('/api/listings?mine=1').catch(() => []);
  const tradable = mine.filter((l) => l.status === 'active' && l.id !== listingId);

  openModal(`
    <h2>Propose a trade</h2>
    <div class="listing" style="margin-bottom:16px">
      <span class="kind">${esc(listing.kind)}</span>
      <h3>${esc(listing.title)}</h3>
      <div class="meta">by @${esc(listing.owner_username)} · asking ${listing.value_coins} coins</div>
    </div>
    <form id="propForm">
      <label>Offer type
        <select name="offer_type">
          <option value="coins">Pay with coins</option>
          ${tradable.length ? '<option value="listing">Swap with one of my listings</option>' : ''}
        </select>
      </label>
      <div id="coinsField">
        <label>Coins to offer (you have ${state.user.coins})
          <input name="offer_coins" type="number" min="1" max="${state.user.coins}" value="${listing.value_coins}" />
        </label>
      </div>
      <div id="listingField" hidden>
        <label>My listing to swap
          <select name="offer_listing_id">
            ${tradable.map((l) => `<option value="${l.id}">${esc(l.title)} — ${l.value_coins} coins</option>`).join('')}
          </select>
        </label>
      </div>
      <label>Message (optional)<textarea name="message" maxlength="500" placeholder="Anything to add?"></textarea></label>
      <button type="submit">Send proposal</button>
      <p class="err" id="propErr" hidden></p>
    </form>
  `);

  const sel = $('#propForm select[name=offer_type]');
  const coinsField = $('#coinsField');
  const listingField = $('#listingField');
  sel.addEventListener('change', () => {
    const v = sel.value;
    coinsField.hidden = v !== 'coins';
    listingField.hidden = v !== 'listing';
  });

  $('#propForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $('#propErr');
    err.hidden = true;
    const body = {
      listing_id: listing.id,
      offer_type: fd.get('offer_type'),
      message: fd.get('message') || '',
    };
    if (body.offer_type === 'coins') body.offer_coins = Number(fd.get('offer_coins'));
    else body.offer_listing_id = Number(fd.get('offer_listing_id'));
    try {
      await api('/api/trades', { method: 'POST', body });
      closeModal();
      setView('trades');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
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
  $$('[data-accept]', el).forEach((b) =>
    b.addEventListener('click', () => tradeAction(b.dataset.accept, 'accept'))
  );
  $$('[data-reject]', el).forEach((b) =>
    b.addEventListener('click', () => tradeAction(b.dataset.reject, 'reject'))
  );
  $$('[data-cancel-trade]', el).forEach((b) =>
    b.addEventListener('click', () => tradeAction(b.dataset.cancelTrade, 'cancel'))
  );
}

function tradeCard(t) {
  const iAmOwner = state.user.id === t.owner_id;
  const other = iAmOwner ? t.proposer : t.owner;
  const offer =
    t.offer_type === 'coins'
      ? `<b>${t.offer_coins}</b> coins`
      : `their listing: <b>${esc(t.offer_listing && t.offer_listing.title)}</b> (valued at ${t.offer_listing ? t.offer_listing.value_coins : '?'} coins)`;
  const actions =
    t.status === 'pending'
      ? iAmOwner
        ? `<button data-accept="${t.id}">Accept</button>
           <button class="ghost" data-reject="${t.id}">Reject</button>`
        : `<button class="ghost" data-cancel-trade="${t.id}">Cancel proposal</button>`
      : '';
  return `
    <div class="trade">
      <div class="title">
        <div><b>${esc(t.listing.title)}</b> <span class="meta">(listed at ${t.listing.value_coins} coins)</span></div>
        <span class="badge ${t.status}">${t.status}</span>
      </div>
      <div class="offer">
        ${iAmOwner ? `@${esc(other.username)} offers ${offer} for your listing.` : `You offered ${offer} for @${esc(other.username)}'s listing.`}
      </div>
      ${t.message ? `<div class="meta" style="margin-top:8px">“${esc(t.message)}”</div>` : ''}
      <div class="actions">${actions}</div>
    </div>
  `;
}

async function tradeAction(id, action) {
  try {
    await api(`/api/trades/${id}/${action}`, { method: 'POST' });
    await refreshUser();
    renderTopbar();
    renderTrades();
  } catch (e) {
    alert(e.message);
  }
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
        </tr>
      `
      )
      .join('');
  };
  $('#dailyBtn').addEventListener('click', async () => {
    const err = $('#dailyErr');
    err.hidden = true;
    try {
      const r = await api('/api/wallet/daily', { method: 'POST' });
      state.user.coins = r.balance;
      renderTopbar();
      await load();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
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
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function refreshUser() {
  try {
    state.user = await api('/api/me');
  } catch {
    state.user = null;
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
  setView('market');
});

(async function boot() {
  await refreshUser();
  setView('market');
})();
