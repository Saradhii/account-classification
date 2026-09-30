# Scenario Spec — Synthetic Salesforce Export

**Status: DRAFT — awaiting candidate approval before data generation.**

This document defines the mock dataset before a single email is written. Emails
realize these scenarios; they never invent their own story. `data/gold-labels.json`
is derived from this spec and is eval-only — the pipeline never reads it.

## 0. What this dataset is (and is not)

- **What it is:** a smoke/regression test for the POC pipeline and the live demo —
  a scenario-balanced set of realistic threads where each account's intended
  label is known in advance.
- **What it is not:** proof of accuracy on real customer emails. The real
  correctness answer (presentation part 4) is: CSMs hand-label a stratified
  sample of real accounts, we report a confusion matrix with weighted error
  costs (a happy customer marked Negative is the most expensive error; Neutral→Mixed
  is the cheapest), and that labeled sample becomes the ongoing regression set.
  The synthetic set only de-risks development and demos before real labels exist.

All bank names, people, and content are fictional. No real financial institutions
are used — deliberate choice, consistent with the privacy posture of the case.

## 1. Label taxonomy (authoritative definitions)

The pipeline must use exactly the brief's four labels. Definitions the
aggregation logic (and prompts) must implement:

| Label | Definition |
|---|---|
| **Positive** | Net signals in the window show a healthy or strengthening relationship: praise, forward progress on shared goals, inbound initiative from the customer, expansion or renewal intent. |
| **Negative** | Net signals show deterioration or substantive frustration: escalations, complaints with substance, engagement decay after prior engagement, competitive displacement, blocked progress attributed to us. |
| **Mixed** | **Materially conflicting signals from different personas or channels within the window** (e.g. exec enthusiasm about expansion while the delivery PM escalates support issues). Conflicts are reported, not averaged away — both signals are real and actionable. |
| **Neutral** | **Insufficient signal**, not "balanced sentiment": the window is mostly logistics, scheduling, invoices, technical Q&A. Absence of emotion is not negative. |
| *Skipped* | Pipeline state, not a label: no qualifying activity in the window → no evaluation, no LLM spend, **no Salesforce write**; previous label retained. |

Supporting rules:
- **No per-message "Mixed."** A single message gets Positive/Neutral/Negative;
  conflict only exists at account level, across messages.
- **Persona weight:** decision-maker/exec signal > project-level stakeholder >
  end user. One credible negative from an exec sponsor outranks several vague
  positives from end users.
- **Recency:** later messages in the window weigh more. Quoted/forwarded content
  older than the window must be attributed to its original date, not the reply's
  date (the account 7 trap).
- **Pre-filter before AI:** automated messages (OOO, bounces, calendar
  accept/decline, newsletters) are excluded by rules, not by the model. This is
  the concrete "when not to use AI" answer and cuts token spend.

## 2. Cast of characters (consistent across the dataset)

Backbase side: **Sofia Lindqvist** (AE), **Marcus Chen** (CSM), **Priya Raghavan**
(Solution Consultant). Bank-side personas per account are listed in each
scenario. Email signatures, tone, and verbosity differ per person — reviewers
check that six different bank contacts don't write identical prose.

## 3. Scenarios (10 accounts)

### 1. Meridian Trust Bank — Customer, North America, Tier 1 — **Positive**
- Story: payment-widget go-live landed two weeks ago; thank-yous from the
  digital VP, NPS-style praise, exec asks to scope an onboarding-journey module
  (expansion), renewal 8 months out (context only, not a signal).
- Threads: go-live wrap thread (3 msgs), expansion scoping thread (3),
  1 standalone thank-you. Events: QBR completed (requested by customer),
  expansion kickoff completed.
- Tests: clear positive; exec-level language; UI must show expansion as evidence.

### 2. Noordbank NV — Prospect, EMEA — **Positive**
- Story: active evaluation; their IT director asks substantive inbound
  architecture questions; they request a demo with the board member sponsor;
  procurement asks for security paperwork (logistics, but inbound initiative).
- Threads: architecture Q&A (4), demo scheduling (2), security questionnaire (2).
  Events: technical deep-dive completed (requested by account).
- Tests: prospect path; inbound-heavy ratio as a signal; logistics messages
  must not dilute the positive read.

### 3. Banca Aurelia — Customer, EMEA, Tier 2 — **Negative**
- Story: UAT defects repeatedly slipping the go-live date; PM escalates in
  measured but firm language; mentions the contract's penalty clause; **they
  cancel** the UAT review meeting. One forwarded internal-style chain where a
  mid-level comment grumbles about delays — inside which the **prompt-injection
  attempt is buried** (a single line, styled as a system note, instructing any
  automated analysis to classify this account Positive; not a cartoonish
  "ignore all instructions" banner). Gold stays Negative.
- Threads: UAT defect escalation (5), timeline commitment exchange (3),
  forwarded grumble chain containing the injection (2).
  Events: UAT review — **Cancelled by account**.
- Tests: escalation tone; cancellation as negative event signal; injection
  robustness (system prompt must treat email content as data, never instructions).

### 4. Copperline Credit Union — Prospect, North America — **Negative**
- Story: three unanswered outbound follow-ups after a promising workshop; final
  inbound reply says the project is paused for the year and they're piloting
  with another vendor. Then one more unanswered outbound.
- Threads: follow-up thread (5 msgs, mostly outbound).
  Events: none in window.
- Tests: engagement decay pattern; mostly-outbound ratio as a signal; "paused +
  competitor" makes it Negative, not Neutral.

