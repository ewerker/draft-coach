# Gesamtplan: Aus Spielen überprüfbare Verbesserungen gewinnen

Stand: 10. November 2026. Ausgangspunkt: GitHub-Release **v0.7.6**, Commit **90f6107**.

**Status: Zur Abnahme vorgelegt. Die Umsetzung der Punkte 1–9 beginnt nach Freigabe dieses Plans.**

## Ziel und verbindliche Arbeitsweise

Der Coach erfasst im laufenden Spiel eigene und gegnerische Figurentypen, Mengen und Entwicklungsformen. Nach jeder Partie verarbeitet er seine Beobachtungen selbstständig weiter. Er schlägt gezielte Bildbestätigungen und später begründete Regeländerungen vor. Der normale Benutzerablauf besteht aus Spielen, kurzen Bestätigungen und Freigaben; technische Formulare sind optional.

Der Ablauf muss ohne Codex funktionieren. Deutsch und Englisch verwenden dieselben Kartenkennungen, Mechaniken, Prüfbelege und Regelversionen. Übersetzt werden Darstellung und Erklärung, nicht die Spiellogik.

Es gibt keine garantierte Verbesserung nach einer festen Zahl von Spielen. Fortschritt wird an Abdeckung, Fehlern und unabhängigen Vergleichsdaten gemessen. Ein Sieg beweist keine Regelwirkung; aus einem historischen Screenshot lässt sich kein ungespielter Kampf zuverlässig simulieren.

Verbindliche Statusliste: [learning-plan.json](learning-plan.json). Jedes Arbeitspaket wechselt von **geplant → in Arbeit → umgesetzt → geprüft → abgenommen**. Zu „geprüft“ gehören ein Commit und ein gespeicherter Prüfbericht. Bestehende Teilfunktionen bedeuten nicht, dass das gesamte Paket abgeschlossen ist.

## Ausgangslage 0.7.6

| Vorhanden | Noch keine vollständige Lösung |
|---|---|
| ADB-Aufnahme, Erkennung der Wahlkarten, Bewertung und Antippen | Sicherer eigener/gegnerischer Bestand nach Typ, Anzahl und Entwicklung |
| Archivierung gespeicherter Partieergebnisse mit Belegbildern | Vollständige Erhaltung unterbrochener Partien und ihrer Prüfung |
| Gesprochene/geschriebene Beobachtung, optionaler KI-Vorschlag | Automatische Verarbeitung aller relevanten Beobachtungen nach jeder Partie |
| Gemeinsame Prüffallliste und offene/erledigte Fälle | Durchgängiger Prüfauftrag mit Ergebnis und Freigabeempfehlung |
| Regelstatus Notiz, Testvorschau, Aktiv; einzelne Replay-Vergleiche | Unabhängiger Wirksamkeitsnachweis und automatisch begründete Freigabevorschläge |
| Experimentelle Bildvorlagen und erste unabhängige Auswertung | Belastbare Zählung, Entwicklungsstufen und Behandlung manueller Eingriffe |

## 1. Ein gemeinsamer Wissens- und Prüfprozess

**Umfang:** Jeder Hinweis erhält eine dauerhafte Kennung, Herkunft, Sprache, Version und zugehörige Partien/Bilder. Drei fachliche Arten werden unterschieden: taktische Entscheidung, allgemeine Spielmechanik und Erkennungsproblem. Die Benutzeroberfläche fasst sie als Prüfaufträge in einer zentralen Arbeitsliste zusammen.

- [ ] P1.1 Bestehende Notizen, Regelbelege und Prüffälle zusammenführen bzw. verknüpfen; Dopplungen vorschlagen, Originale erhalten.
- [ ] P1.2 Zustände sichtbar machen: gesammelt, Rückfrage nötig, prüfbar, Prüfung läuft, weitere Belege nötig, Freigabe vorgeschlagen, aktiv, zurückgestellt.
- [ ] P1.3 „Erledigt“ als Bearbeitungsstatus von fachlicher Freigabe unterscheiden. DE/EN-Fassungen teilen dieselbe Regel und Prüfhistorie.

