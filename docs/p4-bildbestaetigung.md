# P4: Gezielte Bildbestätigung

Stand: 10.11.2026. Umsetzung auf Basis von 0.7.6; keine neue Releaseversion. P3 bleibt in Arbeit.

## Ablauf für den Spieler

1. Unter **Partien und Auswertung → Gezielte Bildfragen** eine Runde mit bis zu drei Bildern starten. Auch aus Vorbereitung → Lernfortschritt erreichbar. Die Bildfragen sind auch auf angemeldeten LAN-Clients verfügbar; Archivverwaltung bleibt auf den Host beschränkt.
2. Eigenes und gegnerisches Spielfeld getrennt beantworten: **Stimmt**, **Teilweise**, **Stimmt nicht**, **Nicht beurteilbar**. Fehlende Figurentypen ergänzen. Eine nicht beantwortete Seite bleibt offen.
3. Figurentypen bestätigen. Eine Gesamtzahl nur dann bestätigen, wenn sie tatsächlich gezählt werden kann. Die Zahl gilt für den ganzen Figurentyp auf dieser Seite. Verdeckte Figuren nicht erraten. Alle sichtbaren Typen erfasst und eindeutig leere Seiten benötigen eigene Bestätigungen.
4. Optional eine einzelne gut sichtbare Figur einrahmen. Dazu obere oder untere Seite vergrößern. Der Rahmen ist eine Lernvorlage, kein Gruppenrahmen. Unterschiedliche Formen innerhalb desselben Typs beschreiben und einzeln bestätigen; mehr als vier Formen sind möglich. Keine unbewiesenen allgemeinen Stufennummern verwenden.
5. Speichern und weiter. Antworten bleiben dauerhaft gespeichert. Ohne Rahmen können Typen und Zahlen geprüft werden; für neue Bildvorlagen wird ein markiertes Exemplar benötigt. Kontrollbilder bleiben unabhängig und werden nicht als Lernvorlage verwendet.

Es ist kein API-Key nötig. Dieselbe Bestätigung gilt für Deutsch und Englisch. Freie Formbeschreibungen behalten ihre Eingabesprache; ihre automatische Übersetzung und Zuordnung zu stabilen Entwicklungsformen gehört zu P5. Die Beschriftung der Oberfläche und die kanonischen Figurentypen sind zweisprachig.

## Auswahl und Dauerhaftigkeit

- Nach erfolgreicher Partiesicherung stellt der vorhandene Hintergrundauftrag bis zu drei Bildfragen zusammen. Offene Fragen sind auf 36 Bilder begrenzt; zusätzlich können historische Partien per Button herangezogen werden. Es werden nur vorhandene Bilder aus Wahlphasen verwendet: Im bewegten Kampf beweist die Position keine Zugehörigkeit.
- Ein Kontrollbild wird reproduzierbar unabhängig von der Erkennungsbewertung aus nach Phase, Sprache und Geometrie geschichteten Kandidaten gezogen. Weitere Bilder berücksichtigen frühe/späte Aufstellungen, fehlende Erkennung, Formunsicherheit, Deck-/Aktionskonflikte und abweichende protokollierte Klicks. Fehlende Bilder begrenzen die Abdeckung; daraus wird keine Vollständigkeit abgeleitet.
- Ganze Partien erhalten vorab eine unveränderliche Zuordnung über SHA256(matchId): ungefähr ein Viertel Test, drei Viertel Lernen. Auch Testbilder außerhalb der zufälligen Kontrolle sind blind. Bytegleiche Bilder aus einem anderen Spiel werden zusätzlich aus dem Lernbestand ausgeschlossen.
- SQLite: `image_questions` enthält Bildzuordnung, Vorschlag, Auswahlgrund, feste Partition, Antwort, Revision und Übernahmestand. `image_question_history` bewahrt ältere Antworten. Eine optimistische Versionsprüfung verhindert das Überschreiben neuerer Antworten.
- Bis zur Übernahme bleiben die Bilder in SQLite erhalten, höchstens 12 MiB pro Bild. Bestätigte Bilder landen in der bestehenden Referenzablage; danach wird die doppelte BLOB-Kopie entfernt. Datenbank und Referenzablage gehören zur vollständigen Sicherung.
- Bestätigungen sind ein eigener Datensatz. Offene Regelprüfungen, manuelle Statusangaben und bestehende Markierungen werden nicht automatisch auf erledigt oder aktiv gesetzt. Eine spätere bewusste Änderung im bisherigen Korrektureditor ersetzt die betreffende Bestätigung.

## Was anschließend automatisch passiert

Eine gespeicherte Antwort erzeugt dauerhaft `export_status=pending`. Ein lokaler Hintergrundlauf wartet auf eine Spielpause, überträgt sie atomar in die Referenzmetadaten und merkt die Erkennungsprüfung vor. Neustarts verlieren den Auftrag nicht; wiederholte Übernahme ist idempotent. Fehler erscheinen in der zentralen Bildfragenliste und lassen sich erneut versuchen.

