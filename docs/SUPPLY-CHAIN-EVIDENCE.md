# Evidenze di filiera, prove e firma

EcoTraceIT conserva dati strutturati e verificabili per supportare il fascicolo tecnico PPWR. Non sostituisce il laboratorio, il fabbricante, CONAI o una firma elettronica qualificata.

## Flusso operativo

1. In **Fornitori e prove**, registrare il fabbricante e il responsabile autorizzato alla dichiarazione.
2. Registrare i fornitori con codice interno, ragione sociale, paese, partita IVA, contatti e stato. Solo un fornitore `APPROVED` soddisfa il controllo.
3. Registrare i laboratori con organismo, numero e campo di accreditamento. Solo un laboratorio `APPROVED` può produrre una prova verificata.
4. Nel workspace **PPWR**, associare ogni componente a un fornitore.
5. Inserire la dichiarazione del fornitore con riferimento, date, URL HTTPS del documento e SHA-256 opzionale. Le dichiarazioni scadute, non verificate o appartenenti a fornitori sospesi bloccano la dichiarazione UE.
6. Inserire i rapporti di prova con laboratorio, norma, metodo, campione, esito, sintesi, misure strutturate JSON, URL HTTPS e SHA-256 obbligatorio.
7. Classificare ogni componente con famiglia, codice materiale, tipologia, fascia, aliquota opzionale, periodo di validità e fonte CONAI. La classificazione deve essere marcata `VERIFIED` dal merchant dopo il controllo della fonte vigente.
8. Eseguire la valutazione. La firma è disponibile solo quando non rimangono controlli falliti.
9. Il responsabile digita il proprio nome, accetta l'attestazione e registra luogo e numero della dichiarazione.

## Integrità e audit

La firma genera uno snapshot JSON canonico che include:

- operatore economico e fabbricante;
- identità e versione dell'imballaggio;
- componenti, fornitori e classificazioni CONAI;
- dichiarazioni dei fornitori;
- laboratori, rapporti, metodi, risultati e hash;
- evidenze tecniche e periodo di conservazione.

EcoTraceIT calcola lo SHA-256 dello snapshot e lo salva insieme al testo e alla versione dell'attestazione, al firmatario, alla sessione Shopify, alla data e al metodo `ELECTRONIC_ATTESTATION`. La verifica ricalcola l'hash prima di considerare integra la dichiarazione. Un'amministrazione può revocare la firma indicando la motivazione; il fascicolo passa a `WITHDRAWN` e resta nell'audit trail.

Lo snapshot firmato non viene ricostruito dai dati correnti: preserva le evidenze viste al momento dell'attestazione. Per cambiare un fascicolo dichiarato bisogna crearne una nuova versione.

## Confini legali

- L'attestazione in-app prova intenzione, identità della sessione e integrità del contenuto, ma non è una firma elettronica qualificata eIDAS.
- Lo stato di accreditamento del laboratorio e l'autenticità dei rapporti devono essere verificati presso le fonti competenti.
- Codici, fasce, aliquote ed esenzioni CONAI possono cambiare: EcoTraceIT registra fonte e validità, non inventa né certifica la classificazione.
- La responsabilità della dichiarazione e dell'immissione sul mercato resta al fabbricante o all'operatore economico previsto dalla normativa.

## Privacy

I documenti restano presso il repository scelto dal merchant. EcoTraceIT conserva metadati, URL HTTPS e hash, limitando duplicazione e trattamento di documenti potenzialmente sensibili. Non inserire documenti contenenti dati cliente nei riferimenti di filiera.