**Abnahme A1:** Ein Hinweis aus Spracheingabe, Internetnotiz oder Partie erscheint genau einmal als bearbeitbarer Auftrag mit Herkunft. Sprachwechsel erzeugt keinen zweiten Auftrag. Ein mechanischer Hinweis für alle Karten benötigt weder künstliche Karte noch Punktgewicht. Bestehende Datensicherung und Rückmigration sind geprüft.

## 2. Dauerhafte Partiedaten und Hintergrundaufträge

**Umfang:** Eine Partie wird vom Beginn bis zum Ende nachvollziehbar. Noch nicht abgeschlossene Partien werden als unvollständig gesichert. Ergebnis unbekannt, abgebrochen, gewonnen und verloren bleiben unterscheidbar. Ein Neustart darf einen laufenden oder wartenden Prüfauftrag nicht verlieren.

- [ ] P2.1 Dauerhafte Partiekennung, regelmäßiger Zwischenstand und Wiederaufnahme nach Neustart; Archivimport eindeutig und wiederholbar.
- [ ] P2.2 Für jede Entscheidung speichern: sichtbares Angebot, Bild-Erkennung, damals angenommener Bestand, Empfehlung, Regel-/Modellversion, gesendete Aktion und tatsächlich bestätigte Folge. Manuelle Eingriffe und unbestätigte Aktionen kennzeichnen.
- [ ] P2.3 Nach Partieabschluss automatisch Hintergrundaufträge anlegen; begrenzte Wiederholungen bei Fehlern, sichtbarer Fortschritt, geringe Priorität während des Spiels.
- [ ] P2.4 Begrenztes Bildbudget, Duplikaterkennung und aufschlussreiche Belegbilder. Bestätigte Prüfbelege erhalten; Aufräumen und Sicherung umfassen auch Prüfbilder, Regelversionen und Prüfberichte. Kosten- und Größenlimits anzeigen.

**Abnahme A2:** Eine vollständige Testpartie wird genau einmal gespeichert und startet ihre Nachprüfung. Eine unterbrochene Partie überlebt einen Neustart ohne erfundenes Ergebnis. Ein fehlgeschlagener Auftrag lässt sich nachholen. Unvollständige Partien verfälschen Gewinnquote und Verlustserie nicht.

## 3. Eigene und gegnerische Truppen im laufenden Spiel erkennen

**Umfang:** Beide Seiten erhalten denselben Erkennungsumfang: Figurentyp, sichtbare Anzahl beziehungsweise Mengenintervall, Entwicklungsform und jeweilige Sicherheit. Die Ausgabe unterscheidet Aufstellung vor dem Kampf, Verstärkungswahl und verbleibende Figuren nach dem Kampf. Eine Überlebendenzahl darf nicht unbemerkt den aufgebauten Bestand ersetzen.

Bekannte dauerhafte Kartenstufen und Sterne werden mit den beobachteten Entwicklungsformen verknüpft. Daraus entsteht ein nachvollziehbares Stärkeprofil beider Armeen; eine universelle Kampfstärkezahl wird erst verwendet, wenn ihre Berechnung belegt ist. Verdeckt oder nicht sicher ablesbar bedeutet unbekannt, nicht null.

- [ ] P3.1 Bestehende Vorlagen als gemessene Basis vergleichen mit einem lokal ausführbaren Objekt-Erkennungsmodell und zeitlicher Verfolgung. Kandidat: Modell im ONNX-Format; zuerst CPU-Messung, Hardwarebeschleunigung nur bei belegtem Bedarf.
- [ ] P3.2 Geometrie, beide Spielfeldhälften, Überlappungen, Effekte und Animationen berücksichtigen. Typ-, Mengen- und Formschätzungen getrennt liefern; Unbekannt ist ein gültiges Ergebnis.
- [ ] P3.3 Das sichtbare Gegnerdeck der Schlacht als starken Kandidatenhinweis nutzen, mit Ausnahmen für Sonderangebote. Im Draft Gegner nicht auf das eigene Deck beschränken.
- [ ] P3.4 Eigene beobachtete Wahl und tatsächliche Aufstellung abgleichen; manuelle Eingriffe übernehmen, sobald hinreichend belegt. Nicht allein aus dem Coach-Tipp auf die tatsächlich vorhandenen Truppen schließen.
- [ ] P3.5 Abdeckung pro Figur, Entwicklungsform, Seite, Spielphase, Geometrie und Sprache messen. Zuerst belastbare Teilabdeckung, danach schrittweiser Ausbau auf alle 27 Figuren und ihre Formen.

