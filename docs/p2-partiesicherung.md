# P2: Dauerhafte Partien, Aufträge und vollständige Sicherung

Stand: 10. November 2026. Arbeitspaket P2 aus dem Gesamtplan. Keine Änderung der taktischen Gewichtung und keine neue Bilderkennung.

## Was im Coach sichtbar wird

**Partien und Auswertung → Partiesicherung und Hintergrundaufträge** zeigt wartende, laufende, abgeschlossene und fehlgeschlagene Aufträge. Der Zuklappzustand wird gespeichert. Neue abgeschlossene Partien erzeugen automatisch zwei Aufträge:

1. Belegbilder übernehmen und mit der Partie verknüpfen.
2. Datenvollständigkeit prüfen: gespeicherte Entscheidungen, unklare Angebote, Versionsbezüge, Klickfehler und beobachtete Bildwechsel.

Diese Prüfung ist kein Taktiktest und kein Wirksamkeitsnachweis. Sie aktiviert keine Regeln. P6–P8 bauen später darauf auf. Bestehende bereits archivierte Altpartien bekommen nicht nachträglich erfundene Aufträge. Früher gespeicherte, noch nicht archivierte Journalpartien werden beim Start übernommen.

Die Aufträge warten während Aufnahme, aktivem Spiel und anderen laufenden Schreibvorgängen. Dadurch konkurriert keine neue Bilderkennung mit der Live-Erkennung. Bei einem Fehler gibt es höchstens drei automatische Versuche mit Wartezeit. Danach bleibt der Fehler sichtbar und kann mit **Erneut versuchen** nachgeholt werden. Ein durch Spielbeginn unterbrochener Auftrag verbraucht keinen Fehlversuch. Ein beim Programmende laufender Auftrag wird nach dem Neustart wieder angeboten. Prüfberichte bleiben versioniert in SQLite erhalten.

## Laufende und unterbrochene Partien

Die Partie erhält ihre Kennung und einen Datenbankeintrag vor der ersten Spielaufnahme. Weitere Zwischenstände werden mit höchstens etwa einer Sekunde Verzögerung geschrieben. Sie enthalten auch Maps/Sets der bisherigen eigenen und gegnerischen Beobachtungen. Beim geordneten Desktop-Stopp wird der letzte Stand zusätzlich gesichert. Ein harter Prozessabbruch kann das letzte, noch nicht geschriebene Intervall verlieren; davor gesicherte Daten bleiben erhalten.

Nach einem Neustart erscheint die offene Partie mit ihrer ursprünglichen Kennung. Der Benutzer wählt:

- **Dieselbe Partie fortsetzen**, wenn sie auf dem Gerät tatsächlich noch läuft.
- **Mit unbekanntem Ergebnis abschließen**, wenn das Ergebnis nicht mehr feststeht.
- **Als abgebrochen abschließen**.

Der Coach setzt weder Aufnahme noch automatische Klicks selbstständig fort. Ausstehende alte Klickannahmen werden beim Wiederaufnehmen verworfen; ihre bereits geschriebenen Klickbelege bleiben erhalten. Geräte- und Moduswechsel sichern den vorherigen Stand. Eine neue Partie beginnt erst, nachdem der alte offene Stand bewusst behandelt wurde. „Ohne Angabe“ im Ergebnisdialog speichert ein unbekanntes Ergebnis statt den Stand zu verlieren.

Unbekannte Ergebnisse und unvollständige Partien erhöhen weder Siege noch Niederlagen; sie verändern den bestehenden Niederlagenzähler nicht. Ein Ergebnis wird mit den beiden Aufträgen atomar und genau einmal geschrieben. Wiederholtes Speichern desselben Ergebnisses erzeugt keine zweite Partie. Ein abweichendes zweites Ergebnis wird zurückgewiesen.

## Was zu einer Entscheidung erhalten bleibt

