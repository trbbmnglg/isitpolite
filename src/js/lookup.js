  // ── Premium CTA button factory ───────────────────────────────────────────
  // Mirrors addShareButton (L389). Appended to the result container.
  var PREMIUM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  var ALERT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  function addPremiumButton(container, label, kind, params) {
    if (!container) return;
    var row = container.querySelector(':scope > .premium-action-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'premium-action-row';
      container.appendChild(row);
    }
    var dup = Array.prototype.find.call(row.querySelectorAll('.premium-btn'), function (b) { return b.dataset.kind === kind; });
    if (dup) dup.remove();

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'premium-btn';
    btn.dataset.kind = kind;
    btn.innerHTML = PREMIUM_ICON + ' ' + label;
    btn.addEventListener('click', function () {
      openPremiumModal(kind, params, false);
    });

    row.appendChild(btn);
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
      // 402 daily_exhausted / no credits → open buy modal with the server message,
      // then throw so no caller ever caches or renders a non-result.
      if (res.status === 402 && data && data.upsell) {
        openPremiumModal(null, null, true, data.error);
        var upsellErr = new Error(data.error || 'You have used your free checks for today.');
        upsellErr.upsell = true;
        throw upsellErr;
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

