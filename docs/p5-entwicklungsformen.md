# P5: Entwicklungsformen und begrenzte Mechaniken

Stand: 10.11.2026. Umsetzung auf Basis von 0.7.6. P3 bleibt ein nicht freigegebener Erkennungspilot. P5 ergänzt ein geprüftes Rechen- und Speichermodell, keine allgemeine visuelle Formenerkennung.

## 1. Dauerhafte, sprachübergreifende Identität

Bestätigte Formbeschreibungen aus den gezielten Bildfragen werden automatisch in SQLite übernommen. Jede Form erhält eine stabile Kennung. Eine Form wird durch ihre Figur und die beschriebene Erscheinung bezeichnet, nicht durch Kartenstufe oder Sterne. Formnummern 0/1/2 werden nicht universell angenommen.

Deutsche und englische Bezeichnungen lassen sich unter **Partien und Auswertung → Entwicklungsformen und Mechaniken → Formbezeichnungen** derselben Kennung zuordnen. Beim Umbenennen bleibt die Kennung bestehen. Identische Übersetzungen werden nicht ohne Bestätigung auf verschiedene Formen verteilt; doppeldeutige Bezeichnungen werden abgewiesen. Fehlt eine Sprachfassung, zeigt die andere Oberfläche den fehlenden Namen und die Kennung. Es wird kein API-Aufruf benötigt.

Eine beschriebene Form ist noch kein Erkennungsmodell. Der Coach ordnet nicht ungefragt einen markierten Typ-Ausschnitt einer von mehreren beschriebenen Formen zu. Kartenwerte verbleiben im Sammlungsprofil; Formmengen stehen getrennt davon im bestätigten Bildbestand.

## 2. Zulässige Operationen

Das Rechenmodell kennt nur Hinzufügen, Aufwerten, Verdoppeln und kombinierte Verdopplung/Aufwertung. Als Geltungsbereich ist ausschließlich die ausdrücklich bestätigte Ausgangsform zulässig. Unbeteiligte Formen bleiben unverändert. Keine frei ausführbaren Formeln, Skripte oder KI-Codeausführung.

| Bestand vor der Wahl | Bestätigter Vorgang | Erwarteter Bestand danach |
|---|---|---|
| 2 Grundformen + 10 entwickelte Figuren | Grundform verdoppeln | 4 + 10 = 14 |
| 2 Grundformen + 10 entwickelte Figuren | Grundform aufwerten | 0 + 12 = 12 |
| 2 Grundformen + 10 entwickelte Figuren | Kombinierte Bedeutung noch unbestätigt | genaue Wirkung bleibt offen |
| 2 Grundformen + 10 entwickelte Figuren | Bestätigt: Ausgangsform verdoppeln und diese aufwerten | 0 + 14 = 14 |

Auch ein einzelnes sichtbares Upgrade wird gegen den gemischten Bestand geprüft. Es bedarf nicht zweier nebeneinander angebotener Varianten. Zwei bekannte Grundformen werden nicht durch einen alten Aktionsgesamtstand von beispielsweise 120 Figuren ersetzt.

Die elementaren Einträge sind Rechenmodelle, keine automatische Bestätigung, dass eine beliebige Spielkarte alle benötigten Voraussetzungen erfüllt. Die Bildzuordnung muss ausdrücklich bestätigt sein. Die kombinierte Aktion startet zusätzlich mit Status unbestätigt. Widersprüchliche Mechanikbelege sperren die genaue Berechnung im jeweiligen Geltungsbereich. Fehlende Formmengen bleiben unbekannt. Eine nicht aufgeführte Zielform wird bei unvollständig zugeordnetem Bestand nicht als leer angenommen.

## 3. Einbindung in die Bewertung

- Ein bestätigter eigener Bildbestand gilt nur für dieselbe Partie und dieselbe Aufnahme. Historische Bestände werden nicht auf neue Spiele übertragen.
- Erst eine bestätigte Zuordnung der Angebotskarte zu Ausgangs-/Zielform und eine passende bestätigte Mechanik erlauben eine genaue erwartete Wirkung. Zuordnungen sind unter dem Zusatzwerkzeug prüf- und speicherbar und wirken danach in der Nachauswertung dieses Bildes.
- Die erwartete Folgewirkung ist kein beobachtetes Ergebnis. Ein gesendeter Klick schreibt den bestätigten Ist-Bestand nicht um.
- Ohne diese Grundlage zeigt die Empfehlung, dass betroffene Form und Anzahl unbekannt sind. Ein Bonus für Verstärkungen bleibt eine begrenzte Heuristik. Die aus Hinzufügungen abgeleitete Zahl darf sie schwach beeinflussen, wird aber nicht als Anzahl der aufgewerteten Figuren ausgegeben.
- Eine gesendete Verdopplung verdoppelt nicht mehr ungeprüft den gesamten aktionsbasierten Bestand. Die Hinzufügungszählung bleibt eine Untergrenze. Die exakte Wirkung gehört in das Formmodell.
- Die laufende Kartenerkennung wartet nicht auf neue Datenbankabfragen. Formabgleich und Prüfwerkzeug arbeiten in Spielpausen; die Formkontexte werden bei Referenz-/Partienachauswertungen zugeladen. Es wird kein ungeprüfter Pilot zur Live-Wahrheit erhoben.

