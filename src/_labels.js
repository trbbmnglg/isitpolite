// What the verdict and confidence labels mean. Single source of truth for the
// in-app legend, the static guide pages and the Check prompt.

export const VERDICT_LEGEND = [
  { key: 'polite', label: 'Polite', text: 'Fine to do. Locals are unlikely to think twice.' },
  { key: 'caution', label: 'Caution', text: 'Depends on the setting, the region or who you are with, or is awkward rather than offensive.' },
  { key: 'rude', label: 'Rude', text: 'Likely to offend. Best avoided.' },
];

export const CONFIDENCE_LEGEND = [
  { key: 'high', label: 'High confidence', text: 'Widely documented and consistent across sources.' },
  { key: 'medium', label: 'Medium confidence', text: 'Generally true, but varies by region, generation or setting.' },
  { key: 'low', label: 'Low confidence', text: 'Sources are thin or disagree, so double-check locally.' },
];

// "high" = widely documented ...; used inside the Check prompt.
export function confidenceRules() {
  return CONFIDENCE_LEGEND.map(function (c) {
    return '"' + c.key + '" = ' + c.text.charAt(0).toLowerCase() + c.text.slice(1).replace(/\.$/, '');
  }).join('; ');
}