**Abnahme A3:** Ein unabhängiger Bericht nennt für beide Seiten Typ-Präzision/Trefferquote, Zählfehler, Fehler je Entwicklungsform und Laufzeit einschließlich hoher Ausreißer. Ein durchschnittlich guter Wert darf schwache Figurentypen nicht verdecken. Pilotziel für Figurentypen: mindestens 95 % Präzision und 90 % Trefferquote auf getrennten Testpartien; Mengen/Formen erhalten vor ihrem Einsatz eigene Grenzwerte anhand des Pilotdatensatzes. Die neue Analyse soll im Pilot für mindestens 95 % der relevanten Bilder unter einer Sekunde liegen; Aufnahme, gesamte Wartezeit und Klickfrist werden zusätzlich gemessen. Wird dies verfehlt, bleibt der langsame Anteil in der Nachauswertung. Kein zu alter Spielzustand darf einen Klick auslösen.

## 4. Gezielte Bestätigung durch den Spieler

**Umfang:** Der Coach wählt nach der Partie wenige nützliche, unterschiedliche Bilder aus und fragt konkret: „Gegner: 3 Schnecken, davon 2 entwickelt – stimmt das?“ Markierte Bereiche und die vollständige Aufnahme sind gemeinsam sichtbar. Bestätigen, stimmt teilweise, stimmt nicht und nicht beurteilbar sind möglich; kurze Sprachkorrektur oder Mengenanpassung reicht.

- [ ] P4.1 Unsichere Figuren, Mengen/Formen, neue Geometrien, Konflikte mit gesendeten Klicks und manuelle Eingriffe gezielt vorlegen. Pro Prüfrunde wenige Fälle, Rest sichtbar in der Warteschlange.
- [ ] P4.2 Figurentyp, Anzahl und Form einzeln bestätigen. Nur tatsächlich bestätigte Angaben werden Prüf-Wahrheit; unbekannte oder KI-erzeugte Beschriftungen bleiben Vorschläge.
- [ ] P4.3 Teilbestätigungen, leere Seiten und Überlappungen unterstützen. Keine vier Formularzeilen als starre Grenze für die tatsächliche Zahl sichtbarer Entwicklungsformen.
- [ ] P4.4 Einen unabhängigen, nach ganzen Partien getrennten Testbestand reservieren. Zusätzlich zufällig geschichtete Kontrollbilder vorlegen, damit die Auswahl nur schwieriger Fälle die Messung nicht verzerrt.

**Abnahme A4:** Ein Benutzer kann mehrere vorgeschlagene Bilder mit kurzen Antworten abarbeiten. Die Korrektur überlebt einen Neustart und löst automatisch einen neuen Prüfauftrag aus. Dieselbe Aufnahme dient niemals zugleich als Lernvorlage und unabhängiger Test. Unbestätigte Angaben zählen nicht als Bestätigung.

## 5. Allgemeine Mechaniken und Bestände nach Entwicklungsform

**Umfang:** Regeln wie „Verdopplung betrifft die angezeigte Ausgangsform“ werden als strukturierte Berechnungsmechanik geführt. Kartenbezogene Taktikpunkte bleiben ein eigener Regeltyp. „Alle Karten“ ist als Geltungsbereich zulässig, wenn der Mechanismus tatsächlich dafür belegt ist.

- [ ] P5.1 Stabile Kennungen der Ausgangs- und Zielform einführen. Kartenstufe, Sterne, Entwicklungsform und betroffene Stückzahl getrennt halten; keine unbewiesene Nummerierung der Formen voraussetzen.
- [ ] P5.2 Hinzufügen, Aufwerten, Verdoppeln und kombinierte Angebote modellieren. Eine KI darf nur Vorschläge innerhalb erlaubter Mechanismen erstellen, keinen beliebigen Programmcode ausführen.
- [ ] P5.3 Die betroffene Gruppe berechnen, wenn sie bekannt ist. Bei unbekannter Form oder Anzahl keine Wirkung auf den Gesamtbestand behaupten; Unsicherheit in die Bewertung übernehmen.

