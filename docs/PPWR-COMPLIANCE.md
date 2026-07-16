# EcoTraceIT PPWR Compliance Workspace

## Perimetro

EcoTraceIT supporta la preparazione, la valutazione e la conservazione del fascicolo tecnico previsto dal Regolamento (UE) 2025/40. Il regolamento è entrato in vigore l'11 febbraio 2025 ed è generalmente applicabile dal 12 agosto 2026, con singoli requisiti soggetti a date e atti attuativi successivi.

La piattaforma non sostituisce prove di laboratorio, valutazioni del fabbricante, organismi notificati quando applicabili o consulenza legale. Ai sensi dell'articolo 39, la responsabilità della dichiarazione UE di conformità resta del fabbricante che la firma.

Fonti normative:

- Regolamento (UE) 2025/40: https://eur-lex.europa.eu/eli/reg/2025/40/oj
- Commissione europea, Packaging waste: https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en
- FAQ PPWR della Commissione, 30 marzo 2026: https://environment.ec.europa.eu/publications/faq-packaging-and-packaging-waste-regulation-ppwr_en
- Guidance PPWR della Commissione, marzo 2026: https://environment.ec.europa.eu/publications/guidance-document-packaging-and-packaging-waste-regulation-ppwr_en

## Copertura implementata

| Requisito | Funzione EcoTraceIT |
| --- | --- |
| Ruolo e identità operatore | Anagrafica fabbricante/importatore/distributore, contatti, rappresentante ed EPR |
| Articolo 5 | Stato sostanze e rapporto di prova obbligatorio prima della firma |
| Articolo 6 | Valutazione di riciclabilità, grado ed evidenza |
| Articolo 7 | Percentuale riciclata e post-consumo per componente; certificato obbligatorio per plastica |
| Articolo 9 | Claim di compostabilità bloccato senza certificato |
| Articoli 10 e 24 | Dimensioni, volume, peso, minimizzazione e calcolo automatico dello spazio vuoto |
| Articolo 11 | Monouso/riutilizzabile, serializzazione, cicli, ritorno, ispezione e fine vita |
| Articolo 12 | Stato etichetta e artwork verificabile |
| Articolo 15 | Identificativo univoco, versione, fornitori approvati e dichiarazioni strutturate per la tracciabilità |
| Allegato VII | Componenti, disegni, rischi, controlli, norme, specifiche e rapporti di prova |
| Articolo 39 / Allegato VIII | Responsabile del fabbricante, attestazione elettronica, snapshot SHA-256, revoca e dichiarazione UE stampabile |
| Conservazione | Scadenza calcolata a 5 anni per monouso e 10 anni per riutilizzabile |
| Audit | Registro append-only delle azioni rilevanti |
| Ordini Shopify | Collegamento al dossier dichiarato e right-sizing dalle dimensioni prodotto |
| EPR / CONAI | Classificazione strutturata per componente con fonte e validità; aggregazione per materiale, peso, riciclato, fascia e tipologia; CSV mensile |
| Corrieri | Tracking DHL MyDHL e FedEx REST con fallback manuale per altri vettori |

## Stati del fascicolo

- `DRAFT`: dati o evidenze mancanti; non può essere presentato come conforme.
- `READY_FOR_DECLARATION`: tutti i controlli automatizzabili passano; serve la firma del responsabile.
- `DECLARED`: dichiarazione registrata e fascicolo immutabile. Qualsiasi variazione richiede una nuova versione in bozza, con nuova valutazione e firma.

EcoTraceIT non usa una percentuale come certificato. Il punteggio misura soltanto la completezza dei controlli applicabili.

## Workflow merchant

1. Aprire **PPWR** dalla navigazione dell'app.
2. Registrare l'operatore economico e selezionare il ruolo effettivo nella catena di fornitura.
3. In **Fornitori e prove**, registrare il fabbricante, il responsabile autorizzato, i fornitori e i laboratori accreditati.
4. Creare un profilo per ogni tipo e versione di imballaggio.
5. Inserire tutti i componenti e collegarli ai fornitori. La somma delle masse deve coincidere con il peso totale entro la tolleranza del 2% o 1 grammo.
6. Inserire dichiarazioni dei fornitori, prove di laboratorio e classificazioni CONAI verificabili.
7. Inserire volume del prodotto e dimensioni interne utili. EcoTraceIT calcola volume e spazio vuoto.
8. Registrare le altre evidenze con riferimento, emittente, scadenza, URL HTTPS e hash SHA-256 quando disponibile.
9. Completare analisi rischi, minimizzazione, controlli di fabbricazione e specifiche applicate.
10. Eseguire la valutazione. Ogni controllo fallito mostra l'azione correttiva richiesta.
11. Il responsabile del fabbricante verifica lo snapshot e registra l'attestazione elettronica assumendosi esplicitamente la responsabilità.
12. Scaricare il fascicolo JSON e stampare/salvare in PDF la dichiarazione UE.

## Associazione agli ordini

Il motore ordini propone i codici `RECYCLED_MAILER_S`, `FSC_BOX_S` e `FSC_BOX_M`. Per collegare automaticamente un ordine a un fascicolo dichiarato, creare un profilo PPWR con uno di questi identificativi. EcoTraceIT salva nei metafield ordine:

