// ---------------------------------------------------------------------------
// A deliberately tiny, zero-dependency field vocabulary.
//
// Why not Zod (which the repo already has in @b2b-ai-chatbot/shared)? Because
// these schemas are imported by the Vercel *Edge* handlers in /api, where every
// added dependency is bundle weight on a cold start, and by the browser bundle,
// where it is download weight. The subset of validation an HTTP boundary needs
// is small enough to own outright — roughly 150 lines — and owning it keeps the
// contracts importable from anywhere with no build step at all.
//
// A field is an object with { kind, optional, parse(value, path) }. `parse`
// returns the coerced value or throws a ValidationError naming the field.
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  constructor(issues) {
    const list = Array.isArray(issues) ? issues : [issues];
    super(list.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'ValidationError';
    this.issues = list;
    this.statusCode = 400;
  }
}

function fail(path, message) {
  throw new ValidationError({ path, message });
}

function field(kind, parse, meta = {}) {
  return {
    kind,
    optional: false,
    ...meta,
    parse,
    /** A copy of this field that may be omitted (or sent as null/''). */
    optionalField() {
      return { ...this, optional: true };
    }
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i;

export const f = {
  // `allowEmpty` matters because parseFields treats '' as "not supplied" — a
  // sane default for an HTTP payload, but wrong for a field whose empty value
  // is a real instruction (clearing a page's indexed content, say).
  string({ min = 1, max = 100_000, pattern = null, trim = true, allowEmpty = false } = {}) {
    return field('string', (value, path) => {
      if (typeof value !== 'string') fail(path, 'must be a string');
      const out = trim ? value.trim() : value;
      if (out.length < min) fail(path, `must be at least ${min} character(s)`);
      if (out.length > max) fail(path, `must be at most ${max} character(s)`);
      if (pattern && !pattern.test(out)) fail(path, 'has an unexpected format');
      return out;
    }, { min, max, allowEmpty });
  },

  uuid() {
    return field('uuid', (value, path) => {
      if (typeof value !== 'string' || !UUID_RE.test(value.trim())) fail(path, 'must be a UUID');
      return value.trim();
    });
  },

  email() {
    return field('email', (value, path) => {
      if (typeof value !== 'string') fail(path, 'must be a string');
      const out = value.trim().toLowerCase();
      if (out.length < 3 || out.length > 320 || !EMAIL_RE.test(out)) fail(path, 'must be an email address');
      return out;
    });
  },

  // Accepts a bare hostname too ("acme.com"): every caller in this codebase
  // normalizes with `https://` before use, and rejecting what a user typed
  // into a URL box is the API boundary's least useful moment to be strict.
  url({ requireProtocol = false } = {}) {
    return field('url', (value, path) => {
      if (typeof value !== 'string') fail(path, 'must be a string');
      const raw = value.trim();
      if (!raw) fail(path, 'must not be empty');
      const candidate = /^https?:\/\//i.test(raw) ? raw : (requireProtocol ? null : `https://${raw}`);
      if (!candidate) fail(path, 'must start with http:// or https://');
      try {
        // eslint-disable-next-line no-new
        new URL(candidate);
      } catch {
        fail(path, 'must be a valid URL');
      }
      return raw;
    });
  },

  hexColor() {
    return field('hexColor', (value, path) => {
      if (typeof value !== 'string' || !HEX_COLOR_RE.test(value.trim())) fail(path, 'must be a hex color (#rrggbb)');
      return value.trim();
    });
  },

  boolean() {
    return field('boolean', (value, path) => {
      if (typeof value !== 'boolean') fail(path, 'must be a boolean');
      return value;
    });
  },

  number({ min = -Infinity, max = Infinity, integer = false } = {}) {
    return field('number', (value, path) => {
      if (typeof value !== 'number' || Number.isNaN(value)) fail(path, 'must be a number');
      if (integer && !Number.isInteger(value)) fail(path, 'must be an integer');
      if (value < min) fail(path, `must be >= ${min}`);
      if (value > max) fail(path, `must be <= ${max}`);
      return value;
    }, { min, max, integer });
  },

  oneOf(values) {
    return field('oneOf', (value, path) => {
      if (!values.includes(value)) fail(path, `must be one of: ${values.join(', ')}`);
      return value;
    }, { values });
  },

  arrayOf(item, { min = 0, max = 10_000 } = {}) {
    return field('array', (value, path) => {
      if (!Array.isArray(value)) fail(path, 'must be an array');
      if (value.length < min) fail(path, `must hold at least ${min} item(s)`);
      if (value.length > max) fail(path, `must hold at most ${max} item(s)`);
      return value.map((entry, index) => item.parse(entry, `${path}[${index}]`));
    }, { item, min, max });
  },

  shape(fields) {
    return field('shape', (value, path) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
      return parseFields(fields, value, path);
    }, { fields });
  },

  /** Anything at all — for payloads whose inner structure belongs to a third
   *  party (a Stripe event, a row echoed straight back from Postgres). */
  any() {
    return field('any', (value) => value);
  }
};

/** Marks a field as omittable. `optional(f.uuid())` reads better at the call
 *  site than `f.uuid().optionalField()`. */
export function optional(fieldDef) {
  return { ...fieldDef, optional: true };
}

function isAbsent(value) {
  return value === undefined || value === null || value === '';
}

/** Validates a plain object against `{ name: field }`, collecting every issue
 *  rather than stopping at the first — one round trip should tell the caller
 *  everything that is wrong with their payload. Unknown keys are dropped. */
export function parseFields(fields, input, basePath = '') {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  const issues = [];

  for (const [name, fieldDef] of Object.entries(fields)) {
    const path = basePath ? `${basePath}.${name}` : name;
    const raw = source[name];

    if (isAbsent(raw) && !(raw === '' && fieldDef.allowEmpty)) {
      if (!fieldDef.optional) issues.push({ path, message: 'is required' });
      continue;
    }

    try {
      out[name] = fieldDef.parse(raw, path);
    } catch (err) {
      if (err instanceof ValidationError) issues.push(...err.issues);
      else issues.push({ path, message: err.message });
    }
  }

  if (issues.length) throw new ValidationError(issues);
  return out;
}

/** Non-throwing variant: `{ ok: true, value }` or `{ ok: false, issues, message }`. */
export function safeParseFields(fields, input, basePath = '') {
  try {
    return { ok: true, value: parseFields(fields, input, basePath) };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, issues: err.issues, message: err.message };
    throw err;
  }
}