**Abnahme A5:** Mit bestätigten Formen werden mindestens diese Szenarien geprüft: 2 Grundformen plus 10 entwickelte Figuren; Verdopplung nur der Grundform ergibt 4 plus 10. Aufwertung nur der zwei Grundformen verändert ihre Form, nicht die Gesamtzahl 12. Ein kombiniertes Angebot wird erst mit belegter Bedeutung geprüft. Auch ein einzelnes angebotenes Upgrade wird gegen gemischte eigene Formen geprüft, nicht nur zwei gleichnamige Wahlkarten nebeneinander. Widersprechende Belege begrenzen den Geltungsbereich.

## 6. Automatische Prüfung an gespeicherten Situationen

**Umfang:** Nach jeder Partie und nach jeder bestätigten Korrektur prüft der Coach relevante Mechaniken und taktische Vorschläge erneut. Er protokolliert das erwartete und tatsächliche Ergebnis. Die Auswahl geeigneter Fälle, der Testlauf und die Zusammenfassung geschehen automatisch.

- [ ] P6.1 Aus Beobachtungen prüfbare Erwartungen vorschlagen; eine vom selben KI-Lauf erzeugte Behauptung und Antwort sind kein unabhängiger Beweis.
- [ ] P6.2 Gesicherte Mechaniken gegen Rechenfälle prüfen; taktische Regeln mit und ohne Änderung auf historische Entscheidungen anwenden und Unterschiede speichern.
- [ ] P6.3 Unzuverlässige Erkennung als eigene Fehlerursache behandeln. Nur Situationen mit passendem Geltungsbereich in den Regeltest aufnehmen; Fälle mit unklarer Grundlage separat zeigen.
- [ ] P6.4 Kritische Gegenbeispiele, Widersprüche und Regressionen sammeln. Prüfbericht mit Regelversion, Datenstand, Laufzeit und Abdeckung speichern.

**Abnahme A6:** Eine bestätigte Bildkorrektur oder ein neuer passender Partieabschluss startet ohne Formular einen reproduzierbaren Testlauf. Der Bericht zeigt bestanden, widersprochen oder noch unklar. Ein Replay behauptet keine hypothetische Siegchance. Fehler in gesicherten Rechenfällen blockieren die Freigabe.

## 7. Begleitende Bewertung und kontrollierte Spielversuche

**Umfang:** Prüfbare Kandidaten rechnen zunächst während neuer Spiele mit, ohne die aktuelle Auswahl zu steuern. Der Coach speichert, wo ein Kandidat anders entschieden hätte und welche Voraussetzungen er benutzt hat. Wirkung auf das Spielergebnis lässt sich erst durch tatsächliche, kontrollierte Anwendung untersuchen.

- [ ] P7.1 Begleitberechnung dauerhaft protokollieren, einschließlich Fälle ohne Empfehlung und der später tatsächlich gespielten Wahl.
- [ ] P7.2 Für geeignete Kandidaten einen begrenzten Spielversuch vorschlagen: feste Regelversion, klarer Modus/Geltungsbereich, Vergleichsprofil und Rückfallregel. Genehmigung einmal für den beschriebenen Versuch statt Formulare nach jeder Partie.
- [ ] P7.3 Möglichst vergleichbare Partien und bei ausreichender Datenlage zufällige Zuordnung auf Partieebene verwenden. Deck, eigene Kartenwerte, Gegnerstärke, Sprache, Eingriffe und technische Fehler erfassen. Unsicherheit der Ergebnisunterschiede ausweisen.

**Abnahme A7:** Der Coach kann einen Testlauf durchführen und mit einem zuvor definierten Vergleich auswerten. Ein historischer anderer Tipp gilt nicht als beobachteter Sieg. Unbekannte Ergebnisse und manuelle Eingriffe werden sichtbar behandelt. Eine erforderliche Mindestmenge wird aus Vergleichsziel und beobachteter Streuung abgeleitet; eine pauschale Zusage „50 Spiele reichen“ gibt es nicht. Die bestehende Abschaltung nach drei Niederlagen und die manuelle Kontrolle funktionieren weiterhin.

