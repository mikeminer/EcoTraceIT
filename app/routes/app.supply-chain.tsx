import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {Form, useActionData, useLoaderData} from "react-router";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";
import {isEmail, normalizeCode, validateLaboratory, validateSupplier} from "../services/supply-chain.server";

const text = (form: FormData, key: string, max = 4000) => String(form.get(key) || "").trim().slice(0, max);
const checked = (form: FormData, key: string) => form.get(key) === "yes";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  const [manufacturer, suppliers, laboratories] = await Promise.all([
    prisma.manufacturerResponsible.findUnique({where: {shop: session.shop}}),
    prisma.supplier.findMany({where: {shop: session.shop}, include: {_count: {select: {components: true, declarations: true}}}, orderBy: [{status: "asc"}, {legalName: "asc"}]}),
    prisma.testingLaboratory.findMany({where: {shop: session.shop}, include: {_count: {select: {tests: true}}}, orderBy: [{status: "asc"}, {legalName: "asc"}]}),
  ]);
  return {manufacturer, suppliers, laboratories};
};

export const action = async ({request}: ActionFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  const intent = text(form, "intent", 40);
  const actor = session.id ? `shopify-session:${session.id}` : session.shop;
  await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});

  try {
    if (intent === "saveManufacturer") {
      const data = {
        manufacturerLegalName: text(form, "manufacturerLegalName", 200),
        vatNumber: text(form, "vatNumber", 40) || null,
        eoriNumber: text(form, "eoriNumber", 40) || null,
        streetAddress: text(form, "streetAddress", 250),
        postalCode: text(form, "postalCode", 20),
        city: text(form, "city", 100),
        countryCode: text(form, "countryCode", 2).toUpperCase() || "IT",
        responsibleName: text(form, "responsibleName", 200),
        responsibleRole: text(form, "responsibleRole", 200),
        responsibleEmail: text(form, "responsibleEmail", 200).toLowerCase(),
        authorityBasis: text(form, "authorityBasis", 2000),
        identityVerificationMethod: "SHOPIFY_ADMIN_ATTESTATION",
      };
      if (!data.manufacturerLegalName || !data.streetAddress || !data.postalCode || !data.city || !/^[A-Z]{2}$/.test(data.countryCode)
        || !data.responsibleName || !data.responsibleRole || !data.responsibleEmail || !isEmail(data.responsibleEmail) || data.authorityBasis.length < 10) {
        return {ok: false, error: "Completa fabbricante, indirizzo, responsabile, email e base dei poteri di firma."};
      }
      await prisma.manufacturerResponsible.upsert({where: {shop: session.shop}, create: {shop: session.shop, ...data}, update: data});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "MANUFACTURER_RESPONSIBLE_UPDATED", details: {responsibleRole: data.responsibleRole, verificationMethod: data.identityVerificationMethod}}});
      return {ok: true, message: "Fabbricante e responsabile della firma salvati."};
    }

    if (intent === "saveSupplier") {
      const supplierCode = normalizeCode(text(form, "supplierCode", 64));
      const input = {
        supplierCode,
        legalName: text(form, "legalName", 200),
        countryCode: text(form, "countryCode", 2).toUpperCase() || "IT",
        contactEmail: text(form, "contactEmail", 200).toLowerCase() || null,
        website: text(form, "website", 1000) || null,
      };
      const errors = validateSupplier(input);
      if (errors.length) return {ok: false, error: errors.join(" · ")};
      const data = {
        ...input,
        tradeName: text(form, "tradeName", 200) || null,
        vatNumber: text(form, "vatNumber", 40) || null,
        streetAddress: text(form, "streetAddress", 250) || null,
        postalCode: text(form, "postalCode", 20) || null,
        city: text(form, "city", 100) || null,
        contactName: text(form, "contactName", 200) || null,
        contactPhone: text(form, "contactPhone", 40) || null,
        eprRegistrationNumber: text(form, "eprRegistrationNumber", 100) || null,
        reachDeclarationRef: text(form, "reachDeclarationRef", 200) || null,
        foodContactRegistration: text(form, "foodContactRegistration", 200) || null,
        status: "PENDING",
        approvedBy: null,
        approvedAt: null,
      };
      const supplier = await prisma.supplier.upsert({
        where: {shop_supplierCode: {shop: session.shop, supplierCode}},
        create: {shop: session.shop, ...data},
        update: data,
      });
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "SUPPLIER_SAVED", details: {supplierId: supplier.id, supplierCode, status: "PENDING"}}});
      return {ok: true, message: `Fornitore ${supplierCode} salvato; approvalo dopo la verifica documentale.`};
    }

    if (intent === "approveSupplier") {
      const supplierId = text(form, "supplierId", 100);
      if (!checked(form, "approvalAck")) return {ok: false, error: "Conferma di aver verificato l'identità e i documenti del fornitore."};
      const supplier = await prisma.supplier.findFirst({where: {id: supplierId, shop: session.shop}});
      if (!supplier) return {ok: false, error: "Fornitore non trovato."};
      await prisma.supplier.update({where: {id: supplier.id}, data: {status: "APPROVED", approvedBy: actor, approvedAt: new Date()}});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "SUPPLIER_APPROVED", details: {supplierId: supplier.id, supplierCode: supplier.supplierCode}}});
      return {ok: true, message: `Fornitore ${supplier.supplierCode} approvato.`};
    }

    if (intent === "suspendSupplier") {
      const supplierId = text(form, "supplierId", 100);
      if (!checked(form, "approvalAck")) return {ok: false, error: "Conferma la sospensione del fornitore."};
      const supplier = await prisma.supplier.findFirst({where: {id: supplierId, shop: session.shop}});
      if (!supplier) return {ok: false, error: "Fornitore non trovato."};
      await prisma.supplier.update({where: {id: supplier.id}, data: {status: "SUSPENDED", approvedBy: null, approvedAt: null}});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "SUPPLIER_SUSPENDED", details: {supplierId: supplier.id, supplierCode: supplier.supplierCode}}});
      return {ok: true, message: `Fornitore ${supplier.supplierCode} sospeso; i controlli dei fascicoli collegati segnaleranno il problema.`};
    }

    if (intent === "saveLaboratory") {
      const laboratoryCode = normalizeCode(text(form, "laboratoryCode", 64));
      const input = {
        laboratoryCode,
        legalName: text(form, "legalName", 200),
        countryCode: text(form, "countryCode", 2).toUpperCase() || "IT",
        accreditationBody: text(form, "accreditationBody", 200),
        accreditationNumber: text(form, "accreditationNumber", 100),
        accreditationScope: text(form, "accreditationScope", 4000),
        contactEmail: text(form, "contactEmail", 200).toLowerCase() || null,
        website: text(form, "website", 1000) || null,
      };
      const errors = validateLaboratory(input);
      if (errors.length) return {ok: false, error: errors.join(" · ")};
      const data = {...input, status: "PENDING", approvedBy: null, approvedAt: null};
      const laboratory = await prisma.testingLaboratory.upsert({
        where: {shop_laboratoryCode: {shop: session.shop, laboratoryCode}},
        create: {shop: session.shop, ...data},
        update: data,
      });
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "LABORATORY_SAVED", details: {laboratoryId: laboratory.id, laboratoryCode, status: "PENDING"}}});
      return {ok: true, message: `Laboratorio ${laboratoryCode} salvato; approvalo dopo aver verificato l'accreditamento.`};
    }

    if (intent === "approveLaboratory") {
      const laboratoryId = text(form, "laboratoryId", 100);
      if (!checked(form, "approvalAck")) return {ok: false, error: "Conferma di aver verificato accreditamento e campo di prova."};
      const laboratory = await prisma.testingLaboratory.findFirst({where: {id: laboratoryId, shop: session.shop}});
      if (!laboratory) return {ok: false, error: "Laboratorio non trovato."};
      await prisma.testingLaboratory.update({where: {id: laboratory.id}, data: {status: "APPROVED", approvedBy: actor, approvedAt: new Date()}});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "LABORATORY_APPROVED", details: {laboratoryId: laboratory.id, laboratoryCode: laboratory.laboratoryCode}}});
      return {ok: true, message: `Laboratorio ${laboratory.laboratoryCode} approvato.`};
    }

    if (intent === "suspendLaboratory") {
      const laboratoryId = text(form, "laboratoryId", 100);
      if (!checked(form, "approvalAck")) return {ok: false, error: "Conferma la sospensione del laboratorio."};
      const laboratory = await prisma.testingLaboratory.findFirst({where: {id: laboratoryId, shop: session.shop}});
      if (!laboratory) return {ok: false, error: "Laboratorio non trovato."};
      await prisma.testingLaboratory.update({where: {id: laboratory.id}, data: {status: "SUSPENDED", approvedBy: null, approvedAt: null}});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "LABORATORY_SUSPENDED", details: {laboratoryId: laboratory.id, laboratoryCode: laboratory.laboratoryCode}}});
      return {ok: true, message: `Laboratorio ${laboratory.laboratoryCode} sospeso; le prove collegate saranno rivalutate.`};
    }

    return {ok: false, error: "Operazione non riconosciuta."};
  } catch (error) {
    console.error(JSON.stringify({event: "supply_chain_action_failed", shop: session.shop, intent, message: error instanceof Error ? error.message : "unknown"}));
    return {ok: false, error: error instanceof Error ? error.message : "Errore inatteso nella catena di fornitura."};
  }
};