- Zeitpunkt, Bildkennung, Spielsprache, Modus und Bildgeometrie.
- Sichtbare Wahlangebote und rohe Erkennung getrennt vom damals angenommenen eigenen/gegnerischen Bestand.
- Empfehlung und Bewertung, Referenzen auf unveränderliche Regel- und Sammlungsstände.
- Programm-/Buildstand und Hashes von Bewertungslogik, Grunddaten und Erkennung.
- Gesendete oder fehlgeschlagene Klicks, einschließlich manueller Klicks über den Browser.
- Ein später beobachteter Bildschirmwechsel als eigene Evidenz.

**Gesendet ist nicht bestätigt.** Ein Bildwechsel beweist nicht, welche Karte tatsächlich gewählt wurde. Die unmittelbar am Telefon getroffene Wahl und eine eventuell andere eigene Truppenaufstellung bleiben ausdrücklich unbestätigt, bis die spätere Truppenerkennung dafür Belege liefert. P3 und P4 schließen diese Lücke. Die bisherigen Bestandsannahmen sind weiterhin als Annahmen erkennbar; sie werden hier nicht stillschweigend zu gemessenen Mengen erklärt.

## Bildbestand und Grenzen

Neu automatisch gesicherte Bilder werden anhand SHA-256 dedupliziert. Verschiedene Aufnahmen können dasselbe Binärbild teilen. Die Auswahl bevorzugt Anfang, Ergebnis und über die Partie verteilte relevante Situationen.

- Höchstens **80 Belegaufnahmen und 64 MiB unterschiedlicher Bilder je Partie**.
- Höchstens **2 GiB neu angelegte automatische Bilddaten** insgesamt. Bei Erreichen des Limits werden weitere Bilder ausgelassen; Metadaten und Ergebnisse bleiben erhalten. Die Übersicht zeigt den belegten Speicher und die Grenzen.
- Der rohe Aufnahmeordner wird höchstens alle 30 Sekunden auf 900 Bilder und etwa 1 GiB begrenzt. Ausgewählte Bilder eines noch offenen Spiels sind zusätzlich geschützt; dieser Schutz kann die Grenze zeitweise überschreiten.
- Bestätigte Prüfbilder, vorbereitete Sammlungsbilder und bereits vorhandene Archivbelege werden nicht automatisch gelöscht. Deren alter Speicher wird nicht rückwirkend als freigegebene Löschmenge behandelt.

Aktuelle Archivierungsaufträge lesen gezielt die betroffene Partie und deren SQL-Klickbelege. Sie müssen dafür nicht alle vollständigen Partie- und Klickjournale erneut verarbeiten. Neue Journalzeilen enthalten eine kurze Abschlusszusammenfassung; vollständige Entscheidungen liegen in SQLite.

## Sicherung und Wiederherstellung

Die bisherige **SQLite-Sicherung** bleibt verfügbar. Zusätzlich gibt es unter **Archivverwaltung und API-Key → Vollständige Sicherung herunterladen** ein ZIP mit:

- konsistentem SQLite-Snapshot einschließlich Partien, Binärbildern, Prüffällen, Wissen, Versionen, Aufträgen und Berichten;
- Taktikbibliothek, Sammlung, gespeicherten Referenzbildern samt Korrekturen, Vorbereitung, Einstellungen zur Verlustabschaltung und ausgewählten Journalen;
- Dateiliste mit Größen und SHA-256-Prüfsummen.

API-Key, WLAN-Passwort, `.env`, beliebige Zusatzdateien und der unbeschränkte rohe Aufnahmebestand werden nicht übernommen. Während der vollständigen Sicherung sind schreibende Aktionen gesperrt. Dafür zuerst Spiel und Aufnahme stoppen. Die Sicherung braucht freien Platz für Datenbanksnapshot und ZIP und verwendet ZIP64 für große Archive. PNGs werden nicht erneut aufwendig komprimiert.

