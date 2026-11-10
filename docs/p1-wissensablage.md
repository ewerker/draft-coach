# P1: Gemeinsame Wissens- und Prüfablage

Punkt 1 des Gesamtplans. Datum: 10. November 2026.

## Bedienung

Am Host-PC **Partien und Auswertung → Wissen und Prüfaufträge** öffnen. Die Liste enthält Taktikregeln, gespeicherte Partie-Prüffälle, Prüfbilder und frühere Archivbeobachtungen. Suche und Filter nach Art, Prüfstand und Bearbeitung gelten über alle Quellen. Je Seite werden höchstens 20 Aufträge angezeigt.

Ein Auftrag gehört zu **Taktik**, **Spielmechanik** oder **Erkennung**. „Als bearbeitet markieren“ verändert nur die Arbeitsliste. Eine fachlich aktive Regel bleibt durch ihre eigentliche Taktikregel bestimmt. Die Arbeitsliste aktiviert keine Regeln und behauptet keine durchgeführten Tests. „Prüfung läuft“ und „Freigabe vorgeschlagen“ sind für spätere Arbeitspakete vorbereitet, können hier aber nicht manuell vorgetäuscht werden.

Unter **Herkunft und Originale** stehen Quellen, zugehörige Partien/Bilder und der Änderungsverlauf. Regel und explizit damit verknüpfter Prüffall erscheinen gemeinsam. Inhaltlich gleiche Regeln mit gleichem Geltungsbereich werden als mögliche Doppelung markiert; sie werden nicht stillschweigend gelöscht oder zusammengelegt. Ältere getrennte Bearbeitungsverläufe bleiben auch bei einer späteren expliziten Verknüpfung nachvollziehbar.

Mit **Beobachtung hinzufügen → Spielmechanik** kann ein allgemeiner Hinweis für alle Karten ohne Einzelkarte und Punktgewicht gespeichert werden. Er ist zunächst gesammelt und wird noch nicht als Berechnungsmechanik ausgeführt: Das gehört zu P5. Eigene Beobachtungen können in beiden Sprachen unter derselben Kennung bearbeitet werden. Fehlender Text wird kenntlich gemacht; Änderungen einer bestehenden Fassung markieren die andere zur Nachprüfung. Das Ergänzen einer bisher fehlenden Fassung markiert das Original nicht unnötig als veraltet.

## Speicherung und Migration

Die SQLite-Tabellen `knowledge_items`, `knowledge_sources` und `knowledge_history` ergänzen das Archiv. Die Migration ist wiederholbar und transaktional. Bestehende Tabellen und Quelldateien werden weder ersetzt noch gelöscht. Die alten Programme können ihre bisherigen Tabellen weiterhin lesen. Regeln, Fälle, Referenzmetadaten und Archivnotizen werden mit unveränderten Quellkennungen importiert. DE/EN erzeugt keine zweite fachliche Identität.

Quellenstände werden bei Änderungen versioniert. Eine entfernte Quelle wird als nicht mehr verfügbar markiert, ihre letzte Fassung und frühere Änderungsbelege bleiben erhalten. Ein Fall kann als erledigt gelten, während sein Hinweis weiter auf Belege wartet. Die Zustände sind absichtlich unabhängig.

Der Abgleich läuft beim Start, beim Öffnen/Aktualisieren der Liste sowie nach Regeländerungen und Bearbeitung der bestehenden Quellen. Automatisch im Spiel erfasste neue Prüfbilder werden spätestens beim nächsten Abgleich übernommen. Es findet keine zusätzliche Truppenerkennung im Aufnahmeweg statt. API-Schlüssel werden für diese Zusammenführung nicht benötigt.

Die vorhandene **SQLite-Sicherung** enthält auch die neuen Tabellen, ihre Quellenstände, eigenen Beobachtungen und Verläufe. Die weiterhin extern liegenden Originaldateien der Taktikbibliothek und Referenzbilder gehören noch nicht vollständig zur SQLite-Sicherung; deren vollständige gemeinsame Sicherung ist P2. Es wird kein API-Key in die Wissensablage kopiert.

## Prüfung A1

Die ursprünglichen deutschen Archivbeobachtungen entstanden vor der Sprachtrennung. Sie werden mit gekennzeichneter Legacy-Herkunft als Deutsch übernommen; eine fehlende englische Fassung bleibt sichtbar. Die Arbeitsliste wird vor der potenziell langsameren Partienliste geladen.

- Sieben neue automatisierte Prüfungen: Zusammenführung aller vier Quellarten, wiederholbarer Import, gemeinsame Sprachidentität, getrennte Arbeits-/Regelzustände, allgemeine Mechanik ohne Karte/Gewicht, Historie bei entfernten Quellen, nachträgliche Verknüpfung, Doppelungshinweise, Schutz vor überschreibenden alten Änderungen sowie Migration/Neustart/SQLite-Sicherung.
- Gesamter Node-Testlauf: **71 bestanden, 0 fehlgeschlagen**. Es wurde keine neue Bilderkennung in den Live-Aufnahmeweg eingebaut.
- Browserprüfung in einer getrennten Instanz ohne Gerätezugriff: Beobachtung anlegen, als bearbeitet markieren, englische Fassung unter derselben Kennung ergänzen und nach Serverneustart wiederfinden. Suche, Filter und schmale Darstellung geprüft.
- Probe mit echten Metadaten in einer separaten temporären Datenbank: 146 Regeln, 0 gespeicherte Partie-Prüffälle, 4 Prüfbilder und 13 Archivbeobachtungen ergeben 163 Aufträge. Alle 163 Quellen erhalten, erneuter Import unverändert, Original-Regeldatei unverändert. Keine Spielbilder oder persönlichen Partiekennungen wurden in dieses Dokument übernommen.

Grenze der Abnahme: P1 schafft Ordnung und Nachvollziehbarkeit. Automatische Tests nach jeder Partie, Truppenzählung, Wirksamkeitsversuche und Freigabeempfehlungen sind damit noch nicht umgesetzt. Sie gehören zu P2–P9.

## English summary

On the host PC, open **Matches and review → Knowledge and review tasks**. Tactical rules, match cases, review images and archived findings share a provenance-aware work queue. Work completion never activates a rule. General mechanics need no specific card or point weight. German and English share task identity, status and evidence; missing text is shown rather than silently mixing languages. Original source stores remain authoritative, snapshots and revisions are retained, and the existing SQLite backup includes the new tables. Automatic match checks, quantified army recognition and activation proposals remain subsequent work packages.
