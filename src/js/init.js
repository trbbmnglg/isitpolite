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

    populateAllSelects();
    enhanceAllSelects();
    initHome();
    pruneExpiredCaches();
    populateExamples();
    updateHistoryBadge();
    initOffline();
    registerSW();
    initRouter();
    initAccuracyLazy();
    initModalA11y();
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
    // Static SEO/legal pages link here as /?support=1 or /?feedback=1 (they
    // have no modals of their own) — open the modal, then drop the param.
    try {
      var qp = new URLSearchParams(location.search);
      var openOnArrival = qp.has('support') ? openDonate : qp.has('feedback') ? openFeedback : null;
      if (openOnArrival) {
        qp.delete('support'); qp.delete('feedback');
        var qs = qp.toString();
        history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
        openOnArrival();
      }
    } catch (_) {}

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
      history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VIEW ROUTER
  // ═══════════════════════════════════════════════════════════════════════
  // Routes: #/check  #/compare  #/compare/trip  #/guide  #/quiz  #/history
  // Old links (#/trip, #/community) are mapped onto their new homes.
  var ROUTE_VIEWS = ['check', 'compare', 'guide', 'quiz', 'history'];

  function parseRoute() {
    var parts = (location.hash || '').replace(/^#\/?/, '').split('/');
    var view = parts[0] || 'check', sub = parts[1] || '';
    if (view === 'trip') { view = 'compare'; sub = 'trip'; }
    if (view === 'community') { view = 'check'; sub = 'accuracy'; }
    if (ROUTE_VIEWS.indexOf(view) === -1) { view = 'check'; sub = ''; }
    return { view: view, sub: sub };
  }

  function navigate(view, sub) {
    var hash = '#/' + view + (sub ? '/' + sub : '');
    if (location.hash === hash) applyRoute(); else location.hash = hash;
  }

  function applyRoute() {
    var r = parseRoute();
    showView(r.view, r.sub);
  }

  function initRouter() {
    document.querySelectorAll('.nav-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { navigate(tab.dataset.view); });
    });
    var segAcross = document.getElementById('seg-across');
    var segTrip = document.getElementById('seg-trip');
    if (segAcross) segAcross.addEventListener('click', function () { navigate('compare'); });
    if (segTrip) segTrip.addEventListener('click', function () { navigate('compare', 'trip'); });
    window.addEventListener('hashchange', applyRoute);
    applyRoute();
  }

  // Kept as the single entry point other modules call (e.g. history re-check).
  function switchView(view, sub) { navigate(view, sub); }

  function showView(view, sub) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('view-active'); });
    document.querySelectorAll('.nav-tab').forEach(function (t) {
      t.classList.remove('nav-active');
      t.removeAttribute('aria-current');
    });

    var el = document.getElementById('view-' + view);
    if (el) el.classList.add('view-active');

    var tab = document.querySelector('.nav-tab[data-view="' + view + '"]');
    if (tab) { tab.classList.add('nav-active'); tab.setAttribute('aria-current', 'page'); }

    if (view === 'compare') {
      var trip = sub === 'trip';
      [['seg-across', 'cmp-panel-across', !trip], ['seg-trip', 'cmp-panel-trip', trip]].forEach(function (row) {
        var btn = document.getElementById(row[0]), panel = document.getElementById(row[1]);
        if (btn) { btn.setAttribute('aria-selected', row[2] ? 'true' : 'false'); btn.tabIndex = row[2] ? 0 : -1; }
        if (panel) panel.hidden = !row[2];
      });
    }

    if (view === 'history') renderHistoryView();
    if (view === 'guide') renderPacksStrip();

    var anchor = view === 'check' && sub === 'accuracy' ? document.getElementById('accuracy') : null;
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Load the community stats only once the accuracy section scrolls into view.
  function initAccuracyLazy() {
    var el = document.getElementById('accuracy');
    if (!el) return;
    var loaded = false;
    function load() { if (!loaded) { loaded = true; renderCommunity(); } }
    if (!('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { load(); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
  }

  // Shared modal behaviour: scroll lock, focus in/out, Escape, backdrop, Tab trap.
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function openModalEl() { return document.querySelector('.modal-overlay:not(.hidden)'); }
  function closeModalEl(m) {
    if (m.id === 'privacy-modal') _pendingConsentAction = null;
    m.classList.add('hidden');
  }
  function initModalA11y() {
    document.querySelectorAll('.modal-overlay').forEach(function (m) {
      var wasHidden = m.classList.contains('hidden'), opener = null;
      new MutationObserver(function () {
        var hidden = m.classList.contains('hidden');
        if (hidden === wasHidden) return;
        wasHidden = hidden;
        if (!hidden) {
          opener = document.activeElement;
          document.body.classList.add('modal-open');
          setTimeout(function () {
            var f = Array.prototype.filter.call(m.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; })[0];
            if (f && !m.contains(document.activeElement)) f.focus();
          }, 0);
        } else {
          if (!openModalEl()) document.body.classList.remove('modal-open');
          if (opener && opener.focus && document.contains(opener)) opener.focus();
          opener = null;
        }
      }).observe(m, { attributes: true, attributeFilter: ['class'] });

      m.addEventListener('click', function (e) {
        if (e.target === m && m.id !== 'privacy-modal') closeModalEl(m);
      });
    });

    document.addEventListener('keydown', function (e) {
      var m = openModalEl();
      if (!m) return;
      if (e.key === 'Escape') { closeModalEl(m); return; }
      if (e.key !== 'Tab') return;
      var items = Array.prototype.filter.call(m.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVACY MODAL
  // ═══════════════════════════════════════════════════════════════════════
  var _pendingConsentAction = null;
  function acceptPrivacy() {
    localStorage.setItem(PRIVACY_KEY, '1');
    privacyModal.classList.add('hidden');
    var pending = _pendingConsentAction;
    _pendingConsentAction = null;
    if (pending) pending(); else gestureInput.focus();
  }
  // Gate any data-submitting action on consent. Returns true if the caller
  // should proceed now; if consent hasn't been given, shows the modal and
  // re-runs `action` automatically once the visitor accepts.
  function requireConsent(action) {
    if (localStorage.getItem(PRIVACY_KEY)) return true;
    _pendingConsentAction = action || null;
    privacyModal.classList.remove('hidden');
    return false;
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

  // ═══════════════════════════════════════════════════════════════════════
  // HOME COUNTRY (device-only; tailors answers to where the traveler is from)
  // ═══════════════════════════════════════════════════════════════════════
  var homeSelectEl, homeLineEl, homePickerEl;

  function initHome() {
    homeSelectEl = document.getElementById('home-select');
    homeLineEl   = document.getElementById('home-line');
    homePickerEl = document.getElementById('home-picker');
    if (!homeSelectEl || !homeLineEl || !homePickerEl) return;

    homeSelectEl.value = getHome();
    homeSelectEl.addEventListener('change', function () {
      setHome(homeSelectEl.value);
      homePickerEl.classList.add('hidden');
      renderHomeLine();
      applyHomeDefaults();
      var toggle = homeLineEl.querySelector('.home-toggle');
      if (toggle) toggle.focus();
    });
    homeLineEl.addEventListener('click', function (e) {
      if (!e.target.closest('.home-toggle')) return;
      var opening = homePickerEl.classList.contains('hidden');
      homePickerEl.classList.toggle('hidden', !opening);
      e.target.setAttribute('aria-expanded', opening ? 'true' : 'false');
      if (opening) focusField(homeSelectEl);
    });
    renderHomeLine();
    applyHomeDefaults();
  }

  function renderHomeLine() {
    var home = getHome();
    var toggle = '<button type="button" class="link-btn home-toggle" aria-controls="home-picker" aria-expanded="false">';
    homeLineEl.innerHTML = home
      ? 'Tailored for travelers from <strong>' + sanitize(home) + '</strong> · ' + toggle + 'Change</button>'
      : toggle + 'Add where you\'re from</button> to see what changes for you.';
  }

  // Prefill (never overwrite) the other "from" fields with the saved home country.
  function applyHomeDefaults() {
    var home = getHome();
    if (!home) return;
    if (compareC1 && !compareC1.value) compareC1.value = home;
    if (tripFromEl && !tripFromEl.value) tripFromEl.value = home;
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
    var homeSel = document.getElementById('home-select');
    if (homeSel) populateSelectWithCountries(homeSel);
  }

  function populateExamples() {
    if (!examplesGrid) return;
    var frag = document.createDocumentFragment();
    EXAMPLES.forEach(function (ex, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'example-chip chip-enter';
      btn.style.animationDelay = (i * 55) + 'ms';
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

