import type {ActionFunctionArgs} from "react-router";
import {calculateCarbon} from "../services/carbon.server";
import {suggestPackaging} from "../services/packaging.server";
import {quoteOffset} from "../services/offset.server";
import {authenticate} from "../shopify.server";

export const action = async ({request}: ActionFunctionArgs) => {
  try {
    await authenticate.admin(request);
    const body = await request.json() as Record<string, unknown>;
    const weightGrams = Number(body.weightGrams);
    const itemCount = Number(body.itemCount || 1);
    if (!Number.isFinite(weightGrams) || weightGrams < 1 || weightGrams > 100000) throw new Error("Invalid weight");
    if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > 200) throw new Error("Invalid item count");
    const carbon = await calculateCarbon({
      weightGrams,
      destinationCountry: String(body.countryCode || "IT").slice(0, 2),
      postalCode: String(body.postalCode || "").slice(0, 12),
      carrier: String(body.carrier || "standard").slice(0, 30),
    });
    const packaging = suggestPackaging({weightGrams, itemCount});
    return Response.json({carbon, packaging, offset: await quoteOffset(carbon.emissionsKg)}, {
      headers: {"Cache-Control": "private, max-age=300"},
    });
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Invalid request"}, {status: 400});
  }
};