const field = {display: "grid", gap: 4} as const;
const grid = {display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12} as const;
const input = {width: "100%", padding: 9, border: "1px solid #8a8a8a", borderRadius: 6} as const;

export default function SupplyChain() {
  const {manufacturer, suppliers, laboratories} = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <s-page heading="Fornitori, laboratori e fabbricante">
    <s-banner tone="info">Registra solo dati professionali necessari al fascicolo. EcoTraceIT conserva riferimenti e hash, non copia documenti né dati sensibili.</s-banner>
    {result?.message && <s-banner tone="success">{result.message}</s-banner>}
    {result?.error && <s-banner tone="critical">{result.error}</s-banner>}

    <s-section heading="1. Fabbricante e responsabile autorizzato">
      <Form method="post"><input type="hidden" name="intent" value="saveManufacturer" />
        <div style={grid}>
          <label style={field}>Ragione sociale fabbricante<input name="manufacturerLegalName" defaultValue={manufacturer?.manufacturerLegalName || ""} required style={input} /></label>
          <label style={field}>Partita IVA<input name="vatNumber" defaultValue={manufacturer?.vatNumber || ""} style={input} /></label>
          <label style={field}>EORI<input name="eoriNumber" defaultValue={manufacturer?.eoriNumber || ""} style={input} /></label>
          <label style={field}>Indirizzo<input name="streetAddress" defaultValue={manufacturer?.streetAddress || ""} required style={input} /></label>
          <label style={field}>CAP<input name="postalCode" defaultValue={manufacturer?.postalCode || ""} required style={input} /></label>
          <label style={field}>Città<input name="city" defaultValue={manufacturer?.city || ""} required style={input} /></label>
          <label style={field}>Paese ISO<input name="countryCode" defaultValue={manufacturer?.countryCode || "IT"} minLength={2} maxLength={2} required style={input} /></label>
          <label style={field}>Responsabile<input name="responsibleName" defaultValue={manufacturer?.responsibleName || ""} required style={input} /></label>
          <label style={field}>Ruolo<input name="responsibleRole" defaultValue={manufacturer?.responsibleRole || ""} required style={input} /></label>
          <label style={field}>Email professionale<input type="email" name="responsibleEmail" defaultValue={manufacturer?.responsibleEmail || ""} required style={input} /></label>
        </div>
        <label style={field}>Base dei poteri di firma<textarea name="authorityBasis" defaultValue={manufacturer?.authorityBasis || ""} minLength={10} rows={3} required style={input} placeholder="Es. legale rappresentante risultante dalla visura camerale…" /></label>
        <p><button type="submit">Salva responsabile</button></p>
      </Form>
    </s-section>

    <s-section heading="2. Anagrafica fornitori">
      {suppliers.map((supplier) => <s-box key={supplier.id} padding="base" borderWidth="base" borderRadius="base">
        <s-heading>{supplier.supplierCode} · {supplier.legalName}</s-heading>
        <s-paragraph>{supplier.status} · {supplier.countryCode} · {supplier._count.components} componenti · {supplier._count.declarations} dichiarazioni</s-paragraph>
        {supplier.status !== "APPROVED" ? <Form method="post"><input type="hidden" name="intent" value="approveSupplier" /><input type="hidden" name="supplierId" value={supplier.id} />
          <label><input type="checkbox" name="approvalAck" value="yes" required /> Ho verificato identità e documenti professionali.</label> <button type="submit">Approva</button>
        </Form> : <Form method="post"><input type="hidden" name="intent" value="suspendSupplier" /><input type="hidden" name="supplierId" value={supplier.id} />
          <label><input type="checkbox" name="approvalAck" value="yes" required /> Confermo la sospensione.</label> <button type="submit">Sospendi</button>
        </Form>}
      </s-box>)}
      <Form method="post"><input type="hidden" name="intent" value="saveSupplier" />
        <div style={grid}>
          <label style={field}>Codice interno<input name="supplierCode" placeholder="SUP-001" required style={input} /></label>
          <label style={field}>Ragione sociale<input name="legalName" required style={input} /></label>
          <label style={field}>Nome commerciale<input name="tradeName" style={input} /></label>
          <label style={field}>Partita IVA<input name="vatNumber" style={input} /></label>
          <label style={field}>Paese ISO<input name="countryCode" defaultValue="IT" minLength={2} maxLength={2} required style={input} /></label>
          <label style={field}>Indirizzo<input name="streetAddress" style={input} /></label>
          <label style={field}>CAP<input name="postalCode" style={input} /></label>
          <label style={field}>Città<input name="city" style={input} /></label>
          <label style={field}>Referente<input name="contactName" style={input} /></label>
          <label style={field}>Email professionale<input type="email" name="contactEmail" style={input} /></label>
          <label style={field}>Telefono<input name="contactPhone" style={input} /></label>
          <label style={field}>Sito HTTPS<input type="url" name="website" style={input} /></label>
          <label style={field}>Registrazione EPR<input name="eprRegistrationNumber" style={input} /></label>
          <label style={field}>Rif. dichiarazione REACH<input name="reachDeclarationRef" style={input} /></label>
          <label style={field}>Registrazione MOCA<input name="foodContactRegistration" style={input} /></label>
        </div><p><button type="submit">Salva fornitore</button></p>
      </Form>
    </s-section>

    <s-section heading="3. Laboratori e accreditamenti">
      {laboratories.map((laboratory) => <s-box key={laboratory.id} padding="base" borderWidth="base" borderRadius="base">
        <s-heading>{laboratory.laboratoryCode} · {laboratory.legalName}</s-heading>
        <s-paragraph>{laboratory.status} · {laboratory.accreditationBody} {laboratory.accreditationNumber} · {laboratory._count.tests} prove</s-paragraph>
        {laboratory.status !== "APPROVED" ? <Form method="post"><input type="hidden" name="intent" value="approveLaboratory" /><input type="hidden" name="laboratoryId" value={laboratory.id} />
          <label><input type="checkbox" name="approvalAck" value="yes" required /> Ho verificato accreditamento e campo di prova.</label> <button type="submit">Approva</button>
        </Form> : <Form method="post"><input type="hidden" name="intent" value="suspendLaboratory" /><input type="hidden" name="laboratoryId" value={laboratory.id} />
          <label><input type="checkbox" name="approvalAck" value="yes" required /> Confermo la sospensione.</label> <button type="submit">Sospendi</button>
        </Form>}
      </s-box>)}
      <Form method="post"><input type="hidden" name="intent" value="saveLaboratory" />
        <div style={grid}>
          <label style={field}>Codice interno<input name="laboratoryCode" placeholder="LAB-001" required style={input} /></label>
          <label style={field}>Ragione sociale<input name="legalName" required style={input} /></label>
          <label style={field}>Paese ISO<input name="countryCode" defaultValue="IT" minLength={2} maxLength={2} required style={input} /></label>
          <label style={field}>Ente di accreditamento<input name="accreditationBody" placeholder="Es. Accredia" required style={input} /></label>
          <label style={field}>Numero accreditamento<input name="accreditationNumber" required style={input} /></label>
          <label style={field}>Email professionale<input type="email" name="contactEmail" style={input} /></label>
          <label style={field}>Sito HTTPS<input type="url" name="website" style={input} /></label>
        </div>
        <label style={field}>Campo di accreditamento<textarea name="accreditationScope" minLength={10} rows={3} required style={input} /></label>
        <p><button type="submit">Salva laboratorio</button></p>
      </Form>
    </s-section>
  </s-page>;
}
