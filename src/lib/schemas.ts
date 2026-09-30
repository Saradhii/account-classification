import { z } from "zod";

export const DirectionSchema = z.enum(["Inbound", "Outbound"]);

export const AutoTypeSchema = z.enum([
  "OOO",
  "BOUNCE",
  "CALENDAR_ACCEPT",
  "CALENDAR_DECLINE",
  "NEWSLETTER",
]);

export const SideSchema = z.enum(["backbase", "account"]);

export const PersonRefSchema = z.object({
  name: z.string(),
  role: z.string(),
  side: SideSchema,
});

export const AccountTypeSchema = z.enum(["Customer", "Prospect"]);

export const LabelSchema = z.enum(["Positive", "Neutral", "Negative", "Mixed"]);

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: AccountTypeSchema,
  region: z.string(),
  tier: z.enum(["Tier 1", "Tier 2", "Tier 3"]),
  aeOwner: z.string(),
  csmOwner: z.string(),
  renewalInDays: z.number().int().min(0).nullable(),
  currentSentiment: LabelSchema.nullable(),
});

export const TaskSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  threadId: z.string(),
  direction: DirectionSchema,
  subject: z.string(),
  body: z.string(),
  from: PersonRefSchema,
  to: z.array(PersonRefSchema),
  daysAgo: z.number().int().min(0),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  isAutomated: z.boolean().default(false),
  autoType: AutoTypeSchema.optional(),
});

export const EventStatusSchema = z.enum(["Completed", "Cancelled", "No-show"]);

export const EventSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  subject: z.string(),
  attendees: z.array(PersonRefSchema),
  daysAgo: z.number().int().min(0),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int(),
  requestedBy: SideSchema,
  status: EventStatusSchema,
});

export const SalesforceExportSchema = z.object({
  accounts: z.array(AccountSchema),
  tasks: z.array(TaskSchema),
  events: z.array(EventSchema),
});

export const MessageSentimentSchema = z.enum([
  "Positive",
  "Neutral",
  "Negative",
]);

export const MessageAssessmentSchema = z.object({
  taskId: z.string(),
  sentiment: MessageSentimentSchema,
  note: z.string(),
  citedPersona: z.string(),
  weight: z.enum(["High", "Medium", "Low"]),
});

export const EventEvidenceSchema = z.object({
  eventId: z.string(),
  note: z.string(),
  weight: z.enum(["High", "Medium", "Low"]),
});

export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;

export const WriteOutcomeSchema = z.enum(["written", "unchanged", "none"]);

export const AccountResultSchema = z.object({
  accountId: z.string(),
  runId: z.string(),
  outcome: z.enum(["labeled", "skipped", "failed"]),
  label: LabelSchema.nullable(),
  priorLabel: LabelSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  reasoning: z.string(),
  evidence: z.array(MessageAssessmentSchema),
  eventEvidence: z.array(EventEvidenceSchema),
  consideredMessages: z.number().int(),
  filteredAsAutomated: z.number().int(),
  routedToReview: z.boolean(),
  salesforceWrite: WriteOutcomeSchema,
  ruleAdjustments: z.array(z.string()),
  llmMode: z.enum(["native", "fallback"]).nullable(),
  tokens: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }),
  modelUsed: z.string(),
  generatedAt: z.string(),
  error: z.string().optional(),
});

export const PipelineRunSummarySchema = z.object({
  accounts: z.number().int(),
  labeled: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  routedToReview: z.number().int(),
  salesforceWrites: z.number().int(),
  llmCalls: z.number().int(),
  filteredAutomatedMessages: z.number().int(),
  tokens: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }),
});

export const PipelineRunSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  modelUsed: z.string(),
  results: z.array(AccountResultSchema),
  summary: PipelineRunSummarySchema,
});

export const GoldSchema = z.object({
  accountId: z.string(),
  expected: z.enum(["Positive", "Neutral", "Negative", "Mixed", "Skipped"]),
  rationale: z.string(),
  expectedReviewRouting: z.boolean().optional(),
});

export const GoldFileSchema = z.object({
  notes: z.string(),
  gold: z.array(GoldSchema),
});

export type SalesforceExport = z.infer<typeof SalesforceExportSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Event = z.infer<typeof EventSchema>;
export type GoldFile = z.infer<typeof GoldFileSchema>;
export type AccountResult = z.infer<typeof AccountResultSchema>;
export type PipelineRun = z.infer<typeof PipelineRunSchema>;
export type Label = z.infer<typeof LabelSchema>;
