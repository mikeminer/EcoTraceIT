# EcoTraceIT

EcoTraceIT è un’app Shopify embedded per e-commerce italiani: calcola la CO₂e degli ordini, suggerisce packaging riciclabile ed etichette ambientali, offre l’opzione Carbon Neutral e genera report merchant per marketing e compliance.

Il progetto usa Shopify React Router (successore ufficiale del template Remix), App Bridge, Polaris web components, Session Token, Prisma e Shopify UI Extensions. Runtime, webhook ed estensioni sono allineati alla versione Shopify `2026-07`.

## Funzionalità

- Stima CO₂e da peso, paese/CAP, distanza e modalità di trasporto.
- Carbon Interface opzionale con timeout e fallback automatico alla formula locale.
- Suggerimento packaging con formato, materiale, contenuto riciclato, risparmio ed etichetta IT/EN.
- Checkout UI Extension con badge rapido e opzione Carbon Neutral.
- Variante Shopify opzionale per addebitare l’offset nel carrello.
- Dashboard mensile, KPI, classifiche prodotto e categoria.
- Admin Order Block con CO₂e, packaging, etichetta, metodo e stato offset reali.
- Theme App Extension per mostrare il badge sostenibilità nello storefront.
- Webhook idempotenti `orders/create` e `orders/updated`, con retry sicuro.
- Metafield ordine/prodotto `ecotraceit.*` e configurazione checkout app-owned.
- Shopify App Pricing: Free, Pro e Enterprise usage-based tramite App Events API.
- Localizzazione italiana e inglese.
- Minimizzazione GDPR e webhook privacy obbligatori.

## Struttura

```text
app/
  routes/                  dashboard, settings, pricing, API e webhook
  services/                carbon, packaging, offset, analytics, pricing, App Events
extensions/
  ecotraceit-checkout/     Checkout UI Extension
  ecotraceit-admin/        Admin Order Block
  ecotraceit-badge/        Theme App Extension
prisma/
  migrations/              schema sessioni, ordini e statistiche
  schema.prisma
shopify.app.toml           scope, webhook e definizioni metafield
Dockerfile                 runtime Node 22 per produzione
```

## Avvio locale

Requisiti: Node `22.12+`, npm, Shopify CLI 4.4+ e un development store.

```powershell
Copy-Item .env.example .env
npm ci
npm run setup
npm run dev
```

Il progetto è collegato all’app Dev Dashboard **EcoTraceIT**. `shopify app dev` crea il tunnel HTTPS, aggiorna temporaneamente gli URL e consente l’anteprima delle estensioni.

## Variabili e chiavi API

| Variabile | Uso |
|---|---|
| `SHOPIFY_API_KEY` | Client ID dell’app Shopify. |
| `SHOPIFY_API_SECRET` | Segreto Shopify; solo secret manager o `.env`, mai Git. |
| `SHOPIFY_APP_URL` | URL HTTPS pubblico del backend. |
| `DATABASE_URL` | PostgreSQL gestito; il progetto Vercel usa Neon con pooling. |
| `CARBON_API_PROVIDER` | `formula` oppure `carbon-interface`. |
| `CARBON_INTERFACE_API_KEY` | Chiave Carbon Interface opzionale. |
| `OPENROUTESERVICE_API_KEY` | Placeholder per un futuro routing stradale più preciso. |
| `OFFSET_API_URL`, `OFFSET_API_KEY` | Provider offset; se assenti usa la modalità sandbox. |
| `PARTNER_API_TOKEN` | Token Partner API con permesso **Manage apps**. |
| `SHOPIFY_ORGANIZATION_ID` | ID organizzazione Dev Dashboard. |
| `SHOPIFY_APP_ID` | ID app Partner; il codice accetta numero o GID. |
| `APP_EVENTS_ORDER_HANDLE` | Meter Enterprise, default `order_processed`. |

Non esporre chiavi nelle estensioni, nei TOML o nei metafield.

## Deploy del backend

Shopify ospita le estensioni, non il backend. Il progetto è predisposto per Vercel SSR tramite `@vercel/react-router` e PostgreSQL Neon. Le variabili sensibili devono restare in Vercel, mai nel repository.

```powershell
vercel link --yes --scope mikeminers-projects --project ecotraceit
vercel env pull .env.local --environment=production --yes
$env:DATABASE_URL = (Get-Content .env.local | Select-String '^DATABASE_URL=').Line.Split('=', 2)[1].Trim('"')
npm run setup
vercel deploy --prod
```

Il deploy produzione usa `https://app.ecotraceit.com`. Su Register.it configurare il record `A` con host `app` e valore `76.76.21.21`, quindi verificare lo stato con `vercel domains inspect app.ecotraceit.com`.

In alternativa, il container può essere distribuito su un host Node/Docker con PostgreSQL raggiungibile:

```powershell
docker build -t ecotraceit .
docker run --rm -p 3000:3000 `
  -e SHOPIFY_API_KEY=... `
  -e SHOPIFY_API_SECRET=... `
  -e SHOPIFY_APP_URL=https://app.ecotraceit.com `
  -e SCOPES=read_orders,write_orders,read_products,write_products,write_app_data `
  -e DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require `
  ecotraceit
```

Il container esegue automaticamente `prisma migrate deploy` prima dell’avvio. Configurare il health check su `/healthz`. PostgreSQL consente replica e scale-out senza dipendere dal filesystem della singola istanza.

Dopo il deploy:

1. Verificare in `shopify.app.toml` l’URL `https://app.ecotraceit.com`.
2. Verificare il callback `https://app.ecotraceit.com/auth/callback`.
3. Aggiornare `SHOPIFY_APP_URL` nel secret manager dell’host.
4. Verificare `https://HOST/healthz`.
5. Eseguire la validazione e caricare la versione Shopify:

