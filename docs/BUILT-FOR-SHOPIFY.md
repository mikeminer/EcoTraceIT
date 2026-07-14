# Built for Shopify — verifica EcoTraceIT

Riferimento ufficiale: https://shopify.dev/docs/apps/launch/built-for-shopify/requirements

Questa checklist separa i requisiti dimostrabili dal repository dalle metriche che Shopify calcola su traffico e merchant reali negli ultimi 28 giorni.

## Requisiti tecnici coperti dal codice

| Criterio | Evidenza |
| --- | --- |
| App embedded | `embedded = true` in `shopify.app.toml`; tutte le pagine principali vivono in `/app`. |
| Session token | Loader e action usano `authenticate.admin`; non esiste un login EcoTraceIT separato. |
| App Bridge corrente | `AppProvider` del pacchetto Shopify carica `https://cdn.shopify.com/shopifycloud/app-bridge.js`; la dashboard usa l'App API per lo stato estensioni. |
| Workflow in Shopify | Dashboard, PPWR, filiera, riuso, EPR, impostazioni e pricing sono nell'admin embedded. |
| Theme App Extension | `extensions/ecotraceit-badge` è una Theme App Extension Liquid. La homepage mostra lo stato del blocco nel tema pubblicato con `shopify.app.extensions()`. |
| Disinstallazione pulita | Nessuna modifica al tema; Shopify rimuove il blocco. Il webhook `app/uninstalled` elimina impostazioni, dati applicativi in cascata, sessioni e ricevute webhook. |
| Nessuna Asset API | Nessuno scope `write_themes`, chiamata Asset API o ScriptTag. |
| Storefront leggero | Il blocco usa solo Liquid e CSS inline minimale: nessun JavaScript, font, fetch o risorsa esterna. |
| Checkout leggero | Il calcolo iniziale è locale e memorizzato; nessuna chiamata API esterna durante il rendering. |
| Design Shopify | UI costruita con Polaris web components e App Bridge, senza sistema di login o navigazione esterni. |
| GDPR e affidabilità | Webhook privacy obbligatori, minimizzazione dati, webhook idempotenti, timeout/fallback provider e logging strutturato. |

## Metriche che richiedono uso reale

Il codice non può falsificare o anticipare questi risultati. Shopify li valuta automaticamente:

- almeno 100 misurazioni negli ultimi 28 giorni e percentile 75 con LCP ≤ 2,5 s, CLS ≤ 0,1 e INP ≤ 200 ms;
- impatto storefront non superiore a 10 punti Lighthouse;
- eventuale performance checkout, se applicabile alla categoria e con il volume minimo richiesto;
- almeno 50 installazioni nette da negozi attivi su piani a pagamento;
- almeno 5 recensioni;
- rating recente almeno pari alla soglia mostrata nel Partner Dashboard;
- buona reputazione Partner e approvazione della verifica manuale di design/listing.

## Verifica prima del rilascio

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm exec -- prisma validate
npm exec -- shopify app build
```

Controllare inoltre:

1. `/healthz` in produzione;
2. dashboard embedded su desktop e mobile senza scroll orizzontale;
3. attivazione del badge dal link mostrato in homepage;
4. ordine creato/aggiornato, estensione checkout e blocco admin;
5. disinstallazione su development store e assenza di codice residuo nel tema;
6. pannello **Distribuzione → Built for Shopify** dopo il controllo giornaliero Shopify.

Lo stato Built for Shopify può quindi essere richiesto solo quando anche i requisiti di traffico, installazioni e recensioni risultano soddisfatti nel Partner Dashboard.
