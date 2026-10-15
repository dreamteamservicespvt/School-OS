// Every module's undo handlers are imported here so they are registered
// before an undo runs. Add one import line per module that offers Undo.
import "server-only";
import "./settings/undo";
import "./academic/undo";

import "./communication/undo";
import "./students/undo";
import "./dashboard/undo";
import "./homework/undo";
import "./front-office/undo";
