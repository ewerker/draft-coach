# P6 – automatische Nachprüfung: erster ausführbarer Baustein

Stand 10.11.2026, nach P5. P6 ist **in Arbeit**, keine Freigabe eines selbständig taktisch lernenden Systems.

## Was jetzt selbständig läuft
In Spielpausen sucht der Coach alle zehn Sekunden nach einem noch nicht mit dem aktuellen Datenstand geprüften abgeschlossenen Spiel. Pro Durchlauf bearbeitet er höchstens eine Partie: die letzten zwanzig dauerhaft gespeicherten Partien sowie ältere Partien mit bestätigten Prüfbildern. Ein neues Spiel unterbricht die Prüfung an der nächsten asynchronen Grenze; es werden keine Bilder neu erkannt, kein ADB-Kommando und kein API-Aufruf ausgeführt.

Ein neuer Abschluss, eine geänderte Bildbestätigung, Formzuordnung, Mechanik oder strukturierte Regel verändert den Prüf-Fingerabdruck und löst ohne Formular einen neuen Bericht aus. Bereits vorhandene Berichte bleiben erhalten, identische Aufträge werden nach Neustart nicht doppelt gespeichert.

## Drei getrennte Prüfungen
1. **Mechanik:** Fünf handgeschriebene Referenzerwartungen prüfen source-only-Verdopplung/Aufwertung bei 2+10, unbekannte Ausgangsmenge, unbestätigte kombinierte Aktion und Konflikt. Ein Rechenfehler sperrt den Regelvergleich. Das prüft das begrenzte mathematische Modell; es beweist nicht jeden Mechanismus des Spiels.
2. **Erkennung:** Spielerbestätigte Figuren und genaue Zahlen werden mit dem damaligen visuellen Pilotbefund verglichen. Fehlende Typen oder falsche genaue Zahlen werden als Widerspruch gespeichert. Eine reine Mindestzahl bleibt unklar. Entwickler-Vorschläge sind keine Bestätigung. Unterstützte Prüfbilder sind zur Fehlersuche nutzbar, zählen jedoch nicht als unabhängige Erkennungsabnahme.
3. **Regelvergleich:** Strukturierte aktive Regeln und Testregeln werden mit und ohne die einzelne Regel auf passende historische Angebote angewandt. Dazu wird die gespeicherte damalige Sammlung verwendet; die aktuelle Bewertungssoftware und die aktuelle Matchup-Datenbank sind ausdrücklich Teil des Fingerabdrucks. Dies ist ein nachvollziehbarer Vergleich unter der aktuellen Software, keine bitgenaue Wiederholung des alten Programms.

Berichte zeigen unbekannte eigene/gegnerische Figurentypen, fehlende historische Sammlung, unvollständige Angebote und nicht bestätigte betroffene Formen. Der Gesamtbestand aus gesendeten Klicks wird nicht nachträglich zur Bildwahrheit. Nur die passende Phase, Spielart, angebotene Karte/Aktion und bekannte gegnerische Karte werden für einen Regelvergleich berücksichtigt. Eine manuell im Wissensspeicher als Mechanik oder Erkennung eingeordnete Quelle wird nicht als Taktik-Regelvergleich behandelt.

## Anzeige und Speicherung
Unter **Partien und Auswertung → Automatische Nachprüfung** stehen die neuesten Berichte je Partie mit Sprache, Modus, Ergebnis, Rechenprüfung, unklarer Grundlage, Erkennungswidersprüchen und veränderten Tipps. Der offene Bereich aktualisiert sich alle 15 Sekunden. Deutsch und Englisch verwenden dieselben Regeln/IDs; Sprachabdeckung wird getrennt gezählt.

SQLite `replay_checks` speichert Bericht, Fingerabdruck, Zeit, Regel-Snapshots und Datenverweise dauerhaft. Vollständige Datenbanksicherungen schließen diese Tabelle ein. API: `GET /api/admin/replay-checks` nur für den lokalen Admin. Keine Regeln werden aktiviert oder Gewichte geändert.

## Noch offen bis A6
- P6.1: Aus freien Beobachtungen kurze, strukturierte Erwartungen vorschlagen und unabhängig bestätigen lassen. Textnotizen werden nicht automatisch zu einem bestandenen Test erklärt.
- Explizite taktische Gegenbeispiele und bestätigte bevorzugte Entscheidungen als eigene Erwartungen einbinden. Eine aus demselben KI-Lauf stammende Behauptung und Antwort bleibt nicht unabhängig.
- Nutzerabnahme der Berichte und Nachweis eines vollständig bestätigten Bild-/Formfalls über den gesamten Ablauf.
- P7/P8: kontrollierte Spielversuche, Wirksamkeitsauswertung und begründete Freigabe-/Rücknahmevorschläge. Ein anderer Replay-Tipp oder ein einzelner Sieg beweist keine Verbesserung.

## Technische Prüfung
106 automatisierte Prüfungen bestehen. Sie decken fehlerhaft eingesetzte Rechenlogik (muss sperren), Bildwidersprüche, unklare Mengen, Regelvergleiche, Abbruch bei Spielstart, unveränderte Wiederholungen, Neustart und SQLite-Sicherung ab. Der HTTP-Gesamttest wartet auf zwei nacheinander automatisch erstellte Berichte und bestätigt die Einbindung einer zuvor beantworteten Bildfrage.

## English summary
P6 has an executable first stage: idle-time, restart-safe reports for completed matches and confirmed image changes. Independent arithmetic fixtures, comparisons against player-confirmed images, and structured-rule ablation replays are separate. Reports retain rule/data/engine fingerprints and per-language coverage. Missing evidence remains unclear; no tactical benefit or automatic activation is claimed. Free-text expectation proposals, independent tactical counterexamples and full A6 acceptance remain open. P7/P8 prospective trials and activation proposals are not implemented here.

Produktionsprüfung: Die installierte Fassung besteht auch den isolierten HTTP-Neustarttest. Echte Berichte entstanden automatisch in beiden Sprachen. Für a6ea869f: 26 Entscheidungen ohne vollständige Bild-/Formgrundlage, drei veränderte Regelvergleichs-Tipps; noch keine Spielerbestätigung dieser neuen Schlüsselbilder. Deutsch/Englisch wurden im Browser geprüft.
