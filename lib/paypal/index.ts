import type { PayPalService } from "./types";
import { mockPayPalService } from "./mock";
import { livePayPalService } from "./client";

// Single switch point: USE_MOCK_DATA (default "true") picks mock vs live.
// Everything else in the app imports `paypal` from here and never has to
// know which mode it's running in.
const useMock = process.env.USE_MOCK_DATA !== "false";

export const paypal: PayPalService = useMock
  ? mockPayPalService
  : livePayPalService;

export * from "./types";
