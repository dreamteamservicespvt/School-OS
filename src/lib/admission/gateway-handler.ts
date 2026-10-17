// The gateway's confirmation of an online application fee (A8). Imported by
// the Razorpay webhook route, which runs the gateway handlers.
import "server-only";

import { onGatewayEvent } from "../payments/events";
import { onAdmissionGatewayEvent } from "./fee";

onGatewayEvent(onAdmissionGatewayEvent);
