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
  return SalesforceExportSchema.parse(JSON.parse(readDataFile("salesforce.json")));
}

export function loadGold(): GoldFile {
  return GoldFileSchema.parse(JSON.parse(readDataFile("gold-labels.json")));
}
