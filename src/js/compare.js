  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE: COMPARE COUNTRIES
  // ═══════════════════════════════════════════════════════════════════════
  async function handleCompare() {
    if (!requireConsent(handleCompare)) return;

    var gesture = compareGestureEl.value.trim();
    var countries = [compareC1.value, compareC2.value, compareC3.value]
      .filter(function (c) { return c; });
    // de-dupe
    countries = countries.filter(function (c, i) { return countries.indexOf(c) === i; });

    compareGestureEl.classList.remove('field-error');
    compareC1.classList.remove('field-error');
    compareC2.classList.remove('field-error');
    var err = false;
    if (!gesture) { compareGestureEl.classList.add('field-error'); err = true; }
    if (countries.length < 2) {
      if (!compareC1.value) compareC1.classList.add('field-error');
      if (!compareC2.value) compareC2.classList.add('field-error');
      err = true;
    }
    if (err) { if (!gesture) compareGestureEl.focus(); return; }

    var cPii = piiMessage(gesture);
    if (cPii) { flashFieldMsg(compareGestureEl, cPii); compareGestureEl.focus(); return; }

    var ckey = 'cmp_' + gesture.toLowerCase() + '|' + countries.join(',');
    var cached = readTtlCache(ckey);
    if (cached) { renderComparison(cached, gesture); return; }

    compareBtn.disabled = true;
    compareBtn.textContent = 'Comparing…';
    compareResult.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Comparing across ' + countries.length + ' countries…</p></div>';

    try {
      var data = await callLookup('compare', { gesture: gesture, countries: countries });
      writeTtlCache(ckey, data);
      renderComparison(data, gesture);
    } catch (e) {
      compareResult.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">' + ALERT_ICON + '</p><p class="error-message">' + sanitize(e.message) + '</p></div>';
    } finally {
      compareBtn.disabled = false;
      compareBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="17" height="17" aria-hidden="true"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg> Compare';
    }
  }


  function renderComparison(data, gesture) {
    var rows = (data.results || []).map(function (r, i) {
      var v = (r.verdict || 'caution').toLowerCase();
      return (
        '<div class="cmp-card ' + verdictClass(v) + '" style="animation-delay:' + (i * 70) + 'ms">' +
          '<div class="cmp-card-head">' +
            '<span class="cmp-dot ' + sanitize(v) + '" aria-hidden="true"></span>' +
            '<span class="cmp-country">' + sanitize(r.country) + '</span>' +
            '<span class="cmp-verdict-tag ' + sanitize(v) + '">' + sanitize(r.verdict_label || v) + '</span>' +
          '</div>' +
          '<p class="cmp-note">' + sanitize(r.note) + '</p>' +
        '</div>'
      );
    }).join('');

    compareResult.innerHTML =
      '<div class="cmp-wrap">' +
        '<div class="cmp-gesture-banner"><span>“' + sanitize(gesture) + '”</span></div>' +
        (data.summary ? '<p class="cmp-summary">' + sanitize(data.summary) + '</p>' : '') +
        '<div class="cmp-grid">' + rows + '</div>' +
        '<div class="result-footnote">AI-generated guidance — customs vary between people and regions.</div>' +
      '</div>';
    compareResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Premium CTA — comparison infographic.
    var cmpWrap = compareResult.querySelector('.cmp-wrap');
    if (cmpWrap) {
      addPremiumButton(cmpWrap, 'Download Infographic', 'infographic', {
        subkind: 'compare', gesture: gesture, result: data,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE: TRIP CULTURE SHIFT (from → to)
  // ═══════════════════════════════════════════════════════════════════════
  async function handleTrip() {
    if (!requireConsent(handleTrip)) return;

    var from = tripFromEl.value, to = tripToEl.value;
    tripFromEl.classList.remove('field-error');
    tripToEl.classList.remove('field-error');
    var err = false;
    if (!from) { tripFromEl.classList.add('field-error'); err = true; }
    if (!to)   { tripToEl.classList.add('field-error'); err = true; }
    if (err) return;
    if (from === to) {
      tripResult.innerHTML = '<div class="error-card" role="alert"><p class="error-message">Pick two different countries to see what changes.</p></div>';
      return;
    }

    var ckey = 'trip_' + from + '>' + to;
    var cached = readTtlCache(ckey);
    if (cached) { renderTrip(cached); return; }

    tripBtn.disabled = true;
    tripBtn.textContent = 'Analyzing…';
    tripResult.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Mapping the shift from ' + sanitize(from) + ' to ' + sanitize(to) + '…</p></div>';

    try {
      var data = await callLookup('trip', { from: from, to: to });
      writeTtlCache(ckey, data);
      renderTrip(data);
    } catch (e) {
      tripResult.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">' + ALERT_ICON + '</p><p class="error-message">' + sanitize(e.message) + '</p></div>';
    } finally {
      tripBtn.disabled = false;
      tripBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="17" height="17" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> Show me the differences';
    }
  }

  function renderTrip(data) {
    var items = (data.differences || []).map(function (d, i) {
      return (
        '<div class="trip-card" style="animation-delay:' + (i * 60) + 'ms">' +
          '<div class="trip-cat">' + sanitize(d.category || '') + '</div>' +
          '<div class="trip-compare">' +
            '<div class="trip-side trip-from-side"><span class="trip-side-label">' + sanitize(data.from || 'Home') + '</span><p>' + sanitize(d.from_norm) + '</p></div>' +
            '<div class="trip-side-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>' +
            '<div class="trip-side trip-to-side"><span class="trip-side-label">' + sanitize(data.to || 'Destination') + '</span><p>' + sanitize(d.to_norm) + '</p></div>' +
          '</div>' +
          '<div class="trip-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg><span>' + sanitize(d.tip) + '</span></div>' +
        '</div>'
      );
    }).join('');

    tripResult.innerHTML =
      '<div class="trip-wrap">' +
        '<div class="trip-route-banner">' +
          '<span class="trip-route-from">' + sanitize(data.from || '') + '</span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
          '<span class="trip-route-to">' + sanitize(data.to || '') + '</span>' +
        '</div>' +
        (data.summary ? '<p class="trip-summary">' + sanitize(data.summary) + '</p>' : '') +
        '<div class="trip-grid">' + items + '</div>' +
        '<div class="result-footnote">AI-generated guidance — a helpful starting point, not absolute rules.</div>' +
      '</div>';
    tripResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Premium CTA — infographic for this culture-shift result.
    var tripWrap = tripResult.querySelector('.trip-wrap');
    if (tripWrap) {
      addPremiumButton(tripWrap, 'Download Infographic', 'infographic', {
        subkind: 'trip', from: data.from, to: data.to, result: data,
      });
    }
  }

  // Generic TTL cache used by Compare / Trip
  function readTtlCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || !entry.data || Date.now() - entry.ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
      return entry.data;
    } catch (_) { return null; }
  }
  function writeTtlCache(key, data) {
    if (!data) return;
    try { localStorage.setItem(key, JSON.stringify({ data: data, ts: Date.now() })); } catch (_) {}
  }

