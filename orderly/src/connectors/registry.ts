import type { Connector } from "./types";
import { gmailConnector } from "./gmail";
import { googleCalendarConnector } from "./googleCalendar";
import { bankConnector } from "./bank";

export const CONNECTORS: Record<string, Connector> = {
  [gmailConnector.provider]: gmailConnector,
  [googleCalendarConnector.provider]: googleCalendarConnector,
  [bankConnector.provider]: bankConnector,
};

export function getConnector(provider: string): Connector {
  const c = CONNECTORS[provider];
  if (!c) throw new Error(`Unknown connector: ${provider}`);
  return c;
}

export const CONNECTOR_LIST = Object.values(CONNECTORS).map((c) => ({
  provider: c.provider,
  label: c.label,
  description: c.description,
  isOAuth: Boolean(c.oauth),
}));
