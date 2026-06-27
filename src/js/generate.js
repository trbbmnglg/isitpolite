  // ═══════════════════════════════════════════════════════════════════════
  // PREMIUM GENERATION
  // ═══════════════════════════════════════════════════════════════════════

  // Current pending generation request (set by addPremiumButton; read by modal).
  var _pendingPremium = null;   // { kind, params }
  var _freeGenRemaining = 1;   // optimistic default; updated by refreshAllBadges()

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
        _freeGenRemaining = freeGen;  // keep modal gate in sync
        var pSearch = (d.purchased && d.purchased.search) ? d.purchased.search : { remaining: 0, total: 0 };
        var pGen = (d.purchased && d.purchased.generation) ? d.purchased.generation : { remaining: 0, total: 0 };

        // Search hint (inside form card — subtle inline text)
        var sBadge = document.getElementById('search-credits-badge');
        if (sBadge) {
          var sCountClass = freeSearch <= 2 ? 'hint-count--warn' : 'hint-count';
          var sHtml = '<span class="' + sCountClass + '">' + freeSearch + '/' + freeSearchLimit + ' free checks</span>'
                    + '<span class="hint-sep">·</span>resets midnight Pacific';
          if (pSearch.total > 0) {
            sHtml += '<span class="hint-sep">·</span><span class="hint-count--paid">' + pSearch.remaining + ' paid</span>';
          }
          sBadge.innerHTML = sHtml;
        }

        // Generation badge (inside premium area — keeps pill style)
        var gBadge = document.getElementById('gen-credits-badge');
        if (gBadge) {
          var gHtml = '<span class="badge-free">Free: ' + freeGen + '/' + freeGenLimit + '</span>';
          if (pGen.total > 0) gHtml += ' <span class="badge-paid">+' + pGen.remaining + ' paid</span>';
          gHtml += ' <span class="badge-reset">· resets midnight Pacific</span>';
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

