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

    if (!forceBuy && (code || _freeGenRemaining > 0)) {
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

