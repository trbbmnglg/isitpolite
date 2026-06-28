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

    // Wire <label> to the custom trigger.
    // `for` can only reference labelable elements — <div> is not one, so browsers
    // flag label[for=triggerId].  Instead: remove `for`, assign an id to the label
    // so aria-labelledby still works, and proxy clicks so the label opens the dropdown.
    var label = select.id ? document.querySelector('label[for="' + select.id + '"]') : null;
    var labelId = null;
    if (label) {
      labelId = sid + '-label';
      label.id = labelId;
      label.removeAttribute('for');
      label.addEventListener('click', function () { trigger.focus(); open(); });
    }

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