- `ecotraceit.ppwr_profile`
- `ecotraceit.ppwr_declaration`

Se non esiste un profilo `DECLARED`, l'ordine mantiene il suggerimento ma non viene marcato come coperto da una dichiarazione PPWR.

## Evidenze

Tipi riconosciuti dal motore:

- `TECHNICAL_DRAWING`
- `SUPPLIER_DECLARATION`
- `SUBSTANCES_TEST`
- `RECYCLABILITY_ASSESSMENT`
- `RECYCLED_CONTENT_CERTIFICATE`
- `COMPOSTABILITY_CERTIFICATE`
- `FOOD_CONTACT_DECLARATION`
- `TEST_REPORT`
- `LABEL_ARTWORK`

Un'evidenza scaduta non soddisfa il controllo. I file restano presso il sistema documentale scelto dal merchant; EcoTraceIT conserva metadati, URL e hash, limitando i dati personali e il rischio di documenti sensibili nel database applicativo.

## Database e deploy

Le migrazioni `20260714090000_ppwr_compliance` e `20260714103000_supply_chain_evidence` aggiungono il workspace PPWR e i registri strutturati di filiera. Prima del deploy:

```bash
npm run setup
npm test
npm run typecheck
npm run build
```

Eseguire `prisma migrate deploy` una sola volta in un job di release controllato, preferibilmente con una connessione PostgreSQL diretta, prima di pubblicare codice che dipende dal nuovo schema. La build Vercel non esegue migrazioni: avviarle in ogni build tramite una connessione in pooling può lasciare occupato l'advisory lock di Prisma. Eseguire sempre backup e prova della migrazione in preview prima della produzione.

## Verifiche che restano esterne

Per poter firmare con cognizione di causa, il responsabile deve ottenere e verificare fuori da EcoTraceIT:

- analisi chimiche e limiti per sostanze/PFAS quando applicabili;
- prove di riciclabilità secondo atti delegati, norme e specifiche vigenti;
- certificazione del contenuto riciclato e catena di custodia;
- prove di compostabilità per qualsiasi claim;
- requisiti per contatto alimentare, farmaceutico, medicale o merci pericolose;
- registrazione EPR e adempimenti nazionali nei mercati serviti;
- applicabilità di deroghe, date transitorie e atti attuativi aggiornati.

## Regole per comunicazione commerciale

Consentito: “EcoTraceIT prepara e verifica il fascicolo tecnico PPWR e blocca la dichiarazione finché mancano dati o evidenze.”

Da evitare: “EcoTraceIT certifica automaticamente la conformità”, “qualsiasi packaging è conforme” o “la stima CO₂ dimostra la conformità PPWR”. La CO₂e dell'ordine è una metrica ambientale separata e non sostituisce la valutazione degli articoli 5–12.

## Registro riuso e reverse logistics

La pagina **Riuso** registra ogni unità con seriale o QR e applica transizioni controllate: disponibile, in circolazione, ritorno richiesto, rientrato, ispezionato e ritirato. Il ciclo viene conteggiato alla spedizione e nuove spedizioni sono bloccate al raggiungimento dei cicli massimi dichiarati. Tracking e ordine sono riferimenti operativi, senza memorizzare indirizzi o dati cliente.

## EPR / CONAI

La pagina **EPR / CONAI** e l'endpoint autenticato `/api/epr` esportano un CSV con separatore `;`, aggregato per codice materiale, materiale CONAI, fascia contributiva e tipologia di imballaggio. Sono inclusi fonte, stato di verifica, aliquota indicata, peso immesso, quota riciclata, post-consumo e unità riutilizzabili. Le fasce e la posizione consortile devono essere validate dal merchant: EcoTraceIT conserva la classificazione applicata ma non certifica automaticamente CAC, decorrenze, esenzioni o procedure.

Dettagli su fornitori, laboratori, snapshot e firma: [`SUPPLY-CHAIN-EVIDENCE.md`](SUPPLY-CHAIN-EVIDENCE.md).

## Right-sizing e dimensioni prodotto

Configurare sui prodotti i metafield app-owned `length_mm`, `width_mm` e `height_mm`. Quando tutte le righe fisiche dell'ordine hanno dimensioni valide, EcoTraceIT aggiunge un buffer protettivo del 15% e sceglie il più piccolo profilo `DECLARED` che contiene il volume. In assenza di dati completi resta attivo il suggerimento basato sul peso; il checkout non attende API corriere.

## Corrieri

Configurare `DHL_API_KEY` e `DHL_API_SECRET` per MyDHL API oppure `FEDEX_CLIENT_ID` e `FEDEX_CLIENT_SECRET` per FedEx REST. `/api/carrier-track?carrier=DHL&tracking=...` e l'equivalente FedEx normalizzano stato ed eventi con timeout breve. GLS, BRT e Poste richiedono credenziali/contratti specifici non pubblici: il registro riuso accetta tracking manuale senza inventare integrazioni o programmi di riuso del vettore.
