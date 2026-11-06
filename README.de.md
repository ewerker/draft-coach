# Draft Coach

[English](README.md)

Draft Coach ist ein lokaler Begleiter für **Draft Showdown**. Er holt Android-Screenshots per ADB, erkennt sichtbare Wahlangebote mit OpenCV und bewertet sie anhand bearbeitbarer Taktikregeln. Du bedienst ihn im Browser. Die Bildverarbeitung läuft auf dem Host-PC.

## Screenshots

Diese Spielansichten nutzt der Coach als Eingabe. In den beiden Sammlungen steht die aktive Aufstellung jeweils oben.

| Einheitensammlung | Deckwahl | Zaubersammlung |
| --- | --- | --- |
| <img src="docs/screenshots/unit-collection.png" width="220" alt="Einheitensammlung mit aktiver Aufstellung in Draft Showdown"> | <img src="docs/screenshots/deck-selection.png" width="220" alt="Drei Figurenangebote bei der Deckwahl in Draft Showdown"> | <img src="docs/screenshots/spell-collection.png" width="220" alt="Zaubersammlung mit aktiver Aufstellung in Draft Showdown"> |

### So markiert der Coach seine Auswertung

Die folgenden Referenzaufnahmen wurden mit der lokalen Erkennung und der originalen Rahmenanzeige des Coachs ausgewertet. Dünne Rahmen markieren erkannte Bereiche. Der kräftige gestrichelte Rahmen zeigt, welche Karte der Coach empfiehlt.

| Gelb gestrichelt · Versuchstipp | Grün gestrichelt · Empfehlung |
| --- | --- |
| <img src="docs/screenshots/coach-detection-1.png" width="300" alt="Coach-Auswertung der Deckwahl mit gelb gestricheltem Rahmen um Merlinor"> | <img src="docs/screenshots/coach-detection-2.png" width="300" alt="Coach-Auswertung der Deckwahl mit grün gestricheltem Rahmen um Kapitän"> |

## Was der Coach kann

| Bereich | Funktionen |
| --- | --- |
| **Aufnahme** | USB-Debugging, geschütztes WLAN-Pairing und WLAN-Einrichtung über USB. Manuelle Aufnahme, Leertaste, Automodus und optionale Sprachbefehle. |
| **Draft und Schlacht** | Erkennt viele Einheiten, Kartenpositionen, Mengen, Aufwertungen, Verdopplungen und sichtbare Kartenwerte. Zeigt das letzte relevante Bild und markiert die Empfehlung. |
| **Bedienung** | Tipps vorlesen, Klicks akustisch melden, das Gerät im Screenshot antippen und auf Wunsch geprüfte Tipps automatisch antippen. |
| **Vorbereitung** | Überlappende Aufnahmen der Einheiten- und Zaubersammlung zusammenführen und aktive Aufstellungen erfassen. Wiederholt sicher gelesene höhere Kartenwerte können Stufe und Sterne in der Sammlung aktualisieren. |
| **Taktik** | Regeln suchen, anlegen, gewichten, testen, ändern und löschen. Die Schnellauskunft beantwortet Fragen zu Kontern und Synergien aus dem lokalen Lexikon. Eine Websuche lässt sich separat öffnen. |
| **Archiv** | Partieergebnisse erfassen. Am Host-PC abgeschlossene Partien mit bis zu fünf vorhandenen Belegbildern je Partie ins SQLite-Archiv übernehmen und eine Sicherung herunterladen. |

## In wenigen Schritten starten

1. **Node.js ab 22.16**, **Python 3.12** und die **Android SDK Platform Tools** installieren. `node` und `adb` müssen auffindbar sein. Alternativ lässt sich der ADB-Pfad in `.env` angeben.
2. Im Projektordner ausführen:

   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
   ```

3. Am Host-PC [http://127.0.0.1:4317/](http://127.0.0.1:4317/) öffnen, oben **Deutsch** oder **English** wählen und über **Handy verbinden** ein Gerät auswählen. Die Probeaufnahme zeigt, ob die Verbindung klappt.
4. Optional `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-desktop.ps1` ausführen. Die beiden Desktop-Verknüpfungen starten und stoppen den Coach. Vorhandene gleichnamige Verknüpfungen zeigen danach auf diesen Projektordner. Speichere ein offenes Partieergebnis vor dem Beenden in der Webseite.

Die Erkennung startet mit der mitgelieferten Kalibrierung. Vollständige Referenzbilder für Galerie und Benchmark lassen sich aus der privaten Sicherung nach `references/` kopieren. Die mitgelieferte Sammlung dient als Beispiel. Über **Vorbereitung** übernimmst du deine eigenen Daten.

## Heimnetz und Datensicherung

- **Host-PC** · [http://127.0.0.1:4317/](http://127.0.0.1:4317/)
- **Anderes Gerät im Heimnetz** · `http://<LAN-IP-des-Host-PCs>:4317/`. Dafür `.env.example` nach `.env` kopieren, `COACH_LAN_ADDRESS` setzen und den Coach neu starten. Die Anmeldung verwendet standardmäßig `coach` und das erzeugte Passwort aus `runtime/lan-passwort.txt`. HTTP mit Basic Auth ist für ein vertrauenswürdiges privates Netz gedacht. **Admin · Archiv** ist am Host-PC erreichbar.

