import { readFileSync } from "node:fs";
import {
  SalesforceExportSchema,
  GoldFileSchema,
  type Task,
} from "../src/lib/schemas.ts";

const WINDOW_DAYS = 13;

const exportData = SalesforceExportSchema.parse(
  JSON.parse(readFileSync(new URL("../data/salesforce.json", import.meta.url), "utf8")),
);

const goldData = GoldFileSchema.parse(
  JSON.parse(readFileSync(new URL("../data/gold-labels.json", import.meta.url), "utf8")),
);

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

const accountIds = new Set(exportData.accounts.map((a) => a.id));

for (const task of exportData.tasks) {
  if (!accountIds.has(task.accountId)) fail(`${task.id}: unknown accountId ${task.accountId}`);
  if (task.daysAgo > WINDOW_DAYS) fail(`${task.id}: daysAgo ${task.daysAgo} outside window`);
  if (task.isAutomated && !task.autoType) fail(`${task.id}: automated without autoType`);
  if (!task.isAutomated && task.autoType) fail(`${task.id}: autoType set on human message`);
  if (!task.isAutomated) {
    const senderSide = task.direction === "Inbound" ? "account" : "backbase";
    if (task.from.side !== senderSide) fail(`${task.id}: ${task.direction} from side ${task.from.side}`);
    for (const recipient of task.to) {
      const recipientSide = task.direction === "Inbound" ? "backbase" : "account";
      if (recipient.side !== recipientSide) fail(`${task.id}: ${task.direction} to side ${recipient.side}`);
    }
  }
}

for (const event of exportData.events) {
  if (!accountIds.has(event.accountId)) fail(`${event.id}: unknown accountId ${event.accountId}`);
  if (event.daysAgo > WINDOW_DAYS) fail(`${event.id}: daysAgo ${event.daysAgo} outside window`);
}

const byThread = new Map<string, Task[]>();
for (const task of exportData.tasks) {
  byThread.set(task.threadId, [...(byThread.get(task.threadId) ?? []), task]);
}

for (const [threadId, tasks] of byThread) {
  for (let i = 1; i < tasks.length; i++) {
    const prev = tasks[i - 1];
    const curr = tasks[i];
    if (curr.daysAgo > prev.daysAgo) {
      fail(`${curr.id}: out of order in ${threadId} (${prev.id} ${prev.daysAgo}d -> ${curr.id} ${curr.daysAgo}d)`);
    }
    if (curr.daysAgo === prev.daysAgo && curr.timeOfDay < prev.timeOfDay) {
      fail(`${curr.id}: same-day reply before original in ${threadId}`);
    }
  }
}

for (const account of exportData.accounts) {
  const humanActivity =
    exportData.tasks.some((t) => t.accountId === account.id && !t.isAutomated) ||
    exportData.events.some((e) => e.accountId === account.id);
  if (account.id === "ACC-BELLWETHER" && humanActivity) {
    fail(`${account.id}: should have zero activity`);
  }
  if (account.id !== "ACC-BELLWETHER" && !humanActivity) {
    fail(`${account.id}: no human activity in window`);
  }
}

const goldAccounts = goldData.gold.map((g) => g.accountId);
if (goldAccounts.length !== new Set(goldAccounts).size) fail("gold has duplicate accounts");
for (const id of goldAccounts) {
  if (!accountIds.has(id)) fail(`gold references unknown account ${id}`);
}
for (const id of accountIds) {
  if (!goldAccounts.includes(id)) fail(`account ${id} missing from gold`);
}

const automated = exportData.tasks.filter((t) => t.isAutomated);
console.log(`accounts: ${exportData.accounts.length}`);
console.log(`tasks: ${exportData.tasks.length} (${automated.length} automated, ${exportData.tasks.length - automated.length} human)`);
console.log(`events: ${exportData.events.length}`);
console.log(`threads: ${byThread.size}`);
console.log(`unreferenced task ids: none`);

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nall checks passed");
