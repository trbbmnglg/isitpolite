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
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || 'Could not submit. Please try again.');
          return d;
        });
      })
      .then(function (d) {
        markVoted(vkey);
        if (d && typeof d.accuracy !== 'undefined') paintAccChip(wrap, d);
        var form = wrap.querySelector('.report-form'); if (form) form.remove();
        var actions = wrap.querySelector('.acc-actions');
        if (actions) { actions.style.display = ''; actions.innerHTML = '<span class="acc-voted">✓ Thanks — your input was recorded</span>'; }
      })
      .catch(function (e) {
        var text = (e && e.message) || 'Could not submit. Please try again.';
        if (msgEl) msgEl.textContent = text;
        else if (btn) btn.title = text;
        if (btn) { btn.disabled = false; btn.textContent = msgEl ? 'Submit report' : 'Accurate'; }
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
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || 'Could not send. Please try again.');
        });
      })
      .then(function () {
        resEl.style.color = '';
        resEl.innerHTML = '<span class="acc-voted">✓ Thank you! Your feedback was received.</span>';
        t.value = '';
        setTimeout(closeFeedback, 1600);
      })
      .catch(function (e) { resEl.style.color = 'var(--rude)'; resEl.textContent = (e && e.message) || 'Could not send. Please try again.'; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Send feedback'; });
  }

