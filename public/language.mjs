// Canonical keys stay unchanged in profiles, rules and recognition results.
export const EN_CARD_NAMES=Object.freeze({
  Spinne:'Matriarch','Agent B':'Agent B',Zerstörer:'Waster',Merlinor:'Merlinor',Ritter:'Knight',
  Kupid:'Cupid',Gans:'Goose',TNT:'TNT',Schnecke:'Snail',Assassine:'Assassin',Splime:'Splime',
  Königlop:'Kingclops',Ingenieur:'Engineer',Maulwurf:'Mole',Bienenkorb:'Beetank',
  Schildling:'Shellbro',Parasit:'Parasite',Sniper:'Sniper',Blutrebe:'Bloodvine',
  Spartheus:'Spartheus',Sixshoot:'Sixshoot',Totem:'Totem',Boomling:'Boomling',
  Obergeist:'Overmind',Drakling:'Whelp',Kapitän:'Captain',Astra:'Astra',
  Steinhaut:'Stone Skin','¡ZAS!':'ZAP!',Grabesbogenschützen:'Grave Archers',
  'Wilder Überfall':'Savage Raid',Säureexplosion:'Acid Burst',Feensegen:'Fairy Blessing',
  Pfeilsturm:'Storm of Arrows','Wachs-Experiment':'Growing Experiment',Volltreffer:'Blast Out',
  Minenfeld:'Minefield',Meuchelbrigade:'Backstab Brigade',Wächtertürme:'Sentinel Towers',
  Meteorschauer:'Meteor Shower',Schildkrötenplan:'Turtle Strategy',
  'Upgrade-Roulette':'Upgrade Roulette',Grabesruf:'Grave Recall'
});
const cards=Object.entries({...EN_CARD_NAMES,Verwüster:'Waster',Bientank:'Beetank'})
  .sort(([a],[b])=>b.length-a.length);
const escapeRegExp=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const cardPattern=new RegExp('(?<![\\p{L}\\p{N}])(?:'+cards.map(([key])=>escapeRegExp(key)).join('|')+')(?![\\p{L}\\p{N}])','gu');
const englishCards=new Map(cards);
export function displayNames(text,language){
  if(typeof text!=='string')return text;
  if(language==='en')return text.replace(cardPattern,name=>englishCards.get(name));
  return text.replaceAll('Zerstörer','Verwüster');
}