## 8. Automatische Freigabe- und Überarbeitungsvorschläge

**Umfang:** Der Coach legt konkrete Vorschläge vor: „Aktivieren“, „mit kleinerem Gewicht testen“, „mehr Bilder nötig“, „widersprüchlich“ oder „zurücknehmen“. Jeder Vorschlag zeigt wenige passende Beispiele und einen verständlichen Grund. Es ist keine Suche durch 146 Formulare nötig.

- [ ] P8.1 Für jeden Kandidaten automatisch prüfen: belastbare Erkennung im benötigten Bereich, bestandene Mechaniktests, ausreichende Fallvielfalt, unabhängige Belege, Widersprüche und gegebenenfalls Ergebnisse des Spielversuchs.
- [ ] P8.2 Mechanik-Freigabe, Erkennungs-Freigabe und taktische Wirksamkeit unterschiedlich begründen. Ein gemeinsam geltender Regelkern wird für Deutsch und Englisch freigegeben; fehlende sprachabhängige Bildabdeckung bleibt ausdrücklich sichtbar.
- [ ] P8.3 Ein-Klick-Freigabe mit Wirkungsvorschau, dokumentierter Version und Rücknahme. Nach Aktivierung weiter überwachen; bei vorab definierten technischen Fehlern auf die vorige Version zurückfallen und dies melden.

**Abnahme A8:** Ein guter und ein bewusst widersprüchlicher Kandidat werden automatisch unterschiedlich vorgeschlagen. Jede vorgeschlagene Aktivierung verweist auf Belege und nennt Grenzen. Eine reine Siegquote genügt nicht. Vor dem erstmaligen Live-Einsatz erfolgt die Freigabe durch den Benutzer. Abgelehnte oder pausierte Vorschläge werden nicht unverändert immer neu vorgelegt.

## 9. Standalone-Gesamtabnahme und Übersicht

**Umfang:** Eine zentrale Seite zeigt Partien, noch offene Fragen, Prüfaufträge und anstehende Freigaben in einem nachvollziehbaren Ablauf. Die vorhandenen Ansichten bleiben erreichbare Details. Der Benutzer sieht, warum etwas noch wartet und was seine nächste kurze Aktion wäre.

- [ ] P9.1 Automatische Verarbeitung beim Desktop-Start fortsetzen, auch nach Neustart oder Netzwerkfehler. Klare Trennung zwischen Codex-Entwicklungsarbeit und im Coach selbst laufenden Aufgaben.
- [ ] P9.2 Vorhandenen API-Key für Strukturierung, verständliche Erklärungen und optional die Nachanalyse einzelner Bilder nutzen. Ohne Key bleiben lokale Erkennung, Messungen, Regeln und bereits bestätigte Prüfungen nutzbar. API-Aufrufe, Bildübermittlung und Kostenbudget sichtbar kontrollieren.
- [ ] P9.3 DE/EN-Oberfläche, Datenmigration, vollständige Sicherung/Wiederherstellung, Laufzeiten und Speichergrenzen prüfen. Ein neues Spiel darf durch eine Hintergrundprüfung nicht ausgebremst werden.
- [ ] P9.4 Gesamtdurchlauf dokumentieren: neue Beobachtung → gezielte Bildfrage → bestätigter Bestand → automatische Prüfung → begründeter Vorschlag → Freigabe → Live-Beobachtung → mögliche Rücknahme.

**Abnahme A9:** Der Gesamtdurchlauf funktioniert ohne Codex und ohne technische Pflichtformulare in Deutsch und Englisch. Eine beantwortete Bildfrage verbessert nachweisbar eine spätere Erkennung; eine aktivierte geprüfte Mechanik verändert nachweisbar die passende Berechnung. Eine Aussage zur verbesserten Gewinnwahrscheinlichkeit erfolgt nur, wenn dafür hinreichende prospektive Daten vorliegen. Andernfalls zeigt der Coach den erreichten technischen Fortschritt und die noch unklare Spielwirkung getrennt.