Wiederherstellung mit der vorhandenen Python-Installation in ein **neues**, noch nicht bestehendes Verzeichnis:

```text
python backup-files.py restore Draft-Coach-Backup.zip Wiederhergestellt
```

Das Skript prüft Manifest, Dateipfade und Prüfsummen. Es überschreibt keine vorhandene Installation. Das Ergebnis enthält `Draft-Coach.sqlite3` und `runtime/`. Für eine neue Standardinstallation: Coach stoppen, die wiederhergestellten Runtime-Dateien nach `runtime/` übernehmen und die Datenbank als `runtime/Draft-Coach.sqlite3` ablegen. Die bestehende lokale Installation dieses Projekts verwendet stattdessen `outputs/Draft-Coach-Archiv/Draft-Coach.sqlite3`. Schlüssel werden anschließend wieder im Coach hinterlegt. Programmdateien selbst stammen weiterhin aus GitHub.

Die Schemaerweiterung ist additiv; bestehende Partie-/Bilddaten werden nicht umgeschrieben. Neu deduplizierte Bilder benötigen den P2-fähigen Bildleser. Ein alter Programmstand kann diese neuen Belegbilder nicht vollständig darstellen. Für einen vollständigen Rollback den dazugehörigen Datenbanksnapshot verwenden.

## Abnahme A2 und Nachweise

Automatisierte Prüfungen umfassen Prozessneustart mit derselben Partiekennung, typisierte Bestände, unbekanntes Ergebnis, genau einmal gespeichertes Ergebnis plus Aufträge, späte Zwischenstände, unterbrochene und fehlgeschlagene Aufträge, Wiederholungslimit, ausdrückliche Wiederholung, Klick-/Bildwechselevidenz, Deduplizierung, Speichergrenzen, unveränderliche Versionen und Backup/Wiederherstellung ohne Schlüssel.

Ein zusätzlicher HTTP-Test startet einen isolierten Coach mit simuliertem ADB und einer kleinen Test-Erkennung. Er nimmt auf, stoppt und startet den Server, setzt dieselbe Partie fort, speichert genau einen Sieg, wartet auf beide Hintergrundberichte und prüft einen zweiten Neustart mit unbekannt abgeschlossenem Ergebnis. Dabei wird kein echtes Gerät angesprochen. Die Gewinnstatistik bleibt trotz wiederholtem Ergebnis und unbekannter zweiter Partie bei einem Sieg.

Die bisherigen Programmtests bleiben Bestandteil der Prüfung. Der Status im Gesamtplan wird erst nach bestandenen Prüfungen auf „geprüft“ gesetzt; die Benutzerabnahme bleibt getrennt.

Prüfstand dieses Ausbaus: **82 automatisierte Tests bestanden, 0 fehlgeschlagen**, einschließlich des HTTP-Neustarttests und der ZIP-Wiederherstellung. Ein separater Schreibtest mit einem vorhandenen Partie-Metadatensatz (33 Entscheidungsbilder, rund 233 kB Zwischenstand) ergab bei 20 Schreibvorgängen einen Median von 7,36 ms, einen 95-%-Wert von 8,16 ms und maximal 8,24 ms auf dem verwendeten Rechner. Diese Messung gilt für diesen Datensatz und diese Maschine, nicht als allgemeine Laufzeitgarantie.

## English summary

Matches are checkpointed and recoverable without inventing outcomes or replaying old taps. Explicit recovery never automatically starts capture. Completed results and two persistent background jobs are committed once. Jobs pause during play, retry at most three times and retain their reports. The initial report checks data completeness, not tactical effectiveness. Decisions preserve language-neutral version references; German and English share one history. New automatic evidence images are deduplicated and budgeted; existing and confirmed evidence is preserved. A full ZIP backup includes SQLite and the required runtime data while excluding credentials. The restore helper validates paths and checksums and requires a new directory.
