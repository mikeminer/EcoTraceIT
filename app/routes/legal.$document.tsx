import type {MetaFunction} from "react-router";
import {Link, useParams, useSearchParams} from "react-router";

type Locale = "it" | "en";
type Section = {heading: string; paragraphs: string[]; bullets?: string[]};
type LegalDocument = {title: string; updated: string; intro: string; sections: Section[]};

const contactEmail = "mikforlani@gmail.com";

const documents: Record<string, Record<Locale, LegalDocument>> = {
  privacy: {
    it: {
      title: "Informativa privacy",
      updated: "13 luglio 2026",
      intro: "EcoTraceIT tratta solo i dati necessari a calcolare l’impatto ambientale degli ordini e fornire report al merchant.",
      sections: [
        {heading: "Ruoli e contatti", paragraphs: ["Il merchant Shopify è titolare dei dati dei propri clienti. EcoTraceIT, gestito da servizi alle PMI, opera come responsabile del trattamento su istruzione del merchant. Per richieste privacy: " + contactEmail + "."]},
        {heading: "Dati trattati", paragraphs: ["Trattiamo dominio shop, identificativi tecnici di ordine e prodotto, nome tecnico dell’ordine, peso, categoria prodotto, paese, prime due posizioni del CAP, corriere, stime CO₂e, suggerimenti packaging e scelta Carbon Neutral."], bullets: ["Non conserviamo nome, email o telefono del cliente.", "Non conserviamo indirizzi completi.", "I dati di autenticazione del merchant sono gestiti tramite sessioni Shopify protette."]},
        {heading: "Finalità", paragraphs: ["I dati servono per stime ambientali, suggerimenti di imballaggio, report aggregati, gestione dell’offset richiesto, sicurezza, prevenzione abusi e assistenza. Non vendiamo dati, non facciamo pubblicità comportamentale e non prendiamo decisioni con effetti legali sulle persone."]},
        {heading: "Conservazione e cancellazione", paragraphs: ["Gli aggregati restano disponibili per la durata dell’installazione e finché necessari ai report del merchant. I webhook Shopify di richiesta dati, cancellazione cliente e cancellazione shop vengono gestiti; disinstallazione e shop/redact eliminano sessioni, configurazioni, ordini aggregati e ricevute webhook associate allo shop."]},
        {heading: "Fornitori e trasferimenti", paragraphs: ["Usiamo Shopify per la piattaforma, Vercel per hosting e log tecnici e Neon per PostgreSQL. Se il merchant abilita provider esterni di routing, carbonio o offset, inviamo solo peso e dati geografici minimizzati, senza identificativi diretti. L’elenco aggiornato è nella pagina Subprocessor."]},
        {heading: "Sicurezza e diritti", paragraphs: ["I dati sono cifrati in transito, protetti a riposo dai provider e accessibili secondo il principio del privilegio minimo. I clienti esercitano i propri diritti tramite il merchant; merchant e autorità possono contattarci all’indirizzo indicato sopra."]},
      ],
    },
    en: {
      title: "Privacy policy",
      updated: "13 July 2026",
      intro: "EcoTraceIT processes only the data required to calculate order environmental impact and provide merchant reports.",
      sections: [
        {heading: "Roles and contact", paragraphs: ["The Shopify merchant is the controller of customer data. EcoTraceIT, operated by servizi alle PMI, acts as processor under the merchant’s instructions. Privacy contact: " + contactEmail + "."]},
        {heading: "Data processed", paragraphs: ["We process shop domain, technical order and product identifiers, order display name, weight, product category, country, the first two postal-code characters, carrier, CO₂e estimates, packaging suggestions and the Carbon Neutral choice."], bullets: ["We do not retain customer names, email addresses or phone numbers.", "We do not retain full addresses.", "Merchant authentication data is held in protected Shopify sessions."]},
        {heading: "Purposes", paragraphs: ["Data is used for environmental estimates, packaging guidance, aggregate reporting, requested offsets, security, abuse prevention and support. We do not sell data, run behavioural advertising or make decisions with legal effects on individuals."]},
        {heading: "Retention and deletion", paragraphs: ["Aggregates remain available while the app is installed and while needed for merchant reporting. Shopify data-request, customer-redaction and shop-redaction webhooks are handled; uninstall and shop/redact remove the shop’s sessions, settings, aggregates and webhook receipts."]},
        {heading: "Providers and transfers", paragraphs: ["We use Shopify for the platform, Vercel for hosting and technical logs, and Neon for PostgreSQL. Optional routing, carbon or offset providers receive only minimised weight and location data, without direct identifiers. See the Subprocessors page for the current list."]},
        {heading: "Security and rights", paragraphs: ["Data is encrypted in transit, protected at rest by our providers and restricted by least privilege. Customers exercise their rights through the merchant; merchants and authorities can contact us at the address above."]},
      ],
    },
  },
  terms: {
    it: {
      title: "Termini di servizio",
      updated: "13 luglio 2026",
      intro: "I presenti termini regolano l’uso di EcoTraceIT da parte dei merchant Shopify.",
      sections: [
        {heading: "Servizio", paragraphs: ["EcoTraceIT fornisce stime CO₂e, suggerimenti packaging, etichette informative, report e integrazioni Carbon Neutral. Le funzionalità dipendono dal piano attivo e dai servizi Shopify disponibili."]},
        {heading: "Limiti delle stime", paragraphs: ["Le stime sono supporto operativo e non costituiscono una LCA certificata, consulenza legale o garanzia di conformità PPWR. Il merchant verifica pesi, materiali, claim, corrieri e obblighi applicabili prima dell’uso commerciale."]},
        {heading: "Obblighi del merchant", paragraphs: ["Il merchant configura l’app, fornisce informazioni accurate, dispone delle basi giuridiche necessarie, informa i clienti e non usa EcoTraceIT per attività illecite o ingannevoli."]},
        {heading: "Piani e pagamenti", paragraphs: ["Free, Pro ed Enterprise sono gestiti tramite Shopify App Pricing. Prezzi, periodo, prova, cambi piano e costi a consumo sono mostrati e addebitati da Shopify prima dell’attivazione."]},
        {heading: "Disponibilità e responsabilità", paragraphs: ["Manteniamo il servizio con ragionevole cura, senza garantire assenza assoluta di interruzioni o errori di provider terzi. Nei limiti di legge, la responsabilità complessiva non supera gli importi pagati per il servizio nei 12 mesi precedenti."]},
        {heading: "Durata", paragraphs: ["Il merchant può disinstallare l’app in qualsiasi momento. Possiamo sospendere usi abusivi o rischiosi. Alla cessazione si applicano cancellazione e portabilità previste nell’informativa privacy e nel DPA."]},
      ],
    },
    en: {
      title: "Terms of service",
      updated: "13 July 2026",
      intro: "These terms govern Shopify merchants’ use of EcoTraceIT.",
      sections: [
        {heading: "Service", paragraphs: ["EcoTraceIT provides CO₂e estimates, packaging guidance, environmental labels, reports and Carbon Neutral integrations. Features depend on the active plan and available Shopify services."]},
        {heading: "Estimate limitations", paragraphs: ["Outputs are operational guidance, not a certified LCA, legal advice or a guarantee of PPWR compliance. Merchants must verify weights, materials, claims, carriers and applicable obligations before commercial use."]},
        {heading: "Merchant duties", paragraphs: ["Merchants configure the app, provide accurate information, maintain appropriate legal bases, inform customers and do not use EcoTraceIT for unlawful or misleading activity."]},
        {heading: "Plans and payments", paragraphs: ["Free, Pro and Enterprise are managed through Shopify App Pricing. Prices, billing period, trials, plan changes and usage costs are displayed and charged by Shopify before activation."]},
        {heading: "Availability and liability", paragraphs: ["We operate the service with reasonable care but cannot guarantee uninterrupted service or third-party availability. To the extent permitted by law, aggregate liability is capped at fees paid for the service in the prior 12 months."]},
        {heading: "Term", paragraphs: ["Merchants may uninstall at any time. We may suspend abusive or unsafe use. Privacy-policy and DPA deletion and portability provisions apply on termination."]},
      ],
    },
  },
  dpa: {
    it: {
      title: "Data Processing Addendum (DPA)",
      updated: "13 luglio 2026",
      intro: "Il presente addendum integra i Termini e disciplina il trattamento dei dati per conto del merchant ai sensi dell’art. 28 GDPR.",
      sections: [
        {heading: "Oggetto e durata", paragraphs: ["EcoTraceIT tratta dati tecnici di ordini e destinazioni minimizzate esclusivamente per erogare il servizio, per la durata dell’installazione e per il tempo necessario a cancellazione, sicurezza e obblighi di legge."]},
        {heading: "Istruzioni e riservatezza", paragraphs: ["Trattiamo i dati solo su istruzioni documentate del merchant e Shopify, salvo obbligo di legge. L’accesso è limitato a persone autorizzate e soggette a riservatezza."]},
        {heading: "Misure e assistenza", paragraphs: ["Applichiamo minimizzazione, TLS, protezione a riposo, segreti gestiti, separazione degli accessi, logging tecnico, patching e procedure di incidente. Assistiamo il merchant con diritti degli interessati, valutazioni, violazioni e richieste delle autorità."]},
        {heading: "Sub-responsabili", paragraphs: ["Il merchant autorizza i sub-responsabili elencati nella pagina dedicata. Comunicheremo modifiche sostanziali; il merchant può opporsi per motivi documentati di protezione dati."]},
        {heading: "Cancellazione e audit", paragraphs: ["Alla cessazione cancelliamo o restituiamo i dati secondo le istruzioni e i webhook Shopify, salvo conservazione imposta dalla legge. Forniamo informazioni ragionevoli per dimostrare la conformità e supportare verifiche concordate."]},
      ],
    },
    en: {
      title: "Data Processing Addendum (DPA)",
      updated: "13 July 2026",
      intro: "This addendum supplements the Terms and governs processing on the merchant’s behalf under GDPR Article 28.",
      sections: [
        {heading: "Subject and duration", paragraphs: ["EcoTraceIT processes technical order data and minimised destinations solely to provide the service, for the installation term and the time needed for deletion, security and legal duties."]},
        {heading: "Instructions and confidentiality", paragraphs: ["We process data only on documented merchant and Shopify instructions unless law requires otherwise. Access is restricted to authorised persons under confidentiality duties."]},
        {heading: "Measures and assistance", paragraphs: ["We use minimisation, TLS, at-rest protection, managed secrets, access separation, technical logging, patching and incident procedures. We assist with data-subject rights, assessments, breaches and authority requests."]},
        {heading: "Subprocessors", paragraphs: ["The merchant authorises the providers listed on the Subprocessors page. We will communicate material changes, and merchants may object for documented data-protection reasons."]},
        {heading: "Deletion and audits", paragraphs: ["On termination we delete or return data under merchant instructions and Shopify webhooks unless law requires retention. We provide reasonable compliance information and support agreed audits."]},
      ],
    },
  },
  subprocessors: {
    it: {
      title: "Sub-responsabili",
      updated: "13 luglio 2026",
      intro: "Fornitori utilizzati per erogare EcoTraceIT.",
      sections: [
        {heading: "Fornitori principali", paragraphs: [], bullets: ["Shopify International Ltd / Shopify Inc. — piattaforma e-commerce, autenticazione, API, checkout e billing.", "Vercel Inc. — hosting applicativo, rete, log tecnici e secret management.", "Neon, Inc. — database PostgreSQL gestito, replica e backup cifrati."]},
        {heading: "Fornitori opzionali", paragraphs: ["Carbon Interface, OpenRouteService e un provider di offset possono essere attivati dal merchant mediante chiavi API. Ricevono solo i dati tecnici minimizzati necessari alla richiesta; nessun nome, email, telefono o indirizzo completo."], bullets: ["Carbon Interface — fattori e stime di emissione.", "OpenRouteService — stime di distanza.", "Provider di offset configurato dal merchant — acquisto o registrazione offset."]},
      ],
    },
    en: {
      title: "Subprocessors",
      updated: "13 July 2026",
      intro: "Providers used to deliver EcoTraceIT.",
      sections: [
        {heading: "Core providers", paragraphs: [], bullets: ["Shopify International Ltd / Shopify Inc. — commerce platform, authentication, APIs, checkout and billing.", "Vercel Inc. — application hosting, network, technical logs and secret management.", "Neon, Inc. — managed PostgreSQL, replication and encrypted backups."]},
        {heading: "Optional providers", paragraphs: ["Carbon Interface, OpenRouteService and a merchant-selected offset provider can be enabled with API keys. They receive only minimised technical data required for the request; no name, email, phone number or full address."], bullets: ["Carbon Interface — emission factors and estimates.", "OpenRouteService — distance estimates.", "Merchant-configured offset provider — offset purchase or registration."]},
      ],
    },
  },
  security: {
    it: {
      title: "Sicurezza e incident response",
      updated: "13 luglio 2026",
      intro: "EcoTraceIT applica controlli tecnici e organizzativi proporzionati ai dati minimizzati trattati.",
      sections: [
        {heading: "Controlli", paragraphs: [], bullets: ["TLS per dati in transito e protezione a riposo dei provider.", "Segreti conservati nel secret manager, mai nel repository.", "Accesso con privilegio minimo, session token Shopify e verifica HMAC dei webhook.", "Log strutturati senza dati cliente diretti, dipendenze verificate e backup gestiti.", "Ambienti e credenziali separati ove applicabile; dati di test non usati per finalità commerciali."]},
        {heading: "Gestione incidenti", paragraphs: ["Segnalare vulnerabilità a " + contactEmail + " con oggetto SECURITY. Confermiamo la ricezione, conteniamo l’evento, analizziamo impatto e causa, ripristiniamo in sicurezza e notifichiamo merchant, Shopify e autorità nei termini applicabili. Non pubblicare dettagli prima del coordinamento della correzione."]},
      ],
    },
    en: {
      title: "Security and incident response",
      updated: "13 July 2026",
      intro: "EcoTraceIT applies technical and organisational controls proportionate to its minimised data set.",
      sections: [
        {heading: "Controls", paragraphs: [], bullets: ["TLS in transit and provider-managed protection at rest.", "Secrets stored in a secret manager and never committed.", "Least privilege, Shopify session tokens and webhook HMAC validation.", "Structured logs without direct customer data, dependency checks and managed backups.", "Separate environments and credentials where applicable; test data is not used commercially."]},
        {heading: "Incident handling", paragraphs: ["Report vulnerabilities to " + contactEmail + " with subject SECURITY. We acknowledge, contain, assess impact and root cause, recover safely, and notify merchants, Shopify and authorities within applicable deadlines. Please coordinate disclosure until remediation is available."]},
      ],
    },
  },
  support: {
    it: {
      title: "Supporto EcoTraceIT",
      updated: "13 luglio 2026",
      intro: "Assistenza per installazione, calcoli, checkout, report, billing e privacy.",
      sections: [
        {heading: "Contatti", paragraphs: ["Email: " + contactEmail + ". Includi dominio myshopify, ID tecnico ordine e descrizione del problema; non inviare dati personali del cliente."]},
        {heading: "Tempi", paragraphs: ["Risposta iniziale entro 2 giorni lavorativi. Problemi di sicurezza o indisponibilità critica hanno priorità. Il supporto Enterprise segue gli SLA concordati nel piano."]},
      ],
    },
    en: {
      title: "EcoTraceIT support",
      updated: "13 July 2026",
      intro: "Help with installation, calculations, checkout, reporting, billing and privacy.",
      sections: [
        {heading: "Contact", paragraphs: ["Email: " + contactEmail + ". Include the myshopify domain, technical order ID and issue description; do not send customer personal data."]},
        {heading: "Response", paragraphs: ["Initial response within two business days. Security issues and critical outages are prioritised. Enterprise support follows the SLA agreed for the plan."]},
      ],
    },
  },
};