Unter `runtime/` liegen Sammlung, eigene Regeln, Protokolle, Aufnahmen und die SQLite-Datenbank. Sichere diesen Ordner getrennt. Der SQLite-Download enthält die eingebetteten Belegbilder. Der laufende Aufnahmepuffer rotiert. Für einen Umzug beide Instanzen stoppen und die gewünschten Dateien kopieren. Das SQLite-Archiv gehört in `runtime/Draft-Coach.sqlite3`.

## Grenzen und Entwicklung

Die Erkennung hängt von Bildschirmgeometrie, Animationen und Kalibrierung ab. Im Zauberfenster erkennt der Coach derzeit Plätze und sichtbare Stufen. Zaubernamen, ein vollständiger Feldbestand und eine belastbare Kampfstärkeformel sind offen. Die Gewichte sind änderbare Einschätzungen. Prüfe automatische Klicks zuerst auf deinem Gerät. Browser-Spracherkennung kann einen Dienst des Browseranbieters nutzen. Die optionale Websuche übermittelt die Frage beim Öffnen der Suche.

Der Sprachumschalter wählt auch die Spielsprache für die Erkennung. Für englisch beschriftete Karten und Deckfenster gibt es experimentelle lokale Vorlagen. Wenn die Erkennung auf diese Vorlagen zurückgreift, bleibt das automatische Antippen aus. Gespeicherte deutsche Begründungen bleiben im Original verfügbar. Nach einem Sprachwechsel das Mikrofon erneut einschalten, um die neuen Sprachbefehle zu verwenden.

`npm test` startet die Node-Regressionstests. `python vision.py --file <Bild>` prüft eine einzelne Aufnahme. Mit den privaten Referenzen baut `python vision.py --build-calibration` die Vorlagen neu und `python benchmark.py` misst die Erkennung. `node smoke.mjs` benötigt einen laufenden Coach, Referenzbilder und ein ADB-Gerät.

| Datei oder Ordner | Aufgabe |
| --- | --- |
| `public/` | Weboberfläche, Rahmen, Audio, Taktikeditor und Archivverwaltung |
| `server.mjs`, `pipeline.mjs` | HTTP, ADB, Aufnahmesteuerung und Python-Prozess |
| `vision.py`, `data/calibration.npz` | OpenCV-Erkennung und abgeleitete Vorlagen |
| `advice.mjs`, `quick-advice.mjs`, `data/` | Empfehlungen, Schnellauskunft und Startdaten |
| `archive.mjs`, `data/archive-schema.sql` | SQLite-Import, Belegbilder und Sicherung |

Eigenständiges Fanprojekt zu Draft Showdown. Spielnamen und visuelle Elemente gehören ihren jeweiligen Rechteinhabern.

[Versions- und Releaseablauf](RELEASING.md)

## Partie auswerten und den Coach verbessern

Öffne am Host-PC **Partie auswerten** und lade ein Wahlfenster. Neue Partien speichern erkannte Angebote, den damaligen Tipp und den Kontext. Ältere Aufnahmen lassen sich nachträglich auswerten, solange das Bild verfügbar ist. Trage eine Beobachtung ein, prüfe die Regel im Replay und speichere den Prüffall. Mit **Testregel**, **Aktivieren** oder **Zurücknehmen** änderst du den Status. Der gespeicherte Fall sichert das zugehörige Bild, wenn es verfügbar ist. Das SQLite-Backup enthält die Prüffälle und ihre Regelhistorie.

Über **Rote Gegneranzeige korrigieren** lernt der Coach den sichtbaren Text für genau diese Aktion und Spielsprache. Wähle dazu die Figur, Aktion und Anzahl aus. In der Liste lässt sich die Vorlage deaktivieren. Taktikregeln gelten dank gemeinsamer Kartenkennungen auf Deutsch und Englisch.

Optionale GPT-Entwürfe brauchen `OPENAI_API_KEY` und `COACH_REVIEW_MODEL` in der Umgebung des Host-Prozesses. Das gewählte Modell muss Bildeingabe und strukturierte Ausgaben der Responses API unterstützen. Der Schlüssel gehört ausschließlich in die Host-Umgebung. **GPT-Entwurf erstellen** sendet die Daten des ausgewählten Wahlfensters an OpenAI. Der Kartenausschnitt wird nur bei gesetztem Häkchen mitgesendet. Pro Serverstart sind zehn Anfragen möglich. Die API kann Kosten verursachen. Du prüfst den Entwurf und entscheidest über die Aktivierung.

### Standalone-KI für die Schnellauskunft

Setze OPENAI_API_KEY in der Umgebung des Host-Prozesses und starte den Coach neu. Über COACH_QUICK_MODEL kannst du das Standardmodell gpt-5.4-mini ändern. In der Schnellauskunft lässt sich die Antwortquelle wählen. Die Standalone-KI sendet die Frage, passende lokale Taktiktexte und den vorherigen KI-Dialogschritt an OpenAI. Das lokale Lexikon bleibt verfügbar. Im Codex-Ablauf stellst du die Frage direkt im Codex-Chat.
