# P3 – Eigene und gegnerische Truppen: technischer Pilot

Stand: 10. November 2026. **P3 ist in Arbeit, nicht abgenommen.** P1/P2 und die bestehenden Spielentscheidungen bleiben erhalten. Die Bearbeitungsmarkierungen und Kategorien der Wissensliste werden nicht verändert.

## 1. Umgesetzt

- Ein zusätzlicher lokaler Prozess untersucht beide Spielfeldseiten. Der Hauptprozess wartet weder bei der Empfehlung noch beim automatischen Antippen auf diese Untersuchung. Es gibt höchstens einen laufenden und einen ersetzbaren wartenden Analyseauftrag.
- Ein Fehler oder eine Zeitüberschreitung beendet nur die zusätzliche Untersuchung. Unter Vorbereitung → Lernfortschritt → Prüfung anstoßen lässt sie sich wieder freigeben; der nächste passende Spielausschnitt startet sie erneut. Die Kartenerkennung läuft weiter.
- Der Pilot vergleicht die bisherigen Grauwertvorlagen mit einem neuen **Prototypen-Klassifikator im ONNX-Format mit lokalen Vorlagen als Bereichsvorschlägen**. Dies ist ausdrücklich kein allgemein vortrainiertes neuronales Objekterkennungsmodell. Ohne optionale ONNX-Pakete führt NumPy dieselbe Klassifikation aus.
- Beide Verfahren arbeiten lokal auf der CPU. ONNX Runtime und OpenCV verwenden für die zusätzliche Beobachtung jeweils einen Thread; der Prozess erhält, soweit unterstützt, eine niedrigere Priorität. Begrenzungen: 80 Prototypen, 200 Vorschläge je Seite, 350 ms Suchbudget je Seite, 2,2 s Auftragsfrist. Ein Zeitbudget macht ein Ergebnis unvollständig, nicht zu einem leeren Spielfeld. Modellaufbau und Einlesen können zusätzlich Zeit beanspruchen; die harte Frist schützt den Ablauf.
- Die vorhandene Bildschirmgeometrie wird auf 1080 × 2340 normalisiert. Während Wahlfenstern liegen die Suchbereiche außerhalb der Kartenillustrationen. Überlappende Vorschläge werden unterdrückt, mehrdeutige Typen zurückgehalten.
- Ausgabe je Seite: Typkandidaten, geschätztes sichtbares Minimum, unbekannte Obergrenze, einzeln beschriftete Entwicklungsformen, unbekannte Formen und getrennte Sicherheitsangaben. Stufe und Sterne werden aus den bekannten Kartenwerten ergänzt, nicht aus einer erfundenen universellen Stärkeformel.
- Das Schlacht-Gegnerdeck erhöht die Anforderungen an überraschende Typen außerhalb des Decks, erzwingt aber keine Zuordnung. Im Draft wird das eigene Deck nicht als Gegnerpool verwendet.
- Räumliche Zuordnung und Wiedererkennung über zeitlich nahe Bilder liefern temporäre Spuren. Eine Spur ist kein unabhängiger Qualitätsnachweis. Während des Kampfes heißt oben/unten nicht automatisch Gegner/eigen; diese Positionen ersetzen niemals die letzte vor dem Kampf beobachtete Aufstellung.
- Abweichungen zwischen sichtbaren Kandidaten und aus protokollierten eigenen Aktionen abgeleitetem Bestand werden angezeigt. Daraus wird weder die tatsächlich angeklickte Karte noch eine sichere Gesamtanzahl erfunden.
- Beobachtungen haben Bild-, Partie-, Geräte-, Modell- und Zeitbezug. Zu alte Ergebnisse, Ergebnisse einer anderen Partie oder eines anderen Geräts und rückwärts eintreffende Ergebnisse werden verworfen. Die Truppenbeobachtung löst keine Klicks aus.
- Speicherung in den dauerhaften Partiedaten und Wahlfenstern, einschließlich unbekannter Angaben. Der laufende Verlauf ist auf 60 Beobachtungen begrenzt. Pro gespeicherter Seite werden bis zu 40 Objektbereiche und acht mehrdeutige Bereiche erhalten; eine Kürzung ist ausdrücklich markiert. Zusammenfassende Mengen bleiben separat erhalten.
- Zweisprachige Ansicht „Truppenbeobachtung · Pilot“ im Spiel und Messbericht unter Vorbereitung → Lernfortschritt. Der vollständige Bericht liegt in `runtime/feld-lernstand.json` und wird mitgesichert.

## 2. Was die erste Messung zeigt