const ui=new Map(`
Deck und Zauber vorschlagen|Suggest a deck and spells
Der Vorschlag nutzt deine gespeicherte Sammlung. Du kannst ihn im Spiel von Hand übernehmen.|The suggestion uses your saved collection. You can apply it manually in the game.
Vorschlag anzeigen|Show suggestion
Empfohlene Einheiten|Suggested units
Empfohlene Zauber|Suggested spells
Keine Karten gespeichert.|No saved cards.
Vorschlag konnte nicht geladen werden.|Could not load the suggestion.
Frontlinie|Front line
Zugriff auf die Hinterreihe|Backline access
Schutz oder Verstärkung|Protection or reinforcement
Druck auf die Hinterreihe|Backline pressure
Kartenstärke|Card strength
Rote Gegneranzeige korrigieren|Correct red enemy banner
Gegnerfigur|Enemy unit
Anzahl|Quantity
Erkennungsvorlage speichern|Save recognition template
Erkennungsvorlage gespeichert.|Recognition template saved.
Vorlage deaktivieren|Disable template
Vorlage aktivieren|Enable template
Kartenausschnitt an OpenAI senden|Send card crop to OpenAI
GPT-Entwurf erstellen|Generate GPT draft
GPT erstellt einen Entwurf …|GPT is preparing a draft…
Entwurf geladen. Prüfe ihn vor dem Speichern.|Draft loaded. Review it before saving.
Meine bevorzugte Wahl|My preferred choice
Partie auswerten|Review match
Wähle ein Wahlfenster und vergleiche den damaligen Tipp mit einer neuen Regel.|Choose a decision and compare the original tip with a new rule.
Partie|Match
Sprache älterer Bilder|Language of older captures
Bild und Auswertung laden|Load image and review
Aufnahme aus der Partie|Match capture
Beobachtung und Taktikregel|Observation and tactical rule
Beobachtung|Observation
Regeltitel|Rule title
Regel im Replay prüfen|Preview rule in replay
Prüffall speichern|Save review case
Gespeicherte Prüffälle|Saved review cases
Weitere Aufnahmen|Other captures
Angebote|Offers
Damals empfohlen|Original recommendation
Klickprotokoll|Tap log
Replay bisher|Baseline replay
Replay mit Regel|Replay with proposed rule
Prüffall gespeichert.|Review case saved.
Testregel|Test rule
Aktivieren|Activate
Zurücknehmen|Roll back
Wähle zuerst ein Wahlfenster.|Select a decision first.
Erkenntnis bearbeiten|Edit rule
Neue Erkenntnis|New rule
Keine passenden Regeln.|No matching rules.
Regel gelöscht.|Rule deleted.
Gespeichert.|Saved.
Taktikregeln konnten nicht geladen werden.|Could not load tactical rules.
Prüfe die Angaben. Eine Testregel oder aktive Regel braucht eine Angebotskarte und ein Gewicht ungleich null.|Check the fields. A test or active rule requires an offered card and a nonzero weight.
Textsprache|Text language
Für diese Sprache fehlt der Regeltext.|Rule text is missing in this language.
Übersetzung prüfen.|Translation needs review.
Titel und Begründung gelten für die gewählte Textsprache.|Title and explanation apply to the selected text language.
OpenAI-API-Key|OpenAI API key
Schlüssel speichern|Save key
Gespeicherten Schlüssel entfernen|Remove saved key
API-Key einrichten|Set up API key
Der Coach verwendet den Schlüssel für KI-Schnellauskunft und automatische Regelübersetzung. Er wird auf diesem PC gespeichert.|The coach uses the key for AI Quick Advice and automatic rule translation. It is stored on this PC.
KI ist eingerichtet. Der Schlüssel wird beim nächsten KI-Aufruf geprüft.|AI is configured. The key will be checked on the next AI request.
Kein OpenAI-API-Key eingerichtet.|No OpenAI API key configured.
KI-Einstellungen konnten nicht geladen werden.|Could not load AI settings.
Regel gespeichert. Automatische Übersetzung fehlgeschlagen.|Rule saved. Automatic translation failed.
Regel und automatische Übersetzung gespeichert.|Rule and automatic translation saved.
Automatisch übersetzt.|Machine translated.
Antwortquelle|Answer source
Standalone-KI|Standalone AI
Für die Standalone-KI braucht der Coach einen OpenAI-API-Key auf dem Host.|Standalone AI requires an OpenAI API key on the host.
KI-Schnellauskunft ist auf dem Host nicht eingerichtet.|AI Quick Advice is not configured on the host.
Eine KI-Antwort läuft bereits.|An AI response is already running.
Die KI hat keine vollständige Antwort geliefert.|The AI did not return a complete answer.
Oberfläche und Taktikregeln gibt es auf Deutsch und Englisch. Manche Kartenbeschriftungen brauchen je nach Spielsprache eigene Vorlagen. Experimentell erkannte Angebote werden nicht automatisch angetippt.|The interface and tactical rules are available in German and English. Some card captions need templates for the game language. Auto-tap skips experimentally recognized offers.
Was ist der Unterschied zwischen Draft und Schlacht?|How do Draft and Battle differ?
Im Draft kommen reguläre Einheitenangebote aus deiner aktiven Aufstellung. In der Schlacht stellst du das Deck zu Beginn aus den angebotenen Figuren zusammen. Zauber kommen in beiden Modi normalerweise aus deiner aktiven Zauberauswahl. Sonderangebote können den üblichen Pool erweitern.|In Draft, regular unit offers come from your active lineup. In Battle, you build a deck from the units offered at the start. Spells normally come from your active spell loadout in both modes. Special offers can extend the usual pool.
Wie schlage ich ein Deck und Zauber vor?|How do I get deck and spell suggestions?
Öffne Vorbereitung und wähle Vorschlag anzeigen unter Deck und Zauber vorschlagen. Der Coach nutzt deine gespeicherte Sammlung und empfiehlt bis zu vier Einheiten und drei Zauber mit Kartenstufe und Aufgabe. Du kannst die Auswahl im Spiel übernehmen.|Open Setup and choose Show suggestion under Suggest a deck and spells. The coach uses your saved collection to suggest up to four units and three spells with their levels and roles. You can apply the selection in the game.
Was bedeuten Rahmen und Zwischenbilder?|What do the outlines and intermediate frames mean?
Dünne Rahmen zeigen erkannte Karten. Ein grüner Tipp ist regulär bewertet. Gelb kennzeichnet einen vorläufigen Tipp oder einen Versuchstipp. Eine gesendete Auswahl wird zusätzlich markiert. Im Automodus bleibt das letzte relevante Wahlfenster sichtbar. Mit Zwischenbilder anzeigen kannst du auch die Aufnahmen dazwischen sehen.|Thin outlines show detected cards. Green marks a regular recommendation. Yellow indicates a provisional or fallback recommendation. A sent choice gets an additional marker. Auto capture keeps the last relevant choice visible. Use Show intermediate frames to see captures in between.
Wann setzt der Coach automatisch einen Zauber ein?|When does the coach cast a spell automatically?
Wenn Automodus und automatisches Antippen eingeschaltet sind, kann der Coach bei Herzrückstand oder ohne sicheren Truppentipp einmal pro Partie die Zauberauswahl öffnen. Er tippt nur einen sicher erkannten Zauber aus deiner gespeicherten aktiven Auswahl an. Bei unklarer Erkennung bleibt die Wahl bei dir.|With auto capture and auto-tap enabled, the coach can open the spell menu once per match if you trail on hearts or it lacks a confident unit recommendation. It taps only a confidently recognized spell from your saved active loadout. If recognition is unclear, you can choose yourself.
Wie funktioniert die Schnellauskunft?|How does Quick Advice work?
Wähle in der Schnellauskunft als Antwortquelle das lokale Taktiklexikon oder Standalone-KI. Das Lexikon funktioniert offline. Standalone-KI beantwortet frei formulierte Fragen auf Deutsch oder Englisch und erhält die Frage, passende lokale Regeln und gegebenenfalls den vorherigen KI-Dialogschritt als Text. Im Codex-Ablauf kannst du deine Frage direkt im Codex-Chat stellen.|In Quick Advice, select the local tactics knowledge base or Standalone AI as the answer source. The local knowledge base works offline. Standalone AI answers free-form questions in German or English and receives the question, relevant local rules and, when available, the previous AI turn as text. In the Codex workflow, ask directly in the Codex chat.
Wo hinterlege ich den OpenAI-API-Key?|Where do I set up the OpenAI API key?
Öffne die Schnellauskunft am Host-PC und klicke auf API-Key einrichten. Alternativ findest du das Feld unter Admin · Archiv. Nach dem Speichern ist Standalone-KI sofort auswählbar. Der Coach speichert den Schlüssel als lokale Datei auf dem Host. Die SQLite-Sicherung enthält ihn nicht. Unter Admin · Archiv kannst du den gespeicherten Schlüssel auch entfernen.|On the host PC, open Quick Advice and click Set up API key. The field is also under Admin · Archive. Standalone AI becomes available as soon as you save the key. The coach stores the key in a local file on the host. The SQLite backup excludes it. You can also remove the saved key under Admin · Archive.
Wie bearbeite ich zweisprachige Taktikregeln?|How do I edit bilingual tactical rules?
Der Sprachschalter bestimmt im Regeleditor die Sprache von Titel und Begründung. Karten, Bedingungen, Gewicht und Status gelten gemeinsam. Mit einem API-Key ergänzt der Coach beim Speichern fehlende Sprachfassungen und aktualisiert veraltete maschinelle Übersetzungen. Handbearbeitete Fassungen bleiben erhalten und werden bei Bedarf zur Prüfung markiert. Falls die Übersetzung fehlschlägt, bleibt der Originaltext gespeichert.|The language selector controls the title and explanation in the rule editor. Cards, conditions, weight and status are shared. With an API key, saving a rule fills missing translations and updates stale machine translations. Human-edited versions are kept and flagged for review when needed. If translation fails, the original text stays saved.
Wie lernt der Coach aus einer Partie?|How does the coach learn from a match?
Speichere nach Stopp das Ergebnis. Öffne am Host-PC Partie auswerten, lade ein Wahlfenster und vergleiche Tipp und gesendeten Klick. Speichere deine bevorzugte Wahl oder eine Beobachtung als Prüffall. Neue Regeln kannst du im Replay prüfen, als Testregel übernehmen, aktivieren und zurücknehmen. Eine korrigierte rote Gegneranzeige wird als Vorlage für ihre Spielsprache gespeichert. Der optionale GPT-Entwurf verwendet die ausgewählten Textdaten und überträgt den Kartenausschnitt nur, wenn du ihn ausdrücklich auswählst.|Record the result after pressing Stop. On the host PC, open Review match, load a choice and compare the recommendation with the sent tap. Save your preferred choice or observation as a review case. Preview new rules in a replay, save them as test rules, activate them or roll them back. A corrected red enemy banner is saved as a template for that game language. The optional GPT draft uses the selected text data and sends the card crop only if you explicitly select it.
Was enthält die Sicherung?|What does the backup contain?
Unter Admin · Archiv übernimmst du abgeschlossene Partien und lädst die SQLite-Sicherung herunter. Sie enthält archivierte Partien, Klickprotokolle, Belegbilder und Prüffälle samt Regelhistorie. Die laufende Taktikbibliothek wird separat gespeichert. Ältere Bilder lassen sich erneut auswerten, solange sie noch vorhanden oder als Beleg gesichert sind.|Under Admin · Archive, import completed matches and download the SQLite backup. It contains archived matches, tap logs, evidence images and review cases with rule history. The live tactics library is stored separately. Older images can be reviewed while they remain available or are saved as evidence.
Frage diktieren|Dictate question
Diktat abbrechen|Cancel dictation
Ich höre zu …|Listening…
Spracheingabe ist in diesem Browser nicht verfügbar.|Voice input is unavailable in this browser.
Frage übernommen. Prüfe sie vor dem Absenden.|Question transcribed. Review it before sending.
Mikrofonzugriff wurde nicht freigegeben.|Microphone permission was denied.
Spracheingabe fehlgeschlagen. Du kannst die Frage eintippen.|Voice input failed. You can type your question.
Keine Frage erkannt. Versuche es erneut.|No question recognized. Try again.
Spracheingabe konnte nicht gestartet werden.|Could not start voice input.
Mit Frage diktieren kannst du die Spracheingabe des Browsers nutzen. Der Coach trägt den Text ins Eingabefeld ein. Prüfe ihn vor dem Absenden.|Use Dictate question to use browser voice input. The coach fills in the question field. Review the text before sending.
Draft Coach · Lokal|Draft Coach · Local
Lokales Erkennungslabor|Local recognition lab
ADB wird geprüft …|Checking ADB…
Erkennung startet|Starting recognition
Draft Showdown mit einem Klick|Draft Showdown in one click
„Jetzt“ oder „Klick“ nimmt den Handybildschirm auf.|Say “Now” or “Click” to capture your phone screen.
Die Bilderkennung arbeitet lokal im Hintergrund.|Image recognition runs locally in the background.
Auswahl|Choose a view
Sprache|Language
Farbschema|Colour theme
Hell|Light
Dunkel|Dark
Spiel|Play
Organisation|Manage
Hilfe|Help
Schlacht|Battle
Vorbereitung|Setup
Schnellauskunft|Quick Advice
Taktikregeln|Tactical rules
Hilfe / FAQ|Help / FAQ
Zauber immer nur aus deiner Auswahl.|Spells normally come from your active loadout.
Zurück zum Spiel|Back to play
Der Coach holt einen Screenshot vom Android-Gerät, erkennt die sichtbaren Angebote und bewertet sie mit deinem Deck und den lokalen Taktikregeln. Die Empfehlung erscheint im Browser und wird im Bild markiert.|The Coach captures your Android screen, recognises visible offers and ranks them using your deck and local tactical rules. The recommendation appears in the browser and is highlighted in the screenshot.
In drei Schritten loslegen|Get started in three steps
Handy verbinden.|Connect your phone.
Öffne „Handy verbinden“ in einer Spielansicht. Verbinde das Gerät per USB-Debugging oder über „Geschütztes WLAN-Pairing“. Beim WLAN-Pairing verwendest du zuerst die Adresse im Kopplungsdialog und danach die Adresse auf der Hauptseite „Debugging über WLAN“. Die automatische Probeaufnahme zeigt, ob die Verbindung klappt.|Open “Connect phone” in a play view. Connect using USB debugging or secure wireless pairing. For wireless pairing, use the address in the pairing dialog first, then the address on the main Wireless debugging page. The automatic test capture checks the connection.
Sammlung und Deck erfassen.|Capture your collection and deck.
Wähle „Vorbereitung“. Nimm Einheiten und Zauber getrennt auf. Wenn du scrollst, lass die Bilder etwas überlappen. Erfasse auch die aktiven Aufstellungen, werte die Aufnahmen aus und übernimm die geprüften Daten.|Choose “Setup”. Capture units and spells separately, with a little overlap when scrolling. Capture your active lineups too, then analyse the images and confirm the reviewed data.
Spielen.|Play.
Wähle „Draft“ oder „Schlacht“ passend zum Spiel. Nutze „Manuell aufnehmen“, die Leertaste oder den Automodus. Der Coach bewertet die sichtbare Wahl. Du kannst selbst wählen oder „Tipp automatisch antippen“ aktivieren.|Choose “Draft” or “Battle” to match the game. Use manual capture, Space or Auto capture. The Coach ranks the visible offers. Pick one yourself or turn on “Auto-tap recommendation”.
Was kann ich ins Mikrofon sagen?|What can I say into the microphone?
„Jetzt“, „Klick“ oder „Start“|“Now”, “Click” or “Start”
Löst eine einzelne Aufnahme aus. Den Automodus startest du mit dem eigenen Button.|Takes one screenshot. Use the separate button to start auto capture.
„Stopp“ oder „Ende“|“Stop” or “End”
Beendet Mikrofon, Automodus und automatisches Antippen. Bei einer laufenden Partie kannst du anschließend das Ergebnis angeben.|Turns off the microphone, auto capture and auto-tap. If a match is in progress, you can then record the outcome.
Falls der Browser kein Mikrofon anbietet oder die Freigabe fehlt, nutze den Aufnahmebutton oder die Leertaste. Die Browser-Spracherkennung kann einen externen Dienst verwenden. „Tipp vorlesen“ steuert die Sprachausgabe unabhängig vom Mikrofon.|If microphone access is unavailable, use the capture button or Space. Browser speech recognition may use an external service. “Read recommendation aloud” controls speech output independently of the microphone.
Im Draft orientiert sich der Coach an deiner aktiven Aufstellung. In der Schlacht kann er eigene Einheiten aus der Sammlung berücksichtigen. Zauber stammen in beiden Modi normalerweise aus der aktiven Zauberauswahl.|In Draft, the Coach uses your active unit lineup. In Battle, it can consider units from your collection. In both modes spells normally come from your active loadout.
Was bedeuten relevante Aufnahmen?|What are relevant captures?
Im Automodus bleibt normalerweise das letzte erkannte Wahlfenster im Bild. Mit „Zwischenbilder anzeigen“ kannst du auch die Aufnahmen dazwischen sehen.|Auto capture normally keeps the last recognised choice on screen. “Show intermediate frames” also shows captures between choices.
Wo finde ich Taktikwissen und Partien?|Where can I find tactics and matches?
„Schnellauskunft“ beantwortet Fragen aus dem lokalen Lexikon. Unter „Taktikregeln“ bearbeitest du die Regeln. „Admin · Archiv“ steht am Host-PC zur Verfügung. Dort übernimmst du gespeicherte Partieergebnisse ins Archiv und lädst eine SQLite-Sicherung herunter.|“Quick Advice” answers from the local knowledge base. “Tactical rules” lets you edit the rules. “Admin · Archive” is available on the host PC for archiving match results and downloading a SQLite backup.
Admin · Archiv|Admin · Archive
Das SQLite-Archiv sammelt abgeschlossene Partien, Klickprotokolle und ausgewählte Belegbilder. Pro neuer Partie übernimmt der Coach bis zu fünf noch vorhandene Bilder.|The SQLite archive holds completed matches, tap logs and selected evidence images. Up to five available images are saved per new match.
Neue Partien übernehmen|Archive new matches
Stand aktualisieren|Refresh archive status
SQLite-Sicherung herunterladen|Download SQLite backup
Die Sicherung enthält das SQLite-Archiv samt eingebetteten Belegbildern. Die bearbeitbaren Taktikregeln werden separat gespeichert.|The backup contains the SQLite archive and embedded evidence images. Editable tactical rules are stored separately.
Zuletzt archivierte Partien|Recently archived matches
Lokales Taktiklexikon|Local tactics knowledge base
Was tue ich gegen Darklings?|What counters Whelp?
Was hilft gegen Schwärme?|What counters swarms?
Wer hat Synergie mit Drakling?|Which units work well with Whelp?
Letzte Fragen|Recent questions
Letzte beantwortete Fragen|Recently answered questions
Beispielfragen|Example questions
Fragen und Antworten|Questions and answers
Dieser Browser merkt sich bis zu zehn Fragen mit Treffern im lokalen Lexikon.|This browser remembers up to ten questions that matched the local knowledge base.
Deine Taktikfrage|Your tactics question
Was hilft gegen Parasit?|What counters Parasite?
Fragen|Ask
Frage im Web recherchieren|Search the web for this question
Eine Notiz hält Wissen fest. Eine Testregel zeigt eine Vorschau. Eine aktive Regel beeinflusst den Tipp.|A note records an observation. A test rule is shown in previews. An active rule affects recommendations.
Regeln durchsuchen|Search rules
z. B. Verwüster, Kapitän|e.g. Waster, Captain
Status filtern|Filter by status
Alle|All
Aktiv|Active
Testvorschau|Test preview
Notiz|Note
Neue Erkenntnis|New rule or note
Erkenntnis bearbeiten|Edit rule or note
Titel|Title
Beobachtung oder Begründung|Observation or rationale
Modus|Mode
Draft und Schlacht|Draft and Battle
Wahlfenster|Choice screen
Deckwahl|Deck selection
Kampfwahl|Battle selection
Zauberauswahl|Spell selection
Diese Angebotskarte|Offered card
Wenn diese Gegnerfigur bekannt ist|When this enemy unit is known
Gewicht in Punkten|Weight in points
Plus wertet das Angebot auf, Minus wertet es ab. Mehrere passende Regeln können zusammen bis zu 25 Punkte verändern.|Positive points raise the offer’s rating. Negative points lower it. Matching rules can change the rating by up to 25 points in total.
Speichern|Save
Regel löschen|Delete rule
Handy verbinden · USB oder WLAN|Connect phone · USB or Wi-Fi
Wähle den Verbindungsweg und gib das Gerät frei. Der Coach vermisst danach automatisch ein Probebild.|Choose a connection method and authorise the device. The Coach then measures a test screenshot automatically.
USB-Kabel|USB cable
Geschütztes WLAN-Pairing|Secure wireless pairing
WLAN über USB aktivieren|Enable Wi-Fi via USB
USB verbinden|Connect via USB
Handy per Kabel anschließen, USB-Debugging in den Entwickleroptionen aktivieren und die Freigabe auf dem Handy bestätigen. „Unauthorized“ bedeutet, dass diese Freigabe noch fehlt.|Connect the phone with a cable, enable USB debugging in Developer options and confirm the prompt on the phone. “Unauthorized” means approval is still pending.
WLAN-Pairing ab Android 11|Wireless pairing on Android 11 or later
Auf dem Handy: Entwickleroptionen → Debugging über WLAN → Gerät mit Kopplungscode koppeln. Beide Geräte müssen im selben vertrauenswürdigen WLAN sein.|On your phone, open Developer options → Wireless debugging → Pair device with pairing code. Both devices must use the same trusted Wi-Fi network.
Pairing-Adresse inklusive Port|Pairing address and port
Sechsstelliger Kopplungscode|Six-digit pairing code
Koppeln|Pair
Wenn der PC unter „Gekoppelte Geräte“ steht, ist die Freigabe bereits erteilt. Weiter mit Schritt 2.|If the PC appears under “Paired devices”, it is already authorised. Continue to step 2.
WLAN mithilfe des USB-Kabels|Enable Wi-Fi with a USB cable
Zuerst unter „USB-Kabel“ ein freigegebenes USB-Gerät auswählen. Dieser Weg aktiviert einen ADB-Port im WLAN ohne den TLS-Schutz des Android-Pairings. Nur im vertrauenswürdigen privaten WLAN verwenden.|First select an authorised device under “USB cable”. This enables an ADB port over Wi-Fi without Android wireless pairing’s TLS protection. Use it only on a trusted private Wi-Fi network.
WLAN-Port 5555 ausdrücklich aktivieren|Enable Wi-Fi port 5555
WLAN-Debugging beenden / USB-Modus|Disable Wi-Fi debugging / USB mode
2. WLAN-Verbindung herstellen|2. Connect over Wi-Fi
Öffne am Gerät die Hauptseite „Debugging über WLAN“. Übernimm die Angabe unter „IP-Adresse und Port“ von dieser Seite.|Open the main “Wireless debugging” page on your device. Use the value under “IP address & port”.
IP-Adresse und Port des Geräts|Device IP address and port
Verbinden|Connect
Geräte suchen|Find devices
Warte auf ein verbundenes Gerät.|Waiting for a connected device.
Probeaufnahme wiederholen|Repeat test capture
Manuell aufnehmen|Capture manually
Jetzt aufnehmen|Capture now
Leertaste|Space
Automodus starten|Start auto capture
Automodus läuft|Auto capture running
Mikrofon einschalten|Enable microphone
Mikrofon ausschalten|Disable microphone
Mikrofon aus|Disable microphone
Stopp|Stop
Zwischenbilder anzeigen|Show intermediate frames
Tipp automatisch antippen|Auto-tap recommendation
Tipp vorlesen|Read recommendation aloud
Bereit|Ready
Ton testen|Test sound
Wie ist die Partie ausgegangen?|How did the match end?
Gewonnen|Won
Verloren|Lost
Partie abgebrochen|Match abandoned
Ohne Angabe|Skip
Sammlung und Aufstellung aufnehmen|Capture collection and lineup
Was möchtest du aufnehmen?|What would you like to capture?
Sammlung · Einheiten|Collection · Units
Sammlung · Zauber|Collection · Spells
Aufstellung · Einheiten|Lineup · Units
Aufstellung · Zauber|Lineup · Spells
Wähle die Aufnahmeart und nutze den Aufnahmebutton oder sage „Jetzt“. Scrolle für Sammlungsbilder mit etwas Überlappung weiter.|Choose what to capture and press the capture button or say “Now”. When scrolling through the collection, leave some overlap between screenshots.
Sammlung|Collection
Aktive Aufstellung|Active lineup
Zeige die ausgewählten Einheiten oder Zauber oben im jeweiligen Spielbildschirm vollständig an. Wähle oben die passende Aufnahmeart und nimm je ein Bild auf.|Show the full selected unit or spell lineup at the top of the game screen. Select the matching capture type above and take one screenshot of each.
Sammlung und Aufstellung zusammenführen|Combine collection and lineup
Aufnahmen auswerten|Analyse captures
Geprüfte Sammlung übernehmen|Save reviewed collection
Referenzbilder testen|Test reference images
Lokale Bilderkennung|Local image recognition
Letzte Aufnahme|Latest capture
Letzte relevante Aufnahme|Latest relevant capture
Getestetes Referenzbild|Tested reference image
Noch kein Bild|No image yet
Nimm ein Bild auf oder wähle eine Referenz.|Capture an image or choose a reference.
Wahlangebote|Available choices
Warte auf Auswahl|Waiting for a choice
Noch keine Angebote erkannt.|No choices detected yet.
Auswertung und Sprachsteuerung|Analysis and voice controls
Aufnahme|Capture
Erkennung|Recognition
Bild bis Ergebnis|Capture to result
Bilderkennung und Bewertung laufen lokal. Die Browser-Spracherkennung kann einen externen Dienst verwenden.|Image recognition and recommendations run locally. Browser speech recognition may use an external service.
Sprachbefehle: Jetzt / Klick / Start → eine Aufnahme. Stopp → Mikrofon und Automatik aus.|Voice commands: Now / Click / Start → one capture. Stop → microphone and auto capture off.
Experimentelle Basiswertung. Mengen und gegnerische Stärken sind noch nicht vollständig berücksichtigt.|Experimental scoring. Quantities and enemy strength are only partly accounted for.
Messprotokoll|Timing log
Noch keine Messungen.|No measurements yet.
Draft Coach · Prototyp|Draft Coach · Prototype
Sicher erkannt|Recognised confidently
Tipp|Recommendation
Zaubertipp|Spell recommendation
Versuchstipp|Fallback recommendation
Vorläufiger Tipp|Provisional recommendation
Linke Karte|Left card
Mittlere Karte|Middle card
Rechte Karte|Right card
Links|Left
Mitte|Middle
Rechts|Right
Angebotsaktion|Offer action
Alle Aktionen|All actions
Aufwertung (auch kombiniert)|Upgrade (including combined)
Verdopplung mit Aufwertung|Double and upgrade
Auswahl gesendet|Choice sent
Wählen|Choose
Zauber|Spell
Einheiten|Units
Ausgewählte Einheiten|Selected units
Ausgewählte Zauber|Selected spells
Noch keine Aufnahme.|No captures yet.
Karte|Card
Vorhanden|Owned
Stärke|Level
Aufstellung|Lineup
Auswertung|Analysis
Keine Karten erkannt.|No cards detected.
Ein Sammlungsimport läuft bereits.|A collection import is already running.
Nimm zuerst Sammlungs- oder Aufstellungsbilder auf.|Capture your collection or lineup first.
Bitte warte, bis der Sammlungsimport fertig ist.|Wait for the collection import to finish.
Die Aufstellung enthält zu viele ausgewählte Karten.|The lineup contains too many selected cards.
Sammlungsaufnahme nicht gefunden.|Collection capture not found.
Deckwahl · Beginn|Deck selection · Start
Deckwahl · Gegner sichtbar|Deck selection · Opponent visible
Spielfeld · Einblendung|Battlefield · Banner
Spielfeld · Figuren|Battlefield · Units
Kampf · Wahlangebote|Battle · Available choices
Verwaltung|Administration
Erkannte Bildbereiche|Recognised image regions
Aufgenommener Handybildschirm|Captured phone screen
Aufnahme steuern|Capture controls
Erkennung lokal bereit|Local recognition ready
Erkennung nicht bereit|Recognition unavailable
Gerät nicht verbunden|Device not connected
Bildschirm unklar|Unclear screen
Spielfeld|Battlefield
Wahl im Kampf|Battle selection
Einheitensammlung|Unit collection
Figur nicht erkannt|Unit not recognised
Aktion unklar|Unknown action
Löschen|Delete
Aus Galerie entfernen|Remove from gallery
Gespeichert.|Saved.
Regel gelöscht.|Rule deleted.
Keine passenden Regeln.|No matching rules.
Aktive Regel|Active rule
Testregel|Test rule
Lexikon|Knowledge base
Keine Karte · Notiz|No card · note
Jeder Gegner|Any opponent
Partien werden übernommen …|Archiving matches…
Archiv wird gelesen …|Reading archive…
Einheiten und Zauber getrennt aufnehmen.|Capture units and spells separately.
Fragen aus dem lokalen Taktiklexikon beantworten.|Ask the local tactics knowledge base.
Regeln, Testvorschauen und Notizen bearbeiten.|Edit rules, test previews and notes.
Partien archivieren und SQLite-Sicherungen herunterladen.|Archive matches and download SQLite backups.
Anleitung und Antworten auf häufige Fragen.|Instructions and frequently asked questions.
Englische Spielbilder werden probeweise erkannt. Automatisches Antippen bleibt für experimentell erkannte Angebote aus.|English game-screen recognition is experimental. Auto-tap is disabled for choices using experimental recognition.
Die Erklärung stammt aus dem lokalen Wissensbestand und kann auf Deutsch vorliegen.|Explanations from the local knowledge base may be in German.
Ins Deck aufnehmen|Add to deck
Hinzufügen · Anzahl offen|Add units · quantity unknown
Abweichende Werte prüfen|Review conflicting values
Aus Aufnahme|From capture
Karte erkannt, bisherige Stärke|Card recognised, previous strength retained
Bisheriger Stand|Previous value
Aufnahmen werden ausgewertet …|Analysing captures…
Sammlung und Aufstellung gespeichert.|Collection and lineup saved.
Vorschau. Mit „Geprüfte Sammlung übernehmen“ aktivierst du die angezeigte Aufstellung.|Preview. Choose “Save reviewed collection” to use the displayed lineup.
Kein Gerät gefunden. Kabel, USB-Debugging und Freigabe am Handy prüfen.|No device found. Check the cable, USB debugging and the approval prompt on your phone.
Auswählen|Select
Gerät ausgewählt. Die Probeaufnahme startet automatisch.|Device selected. The test capture will start automatically.
Bildklick derzeit nicht verfügbar. Prüfe die Tablet-Verbindung.|Screen tapping is unavailable. Check the device connection.
Das Bild wird geladen. Tippe danach erneut.|Wait for the image to load, then tap again.
Bildklick wird ans Gerät gesendet …|Sending tap to the device…
Bildklick gesendet.|Tap sent.
Keine Rückmeldung zum Bildklick. Prüfe den Bildschirm am Gerät.|The tap timed out. Check the screen on your device.
Noch kein Wahlfenster erkannt.|No choice screen detected yet.
Lokaler Server nicht erreichbar|Local server unavailable
Klickton wartet auf Audiofreigabe. Tippe auf „Ton testen“.|Tap sounds need browser audio permission. Choose “Test sound”.
Ton wird vorbereitet …|Preparing audio…
Testton in diesem Browser gestartet.|Test sound played in this browser.
Zaubersammlung|Spell collection
Keine Referenzbilder in der Galerie.|There are no reference images in the gallery.
Erkennung läuft|Recognising
Wahl wird geprüft|Verifying choice
Aufnahme läuft|Capturing
Automatik an|Auto capture on
`.trim().split('\n').map(line=>line.split('|')));

