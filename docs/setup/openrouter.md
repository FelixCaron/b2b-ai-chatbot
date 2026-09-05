# OpenRouter setup

OpenRouter is the LLM abstraction layer for chat responses, lead extraction, theme
extraction, and embeddings (`api/lib/llm.js`).

## Manual (no scriptable resource creation needed — it's just an API key)

1. Create an account at https://openrouter.ai and add credit (or use a free-tier model —
   `openrouter/free`, per `CLAUDE.md`).
2. Dashboard → Keys → Create Key → copy it into `OPENROUTER_API_KEY`.
3. Set `DEFAULT_MODEL` and `PREMIUM_MODEL` (see `.env.example` for current defaults) —
   these are OpenRouter model slugs, e.g. `openai/gpt-5.6-luna`,
   `anthropic/claude-3.5-sonnet`. Check https://openrouter.ai/models for what's currently
   available and its pricing before picking one for production traffic.

There's nothing to provision beyond the key itself, so no setup script exists for this
integration.