```powershell
npm ci
npm run setup
npm run lint
npm run typecheck
npm test
npm run build
shopify app build
shopify app deploy
```

6. Reinstallare l’app nel dev store dopo modifiche agli scope.
7. Testare ordine creato/aggiornato, retry webhook, uninstall, privacy, checkout, offset e downgrade.

Non rilasciare una versione Dev Dashboard con `example.com`: webhook e OAuth non sarebbero raggiungibili.

## Shopify App Pricing

Configurare nella submission Shopify:

1. **Free** — €0, 100 ordini/mese, calcolo base e badge.
2. **Pro** — €29 EUR/mese, report avanzati, offset e calcoli illimitati.
3. **Enterprise** — piano mensile più meter usage-based a tier graduati.
4. **Private test plan** — €0 per il collaudo nel development store.

Welcome link relativo: `/app/pricing`. Shopify aggiunge `plan_handle`; EcoTraceIT conferma il contratto con `activeSubscription` sulla Partner API 2026-07. Usare gli item handle `pro` ed `enterprise`. Per Enterprise creare un meter con handle esatto `order_processed`: ogni nuovo ordine genera un App Event idempotente con `value: 1`.

Se Shopify assegna un app handle diverso da `ecotraceit`, aggiornare il link `shopify://admin/charges/.../pricing_plans` in `app/routes/app.pricing.tsx`.

## Checkout e compatibilità piani Shopify

`purchase.checkout.block.render` è disponibile nelle fasi information/shipping/payment solo per merchant Shopify Plus. Per store non-Plus usare il badge della Theme App Extension nel prodotto/storefront; indicare chiaramente questo requisito nel listing. La stima checkout è locale e non effettua round-trip esterni, quindi non rallenta il checkout.

Il merchant abilita il blocco dall’editor Checkout e sceglie una variante prodotto opzionale per il costo offset. Le impostazioni EcoTraceIT vengono sincronizzate in un metafield app-owned dello shop.

## GDPR e PPWR

EcoTraceIT conserva shop, ID tecnici, nome tecnico ordine, paese, prime due cifre del CAP, peso e dati ambientali. Non memorizza nome cliente, email, telefono o indirizzo completo. `shop/redact` ed uninstall eliminano sessioni, impostazioni, ordini aggregati e ricevute webhook dello shop.

Prima della submission pubblicare privacy policy, termini, DPA, retention policy, subprocessors e contatto supporto. Richiedere solo i livelli di protected customer data realmente necessari.

Le etichette e i suggerimenti PPWR sono supporto operativo, non consulenza legale. Validare materiali, codici e obblighi applicabili con un consulente; evitare claim assoluti come “zero impatto”.

## Listing Shopify App Store

**Titolo**

EcoTraceIT: CO₂ & Packaging

**Subtitle**

Calcola CO₂e, migliora il packaging e offri spedizioni Carbon Neutral.

**Descrizione lunga**

EcoTraceIT aiuta gli e-commerce italiani a trasformare ogni spedizione in dati ambientali chiari e azioni concrete. Calcola automaticamente la CO₂e stimata di ogni ordine usando peso, destinazione e modalità di consegna, quindi suggerisce un imballaggio riciclabile adatto al contenuto.

Genera una proposta di etichetta ambientale in italiano o inglese e salva i risultati nei metafield Shopify. I merchant possono consultare emissioni, risparmio stimato, trend mensili e prodotti o categorie a maggior impatto direttamente nella dashboard.

Con Pro, EcoTraceIT abilita l’opzione Carbon Neutral e i report avanzati. Enterprise aggiunge pricing a consumo per volumi elevati. La stima checkout viene eseguita localmente per mantenere l’esperienza veloce, mentre il calcolo completo e i report vengono aggiornati dopo l’ordine.

Ideale per moda, beauty, food e home & living. EcoTraceIT applica minimizzazione dei dati e strumenti operativi per PPWR; le stime non sostituiscono una verifica LCA o una consulenza legale.

**Keyword**

sostenibilità, CO2, carbon neutral, packaging, PPWR, etichetta ambientale, emissioni, ESG, spedizioni, compliance

## Immagini promozionali

1. Icona 1200×1200: foglia/traccia circolare, fondo verde bosco, forme semplici e leggibili a 48 px.
2. Hero 1600×900: dashboard con emissioni, risparmio e ordini analizzati.
3. Checkout 1600×900: badge CO₂e e toggle Carbon Neutral, con nota “Shopify Plus”.
4. Packaging 1600×900: busta riciclata, scatola FSC ed etichetta ambientale.
5. Report 1600×900: andamento mensile e classifiche prodotto/categoria.
6. Admin 1600×900: blocco ordine con CO₂e, materiale, etichetta e offset.

Palette: verde bosco `#174C2B`, salvia `#E6F4EA`, terra `#9A6B45`, fondo `#F7F6F2`. Usare solo screenshot reali del dev store, senza dati cliente o claim non verificabili.

## Stato verifiche

- ESLint senza errori.
- TypeScript strict.
- Test Vitest formula CO₂e.
- Build React Router client/SSR.
- Prisma schema validation.
- Build Checkout, Admin e Theme App Extension.
- CI GitHub su Node 22 e Node 24.
