
  // ── Configuration ──────────────────────────────────────────────────────
  var API_LOOKUP  = '/api/lookup';  // retrieval-augmented agent (Check/Trip/Compare/Guide/Quiz)
  var PRIVACY_KEY = 'isitpolite_privacy_accepted';
  var HISTORY_KEY = 'isitpolite_history';
  var HISTORY_MAX = 50;
  var CACHE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days
  var PACKS_KEY   = 'isitpolite_packs';      // index of saved offline country packs
  var PACK_PREFIX = 'pack_';                 // pack_[country] → guide data, no expiry
  var UNLOCK_KEY  = 'isitpolite_unlock';     // premium unlock code (localStorage)
  var HOME_KEY    = 'isitpolite_home';       // traveler's home country, device-only

  function getHome() {
    try { var h = localStorage.getItem(HOME_KEY) || ''; return COUNTRIES.indexOf(h) !== -1 ? h : ''; } catch (_) { return ''; }
  }
  function setHome(country) {
    try {
      if (country && COUNTRIES.indexOf(country) !== -1) localStorage.setItem(HOME_KEY, country);
      else localStorage.removeItem(HOME_KEY);
    } catch (_) {}
  }

  // ── Premium helpers ────────────────────────────────────────────────────
  function getUnlockCode() { try { return localStorage.getItem(UNLOCK_KEY) || ''; } catch (_) { return ''; } }
  function setUnlockCode(code) { try { if (code) localStorage.setItem(UNLOCK_KEY, code); else localStorage.removeItem(UNLOCK_KEY); } catch (_) {} }

  // COUNTRIES and CONTEXT_LABELS are injected at the top of this bundle by
  // build-seo.mjs from src/_countries.js (shared with the Worker).


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
      briefFromEl, briefToEl, briefMonthEl, briefContextsEl, briefBtn, briefResult, briefSavedEl;