Zum ersten Messzeitpunkt waren sieben Prüfbilder vorhanden: sechs aus zugeordneten Partien und ein Bild ohne Partienzuordnung. Vier der Lernpartien lieferten 24 beschriftete Objektbeispiele. Ein zurückgehaltenes Spiel lieferte je eine vollständig bestätigte eigene und gegnerische Seite. Keine Entwicklungsform war beschriftet. Während der Entwicklung hinzugekommene unbeschriftete Bilder erhöhen diese geprüfte Abdeckung nicht.

| Verfahren | Eigene Typen richtig / falsch / übersehen | Gegnerische Typen richtig / falsch / übersehen | Laufzeit eigene / Gegnerseite |
|---|---:|---:|---:|
| Bisherige Vorlagen | 0 / 0 / 3 | 0 / 0 / 3 | 468 / 612 ms |
| Neuer ONNX-Kandidat | 0 / 0 / 3 | 0 / 0 / 3 | 48 / 56 ms |

Das sind **jeweils einzelne Bildseiten**, keine belastbare P95-Messung einer Bildpopulation. Die Oberfläche zeigt den berechneten Perzentilwert zusammen mit der Fallzahl. Ein schnelleres Verfahren ist hier noch keine bessere Erkennung. Die fehlenden Typen der eigenen Testseite waren Maulwurf, Merlinor und Splime; auf der Gegnerseite Königlop, Schnecke und Sixshoot. Der mittlere Zählfehler auf den drei beschrifteten Gegnertypen betrug bei beiden Verfahren 10,7 Figuren; eigene Zählwerte waren auf dieser Testseite nicht angegeben.

Ein technischer Selbstvergleich auf einem Lernbild zeigte bei zwei aufeinanderfolgenden Anfragen etwa 845 ms einschließlich Modellaufbau und 137 ms mit bereits aufgebautem Modell. Mit Prozessstart betrug die erste Antwort rund 1,17 s. Treffer auf dem eigenen Lernbild belegen nur die Verarbeitung des Beispiels, keine Generalisierung.

Ganze Partien bleiben stabil getrennt. Bilddateien mit identischem SHA-256 werden zusätzlich aus den Lernbeispielen ausgeschlossen, wenn dieselben Bildbytes in einem Testfall liegen. Bilder ohne Partienzuordnung dienen nicht als unabhängiger Nachweis. Die Schwellen wurden nicht anhand der Testantworten optimiert. Da dieser kleine Testbestand bereits während der Entwicklung betrachtet wurde, müssen vor Freigabe **neue, unangetastete Bestätigungspartien** hinzukommen.

## 3. Prüfungen

- Node: 89 Tests im gesamten Projekt, einschließlich HTTP-Neustart/Wiederaufnahme, asynchroner Beobachtung und ihrer dauerhaften Speicherung. Zusätzlich: Begrenzung der Warteschlange, isolierte Zeitüberschreitung, alte/fremde Bilder, räumliche Spuren, eigene Eingriffe, Trennung der Kampfpositionen von der Aufstellung und begrenzte Metadaten.
- Python: 22 Tests bestanden, einschließlich NumPy/ONNX-Vergleich, getrennten Spielfeldseiten, fehlenden Ausbauangaben, leeren Bereichen und Ausschluss der Kartenillustrationen. Die bestehenden Deck-, Navigations- und Ergebnisprüfungen bestehen.
- DE/EN-Anzeige in einer getrennten Installation mit vorhandenen Bildern und simulierter ADB-Verbindung kontrolliert; kein Telefon wurde dafür bedient. Erkennungsvergleich und fehlende Abdeckung sind sichtbar.
- Keine API-Aufrufe, keine bezahlte Modellbeschaffung und keine taktische Aktivierung.

## 4. Offen vor Abnahme A3

1. **Typenqualität:** 95 % Präzision und 90 % Trefferquote auf neuen, getrennt bestätigten Partien sind nicht erreicht. Auch schwache Einzeltypen und Sprache/Geometrie müssen ausreichend belegt sein. Die aktuellen wenigen Bilder rechtfertigen keine Freigabe.
2. **Anzahl und Ausbau:** Mindestzahlen sind Kandidaten, keine gesicherte Bestandszählung. Für Mengenintervalle und Entwicklungsformen fehlen hinreichende Beschriftung und unabhängige Fehlergrenzen. Eine nicht beschriftete Form bleibt unbekannt.
3. **Eigene Eingriffe:** Konflikte werden nun beobachtet und gespeichert. Der tatsächliche eigene Bestand kann erst aus ausreichend sicherer vollständiger Aufstellung übernommen werden. Bis dahin beeinflussen die Kandidaten keine Mengenberechnung.
4. **Laufzeit:** Die Einzelmessung reicht nicht für das A3-Ziel „95 % unter einer Sekunde“. Kaltstart, dichte Formationen, verschiedene Geometrien und Parallelbetrieb müssen auf mehr Fällen gemessen werden.
5. **Detektor:** Der aktuelle Kandidat generalisiert im kleinen Test nicht ausreichend. Als nächster Schritt sind gezielte zusätzliche Beschriftungen und gegebenenfalls ein lokal trainierter neuronaler Sprite-Detektor zu vergleichen. Eine große Download- oder Trainingsausgabe ist damit nicht autorisiert oder erforderlich beschlossen.