const navigation = ["privacy", "terms", "dpa", "subprocessors", "security", "support"];

export const meta: MetaFunction = () => [
  {title: "EcoTraceIT · Legal & Support"},
  {name: "description", content: "EcoTraceIT privacy, terms, data processing, security and support information."},
];

export default function LegalDocumentPage() {
  const {document = "privacy"} = useParams();
  const [searchParams] = useSearchParams();
  const locale: Locale = searchParams.get("lang") === "en" ? "en" : "it";
  const content = (documents[document] || documents.privacy)[locale];

  return (
    <main className="legal-shell">
      <style>{`
        :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #18392b; background: #f4f1e8; }
        * { box-sizing: border-box; }
        body { margin: 0; background: radial-gradient(circle at top left, #dce9d6, #f4f1e8 42%); }
        a { color: #1f6b46; }
        .legal-shell { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 72px; }
        .legal-head, .legal-card { background: rgba(255,255,255,.92); border: 1px solid #d8dfd2; border-radius: 18px; box-shadow: 0 12px 36px rgba(31,71,49,.08); }
        .legal-head { padding: 28px; margin-bottom: 18px; }
        .brand { font-weight: 800; letter-spacing: -.02em; color: #235b3c; text-decoration: none; }
        h1 { font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1.05; margin: 28px 0 12px; letter-spacing: -.04em; }
        h2 { margin: 0 0 10px; font-size: 1.2rem; }
        p, li { color: #3f5148; line-height: 1.7; }
        .updated { font-size: .9rem; color: #708077; }
        nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
        nav a, .language a { border: 1px solid #cad7ca; border-radius: 999px; padding: 8px 12px; text-decoration: none; background: #f8fbf7; }
        nav a[aria-current="page"] { background: #235b3c; color: white; border-color: #235b3c; }
        .language { float: right; display: flex; gap: 6px; }
        .legal-card { padding: 26px; margin: 14px 0; }
        footer { margin-top: 28px; color: #708077; text-align: center; }
        @media (max-width: 560px) { .language { float: none; margin-top: 16px; } .legal-head, .legal-card { padding: 20px; } }
      `}</style>
      <header className="legal-head">
        <Link className="brand" to="/">EcoTraceIT</Link>
        <span className="language"><Link to={`/legal/${document}`}>IT</Link><Link to={`/legal/${document}?lang=en`}>EN</Link></span>
        <h1>{content.title}</h1>
        <p>{content.intro}</p>
        <p className="updated">{locale === "it" ? "Ultimo aggiornamento" : "Last updated"}: {content.updated}</p>
        <nav aria-label={locale === "it" ? "Documenti legali" : "Legal documents"}>
          {navigation.map((item) => <Link key={item} aria-current={item === document ? "page" : undefined} to={`/legal/${item}?lang=${locale}`}>{documents[item][locale].title}</Link>)}
        </nav>
      </header>
      {content.sections.map((section) => (
        <section className="legal-card" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
        </section>
      ))}
      <footer>© 2026 EcoTraceIT · servizi alle PMI · <a href={`mailto:${contactEmail}`}>{contactEmail}</a></footer>
    </main>
  );
}
