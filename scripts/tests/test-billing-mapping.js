// Billing mapping verification — the check that keeps a paying customer's row
// honest.
//
// Every one of these cases has already shipped as a bug, and each one has the
// same symptom for the customer: they pay, their tenant row still reads
// 'trialing'/'free', and the dashboard's install gate sends them back to the
// pricing page they just bought on.
import {
  planFromPriceId,
  pickLiveSubscription,
  subscriptionPeriodEnd,
  tenantBillingFromSubscription,
  tenantBillingForCancellation
} from '../../packages/contracts/src/stripe-billing.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${label} — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const PRICE_IDS = { basic: 'price_basic', pro: 'price_pro', premium: 'price_premium' };
const PERIOD_END = 1893456000; // 2030-01-01T00:00:00Z

/** A subscription as Stripe's 2025+ API versions render it: the billing period
 *  lives on the ITEM, and the subscription object has no current_period_end at
 *  all. Reading it off the subscription used to throw RangeError out of
 *  `new Date(undefined * 1000).toISOString()` — before the update ran, so the
 *  webhook 500'd and the purchase never activated. */
const modernSubscription = {
  id: 'sub_modern',
  status: 'active',
  customer: 'cus_1',
  created: 1000,
  items: { data: [{ price: { id: 'price_pro' }, current_period_end: PERIOD_END }] }
};

/** The same subscription on a pre-2025 API version. */
const legacySubscription = {
  id: 'sub_legacy',
  status: 'trialing',
  customer: 'cus_1',
  created: 900,
  current_period_end: PERIOD_END,
  items: { data: [{ price: { id: 'price_pro' } }] }
};

check('a 2025+ subscription maps to the plan it sells', () => {
  const columns = tenantBillingFromSubscription(modernSubscription, { priceIds: PRICE_IDS });
  assert(columns.plan === 'pro', `plan was ${columns.plan}`);
  assert(columns.plan_status === 'active', `status was ${columns.plan_status}`);
  assert(columns.stripe_subscription_id === 'sub_modern', 'subscription id was not recorded');
  assert(columns.stripe_customer_id === 'cus_1', 'customer id was not recorded');
  assert(columns.plan_expires_at === new Date(PERIOD_END * 1000).toISOString(), 'wrong period end');
});

check('a pre-2025 subscription still maps the same way', () => {
  const columns = tenantBillingFromSubscription(legacySubscription, { priceIds: PRICE_IDS });
  assert(columns.plan === 'pro', `plan was ${columns.plan}`);
  // A Stripe-managed trial is a real, paid-for subscription — hasActivePlan()
  // treats it as active, which is what keeps the install gate open during it.
  assert(columns.plan_status === 'trialing', `status was ${columns.plan_status}`);
  assert(columns.plan_expires_at === new Date(PERIOD_END * 1000).toISOString(), 'wrong period end');
});

check('a missing billing period never blocks the plan write', () => {
  const noPeriod = { id: 'sub_x', status: 'active', items: { data: [{ price: { id: 'price_pro' } }] } };
  assert(subscriptionPeriodEnd(noPeriod) === null, 'an absent period end should be null, not a crash');
  const columns = tenantBillingFromSubscription(noPeriod, { priceIds: PRICE_IDS });
  assert(columns.plan === 'pro' && columns.plan_status === 'active', 'the plan was lost with the date');
  assert(!('plan_expires_at' in columns), 'an unknown period end must not be written');
});

check('an unrecognized price keeps the plan the tenant already has', () => {
  const custom = { id: 'sub_c', status: 'active', items: { data: [{ price: { id: 'price_custom' } }] } };
  assert(planFromPriceId('price_custom', PRICE_IDS) === null, 'an unknown price must not resolve to a plan');
  const columns = tenantBillingFromSubscription(custom, { priceIds: PRICE_IDS, fallbackPlan: 'premium' });
  assert(columns.plan === 'premium', `a paying tenant was downgraded to ${columns.plan}`);
});

check('the live subscription wins over old cancelled ones', () => {
  const dead = { id: 'sub_old', status: 'canceled', created: 500 };
  const picked = pickLiveSubscription([dead, modernSubscription, legacySubscription]);
  assert(picked?.id === 'sub_modern', `picked ${picked?.id} — expected the newest live one`);
  assert(pickLiveSubscription([dead]) === null, 'a cancelled subscription is not live');
  assert(pickLiveSubscription([]) === null, 'no subscriptions means none is live');
});

check('past_due still counts as a subscription Stripe is tracking', () => {
  const pastDue = { id: 'sub_pd', status: 'past_due', created: 1, items: { data: [] } };
  assert(pickLiveSubscription([pastDue])?.id === 'sub_pd', 'a dunning subscription was treated as gone');
});

check('a cancellation clears the subscription, not just the status', () => {
  const columns = tenantBillingForCancellation();
  assert(columns.plan === 'basic', `plan was ${columns.plan}`);
  assert(columns.plan_status === 'canceled', `status was ${columns.plan_status}`);
  assert(columns.stripe_subscription_id === null, 'a dead subscription id was left on the row');
});

console.log(`\nBilling Mapping Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
