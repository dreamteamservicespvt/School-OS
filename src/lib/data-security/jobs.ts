// Background jobs of Settings, Data Backup & Security.
import "server-only";

import { defineJob } from "../jobs";
import { runDataExport } from "./data-export";
import "./imports";

defineJob("data-export", "The full data export", (tx, ctx, payload) => runDataExport(tx, ctx, payload as { exportId: string; models: string[] }), { ownTransaction: true });