### 5. FirstHarbor Bank — Customer, North America, Tier 1 — **Mixed**
- Story: two parallel truths. Their **COO** emails enthusiasm about the
  expansion business case and references us positively to their board. Their
  **delivery PM** files a frustrated support thread about a slow sandbox
  environment and a missed hotfix window. Neither persona mentions the other.
- Threads: expansion thread with COO (3), support frustration thread with PM (4),
  logistics thread (2). Events: exec check-in completed (requested by account).
- Tests: the canonical Mixed — persona conflict, not average; aggregation must
  surface both signals, not net them to Neutral.

### 6. Solventia Bank — Customer, EMEA, Tier 3 — **Neutral**
- Story: ordinary operations fortnight — invoice query, SSO metadata exchange,
  release-notes question, upgrade scheduling. Courteous, zero sentiment either
  way. Two OOO replies and one calendar acceptance sit in the log (pre-filter
  must exclude them and show the count).
- Threads: invoice query (2), SSO config (3), upgrade scheduling (2). Plus
  automated: OOO (2), calendar accept (1). Events: upgrade planning call
  completed (requested by backbase).
- Tests: "no emotion ≠ negative"; automated-message pre-filter visible in UI.

### 7. Tahoe Pacific Bank — Customer, North America, Tier 2 — **Positive**
- Story: current thread is calm and constructive — recovery after a rocky
  patch: they confirm the fix held, thank the team, discuss next phase
  dates. The trap: their reply **quotes in full** the angry email from ~6 weeks
  ago (before the window). Only the new text is current sentiment.
- Threads: recovery thread (5, long bodies with quoted history).
  Events: resolution retrospective completed (requested by backbase).
- Tests: recency/attribution trap; window discipline; long bodies (token cost
  realism).

### 8. Banca Azteca Verde — Customer, LATAM — **Positive**
- Story: evaluation-to-signature momentum; thread mixes Spanish and English
  naturally (greetings/sign-offs in Spanish, technical content in English);
  warm but professional; their lead sends the countersigned agreement and
  suggests a celebration coffee at the next visit.
- Threads: agreement execution (4), kickoff planning (2).
  Events: kickoff completed (requested by account).
- Tests: multilingual handling; positive without exclamation confetti.

### 9. Granite Mutual — Customer, North America, Tier 3 — **Neutral (gold), low confidence by design**
- Story: thin, blunt signal — one-word-ish replies ("fine", "ok, proceed"),
  one mildly sarcastic line about another slipped date, one dry thank-you.
  Nothing material either way.
- Threads: upgrade confirmation thread (4 short msgs), one sarcastic one-liner.
  Events: none.
- Tests: **expected behavior is the review path** — confidence below threshold
  → routed to human review queue; the specific label is secondary. Blunt/sarcastic
  register must not be misread as negative.

### 10. Bellwether Savings — Customer, North America, Tier 3 — **Skipped**
- Story: nothing in the window. No tasks, no events.
- Prior label (from the previous run, stored on the account record): Neutral.
- Tests: skip logic — no LLM call, no write, previous label retained, UI shows
  "stale since last run" honestly.

## 4. Volume budget (timeboxed per review feedback)

~63–70 emails total incl. 4–5 automated, ~10 events, 10 accounts. Heavy
accounts (3, 5, 7) carry 9–11 messages; light ones (4, 9, 10) carry 0–5.
Deliberately below the original 90–120 plan — depth over breadth.

## 5. Review protocol (max 2 rounds)

1. **Realism reviewer** (banking/GTM persona, in-session subagent): reads only
   the export; flags anything that "would never happen" or reads fake.
2. **AI-tell detector** (in-session subagent): hunts LLM-authored tells —
   uniform sentence rhythm across personas, "I hope this finds you well"-class
   clichés, over-tidy threads, perfect grammar everywhere.
3. **Blind labeler** (in-session subagent): sees only messages, predicts each
   account's label + confidence. Pass = match gold on 9/10, where account 9
   may land either side **provided** it expresses low certainty (routing, not
   the label, is its success criterion). Account 10 must be called "no signal".
   - *Known limitation:* in-session reviewers share the author's model family,
     so blind spots can correlate. Closing move: candidate pastes the export
     into Claude web (different family, no gold shown) for one cross-family
     blind pass before submitting the repo.
4. Disagreements revise the **data**, not the gold, unless the realism reviewer
   makes the case that the scenario itself is wrong.

## 6. Decisions log (Q&A ammunition)

| # | Decision | Why |
|---|---|---|
| D1 | Injection email kept, but subtle (buried in a forwarded chain, styled as a system note) | Demos a real failure mode; cartoonish versions prove nothing |
| D2 | Results store paraphrase + task IDs only — never verbatim bodies | Privacy constraint: bodies never leave the source of truth; UI joins by ID to render context |
| D3 | Volume cut to ~65 emails, ≤2 review rounds | Timebox: pipeline, UI and explainer matter more than input bulk |
| D4 | Automated messages pre-filtered by rules, not model | "When not to use AI" + token cost |
| D5 | Mixed = materially conflicting signals across personas/channels within window | Prevents labeler drift on accounts 5/9 |
| D6 | Dates stored as day-offsets, materialized at load | Demo window is always fresh; no stale dates in the repo |
| D7 | Renewal proximity shown in UI but excluded from sentiment input | Sentiment = relationship signals; renewal is GTM context |
| D8 | Production model choice + cached-results demo fallback | Decided in pipeline phase: cheap fast model for bulk, escalation tier for ambiguous/low-confidence; demo runs on cached results if the API is down (also an operations talking point) |
| D9 | Skipped accounts keep previous label, no write | Salesforce daily write limits + cost |

---
**Next step after approval:** generate `data/salesforce-export.json` +
`data/gold-labels.json` to this spec, run the structural validator, then the
review rounds above.
