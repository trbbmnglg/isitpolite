  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 2: COUNTRY GUIDE
  // ═══════════════════════════════════════════════════════════════════════
  async function handleGuideGenerate() {
    if (!requireConsent(handleGuideGenerate)) return;

    var country = guideCountryEl.value;
    if (!country) { guideCountryEl.classList.add('field-error'); guideCountryEl.focus(); return; }
    guideCountryEl.classList.remove('field-error');

    // Offline + saved pack? serve it directly.
    if (!navigator.onLine && getPack(country)) { renderGuide(getPack(country), true, country); return; }

    // Check localStorage cache first
    var ckey = GUIDE_CACHE_KEY + country;
    try {
      var raw = localStorage.getItem(ckey);
      if (raw) {
        var cached = JSON.parse(raw);
        if (cached && cached.data && Date.now() - cached.ts < CACHE_TTL) { renderGuide(cached.data, true, country); return; }
        localStorage.removeItem(ckey);
      }
    } catch (_) {}

    guideBtnEl.disabled = true;
    guideBtnEl.textContent = 'Generating…';
    guideResult.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Building your ' + sanitize(country) + ' cheat sheet…</p></div>';

    try {
      var data = await callLookup('guide', { country: country });
      try { localStorage.setItem(ckey, JSON.stringify({ data: data, ts: Date.now() })); } catch (_) {}
      if (isPack(country)) saveOfflinePack(country, data); // refresh saved pack
      renderGuide(data, false, country);
    } catch (err) {
      guideResult.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">' + ALERT_ICON + '</p><p class="error-message">' + sanitize(err.message) + '</p><button class="retry-btn" type="button" onclick="document.getElementById(\'guide-btn\').click()">Try Again</button></div>';
    } finally {
      guideBtnEl.disabled = false;
      guideBtnEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> Generate Guide';
    }
  }


  function renderGuide(data, fromCache, country) {
    country = country || data.country || data.Country || '';
    var tipsHtml = (data.tips || []).map(function (tip, i) {
      var cat = (tip.category || 'general').replace(/_/g, ' ');
      return (
        '<div class="guide-tip" style="animation-delay:' + (i * 60) + 'ms">' +
          '<div class="guide-tip-header">' +
            '<span class="guide-tip-num">' + (i + 1) + '</span>' +
            '<span class="guide-tip-title">' + sanitize(tip.title) + '</span>' +
          '</div>' +
          '<p class="guide-tip-body">' + sanitize(tip.body) + '</p>' +
          '<span class="guide-tip-cat">' + sanitize(cat) + '</span>' +
        '</div>'
      );
    }).join('');

    guideResult.innerHTML =
      '<div class="guide-intro">' +
        '<div class="guide-intro-top">' +
          '<strong>' + sanitize(country) + '</strong>' +
          '<button class="pack-save-btn" type="button" id="pack-save-btn"></button>' +
        '</div>' +
        (fromCache ? '<small class="guide-cached-tag">Saved / cached copy</small>' : '') +
        '<p class="guide-intro-text">' + sanitize(data.intro || '') + '</p>' +
      '</div>' +
      '<div class="guide-grid">' + tipsHtml + '</div>';

    // Premium CTAs — infographic, dossier, phrasebook for this guide.
    var guideIntro = guideResult.querySelector('.guide-intro');
    if (guideIntro) {
      addPremiumButton(guideIntro, 'Download Infographic', 'infographic', { subkind: 'guide', country: country, result: data });
    }
    var guideGrid = guideResult.querySelector('.guide-grid');
    if (guideGrid) {
      addPremiumButton(guideGrid, 'Download Country Dossier (PDF)', 'dossier', { country: country, result: data });
      addPremiumButton(guideGrid, 'Download Phrasebook (PDF)', 'phrasebook', { country: country, result: data });
    }

    var saveBtn = document.getElementById('pack-save-btn');
    if (saveBtn) {
      paintPackButton(saveBtn, country);
      saveBtn.addEventListener('click', function () {
        if (isPack(country)) { removePack(country); }
        else { saveOfflinePack(country, data); }
        paintPackButton(saveBtn, country);
        renderPacksStrip();
      });
    }
  }

  function paintPackButton(btn, country) {
    if (isPack(country)) {
      btn.className = 'pack-save-btn saved';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Saved offline';
    } else {
      btn.className = 'pack-save-btn';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save for offline';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 6: OFFLINE TRIP PACKS
  // ═══════════════════════════════════════════════════════════════════════
  function loadPacks() {
    try { return JSON.parse(localStorage.getItem(PACKS_KEY) || '[]'); } catch (_) { return []; }
  }
  function isPack(country) { return loadPacks().indexOf(country) !== -1; }
  function getPack(country) {
    try {
      var raw = localStorage.getItem(PACK_PREFIX + country);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function saveOfflinePack(country, data) {
    try {
      localStorage.setItem(PACK_PREFIX + country, JSON.stringify(data));
      var packs = loadPacks();
      if (packs.indexOf(country) === -1) { packs.push(country); packs.sort(); }
      localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
    } catch (_) {}
  }
  function removePack(country) {
    try {
      localStorage.removeItem(PACK_PREFIX + country);
      var packs = loadPacks().filter(function (c) { return c !== country; });
      localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
    } catch (_) {}
  }

  function renderPacksStrip() {
    if (!offlinePacksEl) return;
    var packs = loadPacks();
    if (packs.length === 0) { offlinePacksEl.classList.add('hidden'); offlinePacksEl.innerHTML = ''; return; }

    var chips = packs.map(function (c) {
      return '<button class="pack-chip" type="button" data-country="' + sanitize(c) + '">' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>' +
               sanitize(c) +
             '</button>';
    }).join('');

    offlinePacksEl.innerHTML = '<span class="packs-label">Your offline packs</span><div class="packs-chips">' + chips + '</div>';
    offlinePacksEl.classList.remove('hidden');

    offlinePacksEl.querySelectorAll('.pack-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var c = chip.dataset.country;
        var data = getPack(c);
        if (!data) return;
        guideCountryEl.value = c;
        renderGuide(data, true, c);
        guideResult.scrollIntoView({ behavior: scrollMode(), block: 'start' });
      });
    });
  }

