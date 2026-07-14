import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {Form, useActionData, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {recordReuseEvent, registerReusableUnit, type ReuseEventType} from "../services/reuse.server";

export async function loader({request}: LoaderFunctionArgs) {
  const {session} = await authenticate.admin(request);
  const [profiles, units] = await Promise.all([
    prisma.packagingProfile.findMany({where: {shop: session.shop, status: "DECLARED", isReusable: true}, orderBy: {name: "asc"}}),
    prisma.reusablePackagingUnit.findMany({where: {shop: session.shop}, include: {profile: {select: {name: true}}, events: {orderBy: {occurredAt: "desc"}, take: 5}}, orderBy: {updatedAt: "desc"}, take: 200}),
  ]);
  return {profiles, units};
}

export async function action({request}: ActionFunctionArgs) {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  try {
    if (form.get("intent") === "register") {
      await registerReusableUnit(session.shop, String(form.get("profileId") || ""), String(form.get("serialNumber") || ""));
    } else {
      await recordReuseEvent({
        shop: session.shop,
        unitId: String(form.get("unitId") || ""),
        eventType: String(form.get("eventType") || "") as ReuseEventType,
        orderGid: String(form.get("orderGid") || "") || undefined,
        carrier: String(form.get("carrier") || "") || undefined,
        trackingNumber: String(form.get("trackingNumber") || "") || undefined,
        condition: String(form.get("condition") || "") || undefined,
        notes: String(form.get("notes") || "") || undefined,
      });
    }
    return {ok: true, error: ""};
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : "Operazione non riuscita."};
  }
}

const input = {padding: "8px", width: "100%"} as const;
export default function ReusePage() {
  const {profiles, units} = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <s-page heading="Imballaggi riutilizzabili">
    <s-banner tone="info">Il registro traccia identificativo, spedizione, ritorno, ispezione e fine vita. Un ciclo viene conteggiato alla spedizione.</s-banner>
    {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
    <s-section heading="Registra unità">
      <Form method="post"><input type="hidden" name="intent" value="register" />
        <label>Profilo dichiarato<select name="profileId" required style={input}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · max {p.reuseCycles} cicli</option>)}</select></label>
        <label>Seriale / QR<input name="serialNumber" required style={input} /></label>
        <button type="submit" disabled={!profiles.length}>Registra</button>
      </Form>
    </s-section>
    <s-section heading="Unità e reverse logistics">
      {!units.length && <s-text>Nessuna unità registrata.</s-text>}
      {units.map((unit) => <s-box key={unit.id} padding="base" borderWidth="base" borderRadius="base">
        <s-heading>{unit.serialNumber} · {unit.status}</s-heading>
        <s-text>{unit.profile.name} · cicli {unit.cycleCount}/{unit.maxCycles}</s-text>
        <Form method="post"><input type="hidden" name="intent" value="event" /><input type="hidden" name="unitId" value={unit.id} />
          <select name="eventType" style={input}><option>SHIP</option><option>REQUEST_RETURN</option><option>RECEIVE</option><option>INSPECT_PASS</option><option>INSPECT_FAIL</option><option>RETIRE</option></select>
          <input name="orderGid" placeholder="gid ordine (se applicabile)" style={input} />
          <input name="carrier" placeholder="Corriere" style={input} /><input name="trackingNumber" placeholder="Tracking" style={input} />
          <input name="condition" placeholder="Condizione all'ispezione" style={input} /><input name="notes" placeholder="Note / motivo fine vita" style={input} />
          <button type="submit">Registra evento</button>
        </Form>
      </s-box>)}
    </s-section>
  </s-page>;
}