Der nächste gemeinsame Pilot mit P4 sollte besonders ausgebaute Agent B, normale und entwickelte Schnecken, Maulwurf, Merlinor, Sixshoot, Königlop und Splime sowie dichte Formationen und weitere Geometrien enthalten. Zahlen und Formen dürfen getrennt unbekannt bleiben. Eine „bearbeitet“-Markierung der Wissensliste ersetzt keine Bildbeschriftung und wird nicht als solche gezählt.

## 5. Konkretes Gegenbeispiel aus einer neuen Partie

In einer während der Entwicklung gespielten verlorenen Draft-Partie fehlte Agent B vollständig im damaligen Gegnerzustand. Er enthielt nur Verwüster, Splime und Drakling. Dadurch konnte die vorhandene Schnecken-Abwertung gegen entwickelte Agent B nicht greifen. Bei einem dokumentierten Angebot lag Schnecke bei 94,8 Punkten, Sniper und Agent B jeweils bei 84. Später erhielt Schnecke ×2 112,8 gegenüber 111 für Spartheus UP!. Der Spieler meldete ausgebaute gegnerische Agent B; die Originalbilder werden als Erkennungsgegenbeispiele erhalten. Daraus wird kein hypothetischer anderer Sieg abgeleitet und keine Regel allein aufgrund dieses Verlusts aktiviert.

## 6. Betrieb und Wiederherstellung

`python -m pip install -r requirements-army.txt` installiert die optionalen CPU-Abhängigkeiten. Die bestehende Kartenerkennung braucht sie nicht. Der Pilot erzeugt seine Modellgewichte aus gespeicherten Spieler-Markierungen, ohne Daten ins Internet zu schicken. Programmversion, Modellcode und Beschriftungsstand bestimmen den Modellstand. Zum Rückbau auf die vorherige Software die zugehörige Programmsicherung verwenden; die bisherigen Datenbanktabellen und Wissens-Bearbeitungsstände bleiben erhalten.

Offizielle technische Grundlagen: [ONNX Runtime Python](https://onnxruntime.ai/docs/get-started/with-python.html), [ONNX-Operatoren](https://onnx.ai/onnx/operators/).

## Nachprüfung vom 11. November 2026

Der Pilot vergleicht zusätzlich den Körperausschnitt mit Vorlagen derselben Spielfeldseite und mehreren Bildgrößen. Das hilft bei veränderten oder verdeckten Köpfen. Ein solcher Treffer gibt einen Hinweis auf den Typ und ein sichtbares Exemplar. Die Entwicklungsform bleibt offen. Der Test mit verdecktem Kopf deckt diesen Fall ab.

Auf 15 Spielerbildern aus fünf Partien stiegen die Typentreffer bei einem Suchbudget von 350 ms je Seite von 7 auf 26 der 65 bestätigten Typvorkommen. Jeweils die gesamte Testpartie wurde aus den Vorlagen ausgeschlossen. Keine zusätzlichen Typen auf vollständig beschrifteten Seiten. Königlop erschien auf einem der drei Bilder der verlorenen Schlacht. Bei einem separaten Lauf mit 700 ms je Seite waren es 29 Treffer, darunter auch Schnecke. Die Bilder wurden während der Entwicklung betrachtet. 25 von 30 Seiten wurden beim 350-ms-Lauf wegen des Zeitlimits oder der Vorschlaggrenze als unvollständig markiert. Der Nachweis für A3 steht weiterhin aus.

## English summary

P3 now has a bounded asynchronous CPU observation pipeline, a local ONNX prototype-classifier candidate with NumPy fallback, separate army/position histories, uncertain visible counts and evolution labels, immutable frame/match provenance, and a bilingual diagnostic report. It does not use an API key. Pilot estimates do not drive recommendations or taps. The first match-held-out diagnostic failed the type-quality targets for both methods; counting and evolution are not validated. Cold start and long-tail latency need more measurements. P3 remains in progress until fresh match-level verification with representative player labels meets A3. Existing rule-review marks and deliberate open cases are preserved.