const fragments=new Map(`
Zaubertipp|Spell recommendation
Versuchstipp|Fallback recommendation
Vorläufiger Tipp|Provisional recommendation
Gegnerische Karten|Enemy cards
Eigene Karten|Your cards
Gegnerzüge · zuletzt je Figur|Latest enemy action per unit
Aktives Draft-Deck|Active Draft deck
Neu im Spiel erkannt|Newly recognised in game
Noch kein Draft-Deck übernommen|No Draft deck saved yet
Aktiver Stand|Current collection
keine ausgewählt|none selected
Stärke offen|strength unknown
nicht sicher erfasst|not confidently recognised
Zauber einsetzen|Cast spell
Keine ausreichenden Wahlangebote erkannt|Not enough offers recognised
Letztes Wahlfenster|Last choice screen
Zuletzt angezeigtes Wahlfenster|Last displayed choice screen
Quelle|Source
gewonnen|won
verloren|lost
abgebrochen|abandoned
Aufwerten|Upgrade
Aufwertung|Upgrade
Verdopplung|Double
Figuren hinzufügen|Add units
Figuren|units
Einheiten|units
Zauber|spells
Bilder|images
Aufnahmen|captures
Belegbilder|evidence images
Partien im Archiv|archived matches
zur Übernahme|pending
archivierte Erkenntnisse|archived findings
Partien übernommen|matches archived
Bilder gesichert|images saved
Einträge|entries
Punkte|points
Stufe|Level
Sterne|stars
Herzen|Hearts
Links|Left
Mitte|Middle
Rechts|Right
Gegner|Opponent
Verdoppeln und aufwerten|Double and upgrade
Verdoppeln|Double
hinzufügen|add
Gehört|Heard
Gespeichertes Testbild|Saved test image
Wahl wird geprüft|Verifying choice
Aufnahme läuft|Capturing
Erkennung läuft|Recognising
Automatik an|Auto capture on
WLAN|Wi-Fi
gegen|against
Du|You
Tipp|Recommendation
`.trim().split('\n').map(line=>line.split('|')));
const fragmentPattern=new RegExp('(?<![\\p{L}\\p{N}])(?:'+[...fragments.keys()].map(escapeRegExp).join('|')+')(?![\\p{L}\\p{N}])','gu');
const preparationLabels=new Map([
  ['Einheiten','Units'],['Zauber','Spells'],
  ['Ausgewählte Einheiten','Selected units'],['Ausgewählte Zauber','Selected spells']
]);
function translatePreparation(text){
  const reference=/^Sammlung · (Einheiten|Zauber) (\d+)$/.exec(text);
  if(reference)return 'Collection · '+preparationLabels.get(reference[1])+' '+reference[2];
  const capture=/^Aufnahme (\d+)$/.exec(text);
  if(capture)return 'Capture '+capture[1];
  const gallery=/^(Ausgewählte Einheiten|Ausgewählte Zauber|Einheiten|Zauber) · (\d+|Aufnahme \d+)( löschen)?$/.exec(text);
  if(gallery){
    const label=preparationLabels.get(gallery[1])+' · '+gallery[2].replace('Aufnahme ','Capture ');
    return gallery[3]?'Delete '+label:label;
  }
  const deckWarning=/^Aufstellung (Einheiten|Zauber): (\d+) von (\d+) erkannt\. Bisherige Auswahl prüfen\.$/.exec(text);
  if(deckWarning)return `${preparationLabels.get(deckWarning[1])} lineup: ${deckWarning[2]} of ${deckWarning[3]} detected. Review your previous selection.`;
  if(text.startsWith('Aktiver Stand · ')){
    return displayNames(text,'en').replace('Aktiver Stand · ','Current collection · ')
      .replace(/(\d+) Einheiten und (\d+) Zauber/,'$1 units and $2 spells')
      .replace('Einheiten:','Units:').replace('Zauber:','Spells:').replaceAll('keine ausgewählt','none selected');
  }
  const reviewLabel=/^(Stärke (.+)|(.+) (vorhanden|in Aufstellung))$/.exec(text);
  if(reviewLabel){
    if(reviewLabel[2])return 'Level for '+displayNames(reviewLabel[2],'en');
    return displayNames(reviewLabel[3],'en')+(reviewLabel[4]==='vorhanden'?' owned':' in lineup');
  }
}
export function translate(text,language){
  if(language!=='en'||typeof text!=='string')return text;
  const core=text.trim();
  if(!core)return text;
  const english=ui.get(core)??translatePreparation(core)??displayNames(core,'en').replace(fragmentPattern,word=>fragments.get(word));
  return english===core?text:text.replace(core,()=>english);
}

