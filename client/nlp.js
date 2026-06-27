(function() {
  'use strict';

  const HISTORY_KEY = 'propquest:nlpHistory';
  const MAX_HISTORY = 10;

  // ── Main entry point ──────────────────────────────────────────────────────
  // Called when user submits the NL search bar.
  // query: plain English string
  async function parseAndSearch(query) {
    if (!query || query.trim().length < 3) {
      showNLPToast('Please enter a more specific search', 'info');
      return;
    }

    setNLPLoading(true);
    showNLPStatus('Parsing your query...', 'info');

    try {
      // Step 1: Send to AI parser
      const response = await fetch('http://localhost:3000/parse-query', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query.trim()
      });

      if (response.status === 429) {
        const data = await response.json();
        showNLPStatus('Slow down — ' + data.error, 'error');
        return;
      }
      if (!response.ok) throw new Error('Parser service error');
      const parsed = await response.json();
      
      localStorage.setItem('propquest:lastNLPQuery', query.trim());
      saveToHistory(query.trim());

      // Step 2: Show what the AI understood (transparency)
      displayParsedIntent(parsed, query);

      // Step 3: Push params into existing filter UI inputs
      applyParsedFilters(parsed);

      // Step 4: Trigger the existing applyFilters() from filters.js
      // This re-queries the R-tree with the new filter params.
      if (typeof window.applyFilters === 'function') {
        window.applyFilters();
      }

      // Step 5: If a location hint was found, log it for the user
      if (parsed.locationHint) {
        showNLPStatus(
          `Filtering for: ${parsed.locationHint} · max £${
            parsed.maxPrice ? (parsed.maxPrice/1000)+'k' : '–'
          } · ${parsed.minBedrooms || '–'}+ beds`,
          'success'
        );
      }

    } catch (err) {
      showNLPStatus('Could not parse query — try the manual filters below', 'error');
      console.error('[NLP client]', err);
    } finally {
      setNLPLoading(false);
    }
  }

  // ── Push parsed params into existing filter DOM inputs ────────────────────
  // This is how we bridge AI output → existing filter UI → existing R-tree code.
  // We set the input values and dispatch 'change' events so any listeners fire.
  function applyParsedFilters(parsed) {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (!el || value === null || value === undefined) return;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    set('filter-min-price', parsed.minPrice || '');
    set('filter-max-price', parsed.maxPrice || '');
    set('filter-min-beds',  parsed.minBedrooms || '');
    set('filter-max-beds',  parsed.maxBedrooms || '');

    // Handle property type checkboxes
    if (parsed.propertyTypes && parsed.propertyTypes.length > 0) {
      // Uncheck all first
      document.querySelectorAll('[id^="filter-type-"]').forEach(cb => {
        cb.checked = false;
      });
      // Check matching types
      parsed.propertyTypes.forEach(type => {
        const cb = document.getElementById('filter-type-' + type.toLowerCase());
        if (cb) cb.checked = true;
      });
    }
  }

  // ── Display what the AI understood ───────────────────────────────────────
  // Shows a small "intent card" so user can see and trust the parse.
  function displayParsedIntent(parsed, originalQuery) {
    const container = document.getElementById('nlp-intent-display');
    if (!container) return;

    const parts = [];
    if (parsed.minBedrooms) parts.push(`${parsed.minBedrooms}+ beds`);
    if (parsed.maxBedrooms) parts.push(`max ${parsed.maxBedrooms} beds`);
    if (parsed.minPrice)    parts.push(`over £${(parsed.minPrice/1000).toFixed(0)}k`);
    if (parsed.maxPrice)    parts.push(`under £${(parsed.maxPrice/1000).toFixed(0)}k`);
    if (parsed.propertyTypes?.length) parts.push(parsed.propertyTypes.join(' / '));
    if (parsed.locationHint) parts.push(`in ${parsed.locationHint}`);
    if (parsed.keywords?.length) parts.push(`near: ${parsed.keywords.join(', ')}`);

    const confidencePct = Math.round((parsed.confidence || 0) * 100);
    const confidenceColor = confidencePct >= 80 ? '#16a34a' : confidencePct >= 50 ? '#d97706' : '#dc2626';

    container.innerHTML = `
      <div style="font-size:11px;color:#6b7280;margin-bottom:3px;">
        Understood as: <span style="color:${confidenceColor};font-weight:500">${confidencePct}% confidence</span>
        ${confidencePct >= 80
          ? '<span style="color:#9ca3af;font-size:10px"> · LLM parse</span>'
          : '<span style="color:#9ca3af;font-size:10px"> · regex fallback</span>'
        }
      </div>
      <div style="font-size:12px;color:#374151;font-weight:500;">
        ${parts.length > 0 ? parts.join(' · ') : 'No specific filters detected — showing all results'}
      </div>
    `;
    container.style.display = 'block';
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function setNLPLoading(on) {
    const btn = document.getElementById('nlp-search-btn');
    const spinner = document.getElementById('nlp-spinner');
    if (btn) { btn.disabled = on; btn.textContent = on ? 'Parsing...' : 'Search'; }
    if (spinner) spinner.style.display = on ? 'inline' : 'none';
  }

  function showNLPStatus(msg, type) {
    const el = document.getElementById('nlp-status');
    if (!el) return;
    const colors = { info: '#3b82f6', success: '#16a34a', error: '#dc2626' };
    el.style.color = colors[type] || '#6b7280';
    el.textContent = msg;
    el.style.display = 'block';
  }

  function showNLPToast(msg, type) {
    // Re-uses the existing showToast from requests.js if available
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    }
  }

  function saveToHistory(query) {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history = [query, ...history.filter(q => q !== query)].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistoryDropdown(history);
  }

  function renderHistoryDropdown(history) {
    const list = document.getElementById('nlp-history-list');
    if (!list) return;
    if (history.length === 0) { list.style.display = 'none'; return; }
    list.innerHTML = history.map(q =>
      `<div class="nlp-history-item" onclick="
        document.getElementById('nlp-query-input').value='${q.replace(/'/g,"\\'")}';
        document.getElementById('nlp-history-list').style.display='none';
      " style="padding:6px 10px;font-size:11px;cursor:pointer;color:var(--color-text-secondary);"
        onmouseover="this.style.background='#374151'" onmouseout="this.style.background=''"
      >${q}</div>`
    ).join('');
  }

  // ── Expose globally for ui.js to call ────────────────────────────────────
  window.parseAndSearch = parseAndSearch;

  const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  renderHistoryDropdown(hist);

})();
