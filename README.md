# EcoPack AI

Shopify App embedded per e-commerce italiani: calcolo CO₂e, packaging riciclabile, opzione Carbon Neutral e report merchant. Usa il template React Router ufficiale Shopify 2026 (evoluzione Remix), Polaris web components, App Bridge, Session Token, Prisma e Shopify UI Extensions.

## Incluso

- Formula CO₂e da peso, CAP/paese UE e corriere, più integrazione Carbon Interface con timeout e fallback.
- Webhook idempotenti orders/create e orders/updated.
- Metafield ordine ecopack_ai.co2_kg ed ecopack_ai.packaging.
- Suggerimento packaging ed etichetta ambientale IT/EN.
- Dashboard mensile e statistiche prodotto.
- Checkout UI Extension con badge e toggle offset; Admin Order Block; Theme App Extension.
- Shopify App Pricing Free, Pro €29/mese ed Enterprise usage-based.
- Webhook privacy e minimizzazione GDPR: nessun nome, email o indirizzo completo.

## Avvio locale

Requisiti: Node 22.12+ (richiesto dalla Shopify CLI 4), Shopify CLI e development store.

~~~powershell
Copy-Item .env.example .env
npm install
npm run setup
npm run dev
~~~

Eseguire shopify app config link per collegare il progetto e sostituire client_id/URL. Aggiungere i blocchi checkout e tema dagli editor Shopify.

## Chiavi API

- CARBON_API_PROVIDER=formula: calcolo locale.
- CARBON_API_PROVIDER=carbon-interface e CARBON_INTERFACE_API_KEY: provider esterno con fallback.
- OPENROUTESERVICE_API_KEY: placeholder per routing futuro, solo server.
- OFFSET_API_URL e OFFSET_API_KEY: provider offset; senza valori funziona in sandbox.
- offsetVariantId nelle impostazioni dell'estensione: GID della variante Shopify usata come extra pagabile.

Non esporre segreti nelle estensioni, nei TOML o nei metafield pubblici.

## Shopify App Pricing

Configurare nel Dev Dashboard/submission form:

1. free: €0, 100 ordini/mese.
2. pro: €29 EUR/mese, report avanzati, offset e calcoli illimitati.
3. enterprise: ricorrente più usage meter con tier graduati.

Redirect post-selezione: /app/pricing. La route acquisisce plan_handle. Prima della produzione completare la verifica autorevole con Partner API usando PARTNER_API_TOKEN, SHOPIFY_ORGANIZATION_ID e SHOPIFY_APP_ID. Non viene usata la Billing API legacy.

## Deploy

~~~powershell
npm ci
npm run setup
npm run typecheck
npm test
npm run build
shopify app deploy
~~~

Distribuire il server su hosting Node HTTPS e usare PostgreSQL gestito in produzione, cambiando provider Prisma e DATABASE_URL. Poi configurare SHOPIFY_APP_URL, distribuire le estensioni, reinstallare dopo modifiche scope e testare webhook, checkout, uninstall e privacy.

## GDPR e PPWR

EcoPack AI conserva paese, prefisso CAP, peso e identificatori tecnici ordine/prodotto. shop/redact elimina i dati dello shop. Poiché non vengono memorizzati identificativi cliente, customers/data_request e customers/redact non esportano dati personali. Prima della submission pubblicare privacy policy, DPA, retention e subprocessors.

Etichette e suggerimenti PPWR sono supporto operativo, non consulenza legale. Far validare materiali, codici e obblighi nazionali. Evitare claim assoluti come “zero impatto”.

## Listing App Store

Titolo: EcoPack AI – CO₂ & Packaging

Subtitle: Calcola CO₂, packaging sostenibile e offset per ogni ordine.

Descrizione:

EcoPack AI aiuta gli e-commerce italiani a trasformare i dati di spedizione in azioni concrete. Calcola automaticamente la CO₂e stimata usando peso, destinazione e modalità di consegna. Suggerisce un imballaggio riciclabile adatto e genera una proposta di etichetta ambientale in italiano e inglese.

Mostra ai clienti un badge leggero durante il checkout e, con Pro, consente di scegliere una spedizione Carbon Neutral. La dashboard raccoglie emissioni, risparmio stimato, andamento mensile e prodotti a maggior impatto. Ideale per moda, beauty, food e home & living. La stima checkout è locale e veloce; l'elaborazione completa avviene dopo l'ordine.

Keyword: sostenibilità, CO2, carbon neutral, packaging, PPWR, etichetta ambientale, emissioni, ESG, spedizioni.

## Immagini promozionali

1. Hero 1600×900 con KPI dashboard.
2. Checkout con badge e toggle Carbon Neutral.
3. Packaging con busta riciclata, scatola FSC ed etichetta.
4. Report mensile e prodotti ad alto impatto.
5. Metafield ordine e messaggio privacy.

Palette: verde bosco #174C2B, salvia #E6F4EA, terra #9A6B45, fondo #F7F6F2. Usare screenshot reali del dev store.
