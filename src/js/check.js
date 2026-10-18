  // ═══════════════════════════════════════════════════════════════════════
  // CHECK — FEATURE 1 CORE
  // ═══════════════════════════════════════════════════════════════════════
  async function handleSubmit() {
    if (!requireConsent(handleSubmit)) return;

    var gesture = gestureInput.value.trim();
    var country = countrySelect.value;
    var context = contextSelect.value;

    gestureInput.classList.remove('field-error');
    countrySelect.classList.remove('field-error');
    var hasErr = false;
    if (!gesture) { gestureInput.classList.add('field-error'); hasErr = true; }
    if (!country) { countrySelect.classList.add('field-error'); hasErr = true; }
    if (hasErr) { if (!gesture) gestureInput.focus(); else focusField(countrySelect); return; }

    var piiMsg = piiMessage(gesture);
    if (piiMsg) { flashFieldMsg(gestureInput, piiMsg); gestureInput.focus(); return; }

    // Feature 4: check offline cache first
    var cached = getCachedResult(gesture, country, context);
    if (cached) {
      hideCachedBanner();
      renderResult(cached.data, gesture, country, context, true, cached.ts);
      updateShareURL(gesture, country, context);
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    hideCachedBanner();
    showLoading();

    try {
      var home = getHome();
      if (home === country) home = '';
      var data = await callLookup('check', { gesture: gesture, country: country, context: context, home: home });
      if (home) data.home = home;
      setCachedResult(gesture, country, context, data);
      saveToHistory(gesture, country, context, data);
      renderResult(data, gesture, country, context, false, null);
      updateShareURL(gesture, country, context);
      maybeShowDonateNudge();
    } catch (err) {
      renderError(err.message);
    } finally {
      checkBtn.disabled = false;
      checkBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="17" height="17" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Check It';
    }
  }

  function showLoading() {
    resultArea.innerHTML =
      '<div class="loading-state" role="status" aria-label="Loading">' +
        '<div class="spinner"></div><p>Consulting cultural experts…</p>' +
      '</div>';
    resultArea.scrollIntoView({ behavior: scrollMode(), block: 'nearest' });
  }

  function renderResult(data, gesture, country, context, fromCache, cacheTs) {
    var cls = verdictClass(data.verdict);
    var alsoCards = (data.also_check || []).map(function (item) {
      return '<div class="also-card"><div class="also-card-header"><span class="also-country">' + sanitize(item.country) + '</span>' + verdictTag(item.verdict) + '</div><p class="also-note">' + sanitize(item.note) + '</p></div>';
    }).join('');

    var regional = (data.regional_note && String(data.regional_note).trim())
      ? '<div class="card-section"><div class="caveat-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span><strong>Varies locally:</strong> ' + sanitize(data.regional_note) + '</span></div></div>'
      : '';

    var homeNote = (data.home && data.home_contrast && String(data.home_contrast).trim())
      ? '<div class="card-section home-contrast"><h3>Coming from ' + sanitize(withThe(data.home)) + '</h3><p>' + sanitize(data.home_contrast) + '</p></div>'
      : '';

    resultArea.innerHTML =
      '<article class="result-card ' + cls + '" aria-label="Etiquette verdict">' +
        '<div class="verdict-badge">' +
          '<span class="badge-dot" aria-hidden="true"></span>' +
          '<span class="badge-label">' + sanitize(data.verdict_label) + '</span>' +
          confidenceBadge(data.confidence) +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-section"><h3>Explanation</h3><p>' + citeLinks(sanitize(data.explanation), data.sources) + '</p></div>' +
          homeNote +
          regional +
          '<div class="card-section"><h3>Local Tip</h3><p class="local-tip-text">' + sanitize(data.local_tip) + '</p></div>' +
          (alsoCards ? '<div class="card-section"><h3>Also Check</h3><div class="also-check-grid">' + alsoCards + '</div></div>' : '') +
          sourcesSection(data.sources) +
          legendHtml() +
        '</div>' +
        '<div class="result-footnote">AI-generated guidance — customs evolve and vary between people. Treat as a helpful starting point, not absolute rules.</div>' +
      '</article>';

    addShareButton(gesture, country, context, data.verdict_label);
    addReportControls(gesture, country, context, data.verdict, data.verdict_label);
    // Keep the disclaimer as the card's last line, below the actions.
    var card = resultArea.querySelector('.result-card');
    var note = card && card.querySelector(':scope > .result-footnote');
    if (note) card.appendChild(note);

    if (fromCache && cacheTs) {
      cachedBannerText.textContent = 'Cached result from ' + timeAgo(cacheTs) + ' — you\'re offline or it\'s saved locally.';
      cachedBanner.classList.remove('hidden');
    }

    resultArea.scrollIntoView({ behavior: scrollMode(), block: 'start' });
  }

  function sourcesSection(sources) {
    if (!Array.isArray(sources)) return ''; // results cached before sources were returned
    var list = sources.filter(function (s) { return s && /^https:\/\//.test(s.url); });
    if (!list.length) {
      return '<div class="card-section"><h3>Sources</h3><p class="sources-none">No web source directly backed this answer, so treat it with extra care.</p></div>';
    }
    return '<div class="card-section"><h3>Sources</h3><ol class="seo-source-list numbered">' + list.map(function (s, i) {
      var host = '';
      try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch (_) {}
      var forum = s.kind === 'community';
      return '<li id="res-src-' + (i + 1) + '"><a href="' + sanitize(s.url) + '" target="_blank" rel="' + (forum ? 'nofollow ugc noopener' : 'noopener') + '">' + sanitize(s.title) + '</a> <span class="seo-source-host">' + sanitize(host) + (forum ? ' · traveler discussion' : '') + '</span></li>';
    }).join('') + '</ol></div>';
  }

  // Turn "[2]" markers (already HTML-escaped text) into links to the numbered sources.
  function citeLinks(html, sources) {
    var n = Array.isArray(sources) ? sources.length : 0;
    return html.replace(/\s*\[(\d)\]/g, function (m, d) {
      var i = parseInt(d, 10);
      return i >= 1 && i <= n ? '<sup class="cite"><a href="#res-src-' + i + '" aria-label="Source ' + i + '">' + i + '</a></sup>' : '';
    });
  }

  function verdictLabelOf(v) {
    var key = String(v || '').toLowerCase();
    var hit = VERDICT_LEGEND.filter(function (l) { return l.key === key; })[0];
    return hit || VERDICT_LEGEND[1];
  }

  // Flat status tag: colour plus a word, never colour alone.
  function verdictTag(v) {
    var l = verdictLabelOf(v);
    return '<span class="v-tag ' + l.key + '">' + l.label + '</span>';
  }

  function legendHtml() {
    var rows = VERDICT_LEGEND.map(function (l) { return '<div><dt>' + verdictTag(l.key) + '</dt><dd>' + sanitize(l.text) + '</dd></div>'; }).join('') +
      CONFIDENCE_LEGEND.map(function (c) { return '<div><dt><span class="legend-conf">' + sanitize(c.label) + '</span></dt><dd>' + sanitize(c.text) + '</dd></div>'; }).join('');
    return '<details class="verdict-legend"><summary>What do these labels mean?</summary><dl>' + rows + '</dl></details>';
  }

  function renderError(message) {
    resultArea.innerHTML =
      '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">' + ALERT_ICON + '</p><p class="error-message">' + sanitize(message) + '</p><button class="retry-btn" type="button">Try Again</button></div>';
    resultArea.scrollIntoView({ behavior: scrollMode(), block: 'nearest' });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 3: SHARE A VERDICT
  // ═══════════════════════════════════════════════════════════════════════
  function loadFromURLParams() {
    var params = new URLSearchParams(window.location.search);
    var g = params.get('g'), c = params.get('c'), ctx = params.get('ctx');
    // Country hubs link with just ?c= — preselect it and let the visitor type.
    if (c && COUNTRIES.indexOf(c) !== -1) countrySelect.value = c;
    if (ctx && CONTEXT_LABELS[ctx]) contextSelect.value = ctx;
    if (g && c) {
      gestureInput.value = g;
      setTimeout(handleSubmit, 300);
    }
  }

  function updateShareURL(gesture, country, context) {
    var params = new URLSearchParams({ g: gesture, c: country, ctx: context });
    window.history.replaceState({}, '', '?' + params.toString() + window.location.hash);
  }

  function addShareButton(gesture, country, context, verdictLabel) {
    var card = resultArea.querySelector('.result-card');
    if (!card) return;

    var copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

    var row = document.createElement('div');
    row.className = 'share-row';

    // Copy link
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'share-btn';
    btn.innerHTML = copyIcon + ' Share link';
    btn.addEventListener('click', function () {
      var url = window.location.href;
      var done = function () {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Link Copied!';
        btn.classList.add('copied');
        setTimeout(function () { btn.innerHTML = copyIcon + ' Share link'; btn.classList.remove('copied'); }, 2500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done);
      } else {
        var tmp = document.createElement('input');
        tmp.value = url; document.body.appendChild(tmp); tmp.select();
        document.execCommand('copy'); document.body.removeChild(tmp); done();
      }
    });

    // Share on X
    var xBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.className = 'share-btn share-x';
    xBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> Share on X';
    xBtn.addEventListener('click', function () {
      var verdictTxt = verdictLabel ? (' → ' + verdictLabel) : '';
      var text = 'Is "' + gesture + '" polite in ' + country + '?' + verdictTxt + ' — I found out on IsItPolite.com';
      var intent = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(window.location.href);
      window.open(intent, '_blank', 'noopener,noreferrer');
    });

    row.appendChild(btn);
    row.appendChild(xBtn);
    card.appendChild(row);
  }