const reviewMessages={
  offers:['Angebote','Offers'], enemies:['Gegnerische Karten','Enemy cards'],
  original:['Damals empfohlen','Original recommendation'], clicks:['Klickprotokoll','Tap log'],
  baseline:['Replay bisher','Baseline replay'], proposed:['Replay mit Regel','Replay with proposed rule'],
  reason:['Begründung im Original','Reason in original language'],
  gesendet:['Gesendet','Sent'], abgebrochen:['Abgebrochen','Cancelled'], fehler:['Fehler','Failed'],
  gewonnen:['Gewonnen','Won'], verloren:['Verloren','Lost'],
  arena:['Schlacht','Battle'], draft:['Draft','Draft'],
  deck_choice:['Deckwahl','Deck choice'], battle_choice:['Kampfwahl','Battle choice'],
  spell_choice:['Zauberauswahl','Spell choice'], unknown:['Unbekannt','Unknown'],
  add:['Hinzufügen','Add'], upgrade:['Aufwerten','Upgrade'], multiply:['Verdoppeln','Double'],
  multiply_upgrade:['Verdoppeln und aufwerten','Double and upgrade'], spell:['Zauber einsetzen','Cast spell'],
  test:['Testregel','Test rule'], aktiv:['Aktiv','Active'], zurueck:['Zurückgenommen','Rolled back'],
  openCase:['Prüffall öffnen','Open review case'],
  preference:['Bevorzugte Wahl','Preferred choice'], noPreference:['Keine Auswahl','No preference'],
  confirmation:['Wahlfenster hat sich geändert oder konnte nicht bestätigt werden','Choice changed or could not be verified'],
  timeout:['Gerät antwortet nicht rechtzeitig.','Device did not respond in time.'],
  interrupted:['Klickprüfung abgelaufen oder Automatik unterbrochen','Tap verification timed out or automation stopped'],
};
export function reviewMessage(key,language){
  return Object.hasOwn(reviewMessages,key)?reviewMessages[key][language==='en'?1:0]:'';
}
export function reviewTapReason(reason,language){
  const key=['confirmation','timeout','interrupted'].find(key=>reviewMessage(key,'de')===reason);
  return key?reviewMessage(key,language):reason;
}


export function tacticText(rule,language){
  const locale=language==='en'?'en':'de';
  if(rule.texts)return rule.texts[locale]??null;
  return locale==='de'?{title:rule.title,reason:rule.reason}:null;
}
