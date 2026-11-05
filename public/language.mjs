// Canonical keys stay unchanged in profiles, rules and recognition results.
export const EN_CARD_NAMES=Object.freeze({
  Spinne:'Matriarch','Agent B':'Agent B',Zerstörer:'Waster',Merlinor:'Merlinor',Ritter:'Knight',
  Kupid:'Cupid',Gans:'Goose',TNT:'TNT',Schnecke:'Snail',Assassine:'Assassin',Splime:'Splime',
  Königlop:'Kingclops',Ingenieur:'Engineer',Maulwurf:'Mole',Bienenkorb:'Beetank',
  Schildling:'Shellbro',Parasit:'Parasite',Sniper:'Sniper',Blutrebe:'Bloodvine',
  Spartheus:'Spartheus',Sixshoot:'Sixshoot',Totem:'Totem',Boomling:'Boomling',
  Obergeist:'Overmind',Drakling:'Whelp',Kapitän:'Captain',Astra:'Astra',
  Steinhaut:'Stone Skin','¡ZAS!':'ZAP!',Grabesbogenschützen:'Grave Archers',
  'Wilder Überfall':'Wilder Überfall',Säureexplosion:'Acid Burst',Feensegen:'Fairy Blessing',
  Pfeilsturm:'Storm of Arrows','Wachs-Experiment':'Wachs-Experiment',Volltreffer:'Blast Out',
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
Draft Coach · Lokal|Draft Coach · Local
Lokales Erkennungslabor|Local recognition lab
ADB wird geprüft …|Checking ADB…
Erkennung startet|Starting recognition
VOM BILDSCHIRM ZUR ENTSCHEIDUNG|FROM SCREEN TO DECISION
Ein Wort. Ein neuer Blick.|One word. A fresh look.
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
Was ist der Unterschied zwischen Draft und Schlacht?|What is the difference between Draft and Battle?
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
Wählen|Choose
Zauber|Spell
Einheiten|Units
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
export function translate(text,language){
  if(language!=='en'||typeof text!=='string')return text;
  const core=text.trim();
  if(!core)return text;
  const english=ui.get(core)??displayNames(core,'en').replace(fragmentPattern,word=>fragments.get(word));
  return english===core?text:text.replace(core,()=>english);
}
