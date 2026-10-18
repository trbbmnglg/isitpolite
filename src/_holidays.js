// Holidays whose dates move every year, with dates taken from published
// sources (checked 2026-10-18). Trip briefings add matching entries directly,
// so they never depend on the model or on what a web search happens to return.
// Lunar and Islamic dates are projections that can shift by a day (moon sighting).
// Extend this table before September 2027, when briefings start reaching 2028.

const ISLAMIC = ['Afghanistan', 'Algeria', 'Bahrain', 'Bangladesh', 'Brunei', 'Burkina Faso', 'Chad', 'Comoros', 'Djibouti', 'Egypt',
  'Gambia', 'Guinea', 'Indonesia', 'Iran', 'Iraq', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Lebanon', 'Libya', 'Malaysia',
  'Maldives', 'Mali', 'Mauritania', 'Morocco', 'Niger', 'Oman', 'Pakistan', 'Palestine', 'Qatar', 'Saudi Arabia', 'Senegal',
  'Sierra Leone', 'Somalia', 'Sudan', 'Syria', 'Tajikistan', 'Tunisia', 'Turkey', 'Turkmenistan', 'United Arab Emirates', 'Uzbekistan', 'Yemen'];
const LUNAR_NEW_YEAR = ['China', 'Taiwan', 'Singapore', 'Vietnam', 'South Korea', 'Malaysia'];
const DIWALI = ['India', 'Nepal', 'Singapore', 'Malaysia', 'Sri Lanka', 'Fiji', 'Mauritius', 'Trinidad and Tobago', 'Guyana', 'Suriname'];
const HOLY_WEEK = ['Philippines', 'Spain', 'Mexico', 'Italy', 'Brazil', 'Portugal', 'Poland', 'Ireland', 'Malta', 'Guatemala', 'Colombia',
  'Peru', 'Argentina', 'Chile', 'Ecuador', 'Venezuela', 'Bolivia', 'Paraguay', 'Costa Rica', 'El Salvador', 'Honduras', 'Nicaragua',
  'Panama', 'Dominican Republic'];
const ORTHODOX = ['Greece', 'Russia', 'Serbia', 'Romania', 'Bulgaria', 'Georgia', 'Cyprus', 'Ukraine', 'North Macedonia', 'Montenegro',
  'Belarus', 'Moldova', 'Ethiopia', 'Eritrea'];

const SRC = {
  islamic2027: { title: 'Khaleej Times: Ramadan, Eid Al Fitr and Eid Al Adha 2027 likely dates', url: 'https://www.khaleejtimes.com/uae/ramadan-eid-al-fitr-eid-al-adha-2027-likely-dates' },
  islamic2028: { title: 'Calendarific: Saudi Arabia holidays 2028', url: 'https://calendarific.com/holidays/2028/sa' },
  lunar: { title: 'PublicHolidays.com: Lunar New Year 2027 and 2028', url: 'https://publicholidays.com/lunar-new-year/' },
  diwali: { title: 'SmartPuja: Diwali 2026 date', url: 'https://www.smartpuja.com/blog/diwali-2026-date' },
  chuseok: { title: 'PublicHolidays.co.kr: Chuseok 2026, 2027 and 2028', url: 'https://publicholidays.co.kr/chuseok/' },
  easter: { title: 'PublicHolidays.com: Easter 2027 and 2028', url: 'https://publicholidays.com/easter/' },
};

const NOTES = {
  ramadan: 'Muslims fast from dawn to sunset. Expect shorter business hours and quiet days, with lively evenings after iftar. Be discreet about eating, drinking or smoking in public during daylight, especially in more conservative areas.',
  fitr: 'The holiday that ends Ramadan. Offices and many shops close for several days, and flights, hotels and roads are busy.',
  adha: 'A major holiday with closures over several days. Flights, hotels and roads are busy.',
  lunar: 'The biggest holiday of the year. Many shops and restaurants close for several days and transport is packed around it.',
  diwali: 'The festival of lights: fireworks, crowded markets and some closures. Sweets make a welcome gift if you visit a home.',
  chuseok: 'Korea\'s harvest holiday. Many businesses close for three days and trains and roads out of cities are packed.',
  holyWeek: 'Many businesses close from Holy Thursday to Easter Sunday, and processions fill town centres.',
  orthodox: 'The most important holiday of the year. Expect closures over the weekend and midnight church services on Saturday.',
};

