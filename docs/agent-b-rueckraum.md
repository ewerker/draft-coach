# Agent B und die eigene Hinterreihe

Eine Spielerbeobachtung wird dauerhaft wirksam, indem sie als **aktive Taktikregel** mit Angebotskarte, Gegner, Gewicht und passender Bedingung gespeichert wird. Eine freie Notiz mit Gewicht 0 ändert keine Empfehlung.

Für Sniper und Schnecke gibt es getrennte Regeln, gemeinsam für Draft und Schlacht und für alle Angebotsaktionen. Gewicht jeweils −20, Status Aktiv. Die Bedingung `enemy_reinforced` verlangt für den angegebenen Gegner eine protokollierte Aufwertung/Verdopplung oder mindestens vier protokollierte Hinzufügungen. Menge wird nicht als Entwicklungsform ausgegeben. Ein einmal erkannter Verstärkungsvorgang bleibt auch nach einer späteren Hinzufügung im Partiegedächtnis erhalten.

Es ist eine starke Abwertung, kein generelles Verbot: Fehlen passende Alternativen, kann eine riskante Karte weiterhin gewählt werden. Eine nicht erkannte Figur gilt nicht als nachgewiesen abwesend. Ein Sieg nach einem manuellen Schnecken-Eingriff bleibt als Gegenbeispiel zu einer pauschalen Sperre erhalten, beweist aber keine alternative Siegchance.

## Nachvollziehbarkeit und Sicherung

- Im Editor **Taktikregeln** nach Agent B suchen. Karte, Bedingung, Gewicht und Status gelten für beide Sprachen; Titel und Begründung haben getrennte DE/EN-Texte.
- Die laufende Bibliothek liegt unter `runtime/taktikregeln.json`. Jede Änderung erzeugt zusätzlich eine unveränderliche Version in SQLite und einen Wissensverlauf. Beides gehört zur vollständigen Sicherung. Ein Neustart entfernt die Regeln nicht.
- Die reproduzierbaren DE/EN-Regelvorlagen stehen in `data/agent-b-backline-rules.json`. Sie werden nicht ungefragt ein zweites Mal in eine vorhandene Bibliothek importiert.
- 95 Node-Tests bestehen, einschließlich API-Speicherung/Neustart und Regelwirkung in Draft und Schlacht.
- Historischer Einzel-Replay: Ohne erkannten Agent B bleibt die Sniper-Verdopplung bevorzugt. Nach Ergänzung der im Bild sichtbaren vier Agent B und Anwendung der Regel wechselt der Tipp auf Spartheus. Dies belegt die Bedingungs- und Bewertungswirkung, nicht den Ausgang eines ungespielten Kampfes.

## English

Store player observations as active, structured tactical rules to affect recommendations. Separate Sniper and Snail rules share one canonical identity across languages, use weight −20, and require positively observed enemy reinforcement. Counts do not establish evolution forms. Rules are durable across restarts and included in full backups. Unknown opponents are not assumed absent. A player-influenced Snail win is a counterexample to a blanket ban, not causal proof. The editable condition and both language templates are provided in the repository.
