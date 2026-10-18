  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE: TRIP BRIEFING (origin-aware, saved on device for offline use)
  // ═══════════════════════════════════════════════════════════════════════
  var BRIEFS_KEY   = 'isitpolite_briefs';   // index of saved briefings, newest first
  var BRIEF_PREFIX = 'brief_';              // brief_[key] → { data, ts }, no expiry
  var BRIEFS_MAX   = 12;
  var SEVERITY_LABELS = { high: 'Most important', medium: 'Worth knowing', low: 'Minor' };
  var SEVERITY_CLASS  = { high: 'rude', medium: 'caution', low: 'polite' };

  function shortContext(c) { return (CONTEXT_LABELS[c] || c).split(' / ')[0]; }

  // Validate a shared-trip link. Pure (no DOM), so it can be unit-tested.
  function parseTripParams(params) {
    var from = params.get('tf'), to = params.get('tt');
    if (!from || !to || from === to || COUNTRIES.indexOf(from) === -1 || COUNTRIES.indexOf(to) === -1) return null;
    var contexts = String(params.get('tc') || '').split(',').filter(function (c, i, a) {
      return Object.prototype.hasOwnProperty.call(CONTEXT_LABELS, c) && a.indexOf(c) === i;
    });
    var m = parseInt(params.get('tm'), 10);
    return { from: from, to: to, contexts: contexts.length ? contexts : ['general'], month: m >= 1 && m <= 12 ? m : 0 };
  }

  // ── Calendar reminder (.ics), built on the device; nothing is sent anywhere ──
  function icsEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  // RFC 5545 folds lines at 75 octets; 60 characters keeps multi-byte text safe.
  function icsFold(line) {
    var out = [];
    while (line.length > 60) { out.push(line.slice(0, 60)); line = ' ' + line.slice(60); }
    out.push(line);
    return out.join('\r\n');
  }
  function ymd(d) {
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  }
  // departure: 'YYYY-MM-DD'. Reminder is an all-day event 2 days before (never before today).
  function buildIcs(data, departure, today) {
    var dep = new Date(departure + 'T00:00:00Z');
    if (isNaN(dep)) return '';
    var now = today ? new Date(today + 'T00:00:00Z') : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
    var start = new Date(Math.max(dep.getTime() - 2 * 86400000, now.getTime()));
    var end = new Date(start.getTime() + 86400000);
    var top = (data.watch_outs || []).slice(0, 3).map(function (w) { return '• ' + w.title + ': ' + w.do; }).join('\n');
    var summary = 'Read your ' + data.to + ' etiquette briefing';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IsItPolite//Trip briefing//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + ymd(start) + '-' + slugify(data.from) + '-' + slugify(data.to) + '@isitpolite.com',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTSTART;VALUE=DATE:' + ymd(start),
      'DTEND;VALUE=DATE:' + ymd(end),
      'SUMMARY:' + icsEscape(summary),
      'DESCRIPTION:' + icsEscape('You fly to ' + data.to + ' on ' + departure + '.\n' + data.headline + '\n\n' + top + '\n\nOpen your saved briefing (works offline): https://isitpolite.com/#/saved'),
      'URL:https://isitpolite.com/#/saved',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(summary), 'TRIGGER:PT9H', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function downloadIcs(data, departure) {
    var ics = buildIcs(data, departure);
    if (!ics) return false;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'isitpolite-' + slugify(data.to) + '-briefing.ics';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    trackEvent('reminder_added');
    return true;
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function tripLink(data) {
    var q = new URLSearchParams({ tf: data.from, tt: data.to });
    if (data.contexts && data.contexts.length) q.set('tc', data.contexts.join(','));
    if (data.month) q.set('tm', String(data.month));
    return 'https://isitpolite.com/?' + q.toString() + '#/trip';
  }

  function shareBrief(data, btn) {
    var top = (data.watch_outs || []).slice(0, 3).map(function (w) { return '• ' + w.title + ': ' + w.do; }).join('\n');
    var text = data.from + ' → ' + data.to + ' etiquette briefing\n' + data.headline + '\n\n' + top + '\n\nGet the full briefing:';
    shareOrCopy({ title: 'Trip briefing: ' + data.to, text: text, url: tripLink(data) }, function (how) {
      trackEvent('share_brief');
      if (how === 'copied' && btn) {
        var label = btn.innerHTML;
        btn.textContent = 'Copied: paste it into Messenger or Viber';
        setTimeout(function () { btn.innerHTML = label; }, 2500);
      }
    });
  }

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
      trackEvent('brief_saved');
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

  var TICK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function getBriefRead(key) {
    var e = getBrief(key);
    return e && Array.isArray(e.read) ? e.read : [];
  }
  function setBriefRead(key, read) {
    try {
      var e = getBrief(key);
      if (!e) return;
      e.read = read;
      localStorage.setItem(BRIEF_PREFIX + key, JSON.stringify(e));
    } catch (_) {}
  }

  function phrasesHtml(data) {
    var list = (data.phrases || []).filter(function (p) { return p && p.english && p.local; });
    if (!list.length) return '';
    return '<section class="brief-phrases" aria-label="Three phrases to know"><h4>Three phrases to know</h4><ul>' + list.map(function (p) {
      return '<li><span class="ph-en">' + sanitize(p.english) + '</span><span class="ph-local">' + sanitize(p.local) + '</span>' +
        (p.romanization ? '<span class="ph-rom">' + sanitize(p.romanization) + '</span>' : '') + '</li>';
    }).join('') + '</ul><p class="ph-note">Pronunciation is approximate.</p></section>';
  }

  function readProgressText(read, total) {
    return read + ' of ' + total + ' read';
  }

  function renderBrief(data, key, ts) {
    var route = sanitize(data.from) + ' → ' + sanitize(data.to);
    var meta = [(data.contexts || []).map(shortContext).join(', '), briefWhen(data)].filter(Boolean).map(sanitize).join(' · ');
    var read = getBriefRead(key);
    var total = (data.watch_outs || []).length;

    var items = (data.watch_outs || []).map(function (w, i) {
      var sev = SEVERITY_CLASS[w.severity] ? w.severity : 'medium';
      var link = /^\/etiquette\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(w.link || '') ? w.link : '';
      var isRead = read.indexOf(i) !== -1;
      return '<li class="brief-item' + (isRead ? ' is-read' : '') + '">' +
        '<div class="brief-item-head"><span class="sev-chip ' + SEVERITY_CLASS[sev] + '">' + SEVERITY_LABELS[sev] + '</span>' +
          '<span class="brief-cat">' + sanitize(w.category || shortContext(w.context)) + '</span></div>' +
        '<h4>' + sanitize(w.title) + '</h4>' +
        '<dl class="brief-compare">' +
          '<div><dt>In ' + sanitize(withThe(data.from)) + '</dt><dd>' + sanitize(w.from_norm) + '</dd></div>' +
          '<div><dt>In ' + sanitize(withThe(data.to)) + '</dt><dd>' + sanitize(w.to_norm) + '</dd></div>' +
        '</dl>' +
        // NHS-style do and don't lists: stacked, labelled in words, icons decorative.
        '<div class="dd-list dd-do"><p class="dd-head">' + TICK + 'Do</p><p class="dd-text">' + sanitize(w.do) + '</p></div>' +
        (w.avoid ? '<div class="dd-list dd-dont"><p class="dd-head">' + CROSS + 'Don\'t</p><p class="dd-text">' + sanitize(w.avoid) + '</p></div>' : '') +
        '<div class="brief-item-foot">' +
          (link ? '<a class="brief-src" href="' + link + '">See the reviewed guide and sources →</a>' : '<span></span>') +
          '<button type="button" class="brief-read" data-read="' + i + '" aria-pressed="' + (isRead ? 'true' : 'false') + '">' + (isRead ? TICK + ' Read' : 'Mark as read') + '</button>' +
        '</div>' +
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
          '<p class="brief-meta"><span class="brief-saved-ok">' + TICK + 'Saved for offline use</span> · ' + timeAgo(ts) + ' · <button type="button" class="link-btn" data-act="refresh">Refresh</button></p>' +
          '<div class="brief-actions">' +
            '<button type="button" class="share-btn" data-act="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Send to family</button>' +
            '<button type="button" class="share-btn" data-act="remind" aria-expanded="false" aria-controls="brief-remind"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Remind me before I fly</button>' +
          '</div>' +
          '<div class="brief-remind hidden" id="brief-remind">' +
            '<label for="brief-date">When do you fly?</label>' +
            '<div class="brief-remind-row"><input type="date" id="brief-date" min="' + todayIso() + '" /><button type="button" class="share-btn" data-act="ics">Add to calendar</button></div>' +
            '<p class="field-hint">Adds a reminder 2 days before, as a calendar file on your device. Nothing is sent to us.</p>' +
            '<p class="brief-remind-msg" aria-live="polite"></p>' +
          '</div>' +
          '<div class="install-card hidden" id="install-card" aria-live="polite"></div>' +
          phrasesHtml(data) +
          '<p class="brief-progress" aria-live="polite"><span class="brief-progress-bar"><span style="width:' + (total ? Math.round(read.length / total * 100) : 0) + '%"></span></span><span class="brief-progress-text">' + readProgressText(read.length, total) + '</span></p>' +
        '</div>' +
        '<ol class="brief-list">' + items + '</ol>' +
        season +
        '<div class="result-footnote">Drafted by AI from web sources and our reviewed country guides. Customs vary between people and regions.</div>' +
      '</div>';
    briefResult.dataset.key = key;
    briefResult._briefData = data;

    var wrap = briefResult.querySelector('.brief-wrap');
    if (wrap) addPremiumButton(wrap, 'Download Infographic', 'infographic', { subkind: 'trip', from: data.from, to: data.to, result: data });
    maybeShowInstallCard(document.getElementById('install-card'));
    briefResult.scrollIntoView({ behavior: scrollMode(), block: 'start' });
  }

  function onBriefResultClick(e) {
    if (e.target.closest('[data-act="refresh"]')) { handleBrief({ refresh: true }); return; }
    var share = e.target.closest('[data-act="share"]');
    if (share) { if (briefResult._briefData) shareBrief(briefResult._briefData, share); return; }
    var remind = e.target.closest('[data-act="remind"]');
    if (remind) {
      var panel = document.getElementById('brief-remind');
      var open = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !open);
      remind.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) document.getElementById('brief-date').focus();
      return;
    }
    if (e.target.closest('[data-act="ics"]')) {
      var date = document.getElementById('brief-date').value;
      var msg = briefResult.querySelector('.brief-remind-msg');
      if (!date) { msg.textContent = 'Pick your departure date first.'; return; }
      msg.textContent = downloadIcs(briefResult._briefData, date) ? 'Calendar file downloaded. Open it to add the reminder.' : 'That date does not look right.';
      return;
    }
    var btn = e.target.closest('[data-read]');
    if (!btn) return;
    var key = briefResult.dataset.key;
    var i = parseInt(btn.getAttribute('data-read'), 10);
    var read = getBriefRead(key).filter(function (n) { return n !== i; });
    var nowRead = btn.getAttribute('aria-pressed') !== 'true';
    if (nowRead) read.push(i);
    setBriefRead(key, read);
    btn.setAttribute('aria-pressed', nowRead ? 'true' : 'false');
    btn.innerHTML = nowRead ? TICK + ' Read' : 'Mark as read';
    btn.closest('.brief-item').classList.toggle('is-read', nowRead);
    var total = briefResult.querySelectorAll('.brief-item').length;
    var bar = briefResult.querySelector('.brief-progress-bar span');
    if (bar) bar.style.width = (total ? Math.round(read.length / total * 100) : 0) + '%';
    var txt = briefResult.querySelector('.brief-progress-text');
    if (txt) txt.textContent = readProgressText(read.length, total);
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

  // Saved tab: the same briefings, opened in the Trip tab.
  function renderSavedTrips() {
    var el = document.getElementById('saved-trips');
    if (!el) return;
    var keys = loadBriefIndex().filter(function (k) { return getBrief(k); });
    if (!keys.length) {
      el.innerHTML = '<p class="saved-empty">No briefings yet. <a href="#/trip">Make one in Trip</a> and it will be saved here for offline use.</p>';
      return;
    }
    el.innerHTML = '<ul class="saved-list">' + keys.map(function (k) {
      var e = getBrief(k), d = e.data, read = Array.isArray(e.read) ? e.read.length : 0, total = (d.watch_outs || []).length;
      var sub = [(d.contexts || []).map(shortContext).join(', '), briefWhen(d), readProgressText(read, total)].filter(Boolean).join(' · ');
      return '<li><button type="button" class="saved-row" data-open-brief="' + sanitize(k) + '">' +
        '<span class="saved-row-title">' + sanitize(d.from) + ' → ' + sanitize(d.to) + '</span>' +
        '<span class="saved-row-sub">' + sanitize(sub) + '</span></button></li>';
    }).join('') + '</ul>';
  }

  function onSavedTripsClick(e) {
    var btn = e.target.closest('[data-open-brief]');
    if (!btn) return;
    var key = btn.getAttribute('data-open-brief');
    var entry = getBrief(key);
    if (!entry) return;
    navigate('trip');
    setTimeout(function () { setBriefForm(entry.data); renderBrief(entry.data, key, entry.ts); }, 60);
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
