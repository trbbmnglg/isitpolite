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

