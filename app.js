(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────────
  var API_URL     = '/api/ask';     // legacy proxy (kept for build tooling)
  var API_LOOKUP  = '/api/lookup';  // retrieval-augmented agent (Check/Compare/Trip/Guide/Quiz)
  var PRIVACY_KEY = 'isitpolite_privacy_accepted';
  var HISTORY_KEY = 'isitpolite_history';
  var HISTORY_MAX = 50;
  var CACHE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days
  var PACKS_KEY   = 'isitpolite_packs';      // index of saved offline country packs
  var PACK_PREFIX = 'pack_';                 // pack_[country] → guide data, no expiry
  var UNLOCK_KEY  = 'isitpolite_unlock';     // premium unlock code (localStorage)

  // ── Premium helpers ────────────────────────────────────────────────────
  function getUnlockCode() { try { return localStorage.getItem(UNLOCK_KEY) || ''; } catch (_) { return ''; } }
  function setUnlockCode(code) { try { if (code) localStorage.setItem(UNLOCK_KEY, code); else localStorage.removeItem(UNLOCK_KEY); } catch (_) {} }

  // ── Country List ───────────────────────────────────────────────────────
  var COUNTRIES = [
    'Afghanistan','Albania','Algeria','Andorra','Angola',
    'Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
    'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados',
    'Belarus','Belgium','Belize','Benin','Bhutan',
    'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei',
    'Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia',
    'Cameroon','Canada','Central African Republic','Chad','Chile',
    'China','Colombia','Comoros','Congo (Democratic Republic)','Congo (Republic)',
    'Costa Rica','Croatia','Cuba','Cyprus','Czech Republic',
    'Denmark','Djibouti','Dominica','Dominican Republic','Ecuador',
    'Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia',
    'Eswatini','Ethiopia','Fiji','Finland','France',
    'Gabon','Gambia','Georgia','Germany','Ghana',
    'Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
    'Guyana','Haiti','Honduras','Hungary','Iceland',
    'India','Indonesia','Iran','Iraq','Ireland',
    'Israel','Italy','Jamaica','Japan','Jordan',
    'Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan',
    'Laos','Latvia','Lebanon','Lesotho','Liberia',
    'Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar',
    'Malawi','Malaysia','Maldives','Mali','Malta',
    'Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia',
    'Moldova','Monaco','Mongolia','Montenegro','Morocco',
    'Mozambique','Myanmar','Namibia','Nauru','Nepal',
    'Netherlands','New Zealand','Nicaragua','Niger','Nigeria',
    'North Korea','North Macedonia','Norway','Oman','Pakistan',
    'Palau','Palestine','Panama','Papua New Guinea','Paraguay',
    'Peru','Philippines','Poland','Portugal','Qatar',
    'Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia',
    'Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe','Saudi Arabia',
    'Senegal','Serbia','Seychelles','Sierra Leone','Singapore',
    'Slovakia','Slovenia','Solomon Islands','Somalia','South Africa',
    'South Korea','South Sudan','Spain','Sri Lanka','Sudan',
    'Suriname','Sweden','Switzerland','Syria','Taiwan',
    'Tajikistan','Tanzania','Thailand','Timor-Leste','Togo',
    'Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan',
    'Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom',
    'United States','Uruguay','Uzbekistan','Vanuatu','Vatican City',
    'Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
  ];

  var CONTEXT_LABELS = {
    general: 'General / everyday', business: 'Business / work',
    dining: 'Dining / restaurant', religion: 'Religious setting',
    social: 'Social gathering', family: 'Meeting family',
  };

  var EXAMPLES = [
    { gesture: 'Thumbs up',                     country: 'Iran',         context: 'general'  },
    { gesture: 'Tipping at a restaurant',       country: 'Japan',        context: 'dining'   },
    { gesture: 'Bowing when greeting',          country: 'South Korea',  context: 'business' },
    { gesture: 'Showing soles of feet',         country: 'Thailand',     context: 'social'   },
    { gesture: 'Eating with the left hand',     country: 'India',        context: 'dining'   },
    { gesture: 'Refusing offered food',         country: 'India',        context: 'family'   },
    { gesture: 'Arriving 15 minutes late',      country: 'Germany',      context: 'business' },
    { gesture: 'Direct eye contact',            country: 'Japan',        context: 'business' },
    { gesture: 'Patting someone on the head',   country: 'Thailand',     context: 'social'   },
    { gesture: 'Beckoning with one finger',     country: 'Philippines',  context: 'general'  },
    { gesture: 'Crossing legs while sitting',   country: 'Saudi Arabia', context: 'business' },
    { gesture: 'Giving gift with both hands',   country: 'China',        context: 'business' },
  ];

  var GUIDE_CACHE_KEY = 'guide_';
  var QUIZ_CACHE_KEY  = 'quiz_';

  // ── Quiz State ─────────────────────────────────────────────────────────
  var quizState = { questions: [], current: 0, score: 0, country: '', answers: [] };

  // ── DOM References ─────────────────────────────────────────────────────
  var gestureInput, countrySelect, contextSelect, checkBtn, resultArea,
      privacyModal, modalAccept, examplesGrid,
      guideCountryEl, guideBtnEl, guideResult, offlinePacksEl,
      quizSetup, quizCountryEl, quizStartBtn, quizArea,
      historyList, historyBadge,
      offlineBanner, cachedBanner, cachedBannerText,
      compareGestureEl, compareC1, compareC2, compareC3, compareBtn, compareResult,
      tripFromEl, tripToEl, tripBtn, tripResult;

  // ═══════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════
  function init() {
    gestureInput     = document.getElementById('gesture-input');
    countrySelect    = document.getElementById('country-select');
    contextSelect    = document.getElementById('context-select');
    checkBtn         = document.getElementById('check-btn');
    resultArea       = document.getElementById('result-area');
    privacyModal     = document.getElementById('privacy-modal');
    modalAccept      = document.getElementById('modal-accept');
    examplesGrid     = document.getElementById('examples-grid');
    guideCountryEl   = document.getElementById('guide-country');
    guideBtnEl       = document.getElementById('guide-btn');
    guideResult      = document.getElementById('guide-result');
    offlinePacksEl   = document.getElementById('offline-packs');
    compareGestureEl = document.getElementById('compare-gesture');
    compareC1        = document.getElementById('compare-c1');
    compareC2        = document.getElementById('compare-c2');
    compareC3        = document.getElementById('compare-c3');
    compareBtn       = document.getElementById('compare-btn');
    compareResult    = document.getElementById('compare-result');
    tripFromEl       = document.getElementById('trip-from');
    tripToEl         = document.getElementById('trip-to');
    tripBtn          = document.getElementById('trip-btn');
    tripResult       = document.getElementById('trip-result');
    quizSetup        = document.getElementById('quiz-setup');
    quizCountryEl    = document.getElementById('quiz-country');
    quizStartBtn     = document.getElementById('quiz-start-btn');
    quizArea         = document.getElementById('quiz-area');
    historyList      = document.getElementById('history-list');
    historyBadge     = document.getElementById('history-badge');
    offlineBanner    = document.getElementById('offline-banner');
    cachedBanner     = document.getElementById('cached-banner');
    cachedBannerText = document.getElementById('cached-banner-text');

    initRouter();
    checkPrivacyModal();
    populateAllSelects();
    enhanceAllSelects();
    populateExamples();
    updateHistoryBadge();
    initOffline();
    registerSW();
    loadFromURLParams();

    modalAccept.addEventListener('click', acceptPrivacy);
    checkBtn.addEventListener('click', handleSubmit);
    gestureInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleSubmit(); });
    resultArea.addEventListener('click', function (e) { if (e.target.classList.contains('retry-btn')) handleSubmit(); });

    guideBtnEl.addEventListener('click', handleGuideGenerate);
    quizStartBtn.addEventListener('click', handleQuizStart);
    compareBtn.addEventListener('click', handleCompare);
    tripBtn.addEventListener('click', handleTrip);
    compareGestureEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleCompare(); });
    document.getElementById('clear-history-btn').addEventListener('click', clearHistory);

    // Feedback modal
    var fbOpen = document.getElementById('feedback-open');
    var fbClose = document.getElementById('feedback-close');
    var fbSend = document.getElementById('feedback-send');
    if (fbOpen) fbOpen.addEventListener('click', openFeedback);
    if (fbClose) fbClose.addEventListener('click', closeFeedback);
    if (fbSend) fbSend.addEventListener('click', submitFeedback);

    // Donate modal
    Array.prototype.forEach.call(document.querySelectorAll('.js-donate-open'), function (b) { b.addEventListener('click', openDonate); });
    var dClose = document.getElementById('donate-close');
    if (dClose) dClose.addEventListener('click', closeDonate);
    var gq = document.getElementById('gcash-qr');
    if (gq) gq.addEventListener('error', function () { var g = document.getElementById('donate-gcash'); if (g) g.style.display = 'none'; });

    // FAQ: single-open accordion — opening one closes the others.
    var faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open) faqItems.forEach(function (o) { if (o !== d) o.removeAttribute('open'); });
      });
    });

    renderPacksStrip();

    // Premium modal
    wirePremiumModal();

    // Populate both credit badges on load.
    refreshAllBadges();

    // Handle ?unlock=success|cancel from PayPal redirect (if browser-redirected flow).
    var unlockParam = new URLSearchParams(window.location.search).get('unlock');
    if (unlockParam === 'success' || unlockParam === 'cancel') {
      history.replaceState({}, '', window.location.pathname);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VIEW ROUTER
  // ═══════════════════════════════════════════════════════════════════════
  function initRouter() {
    document.querySelectorAll('.nav-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchView(tab.dataset.view);
      });
    });
  }

  function switchView(view) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('view-active'); });
    document.querySelectorAll('.nav-tab').forEach(function (t) {
      t.classList.remove('nav-active');
      t.removeAttribute('aria-current');
    });

    var el = document.getElementById('view-' + view);
    if (el) el.classList.add('view-active');

    var tab = document.querySelector('[data-view="' + view + '"]');
    if (tab) { tab.classList.add('nav-active'); tab.setAttribute('aria-current', 'page'); }

    if (view === 'history') renderHistoryView();
    if (view === 'guide') renderPacksStrip();
    if (view === 'community') renderCommunity();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVACY MODAL
  // ═══════════════════════════════════════════════════════════════════════
  function checkPrivacyModal() {
    if (!localStorage.getItem(PRIVACY_KEY)) privacyModal.classList.remove('hidden');
  }
  function acceptPrivacy() {
    localStorage.setItem(PRIVACY_KEY, '1');
    privacyModal.classList.add('hidden');
    gestureInput.focus();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // POPULATE SELECTS
  // ═══════════════════════════════════════════════════════════════════════
  function populateSelectWithCountries(el) {
    var frag = document.createDocumentFragment();
    COUNTRIES.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      frag.appendChild(opt);
    });
    el.appendChild(frag);
  }

  function populateAllSelects() {
    populateSelectWithCountries(countrySelect);
    populateSelectWithCountries(guideCountryEl);
    populateSelectWithCountries(quizCountryEl);
    populateSelectWithCountries(compareC1);
    populateSelectWithCountries(compareC2);
    populateSelectWithCountries(compareC3);
    populateSelectWithCountries(tripFromEl);
    populateSelectWithCountries(tripToEl);
  }

  function populateExamples() {
    if (!examplesGrid) return;
    var frag = document.createDocumentFragment();
    EXAMPLES.forEach(function (ex, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'example-chip chip-enter';
      btn.style.animationDelay = (i * 55) + 'ms';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', ex.gesture + ' in ' + ex.country);
      btn.innerHTML = sanitize(ex.gesture) + ' <span class="chip-country">in ' + sanitize(ex.country) + '</span>';
      btn.addEventListener('click', function () {
        gestureInput.value = ex.gesture;
        countrySelect.value = ex.country;
        contextSelect.value = ex.context;
        gestureInput.classList.remove('field-error');
        countrySelect.classList.remove('field-error');
        document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(handleSubmit, 400);
      });
      frag.appendChild(btn);
    });
    examplesGrid.appendChild(frag);
  }

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

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 1: HISTORY
  // ═══════════════════════════════════════════════════════════════════════
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
  }

  function saveToHistory(gesture, country, context, data) {
    var history = loadHistory();
    history.unshift({
      id: Date.now(),
      gesture: gesture,
      country: country,
      context: context,
      verdict: data.verdict,
      verdict_label: data.verdict_label,
      timestamp: Date.now(),
    });
    if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
    updateHistoryBadge();
  }

  function updateHistoryBadge() {
    var count = loadHistory().length;
    if (count > 0) {
      historyBadge.textContent = count > 99 ? '99+' : String(count);
      historyBadge.classList.remove('hidden');
    } else {
      historyBadge.classList.add('hidden');
    }
  }

  function renderHistoryView() {
    var history = loadHistory();
    if (history.length === 0) {
      historyList.innerHTML =
        '<div class="history-empty">' +
          '<div class="history-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
          '<p>No lookups yet.<br>Go to <strong>Check</strong> and search for a gesture to get started.</p>' +
        '</div>';
      return;
    }

    // Group by date
    var groups = {};
    history.forEach(function (item) {
      var label = dateLabel(item.timestamp);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });

    var html = '';
    Object.keys(groups).forEach(function (label) {
      html += '<div class="history-group"><div class="history-group-label">' + sanitize(label) + '</div>';
      groups[label].forEach(function (item) {
        var ctxLabel = (CONTEXT_LABELS[item.context] || item.context).split(' / ')[0];
        html +=
          '<div class="history-item" role="button" tabindex="0" aria-label="Re-check: ' + sanitize(item.gesture) + ' in ' + sanitize(item.country) + '" data-gesture="' + sanitize(item.gesture) + '" data-country="' + sanitize(item.country) + '" data-context="' + sanitize(item.context) + '">' +
            '<span class="history-dot ' + sanitize(item.verdict) + '" aria-hidden="true"></span>' +
            '<div class="history-item-body">' +
              '<div class="history-gesture">' + sanitize(item.gesture) + '</div>' +
              '<div class="history-meta">' +
                '<span class="history-country">' + sanitize(item.country) + '</span>' +
                '<span class="history-ctx">' + sanitize(ctxLabel) + '</span>' +
                '<span class="history-time">' + timeAgo(item.timestamp) + '</span>' +
              '</div>' +
            '</div>' +
            '<span class="history-replay" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>' +
          '</div>';
      });
      html += '</div>';
    });

    historyList.innerHTML = html;

    historyList.querySelectorAll('.history-item').forEach(function (el) {
      function rerun() {
        gestureInput.value = el.dataset.gesture;
        countrySelect.value = el.dataset.country;
        contextSelect.value = el.dataset.context;
        switchView('check');
        setTimeout(handleSubmit, 350);
      }
      el.addEventListener('click', rerun);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rerun(); } });
    });
  }

  function clearHistory() {
    if (!confirm('Clear all lookup history?')) return;
    localStorage.removeItem(HISTORY_KEY);
    updateHistoryBadge();
    renderHistoryView();
  }

  function dateLabel(ts) {
    var d = new Date(ts), now = new Date();
    var today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today - itemDate) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return diff + ' days ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function timeAgo(ts) {
    var diff  = Date.now() - ts;
    var mins  = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days  = Math.floor(diff / 86400000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days === 1) return 'yesterday';
    return days + 'd ago';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 4: OFFLINE CACHE
  // ═══════════════════════════════════════════════════════════════════════
  function cacheKey(g, c, ctx) { return 'cache_' + (g || '').toLowerCase().trim() + '|' + c + '|' + ctx; }

  function getCachedResult(g, c, ctx) {
    try {
      var raw = localStorage.getItem(cacheKey(g, c, ctx));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (Date.now() - entry.ts > CACHE_TTL) { localStorage.removeItem(cacheKey(g, c, ctx)); return null; }
      return entry;
    } catch (_) { return null; }
  }

  function setCachedResult(g, c, ctx, data) {
    try { localStorage.setItem(cacheKey(g, c, ctx), JSON.stringify({ data: data, ts: Date.now() })); } catch (_) {}
  }

  function hideCachedBanner() { cachedBanner.classList.add('hidden'); }

  function initOffline() {
    function updateBanner() {
      if (navigator.onLine) { offlineBanner.classList.add('hidden'); }
      else { offlineBanner.classList.remove('hidden'); }
    }
    updateBanner();
    window.addEventListener('online',  updateBanner);
    window.addEventListener('offline', updateBanner);
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 2: COUNTRY GUIDE
  // ═══════════════════════════════════════════════════════════════════════
  async function handleGuideGenerate() {
    if (!localStorage.getItem(PRIVACY_KEY)) { privacyModal.classList.remove('hidden'); return; }

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
        if (Date.now() - cached.ts < CACHE_TTL) { renderGuide(cached.data, true, country); return; }
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
      guideResult.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">⚠️</p><p class="error-message">' + sanitize(err.message) + '</p><button class="retry-btn" type="button" onclick="document.getElementById(\'guide-btn\').click()">Try Again</button></div>';
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
        guideResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 5: QUIZ MODE
  // ═══════════════════════════════════════════════════════════════════════
  async function handleQuizStart() {
    if (!localStorage.getItem(PRIVACY_KEY)) { privacyModal.classList.remove('hidden'); return; }

    var country = quizCountryEl.value;
    if (!country) { quizCountryEl.classList.add('field-error'); quizCountryEl.focus(); return; }
    quizCountryEl.classList.remove('field-error');

    quizStartBtn.disabled = true;
    quizStartBtn.textContent = 'Building quiz…';
    quizArea.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Generating your ' + sanitize(country) + ' quiz…</p></div>';

    try {
      var data = await callLookup('quiz', { country: country });
      initQuiz(data, country);
    } catch (err) {
      quizArea.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">⚠️</p><p class="error-message">' + sanitize(err.message) + '</p></div>';
    } finally {
      quizStartBtn.disabled = false;
      quizStartBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Quiz';
    }
  }


  function initQuiz(data, country) {
    quizState = { questions: data.questions || [], current: 0, score: 0, country: country, answers: [] };
    if (quizState.questions.length === 0) {
      quizArea.innerHTML = '<div class="error-card" role="alert"><p class="error-message">No questions were generated. Please try again.</p></div>';
      return;
    }
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    var q   = quizState.questions[quizState.current];
    var pct = (quizState.current / quizState.questions.length) * 100;

    var optsHtml = q.options.map(function (opt, i) {
      var letter = String.fromCharCode(65 + i);
      return '<button class="quiz-option" type="button" data-index="' + i + '"><span class="quiz-opt-letter">' + letter + '</span>' + sanitize(opt) + '</button>';
    }).join('');

    quizArea.innerHTML =
      '<div class="quiz-card">' +
        '<div class="quiz-progress-wrap"><div class="quiz-progress-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="quiz-meta">' +
          '<span class="quiz-counter">Question ' + (quizState.current + 1) + ' of ' + quizState.questions.length + '</span>' +
          '<span class="quiz-country-tag">' + sanitize(quizState.country) + '</span>' +
        '</div>' +
        '<h3 class="quiz-question">' + sanitize(q.question) + '</h3>' +
        '<div class="quiz-options">' + optsHtml + '</div>' +
      '</div>';

    quizArea.querySelectorAll('.quiz-option').forEach(function (btn) {
      btn.addEventListener('click', function () { handleQuizAnswer(parseInt(btn.dataset.index, 10)); });
    });
  }

  function handleQuizAnswer(selected) {
    var q         = quizState.questions[quizState.current];
    var correct   = Number(q.correct);   // model sometimes returns the index as a string
    var isCorrect = selected === correct;
    if (isCorrect) quizState.score++;
    quizState.answers.push({ selected: selected, correct: correct, isCorrect: isCorrect });

    // Highlight options
    quizArea.querySelectorAll('.quiz-option').forEach(function (btn, i) {
      btn.disabled = true;
      if (i === correct) btn.classList.add('correct');
      else if (i === selected && !isCorrect) btn.classList.add('wrong');
    });

    // Append explanation
    var card = quizArea.querySelector('.quiz-card');
    var expDiv = document.createElement('div');
    expDiv.className = 'quiz-explanation ' + (isCorrect ? 'correct' : 'wrong');
    expDiv.innerHTML =
      '<p class="quiz-exp-verdict">' + (isCorrect ? 'Correct!' : 'Not quite.') + '</p>' +
      '<p>' + sanitize(q.explanation) + '</p>';
    card.appendChild(expDiv);

    // Next / Results button
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-cta quiz-next-btn';

    if (quizState.current < quizState.questions.length - 1) {
      nextBtn.textContent = 'Next Question';
      nextBtn.addEventListener('click', function () {
        quizState.current++;
        renderQuizQuestion();
      });
    } else {
      nextBtn.textContent = 'See My Results';
      nextBtn.addEventListener('click', showQuizScore);
    }
    card.appendChild(nextBtn);
  }

  function showQuizScore() {
    var total = quizState.questions.length;
    var score = quizState.score;
    var pct   = Math.round((score / total) * 100);

    var msg, ringColor;
    if (pct === 100)     { msg = 'Perfect score! Cultural master.'; ringColor = 'var(--polite)'; }
    else if (pct >= 80)  { msg = 'Excellent! You know your customs.'; ringColor = 'var(--polite)'; }
    else if (pct >= 60)  { msg = 'Good effort! A bit more to learn.'; ringColor = 'var(--caution)'; }
    else                 { msg = 'Keep exploring — you\'ll get there!'; ringColor = 'var(--rude)'; }

    var rowsHtml = quizState.questions.map(function (q, i) {
      var ans = quizState.answers[i];
      return '<div class="score-row">' +
        '<span class="score-row-q">' + sanitize(q.question.substring(0, 70)) + (q.question.length > 70 ? '…' : '') + '</span>' +
        '<span class="score-row-r ' + (ans.isCorrect ? 'win' : 'loss') + '">' + (ans.isCorrect ? 'Correct' : 'Wrong') + '</span>' +
      '</div>';
    }).join('');

    quizArea.innerHTML =
      '<div class="quiz-score-card">' +
        '<div class="score-ring" style="border-color:' + ringColor + '">' +
          '<span class="score-number" style="color:' + ringColor + '">' + score + '/' + total + '</span>' +
        '</div>' +
        '<h3 class="score-msg">' + sanitize(msg) + '</h3>' +
        '<p class="score-sub">You answered ' + score + ' out of ' + total + ' questions correctly about <strong>' + sanitize(quizState.country) + '</strong>.</p>' +
        '<div class="score-breakdown">' + rowsHtml + '</div>' +
        '<button class="btn-cta" type="button" id="quiz-restart">Play Again</button>' +
      '</div>';

    document.getElementById('quiz-restart').addEventListener('click', function () {
      quizArea.innerHTML = '';
      quizStartBtn.disabled = false;
    });

    // Premium CTA — certificate for passing score (≥4/5).
    // Also add Scenario Coach button.
    if (score >= 4) {
      var scoreCard = quizArea.querySelector('.quiz-score-card');
      if (scoreCard) {
        addPremiumButton(scoreCard, 'Download Etiquette Certificate', 'certificate', {
          country: quizState.country,
          score: score,
          totalQuestions: total,
          answers: quizState.answers.map(function (a) { return a.selected; }),
          questions: quizState.questions,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE: COMPARE COUNTRIES
  // ═══════════════════════════════════════════════════════════════════════
  async function handleCompare() {
    if (!localStorage.getItem(PRIVACY_KEY)) { privacyModal.classList.remove('hidden'); return; }

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
      compareResult.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">⚠️</p><p class="error-message">' + sanitize(e.message) + '</p></div>';
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
    if (!localStorage.getItem(PRIVACY_KEY)) { privacyModal.classList.remove('hidden'); return; }

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
      tripResult.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">⚠️</p><p class="error-message">' + sanitize(e.message) + '</p></div>';
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
      if (Date.now() - entry.ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
      return entry.data;
    } catch (_) { return null; }
  }
  function writeTtlCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ data: data, ts: Date.now() })); } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PREMIUM GENERATION
  // ═══════════════════════════════════════════════════════════════════════

  // Current pending generation request (set by addPremiumButton; read by modal).
  var _pendingPremium = null; // { kind, params }

  // Call /api/generate with the unlock code, kind, and params.
  // Returns null (download triggered) or { ok, remaining } (email).
  // Throws on error; caller shows the error in the modal.
  async function generatePremium(kind, params, delivery, email) {
    var code = getUnlockCode();
    var body = Object.assign({}, params, { kind: kind, unlock: code, delivery: delivery });
    if (delivery === 'email') body.email = email;

    var res;
    try {
      res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_) {
      throw new Error('No internet connection. Please check your network and try again.');
    }

    if (res.status === 402) {
      // Daily exhausted / no credits — open buy modal with the server message.
      var errData = null;
      try { errData = await res.json(); } catch (_) {}
      openPremiumModal(kind, params, true, (errData && errData.error) || null);
      return null;
    }

    if (!res.ok) {
      var errData2 = null;
      try { errData2 = await res.json(); } catch (_) {}
      throw new Error((errData2 && errData2.error) || ('Generation failed (' + res.status + '). Please try again.'));
    }

    // Email delivery → JSON { ok, remaining }
    var ct = res.headers.get('Content-Type') || '';
    if (ct.indexOf('application/json') !== -1) {
      var data = await res.json();
      refreshAllBadges();
      return data;
    }

    // Download delivery → binary blob
    var blob = await res.blob();
    var filename = (res.headers.get('Content-Disposition') || '').replace(/.*filename="([^"]+)".*/, '$1') || 'isitpolite-artifact';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 2000);
    refreshAllBadges();
    return null;
  }

  // Refresh the credits text in the modal from /api/credits (legacy, kept for compat).
  function refreshCreditsBadge(code) {
    refreshAllBadges();
  }

  // ── Dual-badge refresh ────────────────────────────────────────────────────
  // Fetches /api/credits and updates both the search and generation credit badges
  // plus the modal credits text. Call after any lookup, generate, or purchase.
  function refreshAllBadges() {
    var code = getUnlockCode();
    var url = '/api/credits' + (code ? '?code=' + encodeURIComponent(code) : '');
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;

        var freeSearch = (d.free && d.free.search) ? d.free.search.remaining : 0;
        var freeSearchLimit = (d.free && d.free.search) ? d.free.search.limit : 10;
        var freeGen = (d.free && d.free.generation) ? d.free.generation.remaining : 0;
        var freeGenLimit = (d.free && d.free.generation) ? d.free.generation.limit : 1;
        var pSearch = (d.purchased && d.purchased.search) ? d.purchased.search : { remaining: 0, total: 0 };
        var pGen = (d.purchased && d.purchased.generation) ? d.purchased.generation : { remaining: 0, total: 0 };

        // Search badge
        var sBadge = document.getElementById('search-credits-badge');
        if (sBadge) {
          var sHtml = '<span class="badge-free">Free: ' + freeSearch + '/' + freeSearchLimit + ' today</span>';
          if (pSearch.total > 0) sHtml += ' <span class="badge-paid">+' + pSearch.remaining + ' paid</span>';
          sHtml += ' <span class="badge-reset">Resets midnight Pacific</span>';
          sBadge.innerHTML = sHtml;
        }

        // Generation badge
        var gBadge = document.getElementById('gen-credits-badge');
        if (gBadge) {
          var gHtml = '<span class="badge-free">Free: ' + freeGen + '/' + freeGenLimit + ' today</span>';
          if (pGen.total > 0) gHtml += ' <span class="badge-paid">+' + pGen.remaining + ' paid</span>';
          gHtml += ' <span class="badge-reset">Resets midnight Pacific</span>';
          gBadge.innerHTML = gHtml;
        }

        // Modal credits text (ready-view)
        var creditsText = document.getElementById('premium-credits-text');
        if (creditsText) {
          if (pGen.total > 0) {
            creditsText.textContent = pGen.remaining + ' of ' + pGen.total + ' creation credits remaining';
          } else {
            creditsText.textContent = freeGen + ' free creation' + (freeGen === 1 ? '' : 's') + ' today';
          }
        }
      })
      .catch(function () {});
  }

  // ── Premium modal ────────────────────────────────────────────────────────
  var _paypalLoaded = false;
  var _paypalLoading = false;
  var selectedTierId = 't1';  // default tier for PayPal createOrder

  function loadPaypalSDK(clientId, currency) {
    return new Promise(function (resolve, reject) {
      if (_paypalLoaded) { resolve(); return; }
      if (_paypalLoading) { var t = setInterval(function () { if (_paypalLoaded) { clearInterval(t); resolve(); } }, 100); return; }
      _paypalLoading = true;
      var s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) + '&currency=' + encodeURIComponent(currency) + '&enable-funding=card&disable-funding=paylater';
      s.onload = function () { _paypalLoaded = true; _paypalLoading = false; resolve(); };
      s.onerror = function () { _paypalLoading = false; reject(new Error('PayPal SDK failed to load.')); };
      document.head.appendChild(s);
    });
  }

  function showPremiumError(elId, msg) {
    var el = document.getElementById(elId);
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }
  function hidePremiumError(elId) {
    var el = document.getElementById(elId);
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  }

  function switchPremiumView(view) { // 'buy' | 'ready'
    var buy = document.getElementById('premium-buy-view');
    var ready = document.getElementById('premium-ready-view');
    if (buy)   buy.classList.toggle('hidden',   view !== 'buy');
    if (ready) ready.classList.toggle('hidden', view !== 'ready');
  }

  // Render the 3-tier selection cards from server config data.
  function renderTierCards(tiers) {
    var grid = document.getElementById('premium-tier-grid');
    if (!grid || !tiers || !tiers.length) return;
    grid.innerHTML = '';
    tiers.forEach(function (t) {
      var isBest = (t.id === 't2');
      var card = document.createElement('label');
      card.className = 'premium-tier-card' + (isBest ? ' premium-tier-card--best' : '');
      card.setAttribute('for', 'tier-radio-' + t.id);
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'premium-tier';
      radio.id = 'tier-radio-' + t.id;
      radio.value = t.id;
      radio.checked = (t.id === selectedTierId);
      radio.addEventListener('change', function () { if (radio.checked) selectedTierId = t.id; });
      var pill = isBest ? '<span class="tier-best-pill" aria-label="Best value">Best value</span>' : '';
      card.innerHTML =
        pill +
        '<span class="tier-label">' + sanitize(t.label) + '</span>' +
        '<span class="tier-price">$' + sanitize(t.price) + '</span>' +
        '<span class="tier-credits">+' + t.search + ' searches &amp; +' + t.gen + ' creations</span>';
      card.insertBefore(radio, card.firstChild);
      grid.appendChild(card);
    });
  }

  // Open the premium modal. kind/params can be null when triggered by a 402 wall.
  // msg: optional server-supplied wall message to display at the top of the buy view.
  function openPremiumModal(kind, params, forceBuy, msg) {
    if (kind !== null) _pendingPremium = { kind: kind, params: params };
    var code = getUnlockCode();
    var premModal = document.getElementById('premium-modal');
    if (!premModal) return;

    // Show scenario textarea only for scenario kind.
    var scenWrap = document.getElementById('premium-scenario-wrap');
    if (scenWrap) scenWrap.classList.toggle('hidden', kind !== 'scenario');

    // Show the wall message if provided.
    var wallMsg = document.getElementById('premium-wall-msg');
    if (wallMsg) {
      if (msg) { wallMsg.textContent = msg; wallMsg.classList.remove('hidden'); }
      else { wallMsg.textContent = ''; wallMsg.classList.add('hidden'); }
    }

    if (!forceBuy && code) {
      switchPremiumView('ready');
      refreshAllBadges();
    } else {
      switchPremiumView('buy');
      // Lazy-load PayPal SDK and tier data.
      fetch('/api/paypal-config')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cfg) {
          if (!cfg || !cfg.clientId) return;
          // Render tier cards from server config (data-driven — no hardcoded prices).
          if (cfg.tiers) renderTierCards(cfg.tiers);
          return loadPaypalSDK(cfg.clientId, cfg.currency || 'USD').then(function () {
            var container = document.getElementById('paypal-button-container');
            if (!container || !window.paypal) return;
            // Clear any previously rendered buttons.
            container.innerHTML = '';
            window.paypal.Buttons({
              style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' },
              createOrder: function () {
                // Send the selected tier — server reads custom_id back at capture.
                return fetch('/api/checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tier: selectedTierId }),
                })
                  .then(function (r) { return r.json(); })
                  .then(function (d) {
                    if (d.error) throw new Error(d.error);
                    return d.orderID;
                  });
              },
              onApprove: function (data) {
                var emailInput = document.getElementById('pp-email-input');
                var emailVal = emailInput ? emailInput.value.trim() : '';
                var payBody = { orderID: data.orderID };
                if (emailVal) payBody.email = emailVal;
                return fetch('/api/capture', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payBody),
                }).then(function (r) { return r.json(); }).then(function (d) {
                  if (d.error) { showPremiumError('premium-pay-error', d.error); return; }
                  setUnlockCode(d.code);
                  // Show the "save your code" notice (it's the only receipt).
                  var saveNotice = document.getElementById('premium-save-notice');
                  if (saveNotice) saveNotice.classList.remove('hidden');
                  switchPremiumView('ready');
                  refreshAllBadges();
                }).catch(function (e) {
                  showPremiumError('premium-pay-error', e.message || 'Payment failed. Please try again.');
                });
              },
              onError: function (err) {
                showPremiumError('premium-pay-error', 'PayPal error. Please try again or use a card.');
              },
            }).render('#paypal-button-container');
          });
        })
        .catch(function () {});
    }

    premModal.classList.remove('hidden');
    // Return focus to the modal for keyboard users.
    setTimeout(function () {
      var firstFocusable = premModal.querySelector('button, input, [tabindex="0"]');
      if (firstFocusable) firstFocusable.focus();
    }, 100);
  }

  function wirePremiumModal() {
    var premModal   = document.getElementById('premium-modal');
    var closeBtn    = document.getElementById('premium-close');
    var applyBtn    = document.getElementById('premium-code-apply');
    var codeInput   = document.getElementById('premium-code-input');
    var genBtn      = document.getElementById('premium-generate-btn');
    var changeCode  = document.getElementById('premium-change-code');
    var ppEmailRadio = document.getElementById('pp-email-radio');
    var ppDlRadio   = document.getElementById('pp-dl-radio');
    var ppEmailField = document.getElementById('pp-email-field');
    var rdyEmailRadio = document.getElementById('rdy-email-radio');
    var rdyDlRadio  = document.getElementById('rdy-dl-radio');
    var rdyEmailField = document.getElementById('rdy-email-field');

    if (!premModal) return;

    if (closeBtn) closeBtn.addEventListener('click', function () { premModal.classList.add('hidden'); });
    premModal.addEventListener('click', function (e) { if (e.target === premModal) premModal.classList.add('hidden'); });
    // Escape key closes the modal (a11y: focus trap + Escape).
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !premModal.classList.contains('hidden')) {
        premModal.classList.add('hidden');
      }
    });

    // Email toggle (buy view)
    if (ppEmailRadio && ppDlRadio && ppEmailField) {
      function togglePpEmail() { ppEmailField.classList.toggle('hidden', !ppEmailRadio.checked); }
      ppEmailRadio.addEventListener('change', togglePpEmail);
      ppDlRadio.addEventListener('change', togglePpEmail);
    }
    // Email toggle (ready view)
    if (rdyEmailRadio && rdyDlRadio && rdyEmailField) {
      function toggleRdyEmail() { rdyEmailField.classList.toggle('hidden', !rdyEmailRadio.checked); }
      rdyEmailRadio.addEventListener('change', toggleRdyEmail);
      rdyDlRadio.addEventListener('change', toggleRdyEmail);
    }

    // "Apply" an existing code.
    if (applyBtn && codeInput) {
      applyBtn.addEventListener('click', function () {
        hidePremiumError('premium-code-error');
        var code = (codeInput.value || '').trim();
        if (!code) { showPremiumError('premium-code-error', 'Please enter your unlock code.'); return; }
        fetch('/api/credits?code=' + encodeURIComponent(code))
          .then(function (r) { return r.json(); })
          .then(function (d) {
            // Accept if the code has either search OR generation credits remaining.
            var hasCredits = d.valid || (d.purchased && (
              (d.purchased.search && d.purchased.search.remaining > 0) ||
              (d.purchased.generation && d.purchased.generation.remaining > 0)
            ));
            if (!hasCredits) {
              showPremiumError('premium-code-error', 'Code not found or no credits remaining.'); return;
            }
            setUnlockCode(code);
            switchPremiumView('ready');
            refreshAllBadges();
          })
          .catch(function () { showPremiumError('premium-code-error', 'Could not verify code. Please try again.'); });
      });
    }

    // "Use a different code"
    if (changeCode) {
      changeCode.addEventListener('click', function () {
        setUnlockCode('');
        switchPremiumView('buy');
      });
    }

    // Scenario PII guard
    var scenInput = document.getElementById('premium-scenario-input');
    if (scenInput) {
      scenInput.addEventListener('input', function () {
        var msg = piiMessage(scenInput.value);
        var piiEl = document.getElementById('premium-scenario-pii-msg');
        if (piiEl) { piiEl.textContent = msg || ''; piiEl.classList.toggle('hidden', !msg); }
      });
    }

    // Generate button
    if (genBtn) {
      genBtn.addEventListener('click', function () {
        if (!_pendingPremium) return;
        hidePremiumError('premium-gen-error');

        var rdyEmail = document.getElementById('rdy-email-radio');
        var delivery = (rdyEmail && rdyEmail.checked) ? 'email' : 'download';
        var email = '';
        if (delivery === 'email') {
          var rdyEmailInput = document.getElementById('rdy-email-input');
          email = rdyEmailInput ? rdyEmailInput.value.trim() : '';
          if (!email) { showPremiumError('premium-gen-error', 'Please enter your email address.'); return; }
        }

        var params = Object.assign({}, _pendingPremium.params);
        // Inject scenario text if applicable.
        if (_pendingPremium.kind === 'scenario') {
          var scenText = document.getElementById('premium-scenario-input');
          params.scenario = scenText ? scenText.value.trim() : '';
          if (!params.scenario) { showPremiumError('premium-gen-error', 'Please describe your scenario.'); return; }
          var piiCheck = piiMessage(params.scenario);
          if (piiCheck) { showPremiumError('premium-gen-error', piiCheck); return; }
        }

        genBtn.disabled = true;
        genBtn.textContent = 'Generating…';

        generatePremium(_pendingPremium.kind, params, delivery, email)
          .then(function (result) {
            genBtn.disabled = false;
            genBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Generate';
            if (result && result.ok) {
              // Email delivered — show confirmation.
              showPremiumError('premium-gen-error', '✓ Sent! Check your inbox.');
              document.getElementById('premium-gen-error').classList.remove('hidden');
              document.getElementById('premium-gen-error').style.color = 'var(--polite)';
            } else {
              premModal.classList.add('hidden');
            }
          })
          .catch(function (e) {
            genBtn.disabled = false;
            genBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Generate';
            showPremiumError('premium-gen-error', e.message || 'Generation failed. Please try again.');
          });
      });
    }
  }

  // ── Premium CTA button factory ───────────────────────────────────────────
  // Mirrors addShareButton (L389). Appended to the result container.
  var PREMIUM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  function addPremiumButton(container, label, kind, params) {
    if (!container) return;
    var existing = container.querySelector('.premium-action-row');
    if (existing) existing.remove();

    var row = document.createElement('div');
    row.className = 'premium-action-row';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'premium-btn';
    btn.innerHTML = PREMIUM_ICON + ' ' + label;
    btn.addEventListener('click', function () {
      openPremiumModal(kind, params, false);
    });

    row.appendChild(btn);
    container.appendChild(row);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API
  // ═══════════════════════════════════════════════════════════════════════
  // Calls the server-side retrieval-augmented agent (/api/lookup) and returns
  // the final structured result. The prompt + Tavily retrieval live server-side.
  async function callLookup(mode, params) {
    var res;
    try {
      res = await fetch(API_LOOKUP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the stored unlock code (may be empty string — server normalises it).
        body: JSON.stringify(Object.assign({ mode: mode, unlock: getUnlockCode() }, params)),
      });
    } catch (_) {
      throw new Error('No internet connection. Please check your network and try again.');
    }

    var data = null;
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      // 402 daily_exhausted / no credits → open buy modal with the server message.
      if (res.status === 402 && data && data.upsell) {
        openPremiumModal(null, null, true, data.error);
        return null;
      }
      // 429 — surface the server error text (do not swallow it with a hardcoded string).
      if (res.status === 429) throw new Error((data && data.error) || 'Rate limit reached. Please wait a moment and try again.');
      throw new Error((data && data.error) || ('Service error (' + res.status + '). Please try again.'));
    }
    if (!data) throw new Error('The response could not be parsed. Please try again.');
    if (data.error) throw new Error(data.error);
    refreshAllBadges();
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  function verdictClass(v) {
    return { polite: 'verdict-polite', caution: 'verdict-caution', rude: 'verdict-rude' }[v] || 'verdict-caution';
  }

  function confidenceBadge(level) {
    var c = String(level || '').toLowerCase();
    if (c !== 'high' && c !== 'medium' && c !== 'low') return '';
    var label = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[c];
    var dots = { high: 3, medium: 2, low: 1 }[c];
    var pips = '';
    for (var i = 0; i < 3; i++) pips += '<span class="conf-pip' + (i < dots ? ' on' : '') + '"></span>';
    return '<span class="confidence-badge conf-' + c + '" title="' + label + '">' +
             '<span class="conf-pips" aria-hidden="true">' + pips + '</span>' + label +
           '</span>';
  }

  function sanitize(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PII GUARD — block obvious personal data before anything is sent to the AI
  // (high-precision client-side patterns; server-side AI still strips the rest)
  // ═══════════════════════════════════════════════════════════════════════
  function luhnValid(s) {
    var sum = 0, alt = false;
    for (var i = s.length - 1; i >= 0; i--) {
      var n = +s[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  function piiMessage(text) {
    if (!text) return null;
    var pre = 'Please remove personal info';
    var tail = ' before submitting — this tool never needs it.';
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) return pre + ' (email address)' + tail;
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) return pre + ' (looks like an SSN/ID)' + tail;
    if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)) return pre + ' (IP address)' + tail;
    var cc = text.match(/\b(?:\d[ -]?){13,19}\b/);
    if (cc) { var dcc = cc[0].replace(/\D/g, ''); if (dcc.length >= 13 && dcc.length <= 19 && luhnValid(dcc)) return pre + ' (looks like a card number)' + tail; }
    var ph = text.match(/\+?\d[\d\s().-]{7,}\d/);
    if (ph) { var dph = ph[0].replace(/\D/g, ''); if (dph.length >= 9 && dph.length <= 15) return pre + ' (looks like a phone number)' + tail; }
    if (/\b\d{9,}\b/.test(text)) return pre + ' (long number — may be a personal ID)' + tail;
    return null;
  }

  function flashFieldMsg(el, msg) {
    var holder = el.parentNode;
    var m = holder.querySelector('.pii-msg');
    if (!m) { m = document.createElement('p'); m.className = 'pii-msg'; m.setAttribute('role', 'alert'); holder.appendChild(m); }
    m.textContent = msg;
    el.classList.add('field-error');
    var clear = function () { m.textContent = ''; el.classList.remove('field-error'); el.removeEventListener('input', clear); };
    el.addEventListener('input', clear);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMMUNITY ACCURACY · REPORTING · FEEDBACK
  // ═══════════════════════════════════════════════════════════════════════
  function vkeyClient(g, c, ctx) {
    return (g || '').toLowerCase().trim().replace(/\s+/g, ' ') + '|' + c + '|' + (ctx || 'general');
  }
  function hasVoted(vkey) { try { return !!localStorage.getItem('voted_' + vkey); } catch (_) { return false; } }
  function markVoted(vkey) { try { localStorage.setItem('voted_' + vkey, '1'); } catch (_) {} }

  function paintAccChip(wrap, d) {
    var chip = wrap.querySelector('.acc-chip');
    if (!chip) return;
    if (!d || d.accuracy === null || d.accuracy === undefined || d.status === 'insufficient') {
      chip.className = 'acc-chip acc-new';
      chip.textContent = 'Community accuracy: not rated yet';
    } else {
      var cls = d.accuracy >= 80 ? 'acc-high' : (d.accuracy >= 50 ? 'acc-mid' : 'acc-low');
      chip.className = 'acc-chip ' + cls;
      chip.textContent = 'Community accuracy: ' + d.accuracy + '% · ' + d.total + ' votes';
    }
  }

  function addReportControls(g, c, ctx, verdict, label) {
    var card = resultArea.querySelector('.result-card');
    if (!card) return;
    var vkey = vkeyClient(g, c, ctx);

    var wrap = document.createElement('div');
    wrap.className = 'accuracy-bar';
    wrap.innerHTML =
      '<div class="acc-left"><span class="acc-chip acc-loading">Community accuracy: …</span></div>' +
      '<div class="acc-actions"></div>';
    card.appendChild(wrap);

    fetch('/api/accuracy?g=' + encodeURIComponent(g) + '&c=' + encodeURIComponent(c) + '&ctx=' + encodeURIComponent(ctx))
      .then(function (r) { return r.json(); })
      .then(function (d) { paintAccChip(wrap, d); })
      .catch(function () { paintAccChip(wrap, null); });

    var actions = wrap.querySelector('.acc-actions');
    if (hasVoted(vkey)) {
      actions.innerHTML = '<span class="acc-voted">✓ Thanks for your feedback</span>';
      return;
    }

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'acc-btn acc-confirm';
    confirmBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><line x1="7" y1="22" x2="7" y2="11"/></svg> Accurate';
    var reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.className = 'acc-btn acc-report';
    reportBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> Report inaccuracy';
    actions.appendChild(confirmBtn);
    actions.appendChild(reportBtn);

    confirmBtn.addEventListener('click', function () {
      sendReport({ gesture: g, country: c, context: ctx, verdict: verdict, verdict_label: label, kind: 'confirm' }, wrap, vkey, null, confirmBtn);
    });
    reportBtn.addEventListener('click', function () { openReportForm(wrap, actions, g, c, ctx, verdict, label, vkey); });
  }

  function openReportForm(wrap, actions, g, c, ctx, verdict, label, vkey) {
    actions.style.display = 'none';
    var form = document.createElement('div');
    form.className = 'report-form';
    form.innerHTML =
      '<label class="report-label">What\'s inaccurate? <span>(an AI moderator screens reports, so genuine corrections help)</span></label>' +
      '<textarea class="report-text" rows="3" maxlength="600" placeholder="e.g. In rural areas this is actually considered…"></textarea>' +
      '<p class="report-fineprint">Anonymized automatically — please don\'t include personal details.</p>' +
      '<div class="report-actions"><button type="button" class="acc-btn report-cancel">Cancel</button><button type="button" class="btn-cta report-submit">Submit report</button></div>' +
      '<div class="report-msg" aria-live="polite"></div>';
    wrap.appendChild(form);
    var ta = form.querySelector('.report-text');
    ta.focus();
    form.querySelector('.report-cancel').addEventListener('click', function () {
      form.remove(); actions.style.display = '';
    });
    form.querySelector('.report-submit').addEventListener('click', function () {
      var txt = ta.value.trim();
      var msg = form.querySelector('.report-msg');
      if (txt.length < 4) { msg.textContent = 'Please add a little more detail.'; return; }
      var rPii = piiMessage(txt);
      if (rPii) { msg.textContent = rPii; return; }
      var btn = form.querySelector('.report-submit');
      sendReport({ gesture: g, country: c, context: ctx, verdict: verdict, verdict_label: label, kind: 'dispute', correction: txt }, wrap, vkey, msg, btn);
    });
  }

  function sendReport(payload, wrap, vkey, msgEl, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        markVoted(vkey);
        if (d && typeof d.accuracy !== 'undefined') paintAccChip(wrap, d);
        var form = wrap.querySelector('.report-form'); if (form) form.remove();
        var actions = wrap.querySelector('.acc-actions');
        if (actions) { actions.style.display = ''; actions.innerHTML = '<span class="acc-voted">✓ Thanks — your input was recorded</span>'; }
      })
      .catch(function () {
        if (msgEl) msgEl.textContent = 'Could not submit. Please try again.';
        if (btn) { btn.disabled = false; btn.textContent = 'Submit report'; }
      });
  }

  // ── Community view ────────────────────────────────────────────────────
  function renderCommunity() {
    var el = document.getElementById('community-content');
    if (!el) return;
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading community accuracy…</p></div>';
    fetch('/api/community')
      .then(function (r) { return r.json(); })
      .then(function (d) { paintCommunity(el, d); })
      .catch(function () {
        el.innerHTML = '<div class="error-card" role="alert"><p class="error-message">Couldn\'t load community stats. Please try again.</p></div>';
      });
  }

  function communityRow(item) {
    var cls = item.accuracy >= 80 ? 'acc-high' : (item.accuracy >= 50 ? 'acc-mid' : 'acc-low');
    var ctxLabel = (CONTEXT_LABELS[item.context] || item.context || '').split(' / ')[0];
    return '<div class="comm-row">' +
      '<div class="comm-row-main"><span class="comm-gesture">' + sanitize(item.gesture) + '</span>' +
      '<span class="comm-meta">' + sanitize(item.country) + (ctxLabel ? ' · ' + sanitize(ctxLabel) : '') + '</span></div>' +
      '<span class="comm-acc ' + cls + '">' + item.accuracy + '%</span>' +
      '</div>';
  }

  function paintCommunity(el, d) {
    if (!d || d.error) { el.innerHTML = '<div class="error-card"><p class="error-message">No data available.</p></div>'; return; }

    if (!d.verdicts_tracked || (d.total_confirms + d.total_disputes) === 0) {
      el.innerHTML =
        '<div class="comm-empty"><div class="comm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg></div>' +
        '<p>No community votes yet.<br>Run a check and tap <strong>Accurate</strong> or <strong>Report inaccuracy</strong> to be the first to shape a verdict.</p></div>';
      return;
    }

    var overall = (d.overall_accuracy === null || d.overall_accuracy === undefined) ? '—' : d.overall_accuracy + '%';
    var oCls = (d.overall_accuracy >= 80) ? 'acc-high' : (d.overall_accuracy >= 50 ? 'acc-mid' : 'acc-low');

    var confirmed = (d.most_confirmed || []).map(communityRow).join('') || '<p class="comm-none">Nothing yet.</p>';
    var disputed = (d.most_disputed || []).map(communityRow).join('') || '<p class="comm-none">No disputed verdicts — nice!</p>';

    el.innerHTML =
      '<div class="comm-stats">' +
        '<div class="comm-stat"><div class="comm-ring ' + oCls + '"><span>' + overall + '</span></div><div class="comm-stat-label">Overall accuracy</div></div>' +
        '<div class="comm-stat"><div class="comm-num">' + d.total_confirms + '</div><div class="comm-stat-label">Confirmations</div></div>' +
        '<div class="comm-stat"><div class="comm-num">' + d.total_disputes + '</div><div class="comm-stat-label">Corroborated disputes</div></div>' +
        '<div class="comm-stat"><div class="comm-num">' + d.verdicts_tracked + '</div><div class="comm-stat-label">Verdicts tracked</div></div>' +
      '</div>' +
      '<div class="comm-cols">' +
        '<div class="comm-col"><h3 class="comm-col-title">Most confirmed</h3>' + confirmed + '</div>' +
        '<div class="comm-col"><h3 class="comm-col-title">Most disputed</h3>' + disputed + '</div>' +
      '</div>' +
      '<p class="comm-note">Accuracy is shown once a verdict has at least 3 votes. Disputes only count after independent corroboration and AI screening.</p>';
  }

  // ── Donate modal + gentle post-check nudge ────────────────────────────
  function openDonate() { var m = document.getElementById('donate-modal'); if (m) m.classList.remove('hidden'); }
  function closeDonate() { var m = document.getElementById('donate-modal'); if (m) m.classList.add('hidden'); }

  function maybeShowDonateNudge() {
    try {
      if (localStorage.getItem('donate_nudge_off')) return;
      var n = (parseInt(localStorage.getItem('ip_checks') || '0', 10) || 0) + 1;
      localStorage.setItem('ip_checks', String(n));
      if (n === 3 || (n > 3 && n % 12 === 0)) showDonateNudge();
    } catch (_) {}
  }
  function showDonateNudge() {
    if (!resultArea || resultArea.querySelector('.donate-nudge')) return;
    var el = document.createElement('div');
    el.className = 'donate-nudge';
    el.innerHTML =
      '<span class="donate-nudge-text">Enjoying IsItPolite? It\'s free &amp; ad-free — a small tip keeps it running.</span>' +
      '<span class="donate-nudge-actions">' +
        '<button type="button" class="donate-nudge-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg> Support</button>' +
        '<button type="button" class="donate-nudge-dismiss" aria-label="Dismiss">&times;</button>' +
      '</span>';
    resultArea.appendChild(el);
    el.querySelector('.donate-nudge-btn').addEventListener('click', openDonate);
    el.querySelector('.donate-nudge-dismiss').addEventListener('click', function () {
      try { localStorage.setItem('donate_nudge_off', '1'); } catch (_) {}
      el.remove();
    });
  }

  // ── Feedback modal ────────────────────────────────────────────────────
  function openFeedback() {
    var m = document.getElementById('feedback-modal');
    if (m) { m.classList.remove('hidden'); var t = document.getElementById('feedback-text'); if (t) t.focus(); }
  }
  function closeFeedback() {
    var m = document.getElementById('feedback-modal');
    if (m) m.classList.add('hidden');
  }
  function submitFeedback() {
    var t = document.getElementById('feedback-text');
    var resEl = document.getElementById('feedback-result');
    var btn = document.getElementById('feedback-send');
    var msg = (t.value || '').trim();
    if (msg.length < 3) { resEl.textContent = 'Please write a little more.'; return; }
    var fPii = piiMessage(msg);
    if (fPii) { resEl.style.color = 'var(--rude)'; resEl.textContent = fPii; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) })
      .then(function (r) { return r.json(); })
      .then(function () {
        resEl.innerHTML = '<span class="acc-voted">✓ Thank you! Your feedback was received.</span>';
        t.value = '';
        setTimeout(closeFeedback, 1600);
      })
      .catch(function () { resEl.textContent = 'Could not send. Please try again.'; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Send feedback'; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOM COMBOBOX — progressively enhances every native <select>
  // The native <select> stays in the DOM (value store + accessible fallback);
  // its `value` setter is intercepted so programmatic changes sync the UI.
  // ═══════════════════════════════════════════════════════════════════════
  var CHEVRON = '<svg class="cbx-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHECK   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="15" height="15" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  var openCombobox = null; // only one open at a time

  function enhanceAllSelects() {
    if (!window.HTMLSelectElement || !document.querySelector) return;
    Array.prototype.forEach.call(document.querySelectorAll('select'), enhanceSelect);
  }

  function enhanceSelect(select) {
    if (select.dataset.cbx) return;
    select.dataset.cbx = '1';

    var opts = Array.prototype.slice.call(select.options);
    var hasPlaceholder = opts.length && opts[0].value === '';
    var placeholder = hasPlaceholder ? opts[0].textContent : 'Select…';
    var realOpts = opts.filter(function (o) { return o.value !== ''; });
    var searchable = realOpts.length > 8;

    // Wrapper + hide native select (kept for value + form semantics)
    var wrap = document.createElement('div');
    wrap.className = 'cbx';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('cbx-native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    var sid = select.id || ('sel-' + Math.random().toString(36).slice(2, 8));
    var triggerId = sid + '-cbx';
    var panelId = sid + '-panel';
    var listId = sid + '-list';

    // Re-point the <label> to the trigger
    var label = select.id ? document.querySelector('label[for="' + select.id + '"]') : null;
    var labelId = null;
    if (label) { labelId = sid + '-label'; label.id = labelId; label.setAttribute('for', triggerId); }

    // Trigger (div, not <button> — avoids native Enter/Space activation clashing
    // with our custom keyboard handling)
    var trigger = document.createElement('div');
    trigger.id = triggerId;
    trigger.className = 'cbx-trigger';
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panelId);
    if (!searchable) trigger.setAttribute('role', 'combobox');
    if (labelId) trigger.setAttribute('aria-labelledby', labelId);
    else if (select.getAttribute('aria-label')) trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
    trigger.innerHTML = '<span class="cbx-value"></span>' + CHEVRON;
    wrap.appendChild(trigger);

    // Panel
    var panel = document.createElement('div');
    panel.className = 'cbx-panel';
    panel.id = panelId;

    var searchInput = null;
    if (searchable) {
      var sw = document.createElement('div');
      sw.className = 'cbx-search-wrap';
      sw.innerHTML = SEARCH_ICON;
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'cbx-search';
      searchInput.setAttribute('placeholder', 'Search…');
      searchInput.setAttribute('role', 'combobox');
      searchInput.setAttribute('aria-autocomplete', 'list');
      searchInput.setAttribute('aria-expanded', 'true');
      searchInput.setAttribute('aria-controls', listId);
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('aria-label', (select.getAttribute('aria-label') || 'Options') + ' — search');
      sw.appendChild(searchInput);
      panel.appendChild(sw);
    }

    var list = document.createElement('div');
    list.id = listId;
    list.className = 'cbx-list';
    list.setAttribute('role', 'listbox');
    if (labelId) list.setAttribute('aria-labelledby', labelId);

    var rows = realOpts.map(function (o, i) {
      var row = document.createElement('div');
      row.className = 'cbx-option';
      row.id = panelId + '-opt-' + i;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      row.dataset.value = o.value;
      row.innerHTML = '<span class="cbx-opt-label">' + sanitize(o.textContent) + '</span><span class="cbx-check">' + CHECK + '</span>';
      list.appendChild(row);
      return row;
    });

    var empty = document.createElement('div');
    empty.className = 'cbx-empty hidden';
    empty.textContent = 'No matches';
    list.appendChild(empty);

    panel.appendChild(list);
    wrap.appendChild(panel);

    // ── Native value setter interception (sync UI on programmatic change) ──
    var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(select, 'value', {
      configurable: true,
      get: function () { return desc.get.call(select); },
      set: function (v) { desc.set.call(select, v); syncDisplay(); },
    });

    var controller = searchable ? searchInput : trigger;
    var activeRow = null;

    function syncDisplay() {
      var optEl = select.options[select.selectedIndex];
      var isPh = !optEl || optEl.value === '';
      var valEl = trigger.querySelector('.cbx-value');
      valEl.textContent = isPh ? placeholder : optEl.textContent;
      valEl.classList.toggle('cbx-placeholder', isPh);
      rows.forEach(function (r) {
        r.setAttribute('aria-selected', String(!isPh && r.dataset.value === optEl.value));
      });
    }

    function visibleRows() { return rows.filter(function (r) { return !r.classList.contains('cbx-hidden'); }); }

    function setActive(row) {
      if (activeRow) activeRow.classList.remove('cbx-active');
      activeRow = row;
      if (row) {
        row.classList.add('cbx-active');
        controller.setAttribute('aria-activedescendant', row.id);
        var rt = row.offsetTop, rb = rt + row.offsetHeight;
        if (rt < list.scrollTop) list.scrollTop = rt - 4;
        else if (rb > list.scrollTop + list.clientHeight) list.scrollTop = rb - list.clientHeight + 4;
      } else {
        controller.removeAttribute('aria-activedescendant');
      }
    }

    function moveActive(dir) {
      var vis = visibleRows();
      if (!vis.length) return;
      var idx = activeRow ? vis.indexOf(activeRow) : -1;
      idx = (idx + dir + vis.length) % vis.length;
      setActive(vis[idx]);
    }

    function filter(q) {
      q = q.trim().toLowerCase();
      var any = false;
      rows.forEach(function (r) {
        var match = !q || r.dataset.value.toLowerCase().indexOf(q) !== -1;
        r.classList.toggle('cbx-hidden', !match);
        if (match) any = true;
      });
      empty.classList.toggle('hidden', any);
      var vis = visibleRows();
      setActive(vis.length ? vis[0] : null);
    }

    function open() {
      if (openCombobox && openCombobox !== close) openCombobox();
      openCombobox = close;
      // flip up if not enough room below
      var r = trigger.getBoundingClientRect();
      var below = window.innerHeight - r.bottom;
      panel.classList.toggle('cbx-panel--up', below < 300 && r.top > below);
      wrap.classList.add('cbx-open');
      trigger.setAttribute('aria-expanded', 'true');

      if (searchInput) { searchInput.value = ''; filter(''); }
      var selected = rows.filter(function (r2) { return r2.getAttribute('aria-selected') === 'true'; })[0];
      setActive(selected || visibleRows()[0] || null);

      if (searchInput) setTimeout(function () { searchInput.focus(); }, 20);
      document.addEventListener('pointerdown', onDocDown, true);
    }

    function close(focusTrigger) {
      wrap.classList.remove('cbx-open');
      trigger.setAttribute('aria-expanded', 'false');
      controller.removeAttribute('aria-activedescendant');
      if (activeRow) { activeRow.classList.remove('cbx-active'); activeRow = null; }
      document.removeEventListener('pointerdown', onDocDown, true);
      if (openCombobox === close) openCombobox = null;
      if (focusTrigger) trigger.focus();
    }

    function isOpen() { return wrap.classList.contains('cbx-open'); }

    function onDocDown(e) { if (!wrap.contains(e.target)) close(false); }

    function selectRow(row) {
      if (!row) return;
      select.value = row.dataset.value;                 // triggers syncDisplay via setter
      select.dispatchEvent(new Event('change', { bubbles: true }));
      close(true);
    }

    function onKeydown(e) {
      var inSearch = (e.currentTarget === searchInput);
      if (!isOpen()) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || (e.key === ' ' && !inSearch)) {
          e.preventDefault(); open();
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); moveActive(1); break;
        case 'ArrowUp':   e.preventDefault(); moveActive(-1); break;
        case 'Home':      e.preventDefault(); setActive(visibleRows()[0] || null); break;
        case 'End':       e.preventDefault(); var v = visibleRows(); setActive(v[v.length - 1] || null); break;
        case 'Enter':     e.preventDefault(); selectRow(activeRow); break;
        case 'Escape':    e.preventDefault(); close(true); break;
        case 'Tab':       close(false); break;
        case ' ':         if (!inSearch) { e.preventDefault(); selectRow(activeRow); } break;
        default: break;
      }
    }

    trigger.addEventListener('click', function () { isOpen() ? close(true) : open(); });
    trigger.addEventListener('keydown', onKeydown);
    if (searchInput) {
      searchInput.addEventListener('keydown', onKeydown);
      searchInput.addEventListener('input', function () { filter(searchInput.value); });
    }
    list.addEventListener('mousemove', function (e) {
      var row = e.target.closest ? e.target.closest('.cbx-option') : null;
      if (row && row !== activeRow) setActive(row);
    });
    list.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.cbx-option') : null;
      if (row) selectRow(row);
    });

    syncDisplay();
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