## 4. Bedienung und Nachvollziehbarkeit

Normalerweise genügen Bildfragen. Das zusätzliche Werkzeug ist geschlossen und optional. Es zeigt Formbezeichnungen, bestätigte eigene Bildbestände, die Zuordnung einer angebotenen Karte und die erwartete Veränderung. Mengen können unbekannt bleiben. Einen allgemeinen Mechanikbeleg kann der Benutzer ausdrücklich als unbestätigt, bestätigt oder widersprüchlich speichern; das aktiviert keine Taktikregel.

SQLite-Tabellen: `evolution_forms`, `evolution_mechanisms`, `evolution_inventory`, `evolution_bindings`, `evolution_history`. Bildbestände sind abgeleitete Schnappschüsse aus Spielerbestätigungen. Zurückgezogene Bestätigungen entziehen ihren abgeleiteten Bestand; die Historie bleibt erhalten. Änderungen an Bezeichnungen und Mechanikbelegen haben Versionsprüfungen. Bestehende Taktikregeln und manuelle Prüfstatus werden nicht durch diese Ableitung verändert. Die Tabellen sind Bestandteil der vollständigen SQLite-Sicherung.

## 5. Prüfung

- A5-Rechenfälle inklusive gemischter Formen, unveränderter Gesamtsumme bei Upgrade, Quelle statt Gesamtheit, leerem/unklarem Ausgangsbestand und unbekannter kombinierter Bedeutung.
- Widersprüche, unbekannte Teilbestände, falsche Partie/Aufnahme und doppelte Formkennungen verhindern exakte Aussagen.
- Stabile Kennung nach deutscher Umbenennung und englischer Bezeichnung, Neustart und SQLite-Sicherungswiederherstellung.
- HTTP: Bildbestätigung → Katalog/Bildbestand → Kartenprüfung → Zuordnung speichern → Bezeichnung ändern → Neustart → Daten unverändert vorhanden.
- Browser: DE/EN; 2 + 10 bei Upgrade ergibt 0 + 12, Verdopplung 4 + 10, kombinierte Aktion zunächst offen und erst nach gesonderter ausdrücklicher Bestätigung 0 + 14. Dieser Browserversuch verwendet einen isolierten künstlichen Rechenfall, keine bestätigten Spieldaten.
- Ergebnis: 102 Node-Tests bestanden. Benutzerabnahme und Qualität der automatischen visuellen Formenzuordnung sind damit nicht bewiesen.

## English

P5 introduces durable, language-independent form identities, separate card values and form counts, and bounded source-form-only operations. Doubling two base units alongside ten evolved units yields four plus ten; upgrading only the two base units leaves twelve units. Combined meaning requires additional explicit confirmation. Unknown counts, conflicting evidence and mismatched match/image contexts prevent exact claims. An unlisted target is not assumed empty when part of the inventory is unassigned.

Player confirmations feed a SQLite catalogue and immutable review history. German and English labels share an identity; no API key is required. The optional review tool maps a pictured offer to source/target forms and calculates an expected effect. It never treats a sent tap as a confirmed resulting army. Historical confirmed stock is not carried into a new game. Without verified form mapping, live reinforcement preference remains a limited, explicitly uncertain heuristic. Automatic visual form recognition remains part of the unfinished P3 pilot.


## Ergänzung: vorausgefüllte Bildfragen
Gezielte Fragen übernehmen Figur, vorgeschlagene Anzahl und beschriebene Form direkt in den Entwurf. Keine Bestätigungsbox ist vorausgewählt. Sichtbare Mindestzahlen werden ausdrücklich als Mindestzahl bezeichnet. Vorhandene gespeicherte Antworten bleiben erhalten; offene Seiten können per Button mit Vorschlägen gefüllt werden. Kontroll-/Testbilder können weiterhin ohne Vorschlag beantwortet werden. „Vorschläge einblenden“ wird dauerhaft als unterstützte Prüfung protokolliert; solche Bilder zählen nicht zur unabhängigen Erkennungsabnahme. Vom Entwickler visuell vorbereitete Schlüsselbilder sind ebenfalls unterstützte Fälle, keine Spielerbestätigungen.

Targeted image questions now prefill editable unit, count and appearance proposals without confirming them. Revealing hints on a control/holdout image records an assisted review and excludes it from independent recognition metrics. Saved player answers remain intact.