## Reihenfolge, Aufwand und Abnahmen

Punkte 1 und 2 bilden das Fundament. Punkte 3 und 4 werden anschließend iterativ aufgebaut; sie sind die größte Unsicherheit. Punkt 5 kann nach dem Fundament mit bereits bestätigten Bildern beginnen. Punkt 6 verbindet diese Bausteine. Punkte 7 und 8 bringen die geprüften Vorschläge kontrolliert ins Spiel. Punkt 9 ist die Gesamtabnahme.

Punkt 4 startet mit vorhandenen Prüfbildern und den ersten Vorschlägen aus Punkt 3; er wartet nicht auf die fertige Erkennung. Die dabei bestätigten Bilder dienen dem Ausbau von Punkt 3. Dessen unabhängiger Testbestand bleibt getrennt. Die Abnahme beider Pakete erfolgt erst nach diesem gemeinsamen Pilotdurchlauf.

Es wird kein verbindlicher Kalender oder eine feste Anzahl benötigter Partien zugesagt, bevor der Erkennungspilot gemessen ist. Der erste Pilotbericht nennt konkrete Lücken nach Figur/Form und bittet gezielt um wenige passende Spielsituationen. Statusupdates beziehen sich immer auf die Nummern P1–P9 und enthalten umgesetzt, geprüft, offen und den nächsten Nachweis.

## Werkzeuge und mögliche Ausgaben

- **Jetzt ausreichend:** bestehendes GitHub-Repository, nummerierte Arbeitsliste, SQLite, Node/Python/OpenCV und der bereits hinterlegte API-Key. Kein zusätzliches Abonnement für die Projektorganisation erforderlich. Nach Planabnahme können GitHub-Issues dieselben P1–P9-Kennungen als verknüpfte Arbeitsaufträge erhalten.
- **Erkennungspilot:** lokal ausführbares Erkennungsmodell plus ONNX Runtime als Kandidat. ONNX Runtime bietet CPU-Ausführung und unterschiedliche Hardware-Anbindungen; ob vorhandene Hardware reicht, entscheidet die Messung. Kein Hardwarekauf vor diesem Nachweis.
- **Optionale Kosten:** begrenzte KI-Nachanalysen ausgewählter Bilder oder vorübergehend Rechenleistung für Modelltraining. Erst ein Pilot mit repräsentativen Bildern, dann ein konkreter Kostenvorschlag. Keine laufende Cloud-Bilderkennung im Ein-Sekunden-Spielpfad als Voraussetzung.
- **Budgetkontrolle:** Vor kostenpflichtigen Erweiterungen werden Zweck, erwartete Menge, Grenze und Abschaltung vereinbart. Bei der Erstellung dieses Plans werden keine neuen Dienste gebucht oder Modelle kostenpflichtig trainiert.

Quellen zu Werkzeugoptionen: [GitHub-Aufgabenlisten und Unteraufgaben](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-tasklists), [ONNX Runtime auf Windows](https://onnxruntime.ai/docs/get-started/with-windows.html), [ONNX Runtime Execution Providers](https://onnxruntime.ai/docs/execution-providers/).

## English summary

This is a proposed plan awaiting user approval, based on release v0.7.6. The numbered work packages are: P1 shared knowledge/case lifecycle; P2 durable matches and background jobs; P3 live recognition of unit types, counts and evolution forms for both armies; P4 targeted user verification; P5 explicit general game mechanics and form-specific inventories; P6 automatic independent replay checks; P7 shadow evaluation and controlled prospective trials; P8 evidence-based activation/withdrawal proposals; P9 standalone bilingual end-to-end acceptance.

German and English share canonical identifiers, evidence, rule versions and activation. Language-dependent recognition coverage is measured separately. Users receive concrete questions and proposals instead of mandatory technical forms. Saved notes, machine predictions, image confirmations, calculation correctness and evidence of tactical benefit remain distinguishable. No guaranteed win-rate improvement or fixed number of matches is promised. No new paid service is purchased as part of planning.
