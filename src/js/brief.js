  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE: TRIP BRIEFING (origin-aware, saved on device for offline use)
  // ═══════════════════════════════════════════════════════════════════════
  var BRIEFS_KEY   = 'isitpolite_briefs';   // index of saved briefings, newest first
  var BRIEF_PREFIX = 'brief_';              // brief_[key] → { data, ts }, no expiry
  var BRIEFS_MAX   = 12;
  var SEVERITY_LABELS = { high: 'Most important', medium: 'Worth knowing', low: 'Minor' };
  var SEVERITY_CLASS  = { high: 'rude', medium: 'caution', low: 'polite' };

  function shortContext(c) { return (CONTEXT_LABELS[c] || c).split(' / ')[0]; }

  function populateBriefControls() {
    populateSelectWithCountries(briefFromEl);
    populateSelectWithCountries(briefToEl);
    MONTHS.forEach(function (m, i) {
      var opt = document.createElement('option');
      opt.value = String(i + 1); opt.textContent = m;
      briefMonthEl.appendChild(opt);
    });
    briefContextsEl.innerHTML = Object.keys(CONTEXT_LABELS).map(function (c) {
      return '<label class="chip-check"><input type="checkbox" value="' + sanitize(c) + '"' + (c === 'general' ? ' checked' : '') + '> ' + sanitize(shortContext(c)) + '</label>';
    }).join('');
  }

  function briefContexts() {
    return Array.prototype.map.call(briefContextsEl.querySelectorAll('input:checked'), function (i) { return i.value; });
  }

  function briefKey(from, to, contexts, month) {
    return from + '>' + to + '|' + contexts.slice().sort().join(',') + '|' + (month || 0);
  }

  function loadBriefIndex() {
    try { return JSON.parse(localStorage.getItem(BRIEFS_KEY) || '[]'); } catch (_) { return []; }
  }
  function getBrief(key) {
    try { var e = JSON.parse(localStorage.getItem(BRIEF_PREFIX + key) || 'null'); return e && e.data ? e : null; } catch (_) { return null; }
  }
  function saveBrief(key, data) {
    try {
      localStorage.setItem(BRIEF_PREFIX + key, JSON.stringify({ data: data, ts: Date.now() }));
      var idx = loadBriefIndex().filter(function (k) { return k !== key; });
      idx.unshift(key);
      idx.slice(BRIEFS_MAX).forEach(function (k) { localStorage.removeItem(BRIEF_PREFIX + k); });
      localStorage.setItem(BRIEFS_KEY, JSON.stringify(idx.slice(0, BRIEFS_MAX)));
    } catch (_) {}
  }
  function removeBrief(key) {
    try {
      localStorage.removeItem(BRIEF_PREFIX + key);
      localStorage.setItem(BRIEFS_KEY, JSON.stringify(loadBriefIndex().filter(function (k) { return k !== key; })));
    } catch (_) {}
  }

  function setBriefForm(data) {
    briefFromEl.value = data.from;
    briefToEl.value = data.to;
    briefMonthEl.value = String(data.month || 0);
    briefContextsEl.querySelectorAll('input').forEach(function (i) { i.checked = (data.contexts || []).indexOf(i.value) !== -1; });
  }

  async function handleBrief(opts) {
    if (!requireConsent(handleBrief)) return;
    var refresh = !!(opts && opts.refresh);
    var from = briefFromEl.value, to = briefToEl.value;

    briefFromEl.classList.remove('field-error');
    briefToEl.classList.remove('field-error');
    if (!from || !to) {
      if (!from) briefFromEl.classList.add('field-error');
      if (!to) briefToEl.classList.add('field-error');
      focusField(!from ? briefFromEl : briefToEl);
      return;
    }
    if (from === to) {
      briefResult.innerHTML = '<div class="error-card" role="alert"><p class="error-message">Pick two different countries for your briefing.</p></div>';
      return;
    }

    // Your first briefing also sets your home country for the rest of the app.
    if (!getHome()) { setHome(from); renderHomeLine(); applyHomeDefaults(); }

    var contexts = briefContexts();
    var month = parseInt(briefMonthEl.value, 10) || 0;
    var key = briefKey(from, to, contexts, month);

    var saved = getBrief(key);
    if (saved && (!refresh || !navigator.onLine)) { renderBrief(saved.data, key, saved.ts); return; }
    if (!navigator.onLine) {
      briefResult.innerHTML = '<div class="error-card" role="alert"><p class="error-message">You\'re offline. Briefings you\'ve already made are listed above and work without a connection.</p></div>';
      return;
    }

    briefBtn.disabled = true;
    briefBtn.textContent = 'Preparing your briefing…';
    briefResult.innerHTML = '<div class="loading-state" role="status"><div class="spinner"></div><p>Checking what changes from ' + sanitize(withThe(from)) + ' to ' + sanitize(withThe(to)) + '…</p></div>';

    try {
      var data = await callLookup('brief', { from: from, to: to, contexts: contexts, month: month });
      saveBrief(key, data);
      renderBrief(data, key, Date.now());
      renderBriefSaved();
    } catch (e) {
      briefResult.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">' + ALERT_ICON + '</p><p class="error-message">' + sanitize(e.message) + '</p></div>';
    } finally {
      briefBtn.disabled = false;
      briefBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17" aria-hidden="true"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg> Get my briefing';
    }
  }

  function briefWhen(data) {
    return data.month ? MONTHS[data.month - 1] + ' ' + data.year : '';
  }

  function renderBrief(data, key, ts) {
    var route = sanitize(data.from) + ' → ' + sanitize(data.to);
    var meta = [(data.contexts || []).map(shortContext).join(', '), briefWhen(data)].filter(Boolean).map(sanitize).join(' · ');

    var items = (data.watch_outs || []).map(function (w) {
      var sev = SEVERITY_CLASS[w.severity] ? w.severity : 'medium';
      var link = /^\/etiquette\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(w.link || '') ? w.link : '';
      return '<li class="brief-item">' +
        '<div class="brief-item-head"><span class="sev-chip ' + SEVERITY_CLASS[sev] + '">' + SEVERITY_LABELS[sev] + '</span>' +
          '<span class="brief-cat">' + sanitize(w.category || shortContext(w.context)) + '</span></div>' +
        '<h4>' + sanitize(w.title) + '</h4>' +
        '<dl class="brief-compare">' +
          '<div><dt>In ' + sanitize(withThe(data.from)) + '</dt><dd>' + sanitize(w.from_norm) + '</dd></div>' +
          '<div><dt>In ' + sanitize(withThe(data.to)) + '</dt><dd>' + sanitize(w.to_norm) + '</dd></div>' +
        '</dl>' +
        '<p class="brief-do"><strong>Do:</strong> ' + sanitize(w.do) + '</p>' +
        (w.avoid ? '<p class="brief-avoid"><strong>Avoid:</strong> ' + sanitize(w.avoid) + '</p>' : '') +
        (link ? '<a class="brief-src" href="' + link + '">See the reviewed guide and sources →</a>' : '') +
      '</li>';
    }).join('');

    var season = '';
    if (data.month) {
      var notes = (data.season || []).filter(function (s) { return s.source && /^https:\/\//.test(s.source.url); }).map(function (s) {
        return '<li><strong>' + sanitize(s.title) + '</strong>' + (s.movable ? ' <span class="date-tag">Check exact dates</span>' : '') +
          '<p>' + sanitize(s.note) + '</p>' +
          '<a href="' + sanitize(s.source.url) + '" target="_blank" rel="noopener">Source: ' + sanitize(s.source.title) + '</a></li>';
      }).join('');
      season = '<section class="brief-season" aria-label="This season"><h3>' + sanitize(briefWhen(data)) + '</h3>' +
        (notes ? '<ul>' + notes + '</ul>' : '<p class="brief-season-none">No sourced holidays or festivals that affect visitors were found for this month.</p>') +
      '</section>';
    }

    briefResult.innerHTML =
      '<div class="brief-wrap">' +
        '<div class="brief-head">' +
          '<p class="brief-route">' + route + (meta ? ' · ' + meta : '') + '</p>' +
          '<h3 class="brief-headline">' + sanitize(data.headline) + '</h3>' +
          '<p class="brief-meta">Saved on this device · ' + timeAgo(ts) + ' · <button type="button" class="link-btn" data-act="refresh">Refresh</button></p>' +
        '</div>' +
        '<ol class="brief-list">' + items + '</ol>' +
        season +
        '<div class="result-footnote">Drafted by AI from web sources and our reviewed country guides. Customs vary between people and regions.</div>' +
      '</div>';
    briefResult.dataset.key = key;

    var wrap = briefResult.querySelector('.brief-wrap');
    if (wrap) addPremiumButton(wrap, 'Download Infographic', 'infographic', { subkind: 'trip', from: data.from, to: data.to, result: data });
    briefResult.scrollIntoView({ behavior: scrollMode(), block: 'start' });
  }

  function onBriefResultClick(e) {
    if (e.target.closest('[data-act="refresh"]')) handleBrief({ refresh: true });
  }

  function renderBriefSaved() {
    var keys = loadBriefIndex().filter(function (k) { return getBrief(k); });
    if (!keys.length) { briefSavedEl.classList.add('hidden'); briefSavedEl.innerHTML = ''; return; }
    briefSavedEl.innerHTML = '<span class="packs-label">Your trips</span><div class="packs-chips">' + keys.map(function (k) {
      var d = getBrief(k).data;
      var label = d.from + ' → ' + d.to + (d.month ? ' · ' + MONTHS[d.month - 1].slice(0, 3) : '');
      return '<span class="trip-chip"><button type="button" class="pack-chip" data-key="' + sanitize(k) + '">' + sanitize(label) + '</button>' +
        '<button type="button" class="trip-chip-remove" data-remove="' + sanitize(k) + '" aria-label="Remove ' + sanitize(label) + '">&times;</button></span>';
    }).join('') + '</div>';
    briefSavedEl.classList.remove('hidden');
  }

  function onBriefSavedClick(e) {
    var rm = e.target.closest('[data-remove]');
    if (rm) {
      var k = rm.getAttribute('data-remove');
      removeBrief(k);
      if (briefResult.dataset.key === k) { briefResult.innerHTML = ''; delete briefResult.dataset.key; }
      renderBriefSaved();
      return;
    }
    var open = e.target.closest('[data-key]');
    if (!open) return;
    var entry = getBrief(open.getAttribute('data-key'));
    if (!entry) return;
    setBriefForm(entry.data);
    renderBrief(entry.data, open.getAttribute('data-key'), entry.ts);
  }
