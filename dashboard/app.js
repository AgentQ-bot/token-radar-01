// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs, and the live-token
// set apart. No network: every byte it shows is in data.js.
//
// State lives in the URL hash, so each view has an address: #detail=<slug>
// opens one protocol, #cat=<category> and #chain=<chain> filter, #q=<text>
// searches, #wl=1 keeps the watchlist, #growing=1 keeps growers, #sort=<key>
// sorts. The three screenshots are three such addresses.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var main = document.getElementById('board');
  if (!DATA || !main) return;
  main.setAttribute('aria-busy', 'false');

  var state = { q: '', category: 'all', chain: 'all', sort: 'implied', dir: -1, wl: false, growing: false, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    return (Math.round(n * 1000) / 1000).toFixed(3) + 'x';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function multipleOf(row) {
    var entry = DATA.multiples[row.category || ''];
    return entry ? entry.multiple : DATA.global_multiple;
  }
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * multipleOf(row) * growthMult * maturity));
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var out = { q: '', category: 'all', chain: 'all', sort: 'implied', wl: false, growing: false, selected: null };
    if (!h) return out;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'q') out.q = v;
      if (k === 'cat') out.category = v;
      if (k === 'chain') out.chain = v;
      if (k === 'sort') out.sort = v;
      if (k === 'wl') out.wl = v === '1';
      if (k === 'growing') out.growing = v === '1';
      if (k === 'detail') out.selected = v;
    });
    return out;
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.sort !== 'implied') parts.push('sort=' + encodeURIComponent(state.sort));
    if (state.wl) parts.push('wl=1');
    if (state.growing) parts.push('growing=1');
    if (state.selected) parts.push('detail=' + encodeURIComponent(state.selected));
    var hash = parts.length ? '#' + parts.join('&') : '';
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash || window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.wl && !r.on_watchlist) return false;
      if (state.growing && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d === null ? 0 : a.change_7d) - (b.change_7d === null ? 0 : b.change_7d);
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else if (key === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      else if (key === 'rank') d = a.rank - b.rank;
      else if (key === 'category') d = (a.category || '') < (b.category || '') ? -1 : (a.category || '') > (b.category || '') ? 1 : 0;
      else if (key === 'chains') d = (a.chains[0] || '') < (b.chains[0] || '') ? -1 : (a.chains[0] || '') > (b.chains[0] || '') ? 1 : 0;
      if (d === 0) d = a.rank - b.rank;
      return d * dir;
    });
    return rows;
  }

  function rowBySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }

  function renderModel() {
    var m = DATA.model;
    document.getElementById('model').innerHTML =
      '<h2>How a row is valued — model ' + esc(DATA.model_version) + '</h2>' +
      '<p><code>implied = TVL x category multiple x growth x maturity</code></p>' +
      '<p>Category multiple: the median market-cap-per-TVL of the launched protocols in the same ' +
      'category (' + m.min_category_comps + ' comparables or more, else the global median ' + fmtMult(DATA.global_multiple) +
      '), clamped to ' + m.multiple_floor + '–' + m.multiple_cap + 'x. Growth: 1 + ' +
      'clamp(7d change, ' + m.growth_floor + '%, ' + m.growth_cap + '%) / 100 x ' + m.growth_weight +
      '. Maturity: ' + m.maturity_floor + ' + 0.3 x min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days +
      'd (unknown age counts as ' + m.unknown_age_days + ' days). Multiples are market cap, not ' +
      'fully-diluted value: the snapshot carries no FDV.</p>';
    document.getElementById('meta').innerHTML =
      'Snapshot <b>' + esc(DATA.as_of) + '</b> · <b>' + DATA.rows.length + '</b> protocols ranked · ' +
      '<b>' + DATA.watchlist_size + '</b> on the watchlist · <b>' + DATA.early_size + '</b> found below the $' +
      (DATA.floor_usd / 1e6) + 'M floor · <b>' + DATA.live_size + '</b> live tokens set aside';
  }

  function fillSelects() {
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      r.chains.forEach(function (c) { chains[c] = true; });
    });
    var catSel = document.getElementById('cat');
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; catSel.appendChild(o);
    });
    var chainSel = document.getElementById('chain');
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; chainSel.appendChild(o);
    });
  }

  function renderTable() {
    var rows = filteredRows();
    // Keep the detail on a row the filter still shows.
    if (rows.length > 0) {
      var selVisible = rows.some(function (r) { return r.slug === state.selected; });
      if (!selVisible) { state.selected = rows[0].slug; writeHash(); }
    }
    var tbody = document.getElementById('rows');
    var html = '';
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty">No protocol matches these filters. Clear the search or widen the category.</div></td></tr>';
    } else {
      rows.forEach(function (r) {
        var g = r.change_7d;
        var gCls = g === null ? '' : g > 0 ? 'up' : g < 0 ? 'down' : '';
        html += '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
          '<td>' + r.rank + '</td>' +
          '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + (r.on_watchlist ? '<span class="badge">watchlist</span>' : '') + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td>' + esc(r.chains.slice(0, 1).join(', ') || '—') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</td>' +
          '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td class="num ' + gCls + '">' + fmtPct(g) + '</td>' +
          '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    }
    document.getElementById('count').innerHTML =
      'Showing <b>' + rows.length + '</b> of <b>' + DATA.rows.length + '</b> ranked protocols' +
      (state.wl ? ' · watchlist only' : '') + (state.growing ? ' · growing only' : '');
    var ths = document.querySelectorAll('#board-table thead th');
    ths.forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
    tbody.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        writeHash();
        renderTable();
        renderDetail();
      });
    });
  }

  function renderDetail() {
    var box = document.getElementById('detail');
    var r = state.selected ? rowBySlug(state.selected) : DATA.rows[0];
    if (!r) { box.innerHTML = '<p class="note">Pick a row to see its detail.</p>'; return; }
    var recomputed = impliedOf(r);
    var check = recomputed === r.implied_value_usd
      ? 'Recomputed in this page: ' + fmtUsd(recomputed) + ' — matches the board.'
      : 'Recomputed in this page: ' + fmtUsd(recomputed) + ' — differs from the board.';
    var entry = DATA.multiples[r.category || ''];
    var multNote = entry
      ? 'median of ' + entry.comps + ' launched ' + (r.category || '') + ' protocols'
      : 'fewer than ' + DATA.model.min_category_comps + ' launched comparables in this category, so the global median applies';
    var compHtml = '';
    if (r.comparables && r.comparables.length) {
      compHtml = '<h3>Launched comparables</h3><table><tbody>' +
        r.comparables.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td>' + fmtUsd(c.mcap_usd) + ' mcap</td><td>' + fmtMult(c.multiple) + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      compHtml = '<h3>Launched comparables</h3><p class="note">No launched protocol with a market cap shares this category.</p>';
    }
    var stepsHtml = '<h3>Farm plan</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    box.innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">Rank ' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' +
      esc(r.chains.slice(0, 4).join(', ') || 'no chain listed') + (r.chains.length > 4 ? ' +' + (r.chains.length - 4) + ' more' : '') + (r.on_watchlist ? ' · on the watchlist' : '') + '</p>' +
      '<div class="big">' + fmtUsd(r.implied_value_usd) + '</div>' +
      '<p class="sub">implied launch value</p>' +
      '<h3>Model breakdown</h3><table><tbody>' +
      '<tr><td>TVL</td><td>' + fmtUsd(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Category multiple</td><td>' + fmtMult(r.category_multiple) + '</td></tr>' +
      '<tr><td>7-day growth</td><td>' + fmtPct(r.change_7d) + ' → x' + r.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Age</td><td>' + fmtAge(r.age_days) + ' → x' + r.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="note">' + esc(multNote) + '. ' + esc(check) + '</p>' +
      compHtml + stepsHtml +
      '<p class="note">The snapshot records no token for this protocol; that is what its DefiLlama ' +
      'record says, not proof it has none. Nothing here predicts whether or when a token is issued.</p>';
  }

  function renderLive() {
    var rows = DATA.live.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b><br><span style="color:var(--faint);font-size:12px">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
        '<td class="num">' + (p.mcap_usd === null ? 'n/a' : fmtUsd(p.mcap_usd)) + '</td>' +
        '<td class="num">' + (p.multiple === null ? 'n/a' : fmtMult(p.multiple)) + '</td></tr>';
    }).join('');
    document.getElementById('live').innerHTML =
      '<h2>Already trading — kept apart</h2>' +
      '<p>These protocols already have a token, so the board never ranks them. They are shown at the ' +
      'market\'s own values, and their market-cap-per-TVL is what the board\'s category multiples are ' +
      'measured from. Top ' + DATA.live_size + ' by market cap.</p>' +
      '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function renderMethod() {
    document.getElementById('method').innerHTML =
      '<h2>Method and limits</h2>' +
      '<ul>' +
      '<li><b>Pre-token means the snapshot records no token</b> — market cap, CoinGecko id and symbol are all null. ' +
      'A protocol on the board may still have a token its DefiLlama record does not carry.</li>' +
      '<li><b>Implied value is a claim, not a forecast.</b> It says what a token would be worth if the ' +
      'protocol\'s record stayed as it is. It does not predict whether or when a token is issued.</li>' +
      '<li><b>Multiples are market cap, not fully-diluted value.</b> The snapshot carries no FDV, no ' +
      'circulating supply and no token price; market cap per TVL is the closest comparable it holds.</li>' +
      '<li><b>Thin categories fall back to the global median.</b> Only 144 launched protocols carry a ' +
      'market cap, so a category with fewer than ' + DATA.model.min_category_comps + ' of them borrows the ' +
      'global median ' + fmtMult(DATA.global_multiple) + ', and every multiple is clamped to ' +
      DATA.model.multiple_floor + '–' + DATA.model.multiple_cap + 'x.</li>' +
      '<li><b>Growth is clamped.</b> The snapshot\'s largest 7-day move is over +4000%, so the growth ' +
      'term is clamped to ' + DATA.model.growth_floor + '%…+' + DATA.model.growth_cap + '% before it is weighted.</li>' +
      '<li><b>Farm plans are generated from each protocol\'s own record</b> — its category, chains, TVL ' +
      'and age — never from a hand-written list of names. Costs are gas and capital; times are setup, ' +
      'weekly actions and the hold window.</li>' +
      '</ul>';
    document.getElementById('foot').textContent =
      'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. ' +
      'Board of ' + DATA.rows.length + ' rows, watchlist ' + DATA.watchlist_size + ' of ' + DATA.rows.length + ' covered in full.';
  }

  function syncControls() {
    document.getElementById('q').value = state.q;
    document.getElementById('cat').value = state.category;
    document.getElementById('chain').value = state.chain;
    document.getElementById('sort').value = state.sort;
    document.getElementById('wl').checked = state.wl;
    document.getElementById('growing').checked = state.growing;
  }

  function renderAll() {
    renderModel();
    syncControls();
    renderTable();
    renderDetail();
    renderLive();
    renderMethod();
  }

  // Wire the controls.
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderTable(); });
  document.getElementById('cat').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderTable(); });
  document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderTable(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; state.dir = -1; writeHash(); renderTable(); });
  document.getElementById('wl').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(); renderTable(); });
  document.getElementById('growing').addEventListener('change', function (e) { state.growing = e.target.checked; writeHash(); renderTable(); });
  document.querySelectorAll('#board-table thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (key === 'rank') key = 'implied';
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'category' || key === 'chains' ? 1 : -1; }
      var sel = document.getElementById('sort');
      if (['implied', 'tvl', 'growth', 'age', 'name'].indexOf(state.sort) !== -1) sel.value = state.sort;
      writeHash();
      renderTable();
    });
  });
  window.addEventListener('hashchange', function () {
    var h = readHash();
    state.q = h.q; state.category = h.category; state.chain = h.chain; state.sort = h.sort;
    state.wl = h.wl; state.growing = h.growing; state.selected = h.selected;
    renderAll();
  });

  // Initial state from the hash, then render.
  var h0 = readHash();
  state.q = h0.q; state.category = h0.category; state.chain = h0.chain; state.sort = h0.sort;
  state.wl = h0.wl; state.growing = h0.growing; state.selected = h0.selected;
  if (state.selected && !rowBySlug(state.selected)) state.selected = null;
  if (!state.selected && DATA.rows.length) state.selected = DATA.rows[0].slug;
  fillSelects();
  renderAll();
})();
