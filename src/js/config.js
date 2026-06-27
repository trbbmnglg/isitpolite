
  // ── Configuration ──────────────────────────────────────────────────────
  var API_LOOKUP  = '/api/lookup';  // retrieval-augmented agent (Check/Compare/Trip/Guide/Quiz)
  var PRIVACY_KEY = 'isitpolite_privacy_accepted';
  var HISTORY_KEY = 'isitpolite_history';
  var HISTORY_MAX = 50;
  var CACHE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days
  var PACKS_KEY   = 'isitpolite_packs';      // index of saved offline country packs
  var PACK_PREFIX = 'pack_';                 // pack_[country] → guide data, no expiry
  var UNLOCK_KEY  = 'isitpolite_unlock';     // premium unlock code (localStorage)

  // ── Premium helpers ────────────────────────────────────────────────────
  function getUnlockCode() { try { return localStorage.getItem(UNLOCK_KEY) || ''; } catch (_) { return ''; } }
  function setUnlockCode(code) { try { if (code) localStorage.setItem(UNLOCK_KEY, code); else localStorage.removeItem(UNLOCK_KEY); } catch (_) {} }

  // ── Country List ───────────────────────────────────────────────────────
  var COUNTRIES = [
    'Afghanistan','Albania','Algeria','Andorra','Angola',
    'Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
    'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados',
    'Belarus','Belgium','Belize','Benin','Bhutan',
    'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei',
    'Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia',
    'Cameroon','Canada','Central African Republic','Chad','Chile',
    'China','Colombia','Comoros','Congo (Democratic Republic)','Congo (Republic)',
    'Costa Rica','Croatia','Cuba','Cyprus','Czech Republic',
    'Denmark','Djibouti','Dominica','Dominican Republic','Ecuador',
    'Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia',
    'Eswatini','Ethiopia','Fiji','Finland','France',
    'Gabon','Gambia','Georgia','Germany','Ghana',
    'Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
    'Guyana','Haiti','Honduras','Hungary','Iceland',
    'India','Indonesia','Iran','Iraq','Ireland',
    'Israel','Italy','Jamaica','Japan','Jordan',
    'Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan',
    'Laos','Latvia','Lebanon','Lesotho','Liberia',
    'Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar',
    'Malawi','Malaysia','Maldives','Mali','Malta',
    'Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia',
    'Moldova','Monaco','Mongolia','Montenegro','Morocco',
    'Mozambique','Myanmar','Namibia','Nauru','Nepal',
    'Netherlands','New Zealand','Nicaragua','Niger','Nigeria',
    'North Korea','North Macedonia','Norway','Oman','Pakistan',
    'Palau','Palestine','Panama','Papua New Guinea','Paraguay',
    'Peru','Philippines','Poland','Portugal','Qatar',
    'Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia',
    'Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe','Saudi Arabia',
    'Senegal','Serbia','Seychelles','Sierra Leone','Singapore',
    'Slovakia','Slovenia','Solomon Islands','Somalia','South Africa',
    'South Korea','South Sudan','Spain','Sri Lanka','Sudan',
    'Suriname','Sweden','Switzerland','Syria','Taiwan',
    'Tajikistan','Tanzania','Thailand','Timor-Leste','Togo',
    'Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan',
    'Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom',
    'United States','Uruguay','Uzbekistan','Vanuatu','Vatican City',
    'Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
  ];

  var CONTEXT_LABELS = {
    general: 'General / everyday', business: 'Business / work',
    dining: 'Dining / restaurant', religion: 'Religious setting',
    social: 'Social gathering', family: 'Meeting family',
  };

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
      tripFromEl, tripToEl, tripBtn, tripResult;

