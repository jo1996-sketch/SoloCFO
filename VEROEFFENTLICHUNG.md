# SoloCFO veröffentlichen – konkrete To-dos

Stand 29.10.2026 – Checkliste, keine rechtliche Beratung.

Version 3.0 erweitert die lokale Test-App um DCF, detaillierte Stundenplanung, Cashflow-Szenarien und ein neues UI. Diese Funktionen sind rechnerisch und im Browser getestet; sie ersetzen keine fachliche Freigabe oder sichere SaaS-Architektur. Es wurde nichts veröffentlicht. Aktueller Startpunkt: `dist/SoloCFO_v3_Offline.html`.

## A. Sofort möglich: technische Web-Pilotversion

1. HTML lokal öffnen und mit **fiktiven Daten** testen.
2. Testberichte aus `node test-engine.cjs` dokumentieren. Für reale Pilotkundendaten erst Daten- und Sicherheitskonzept erstellen.
3. Domain und Markenrecherche durchführen; **SoloCFO** ist vorläufiger Projektname.
4. HTTPS-Hosting für Verzeichnis `web/` einrichten. `index.html` am Domain-Root ausliefern. PWA unter iOS Safari „Zum Home-Bildschirm“ hinzufügen.
5. Impressum, Datenschutzerklärung, Nutzungsbedingungen und fachliche Grenzen rechtlich prüfen; Veröffentlichung zunächst als Beta/Demo kennzeichnen.
6. Cross-Browser-, Accessibility-, Performance- und mobile Tests sowie Rechnungskontrolle mit unabhängigen Referenzbeispielen durchführen.

## B. Für reale zahlende Kunden **vor** öffentlicher Freigabe

- Produktverantwortung, Firmenname, ladungsfähiges Impressum, Supportkontakt, Steuerangaben, AGB, Datenschutzerklärung und Auftragsverarbeitungsverträge klären.
- Nutzeridentitäten, Rechte/Rollen, Mandantentrennung, sicherer Dateiupload, Verschlüsselung, Aufbewahrungs- und Löschkonzept, verschlüsselte Backups und Wiederherstellung ergänzen. Keine vertraulichen Kundenfinanzen ausschließlich im `localStorage` ablegen.
- Sichere Backend-Architektur mit Unternehmens-/Mandantenmodell und nachvollziehbarer Berechnungshistorie.
- Import von PDF, XLSX, Kontensalden/BWA mit explizitem Mapping, Quellenprüfung und manueller Freigabe.
- KI-Erklärungen nur auf **validierten**, versionierten Ergebnisobjekten aufbauen; keine freien KI-Rechnungen; Provider und DPA prüfen.
- Rechts- und Steuergrenzen definieren, Benchmarks und Datenrechte klären, besonders für österreichische KMU.
- Zahlungs- und Abo-System mit Rechnungs- und Kündigungsprozessen implementieren (Web). Vor Umsatzabwicklung rechtlich/steuerlich prüfen.
- Penetrationstest, QA, Sicherheitsprotokolle, Fehlerüberwachung, Incident-Management und Barrierefreiheit.

## C. Apple App Store – native Container-App (geplant, nicht geliefert)

Die `capacitor.config.json` ist eine **Scaffold-Vorlage**, keine bereits erzeugte Xcode-App. Für die tatsächliche iOS-Version werden macOS, Xcode, Apple Developer Program und ein eindeutiger Bundle Identifier benötigt. Die Platzhalter-ID `com.example.solocfo` muss ersetzt werden.

**Entwicklerworkflow unter macOS**, nachdem du Versionen und Dependencies geprüft hast:

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

Im Xcode-Projekt anschließend Signing & Capabilities, App-Symbole/Splashscreen, Datenschutzdeklaration, sichere Datenspeicherung, Device-Tests und Bereitstellung über TestFlight einrichten. Für App-Store-Abos / digitale In-App-Funktionen in der Regel **StoreKit / Apple In-App Purchase** mit aktuellen Apple-Regeln berücksichtigen; Website-Zahlungen dürfen nicht pauschal gleichgesetzt werden. App Store Connect benötigt App-Metadaten, Screenshots, Support-/Datenschutz-URLs, ggf. Altersfreigabe und sonstige Angaben.

**Wichtig:** Ein reiner Website-Wrapper kann an Apples Mindestfunktionsanforderungen scheitern. Wir müssen einen echten mobilen Mehrwert sicherstellen und die aktuellen Review Guidelines vor Einreichung prüfen. Es wurde noch **keine iOS-Binärdatei** gebaut, signiert, eingereicht oder veröffentlicht.

## D. Empfohlener Ausbau in Releases

- **MVP 2 (ursprüngliche Basis):** Web/Offline, deterministische Jahresanalyse, Maßnahmenvergleich, vereinfachte Kalkulation.
- **Lokale Version 3.0 (dieses Paket):** DCF, detaillierte Team-/Stundensatzplanung, Szenarien, neues UI und Tests. Keine Produktionsfreigabe.
- **SaaS-Beta (offen):** sichere Konten + Mandanten + Backend + CSV/XLSX-Kontenmapping + Quellennachweise + erweitertes Testset.
- **Beta 4:** validierte österreichische Kostenrechnung, vollständige Plan-GuV und Liquidität, verbesserte Berichte; Pilotkunden.
- **Release 1:** Audit- und Datenschutzprüfung, Abo-Abwicklung, Nutzerverwaltung, Onboarding, Support und Veröffentlichung.
- **Später:** dokumentierte KI-Erklärungen, Benchmarks mit Datenrechten, Bank-/BMD-Integrationen, App Store.

## E. Entscheidungsfragen

Vor kostenintensivem SaaS-Ausbau anhand echter Pilotgespräche prüfen: Wer ist Käufer (Berater vs. KMU)? Welche Daten liegen wirklich vor? Wie gut klappt das Mapping? Ist der Managementbericht seinen Preis wert? Welche Auswertungen benötigt die Zielgruppe am dringendsten?
