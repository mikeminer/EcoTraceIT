export type CarrierCode = "DHL" | "FEDEX";
export type TrackingEvent = {timestamp: string; status: string; description: string; location?: string};
export type TrackingResult = {carrier: CarrierCode; trackingNumber: string; status: string; delivered: boolean; events: TrackingEvent[]};

async function request(url: string, init: RequestInit, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {...init, signal: controller.signal});
    if (!response.ok) throw new Error(`Carrier API ${response.status}`);
    return response;
  } finally { clearTimeout(timeout); }
}

async function trackDhl(trackingNumber: string): Promise<TrackingResult> {
  const key = process.env.DHL_API_KEY;
  const secret = process.env.DHL_API_SECRET;
  if (!key || !secret) throw new Error("Credenziali DHL_API_KEY/DHL_API_SECRET mancanti.");
  const response = await request(`https://express.api.dhl.com/mydhlapi/shipments/${encodeURIComponent(trackingNumber)}/tracking`, {headers: {Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`, Accept: "application/json"}});
  const data = await response.json() as {shipments?: Array<{status?: {statusCode?: string; description?: string}; events?: Array<{date?: string; time?: string; typeCode?: string; description?: string; serviceArea?: {description?: string}}>} >};
  const shipment = data.shipments?.[0];
  const events = (shipment?.events || []).map((event) => ({timestamp: [event.date, event.time].filter(Boolean).join("T"), status: event.typeCode || "UNKNOWN", description: event.description || "", location: event.serviceArea?.description}));
  const status = shipment?.status?.statusCode || "UNKNOWN";
  return {carrier: "DHL", trackingNumber, status, delivered: status === "delivered" || status === "OK", events};
}

let fedexToken: {value: string; expiresAt: number} | undefined;
async function fedexAccessToken() {
  if (fedexToken && fedexToken.expiresAt > Date.now() + 60_000) return fedexToken.value;
  const clientId = process.env.FEDEX_CLIENT_ID;
  const clientSecret = process.env.FEDEX_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Credenziali FEDEX_CLIENT_ID/FEDEX_CLIENT_SECRET mancanti.");
  const body = new URLSearchParams({grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret});
  const response = await request("https://apis.fedex.com/oauth/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body});
  const data = await response.json() as {access_token?: string; expires_in?: number};
  if (!data.access_token) throw new Error("Token FedEx non disponibile.");
  fedexToken = {value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000};
  return fedexToken.value;
}

async function trackFedex(trackingNumber: string): Promise<TrackingResult> {
  const token = await fedexAccessToken();
  const response = await request("https://apis.fedex.com/track/v1/trackingnumbers", {method: "POST", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-locale": "it_IT"}, body: JSON.stringify({includeDetailedScans: true, trackingInfo: [{trackingNumberInfo: {trackingNumber}}]})});
  const data = await response.json() as {output?: {completeTrackResults?: Array<{trackResults?: Array<{latestStatusDetail?: {code?: string; description?: string}; scanEvents?: Array<{date?: string; eventType?: string; eventDescription?: string; scanLocation?: {city?: string; countryCode?: string}}>} >}>}};
  const track = data.output?.completeTrackResults?.[0]?.trackResults?.[0];
  const events = (track?.scanEvents || []).map((event) => ({timestamp: event.date || "", status: event.eventType || "UNKNOWN", description: event.eventDescription || "", location: [event.scanLocation?.city, event.scanLocation?.countryCode].filter(Boolean).join(", ")}));
  const status = track?.latestStatusDetail?.code || "UNKNOWN";
  return {carrier: "FEDEX", trackingNumber, status, delivered: status === "DL", events};
}

export async function trackShipment(carrier: CarrierCode, trackingNumber: string) {
  if (!/^[A-Za-z0-9-]{6,40}$/.test(trackingNumber)) throw new Error("Numero di tracking non valido.");
  return carrier === "DHL" ? trackDhl(trackingNumber) : trackFedex(trackingNumber);
}