export const MOVABLE_HOLIDAYS = [
  { title: 'Ramadan', from: '2027-02-08', to: '2027-03-09', approx: true, countries: ISLAMIC, note: NOTES.ramadan, source: SRC.islamic2027 },
  { title: 'Eid al-Fitr', from: '2027-03-09', to: '2027-03-10', approx: true, countries: ISLAMIC, note: NOTES.fitr, source: SRC.islamic2027 },
  { title: 'Eid al-Adha', from: '2027-05-16', to: '2027-05-17', approx: true, countries: ISLAMIC, note: NOTES.adha, source: SRC.islamic2027 },
  { title: 'Ramadan', from: '2028-01-28', to: '2028-02-26', approx: true, countries: ISLAMIC, note: NOTES.ramadan, source: SRC.islamic2028 },
  { title: 'Eid al-Fitr', from: '2028-02-27', to: '2028-02-27', approx: true, countries: ISLAMIC, note: NOTES.fitr, source: SRC.islamic2028 },
  { title: 'Eid al-Adha', from: '2028-05-05', to: '2028-05-05', approx: true, countries: ISLAMIC, note: NOTES.adha, source: SRC.islamic2028 },
  { title: 'Lunar New Year', from: '2027-02-06', to: '2027-02-06', approx: false, countries: LUNAR_NEW_YEAR, note: NOTES.lunar, source: SRC.lunar },
  { title: 'Lunar New Year', from: '2028-01-26', to: '2028-01-26', approx: false, countries: LUNAR_NEW_YEAR, note: NOTES.lunar, source: SRC.lunar },
  { title: 'Diwali', from: '2026-11-08', to: '2026-11-08', approx: false, countries: DIWALI, note: NOTES.diwali, source: SRC.diwali },
  { title: 'Chuseok', from: '2027-09-14', to: '2027-09-16', approx: false, countries: ['South Korea'], note: NOTES.chuseok, source: SRC.chuseok },
  { title: 'Chuseok', from: '2028-10-02', to: '2028-10-04', approx: false, countries: ['South Korea'], note: NOTES.chuseok, source: SRC.chuseok },
  { title: 'Holy Week and Easter', from: '2027-03-21', to: '2027-03-28', approx: false, countries: HOLY_WEEK, note: NOTES.holyWeek, source: SRC.easter },
  { title: 'Holy Week and Easter', from: '2028-04-09', to: '2028-04-16', approx: false, countries: HOLY_WEEK, note: NOTES.holyWeek, source: SRC.easter },
  { title: 'Orthodox Easter', from: '2027-05-02', to: '2027-05-02', approx: false, countries: ORTHODOX, note: NOTES.orthodox, source: SRC.easter },
  { title: 'Orthodox Easter', from: '2028-04-16', to: '2028-04-16', approx: false, countries: ORTHODOX, note: NOTES.orthodox, source: SRC.easter },
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return d + ' ' + MONTH_SHORT[m - 1] + ' ' + y;
}

function dateText(h) {
  const range = h.from === h.to ? fmt(h.from) : fmt(h.from) + ' – ' + fmt(h.to);
  return h.approx ? 'Expected around ' + range + '; the exact day depends on the moon sighting.' : range + '.';
}

// Entries observed in `country` that overlap the given month (1-12) of `year`.
export function holidaysFor(country, month, year) {
  if (!month || !year) return [];
  const mm = String(month).padStart(2, '0');
  const start = year + '-' + mm + '-01';
  const end = year + '-' + mm + '-31';
  return MOVABLE_HOLIDAYS
    .filter(function (h) { return h.countries.indexOf(country) !== -1 && h.from <= end && h.to >= start; })
    .map(function (h) {
      return { title: h.title, note: h.note + ' ' + dateText(h), movable: h.approx, verified: true, source: { title: h.source.title, url: h.source.url } };
    });
}
