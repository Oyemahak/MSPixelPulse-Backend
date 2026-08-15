import { mongoState } from "../config/db.js";
import { providerStatus } from "../config/providers.js";
import { storageProviderStatus } from "../storage/provider.js";
import { mailerStatus } from "./mailer.js";

export function healthPayload() {
  const storage = storageProviderStatus();
  const email = mailerStatus();
  const providers = providerStatus();

  const payload = {
    success: true,
    service: "mspixelpulse-api",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),

    providers,
    storage,
    email,
  };

  // Mongoose schemas remain as the controller compatibility façade, but
  // Google production intentionally has no MongoDB connection to report.
  if (providers.data === 'mongodb') {
    payload.mongodb = {
      state: mongoState(),
      connected: mongoState() === 'connected',
    };
  }

  return payload;
}
