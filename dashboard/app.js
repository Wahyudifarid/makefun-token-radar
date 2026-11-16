// Token Launch Radar dashboard: renders window.RADAR (written by main.ts) with
// no network and no framework. The board is sortable and filterable, and every
// row opens a detail view with the model breakdown and the farm plan.
// Deep links: #detail=<slug> opens a protocol, #cat=<category>, #chain=<chain>,
// #q=<text>, #watch=1 and #growing=1 set the filters, so each view is a plain URL.

(function () {
  var D = window.RADAR;
  if (!D) {
    document.body.innerHTML = '<p style="padding:40px">Radar data is missing: main.ts writes data.js next to this page.</p>';
    return;
  }
  var rows = D.rows.slice();
  var live = D.live || [];
  var state = { q: '', cat: '', chain: '', watch: false, growing: false, sort: 'rank', dir: 1 };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n == null) return '—';
    var v = Math.round(n * 10) / 10;
    return (v > 0 ? '+' : '') + v + '%';
  }
  function ageText(days) {
    if (days == null) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function multText(m) {
    return (Math.round(m * 1000) / 1000).toFixed(3) + 'x';
  }
  function provText(source, group, n) {
    if (source === 'category') return 'category median, ' + n + ' live';
    if (source === 'group') return (group || 'group') + ' group median, ' + n + ' live';
    return 'global median';
  }
  function chainsText(chains) {
    var c = chains || [];
    if (c.length === 0) return '—';
    if (c.length <= 3) return c.join(', ');
    return c.slice(0, 3).join(', ') + ' +' + (c.length - 3);
  }

  // ---- header stats -------------------------------------------------------
  $('stats').innerHTML =
    '<div class="stat"><b>' + D.board_size + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + D.watchlist_size + '</b><span>on the watchlist</span></div>' +
    '<div class="stat"><b>' + D.early_size + '</b><span>early finds below the floor</span></div>' +
    '<div class="stat"><b>' + money(D.rows[0] ? D.rows[0].implied_value_usd : 0) + '</b><span>top implied value</span></div>' +
    '<div class="stat"><b>' + esc(D.as_of) + '</b><span>snapshot date</span></div>';

  // ---- category multiples ---------------------------------------------------
  var multHtml = D.multiples.map(function (m) {
    return '<span class="mult">' + esc(m.category) + ' <b>' + multText(m.multiple) + '</b> <small>' + esc(provText(m.source, m.group, m.comparables)) + '</small></span>';
  }).join('');
  multHtml += '<span class="mult">Global fallback <b>' + multText(D.global_multiple) + '</b> <small>median of all live</small></span>';
  if (D.ratio_cap) multHtml += '<span class="mult">Ratios capped <b>' + multText(D.ratio_cap) + '</b> <small>upper Tukey fence</small></span>';
  $('multiples').innerHTML = multHtml;

  // ---- filter options -------------------------------------------------------
  function fillSelect(el, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
  }
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  fillSelect($('cat'), cats);
  fillSelect($('chain'), chains);

  // ---- board ----------------------------------------------------------------
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watch && !r.watchlist) return false;
      if (state.growing && !(r.change_7d != null && r.change_7d > 0)) return false;
      return true;
    });
  }
  function sortRows(list) {
    var k = state.sort;
    var d = state.dir;
    return list.slice().sort(function (a, b) {
      var av = a[k];
      var bv = b[k];
      if (k === 'name' || k === 'category') {
        av = String(av || '');
        bv = String(bv || '');
        return av.localeCompare(bv) * d;
      }
      if (k === 'chains') {
        av = (a.chains || []).join(', ');
        bv = (b.chains || []).join(', ');
        return av.localeCompare(bv) * d;
      }
      av = av == null ? -Infinity : av;
      bv = bv == null ? -Infinity : bv;
      return (av - bv) * d || (a.rank - b.rank);
    });
  }
  function renderBoard() {
    var list = sortRows(filtered());
    var html = list.map(function (r) {
      var chg = r.change_7d == null ? '<span>—</span>' :
        '<span class="' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : '') + '">' + pct(r.change_7d) + '</span>';
      var badge = r.watchlist ? ' <span class="pill watch">watchlist</span>' : '';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b>' + badge + '<br><span style="color:var(--muted);font-size:12.5px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + (r.chains || []).slice(0, 2).map(esc).join(', ') + ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + chg + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '</tr>';
    }).join('');
    $('rows').innerHTML = html || '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No protocols match these filters.</td></tr>';
    $('count').textContent = list.length + ' of ' + rows.length + ' shown';
    document.querySelectorAll('#board thead th').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
  }

  // ---- live table ------------------------------------------------------------
  $('live-rows').innerHTML = live.map(function (p) {
    var chg = p.change_7d == null ? '—' :
      '<span class="' + (p.change_7d > 0 ? 'up' : p.change_7d < 0 ? 'down' : '') + '">' + pct(p.change_7d) + '</span>';
    return '<tr>' +
      '<td><b>' + esc(p.name) + '</b></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + (p.multiple == null ? '—' : multText(p.multiple)) + '</td>' +
      '<td class="num">' + chg + '</td>' +
      '</tr>';
  }).join('');

  // ---- detail view ------------------------------------------------------------
  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    var card = $('detail-card');
    if (!r) { card.classList.add('hidden'); return; }
    var base = r.tvl_usd * r.category_multiple;
    $('detail-title').textContent = '#' + r.rank + ' ' + r.name + (r.watchlist ? ' — on the watchlist' : '');
    var steps = (r.farm_steps || []).map(function (s, i) {
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>';
    }).join('');
    $('detail').innerHTML =
      '<button class="back" type="button" id="back">\u2190 Back to the board</button>' +
      '<div class="detail-grid">' +
      '<div class="stat"><b>' + moneyFull(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div class="stat"><b>' + moneyFull(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="stat"><b>' + pct(r.change_7d) + '</b><span>TVL change, 7 days</span></div>' +
      '<div class="stat"><b>' + esc(r.category || '—') + '</b><span>category</span></div>' +
      '<div class="stat"><b>' + esc(chainsText(r.chains)) + '</b><span>chains</span></div>' +
      '<div class="stat"><b>' + ageText(r.age_days) + '</b><span>tracked since ' + esc(r.listed_at || 'unknown') + '</span></div>' +
      '</div>' +
      '<h3>How the value is built</h3>' +
      '<table class="model-break"><tbody>' +
      '<tr><td>TVL &times; category multiple (' + multText(r.category_multiple) + ', ' + esc(provText(r.multiple_source, r.multiple_group, r.category_comparables)) + ')</td><td class="num">' + moneyFull(base) + '</td></tr>' +
      '<tr><td>Growth multiplier (' + pct((r.growth_multiplier - 1) * 2 * 100) + ' 7-day change, half-weighted)</td><td class="num">' + r.growth_multiplier.toFixed(2) + 'x</td></tr>' +
      '<tr><td>Maturity multiplier (' + ageText(r.age_days) + ' with no token)</td><td class="num">' + r.maturity_multiplier.toFixed(2) + 'x</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + moneyFull(r.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table>' +
      '<h3>Farm plan</h3>' +
      '<ol class="steps">' + steps + '</ol>';
    card.classList.remove('hidden');
    $('back').addEventListener('click', function () {
      setHash({ detail: null });
      card.classList.add('hidden');
      window.scrollTo(0, 0);
    });
    card.scrollIntoView();
  }

  // ---- hash routing -----------------------------------------------------------
  function parseHash() {
    var h = {};
    location.hash.slice(1).split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) h[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return h;
  }
  function setHash(patch) {
    var h = parseHash();
    Object.keys(patch).forEach(function (k) {
      if (patch[k] == null || patch[k] === '' || patch[k] === false) delete h[k];
      else h[k] = String(patch[k]);
    });
    var s = Object.keys(h).map(function (k) { return k + '=' + encodeURIComponent(h[k]); }).join('&');
    history.replaceState(null, '', s ? '#' + s : location.pathname);
  }
  function applyHash() {
    var h = parseHash();
    state.q = h.q || '';
    state.cat = h.cat || '';
    state.chain = h.chain || '';
    state.watch = h.watch === '1';
    state.growing = h.growing === '1';
    $('q').value = state.q;
    $('cat').value = state.cat;
    $('chain').value = state.chain;
    $('watch').checked = state.watch;
    $('growing').checked = state.growing;
    renderBoard();
    if (h.detail) openDetail(h.detail);
  }

  // ---- events -------------------------------------------------------------------
  $('q').addEventListener('input', function () { state.q = this.value; setHash({ q: state.q }); renderBoard(); });
  $('cat').addEventListener('change', function () { state.cat = this.value; setHash({ cat: state.cat }); renderBoard(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; setHash({ chain: state.chain }); renderBoard(); });
  $('watch').addEventListener('change', function () { state.watch = this.checked; setHash({ watch: this.checked ? '1' : null }); renderBoard(); });
  $('growing').addEventListener('change', function () { state.growing = this.checked; setHash({ growing: this.checked ? '1' : null }); renderBoard(); });
  $('reset').addEventListener('click', function () {
    state.q = ''; state.cat = ''; state.chain = ''; state.watch = false; state.growing = false;
    $('q').value = ''; $('cat').value = ''; $('chain').value = '';
    $('watch').checked = false; $('growing').checked = false;
    setHash({ q: null, cat: null, chain: null, watch: null, growing: null });
    renderBoard();
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'name' || k === 'category' || k === 'chains' ? 1 : -1; }
      renderBoard();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    document.querySelectorAll('#rows tr').forEach(function (x) { x.classList.remove('active'); });
    tr.classList.add('active');
    setHash({ detail: tr.getAttribute('data-slug') });
    openDetail(tr.getAttribute('data-slug'));
  });
  window.addEventListener('hashchange', applyHash);

  $('source-line').textContent = 'Snapshot: ' + D.source + '. Floor: ' + moneyFull(D.floor_usd) +
    '. Model ' + D.model_version + ' — category multiples are medians of live-token market-cap-to-TVL ratios from this snapshot.';
  applyHash();
})();
