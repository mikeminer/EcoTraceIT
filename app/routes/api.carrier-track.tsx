import type {LoaderFunctionArgs} from "react-router";
import {authenticate} from "../shopify.server";
import {trackShipment, type CarrierCode} from "../services/carrier.server";

export async function loader({request}: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const carrier = String(url.searchParams.get("carrier") || "").toUpperCase() as CarrierCode;
  const trackingNumber = String(url.searchParams.get("tracking") || "");
  if (!["DHL", "FEDEX"].includes(carrier)) return Response.json({error: "Corriere supportato: DHL o FEDEX."}, {status: 400});
  try {
    return Response.json(await trackShipment(carrier, trackingNumber), {headers: {"Cache-Control": "private, no-store"}});
  } catch (error) {
    console.error(JSON.stringify({event: "carrier_tracking_failed", carrier, message: error instanceof Error ? error.message : "unknown"}));
    return Response.json({error: error instanceof Error ? error.message : "Tracking non disponibile."}, {status: 502});
  }
}
