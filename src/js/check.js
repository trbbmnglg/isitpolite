  // ═══════════════════════════════════════════════════════════════════════
  // CHECK — FEATURE 1 CORE
  // ═══════════════════════════════════════════════════════════════════════
  async function handleSubmit() {
    if (!localStorage.getItem(PRIVACY_KEY)) { privacyModal.classList.remove('hidden'); return; }

    var gesture = gestureInput.value.trim();
    var country = countrySelect.value;
    var context = contextSelect.value;

    gestureInput.classList.remove('field-error');
    countrySelect.classList.remove('field-error');
    var hasErr = false;
    if (!gesture) { gestureInput.classList.add('field-error'); hasErr = true; }
    if (!country) { countrySelect.classList.add('field-error'); hasErr = true; }
    if (hasErr) { if (!gesture) gestureInput.focus(); else countrySelect.focus(); return; }

    var piiMsg = piiMessage(gesture);
    if (piiMsg) { flashFieldMsg(gestureInput, piiMsg); gestureInput.focus(); return; }

    // Feature 4: check offline cache first
    var cached = getCachedResult(gesture, country, context);
    if (cached) {
      hideCachedBanner();
      renderResult(cached.data, gesture, country, context, true, cached.timestamp);
      updateShareURL(gesture, country, context);
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    hideCachedBanner();
    showLoading();

    try {
      var data = await callLookup('check', { gesture: gesture, country: country, context: context });
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
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderResult(data, gesture, country, context, fromCache, cacheTs) {
    var cls = verdictClass(data.verdict);
    var alsoCards = (data.also_check || []).map(function (item) {
      var mc = item.verdict || 'caution';
      return '<div class="also-card"><div class="also-card-header"><span class="mini-dot ' + sanitize(mc) + '" aria-hidden="true"></span><span class="also-country">' + sanitize(item.country) + '</span></div><p class="also-note">' + sanitize(item.note) + '</p></div>';
    }).join('');

    var regional = (data.regional_note && String(data.regional_note).trim())
      ? '<div class="card-section"><div class="caveat-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span><strong>Varies locally:</strong> ' + sanitize(data.regional_note) + '</span></div></div>'
      : '';

    resultArea.innerHTML =
      '<article class="result-card ' + cls + '" aria-label="Etiquette verdict">' +
        '<div class="verdict-badge">' +
          '<span class="badge-dot" aria-hidden="true"></span>' +
          '<span class="badge-label">' + sanitize(data.verdict_label) + '</span>' +
          confidenceBadge(data.confidence) +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-section"><h3>Explanation</h3><p>' + sanitize(data.explanation) + '</p></div>' +
          regional +
          '<div class="card-section"><h3>Local Tip</h3><p class="local-tip-text">' + sanitize(data.local_tip) + '</p></div>' +
          (alsoCards ? '<div class="card-section"><h3>Also Check</h3><div class="also-check-grid">' + alsoCards + '</div></div>' : '') +
        '</div>' +
        '<div class="result-footnote">AI-generated guidance — customs evolve and vary between people. Treat as a helpful starting point, not absolute rules.</div>' +
      '</article>';

    addShareButton(gesture, country, context, data.verdict_label);
    addReportControls(gesture, country, context, data.verdict, data.verdict_label);

    if (fromCache && cacheTs) {
      cachedBannerText.textContent = 'Cached result from ' + timeAgo(cacheTs) + ' — you\'re offline or it\'s saved locally.';
      cachedBanner.classList.remove('hidden');
    }

    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderError(message) {
    resultArea.innerHTML =
      '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">⚠️</p><p class="error-message">' + sanitize(message) + '</p><button class="retry-btn" type="button">Try Again</button></div>';
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 3: SHARE A VERDICT
  // ═══════════════════════════════════════════════════════════════════════
  function loadFromURLParams() {
    var params = new URLSearchParams(window.location.search);
    var g = params.get('g'), c = params.get('c'), ctx = params.get('ctx');
    if (g && c) {
      gestureInput.value = g;
      countrySelect.value = c;
      if (ctx && CONTEXT_LABELS[ctx]) contextSelect.value = ctx;
      setTimeout(handleSubmit, 300);
    }
  }

  function updateShareURL(gesture, country, context) {
    var params = new URLSearchParams({ g: gesture, c: country, ctx: context });
    window.history.replaceState({}, '', '?' + params.toString());
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