Nur bestätigte Angaben werden übernommen. Unbekannte Zahlen bleiben null; Teilbestätigungen werden nicht als vollständige Testbeschriftung bewertet. Für das Training zählen nur bestätigte Typen mit Exemplarrahmen aus Lernpartien. Unabhängige Typprüfungen benötigen die ausdrückliche Bestätigung aller sichtbaren Typen der jeweiligen Seite, einschließlich leerer Seiten. Die Prüfung startet nach einer Spielpause automatisch, sobald Lernbeispiele und unabhängige Testfälle vorliegen. Andernfalls zeigt sie den fehlenden Datenbestand. Der Modellbericht führt zufällige Kontrollbilder getrennt von gezielt schwierigen Bildern (`controlResults`).

Diese Schritte verbessern die Datengrundlage und messen Veränderungen. Sie trainieren noch kein allgemeines neuronales Erkennungsnetz und belegen keine bessere Siegquote. P3 bleibt Beobachtungspilot; Formzuordnung, unabhängige taktische Wirkung und automatische Freigabevorschläge sind weitere Arbeitspakete. Keine Taktikregel wird durch eine Bildantwort automatisch aktiviert.

## Technische Prüfung

- Neue Tests: Bestätigungsgrenzen, unbekannte Zahlen, sechs parallele Formen, leere Seiten, Teilantworten, ungültige Rahmen, dauerhafte Warteschlange, blinde Kontrolle, Revisionen, Wiederaufnahme der Übernahme, bisherige Markierungen, gemeinsame Partietrennung und Hash-Duplikate.
- HTTP-Integration: echter lokaler Server mit isoliertem Gerät, Partieabschluss → automatische Bildfrage → Bestätigung → Referenzübernahme → Neustart → Antwort wiederhergestellt; veraltete Speicherung abgewiesen. Kein Zugriff auf das echte Telefon.
- Browserprüfung: deutsche und englische Oberfläche, Typ-/Zahlbestätigung, Exemplar markieren, speichern/weiter, Wiederöffnen nach Serverneustart, obere/untere Vergrößerung und schmale Bildschirmbreite ohne horizontalen Überlauf.
- Ergebnis: **93 Node-Tests und 25 Python-Tests bestanden**. Desktop DE/EN, Serverneustart und 390-Pixel-Mobilansicht geprüft.
- Benutzerabnahme und unabhängiger Nachweis höherer Erkennungsqualität stehen noch aus.

## English

P4 adds a central queue of short, bilingual image reviews, up to three images per round. Review your own and enemy forces separately. Confirm types, counts and visible appearances independently; leave obscured values unknown. A crop marks one example, while the count describes the entire unit type on that side. More than four forms are supported. No API key is required.

Completed matches automatically supply bounded targeted questions plus a confidence-independent stratified control. Whole matches stay in a fixed training or test partition; control and held-out guesses are hidden. Exact duplicate images cannot leak into training. Answers, revisions and pending transfer jobs survive restarts and full backups. Transfers and recognition evaluation run while play is stopped; insufficient training or independent test labels remain visible. Control metrics are reported separately. Existing manual work and tactical rule statuses are preserved. Form naming is stored for the later P5 mapping; this implementation does not claim tactical efficacy or automatically activate rules.

## Speicherhilfe

Fehlende Pflichtbestätigungen werden vor der Übertragung direkt bei der betroffenen Figur angezeigt. Beim Speichern wird das erste fehlerhafte Feld fokussiert und sichtbar gemacht. Eine zusätzliche Zusammenfassung steht unmittelbar am Speichern-Button; sie verschwindet nach der Korrektur. Optionale unbestätigte Anzahlen bleiben unbekannt. Die Hinweise sind auf Deutsch und Englisch verfügbar, ohne die Benutzereingaben automatisch zu bestätigen. Geprüft: fehlender Figurentyp, Formbestätigung, leere Seite und fehlende Seitenantwort; Browserprüfung DE/EN mit anschließend erfolgreichem Speichern in isolierter Vorschau.

### Sichtung durch Codex

In einer Codex-Sitzung können offene Bildfragen und Partieprüffälle anhand der gespeicherten Bilder bearbeitet werden. Die Befunde erscheinen als „Von Codex geprüft“. Bereits bestätigte Spielerdaten bleiben erhalten. Beispiele aus Trainingspartien mit markierten Figuren können in die Erkennung eingehen. Die unabhängige Prüfung wertet weiterhin menschliche Befunde aus. Überlappende Figuren können mit unbekannter Anzahl gespeichert werden.

Partieprüffälle erhalten einen Befund zum gespeicherten Bild und zur damaligen Erkennung. Die Entscheidung über eine taktische Regel bleibt im bestehenden Prüfablauf. Neue Fälle kann der Coach selbst sammeln. Für die hier beschriebene Sichtung ist eine aktive Codex-Sitzung erforderlich.
