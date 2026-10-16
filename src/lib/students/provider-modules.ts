// Imports every module that offers Student Management a provider (today:
// Communication's Parent Link, see registerParentLink in ./guardians.ts), so
// they are registered before a Parent & Guardian screen or action runs.
// Add one import line per provider.
import "server-only";
import "../communication/student-parent-link";
