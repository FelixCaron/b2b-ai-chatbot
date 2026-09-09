// French dictionary — English string → French. Split into per-area fragments
// so translation can proceed in parallel without merge conflicts; this barrel
// merges them into the single lookup table LanguageContext reads. A key absent
// here falls back to the English original (see LanguageContext).
import chrome from './chrome.js';
import pricing from './pricing.js';
import dashboard from './dashboard.js';
import modals from './modals.js';
import pages from './pages.js';
import misc from './misc.js';

export default {
  ...chrome,
  ...pricing,
  ...dashboard,
  ...modals,
  ...pages,
  ...misc,
};
