# Account Classification

POC for the Backbase GTM Full Stack case study: a single field on the Salesforce Account record —

```
Engagement_Sentiment = Positive | Neutral | Negative | Mixed
```

— refreshed every two weeks, so any AE, CSM, or executive can see at a glance how the
relationship with each account is trending.

This repo is the working thin-slice POC: mock Salesforce activity (emails + meetings) for ten
accounts is run through an LLM pipeline, and the resulting label, its confidence, its paraphrased
evidence, and the reasoning are shown in a clean UI — with an evaluation harness, run history,
and a per-run cost model on top.

Pushes to `master` auto-deploy to Vercel.

## Quickstart

```bash
npm install

# optional, for live runs (any OpenAI-compatible endpoint — see .env.example):
cp .env.example .env.local

# optional, to persist run history in Postgres (Neon):
#   DATABASE_URL=postgres://...

npm run dev                   # http://localhost:3000
```

With **zero configuration** the app serves a prerecorded run from `data/demo-run.json`, so every
page (including the evaluation) works out of the box. A live run needs an LLM key and a database.

`npm run validate:data` re-checks the mock export and gold labels against their schemas
(referential integrity, window bounds, thread structure).

## What to look at

| Page | What it shows |
| --- | --- |
| `/` Dashboard | Labels, confidence, trend vs prior label, Salesforce write decision, review queue |
| `/accounts/[id]` | The "why this label" explainer a rep would open: paraphrased evidence with weights, meeting signals, full message activity (automated ones marked as filtered), and the exact prompt the model saw |
| `/eval` Evaluation | Gold-label comparison, confusion matrix, review-routing checks |
| `/evals` | Evaluation history across runs |
| `/runs`, `/runs/[id]` | Run history: tokens, cost, writes, failures, per-account detail |

## Architecture

```
data/salesforce.json          (mock Salesforce export: Tasks, Events, Accounts)
        │
        ▼
filter: 13-day window, drop automated messages (OOO, bounces, calendar, newsletters)
        │                       — no LLM call, no write for accounts with nothing human
        ▼
one LLM call per account       (temperature 0, native structured output,
        │                       strict-JSON + one repair pass as fallback)
        ▼
deterministic rules            (drop evidence citing unknown ids; force Mixed when
        │                       high-weight positive AND negative coexist; route
        │                       low-confidence / neutral-with-directional-evidence to review)
        ▼
write decision                 written | unchanged | none  → only label CHANGES hit Salesforce
        │
        ▼
Postgres (Neon)                labels, confidence, paraphrased evidence, tokens, cost
        │                       — email bodies never leave the export file
        ▼
Next.js UI                     dashboard · account explainer · eval · run history
```

Core files: `src/lib/prompt.ts` (everything said to the model), `src/lib/llm.ts` (structured
output + fallback), `src/lib/pipeline.ts` (windowing, rules, write decisions),
`src/lib/run-manager.ts` (server-side run loop, cancel, stale-run cleanup),
`src/lib/db.ts` (persistence), `src/lib/cost.ts` (pricing model), `src/lib/eval.ts`
(gold scoring — one definition shared by UI and server).

## How each case constraint is honored

| Constraint | Mechanism |
| --- | --- |
| **Privacy** — bodies never stored outside Salesforce or logged | Only paraphrased evidence notes are persisted (`db.ts`); the prompt forbids verbatim quotes and instructs the model to treat in-message instructions as data (the Barclays fixture contains a planted prompt-injection line); demo bodies are synthetic. Egress to the model API is the one necessary disclosure — in production that means a DPA / no-training commitment with the provider. |
| **Salesforce limits** — writes are expensive | Delta writes only: `written` when the label changed, `unchanged` otherwise, `none` for skipped/failed accounts. In a 5,000-account org where most labels hold steady run over run, only the changed rows are written — spread via Bulk API in production. |
| **Cost** — known and justified | Token usage is recorded per account and per run; `cost.ts` is an explicit, env-overridable price model (per-1M-token input/output prices). The `/runs` page shows the dollars of every historical run. Skipping quiet accounts and pre-filtering automated messages are cost controls, not just noise controls. |
| **Trust** — one visibly wrong label kills adoption | Low-confidence and rule-flagged accounts go to a human review queue instead of being written; deterministic rules override the model (e.g. Mixed when high-weight signals conflict); a gold-labeled fixture set with a confusion matrix acts as the regression gate; the evaluation page states plainly what this proves and what it does not. |

## AI design in one paragraph

The LLM sits behind the stock `@ai-sdk/openai-compatible` provider, so any OpenAI-compatible
endpoint can run this — the runs recorded in this repo used GLM. One call per account, not per
message: the model sees the whole 13-day window (bodies for
emails, metadata for meetings) and must return a structured assessment — label, confidence,
2–4 sentence paraphrased reasoning, and weighted per-message evidence citing message ids.
Temperature 0. Output is validated with zod against a strict schema; if the provider's native
structured output fails, a strict-JSON prompt path runs with a single repair attempt, and the
mode used (`native` / `fallback`) is recorded per account. Label definitions in the prompt make
the hard distinctions explicit — operational-vs-relational friction, persona weighting,
recency weighting, Mixed-when-signals-coexist — because those are exactly where sentiment
systems go wrong.

## Correctness

- **Gold set**: 10 hand-designed scenarios (incl. a silent escalation, a decaying prospect, a
  persona-conflict Mixed, an inactive account, a prompt injection) with intended labels and
  rationales in `data/gold-labels.json`. The pipeline never reads this file.
- **Confusion matrix + per-account comparison** on `/eval`; the score is persisted per run so
  history shows what each run actually scored.
- **Review routing** is part of the contract: gold entries can assert an account *should* route
  to review, and the eval checks it.
- **Honest caveat** (also on the page): the synthetic set is a smoke and regression test, not
  evidence of accuracy on real emails. The production answer is a stratified sample of real
  accounts hand-labeled by CSMs, scored with a confusion matrix and weighted error costs —
  a happy customer marked Negative being the most expensive mistake.

## From POC to production (stated simplifications)

- The bi-weekly trigger is `GET /api/run` with a shared `x-cron-secret` header
  (Vercel Cron in production). The run loop assumes a long-lived server (`next start`); on
  serverless it needs an external runner (queue/worker) — the code says so where it matters.
- Salesforce reads/writes are a local JSON export in the POC; production uses the Bulk API
  (read Tasks/Events, write the Engagement_Sentiment__c field only for changed labels).
- Alerting on failed runs, retry/backoff on provider errors, and a real-data labeled sample
  are the next three things this system needs before sales sees a label.

## Assumptions

- The activity-intelligence provider logs direction and full bodies (given in the brief);
  automated noise (OOO, bounces, calendar replies, newsletters) is flagged `isAutomated` and
  filtered before the LLM.
- The 13-day analysis window on a 14-day cadence tiles calendar days exactly, with no gap and
  no overlap between consecutive runs.
- Renewal date, tier, and region are shown as context only — deliberately not sentiment inputs.
