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

  // Generic TTL cache used by Compare
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

