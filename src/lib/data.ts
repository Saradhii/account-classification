import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SalesforceExportSchema,
  GoldFileSchema,
  type SalesforceExport,
  type GoldFile,
} from "./schemas.ts";

function readDataFile(fileName: string): string {
  return readFileSync(path.join(process.cwd(), "data", fileName), "utf8");
}

export function loadExport(): SalesforceExport {
  return SalesforceExportSchema.parse(JSON.parse(readDataFile("salesforce-export.json")));
}

export function loadGold(): GoldFile {
  return GoldFileSchema.parse(JSON.parse(readDataFile("gold-labels.json")));
}

export function materializeTimestamp(daysAgo: number, timeOfDay: string, runDate: Date): string {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const date = new Date(runDate);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}
