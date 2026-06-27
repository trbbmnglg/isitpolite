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

