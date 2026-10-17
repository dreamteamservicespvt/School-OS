// Imports every module's import kinds (defineImport), so the shared importer
// in Settings, Data Backup & Security lists them all. Add one import line per
// module that offers an Import button.
import "server-only";

import "./data-security/import-kinds";
import "./staff/import";
import "./fees/import";
import "./finance/import";
import "./students/import";
import "./students/update-import";
import "./admission/import";
import "./events/import";
import "./library/import";
import "./hostel/import";
import "./inventory/import";
