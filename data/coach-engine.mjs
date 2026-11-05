import { EN_CARD_NAMES, getCardDisplayName, getRoleDisplayName, localizeTacticalText } from './i18n.mjs';

export const SOURCE = 'https://www.reddit.com/r/DraftShowdown/comments/1w9qsuh/smaw_build/';

export const CARD_IMAGES = {};

const rawUnits = [
  ['Parasit', 6, 8, '🐍', 'Übernahme'],
  ['TNT', 8, 8, '🧨', 'Fläche'],
  ['Bienenkorb', 4, 8, '🐝', 'Schwarm'],
  ['Zerstörer', 4, 7, '🛢️', 'Front'],
  ['Spartheus', 6, 10, '⚔️', 'Front'],
  ['Merlinor', 8, 10, '🧙', 'Fernkampf'],
  ['Drakling', 3, 7, '🐉', 'Schwarm'],
  ['Gans', 3, 7, '🪿', 'Schwarm'],
  ['Schnecke', 5, 8, '🐌', 'Fläche'],
  ['Boomling', 3, 9, '💣', 'Fläche'],
  ['Ingenieur', 6, 9, '🛠️', 'Schutz'],
  ['Kapitän', 8, 11, '🏴‍☠️', 'Zugriff'],
  ['Assassine', 9, 9, '🥷', 'Zugriff'],
  ['Agent B', 1, 5, '🕶️', 'Zugriff'],
  ['Ritter', 5, 7, '🛡️', 'Front'],
  ['Kupid', 6, 7, '🏹', 'Fernkampf'],
  ['Sniper', 5, 9, '🎯', 'Zugriff'],
  ['Königlop', 7, 9, '👑', 'Front'],
  ['Blutrebe', 5, 9, '🌱', 'Front'],
  ['Sixshoot', 4, 8, '🤠', 'Fernkampf'],
  ['Schildling', 6, 9, '🐢', 'Zugriff'],
  ['Totem', 3, 9, '🗿', 'Schutz'],
  ['Splime', 4, 8, '🫧', 'Front'],
  ['Maulwurf', 5, 7, '🦔', 'Zugriff'],
  ['Obergeist', 3, 8, '🌀', 'Übernahme'],
  ['Spinne', 5, 8, '🕷️', 'Front']
];

const rawSpells = [
  ['Steinhaut', 7, '🪨', 'Schutz'],
  ['Feensegen', 8, '🧚', 'Verstärkung'],
  ['Säureexplosion', 7, '🧪', 'Fläche'],
  ['Pfeilsturm', 7, '🏹', 'Fläche'],
  ['Minenfeld', 7, '🔘', 'Fläche'],
  ['Grabesbogenschützen', 8, '💀', 'Fernkampf'],
  ['Wilder Überfall', 7, '🪓', 'Front'],
  ['Volltreffer', 5, '💥', 'Zugriff'],
  ['¡ZAS!', 7, '⚡', 'Zauber'],
  ['Wachs-Experiment', 7, '🧫', 'Verstärkung'],
  ['Meuchelbrigade', 7, '🥷', 'Zugriff'],
  ['Wächtertürme', 8, '🏰', 'Schutz'],
  ['Meteorschauer', 8, '☄️', 'Fläche'],
  ['Schildkrötenplan', 7, '🐢', 'Schutz'],
  ['Upgrade-Roulette', 6, '🍄', 'Verstärkung'],
  ['Grabesruf', 7, '🪦', 'Schwarm']
];

export const CARDS = rawUnits
  .map(([name, blue, orange, icon, role]) => ({
    name,
    blue,
    orange,
    strength: orange || 8,
    icon,
    imageUrl: CARD_IMAGES[name] || null,
    role,
    kind: 'unit',
    owned: !['Obergeist', 'Spinne'].includes(name),
    inDeck: ['Merlinor', 'Parasit', 'Spartheus', 'Kapitän', 'Bienenkorb', 'TNT', 'Zerstörer', 'Schnecke', 'Ingenieur', 'Drakling', 'Gans', 'Boomling'].includes(name),
    inSelection: ['TNT', 'Zerstörer', 'Bienenkorb', 'Spartheus'].includes(name)
  }))
  .concat(
    rawSpells.map(([name, orange, icon, role]) => ({
      name,
      orange,
      blue: null,
      strength: orange || 7,
      icon,
      imageUrl: CARD_IMAGES[name] || null,
      role,
      kind: 'spell',
      owned: !['Meuchelbrigade', 'Wächtertürme', 'Meteorschauer', 'Schildkrötenplan', 'Upgrade-Roulette', 'Grabesruf'].includes(name),
      inDeck: ['Steinhaut', 'Feensegen', 'Pfeilsturm', 'Säureexplosion', 'Volltreffer'].includes(name),
      inSelection: ['Steinhaut', 'Feensegen'].includes(name)
    }))
  );

export const ROLE_COUNTER_MATRIX = {
  Übernahme: [
    {
      name: 'Bienenkorb',
      score: 92,
      reason: 'Viele Bienen-Ziele lenken Einzelziel-Übernahmen zuverlässig ab.',
      reasonEn: 'Multi-unit bee spawns reliably bait and waste single-target Mind Control.',
      synergy: 'Stark hinter Spartheus oder mit Feensegen.',
      synergyEn: 'Strong behind Spartheus or buffed with Fairy Blessing.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Drakling',
      score: 90,
      reason: 'Fliegende Kleingruppe überfordert einzelne Übernahme-Effekte.',
      reasonEn: 'Flying Whelp pack overwhelms single-target Mind Control effects.',
      synergy: 'Harmoniert mit Gans und Feensegen.',
      synergyEn: 'Pairs great with Goose and Fairy Blessing.',
      nextFigure: 'Gans'
    },
    {
      name: 'Gans',
      score: 86,
      reason: 'Günstige Masse verhindert, dass eine teure Kernfigur übernommen wird.',
      reasonEn: 'Low-cost Goose swarm prevents high-value core troops from being hijacked.',
      synergy: 'Stark mit Verstärkungs-Zaubern.',
      synergyEn: 'Strong with Buff spells like Fairy Blessing.',
      nextFigure: 'Feensegen'
    },
    {
      name: 'TNT',
      score: 85,
      reason: 'Direkter Explosionsschaden schaltet Übernahme-Einheiten rasch aus.',
      reasonEn: 'Instant explosive burst eliminates Mind Control units before they lock on.',
      synergy: 'Optimal mit Front-Blockern wie Spartheus.',
      synergyEn: 'Ideal behind Frontline blockers like Spartheus.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Grabesruf',
      score: 88,
      reason: 'Beschwört mehrere Skelette als Zauber-Schwarm und lässt Einzelziel-Übernahmen leerlaufen.',
      reasonEn: 'Grave Call summons a skeleton swarm that wastes single-target Mind Control.',
      synergy: 'Stark mit Bienenkorb, Gans und Feensegen.',
      synergyEn: 'Strong with Beetank, Goose, and Fairy Blessing.',
      nextFigure: 'Bienenkorb'
    },
    {
      name: 'Feensegen',
      score: 84,
      reason: 'Verstärkt eigene Schwarm-Konter gegen Übernahme-Einheiten spürbar.',
      reasonEn: 'Fairy Blessing buffs your swarm counter-units against Mind Control.',
      synergy: 'Optimal mit Bienenkorb, Drakling oder Gans.',
      synergyEn: 'Ideal with Beetank, Whelp, or Goose.',
      nextFigure: 'Bienenkorb'
    },
    {
      name: '¡ZAS!',
      score: 82,
      reason: 'Direkter Blitz-Zauber schaltet Parasit oder Obergeist schnell aus.',
      reasonEn: 'Thunderfall direct spell burst eliminates Parasite or Overmind quickly.',
      synergy: 'Hält deine Kernfiguren frei von Übernahmen.',
      synergyEn: 'Keeps your core units safe from Mind Control.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Zerstörer',
      score: 79,
      reason: 'Robuste Nahkampfpräsenz, sollte aber durch Begleittruppen abgeschirmt werden.',
      reasonEn: 'Sturdy Waster brawler presence, best screened by smaller swarm units.',
      synergy: 'Mit Steinhaut oder Kleingruppen absichern.',
      synergyEn: 'Protect with Stone Skin or swarm units.',
      nextFigure: 'Steinhaut'
    }
  ],
  Schwarm: [
    {
      name: 'Schnecke',
      score: 93,
      reason: 'Konstanter Flächenschaden trifft den gesamten Schwarm gleichzeitig.',
      reasonEn: 'Snail delivers sustained AoE splash that melts clumped swarms.',
      synergy: 'Mit Ingenieur in der Hinterreihe absichern.',
      synergyEn: 'Guard your backline Snail with Engineer.',
      nextFigure: 'Ingenieur'
    },
    {
      name: 'Boomling',
      score: 91,
      reason: 'Explosiver Flächenschaden räumt gebündelte Schwärme sofort ab.',
      reasonEn: 'Explosive rocket AoE clears clustered swarm units immediately.',
      synergy: 'Stark hinter Spartheus als Blocker.',
      synergyEn: 'Strong behind Spartheus holding the Frontline.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'TNT',
      score: 89,
      reason: 'Sprengwirkung dezimiert dicht zusammenstehende Gruppen.',
      reasonEn: 'Detonation blast wipes out tightly packed troop waves.',
      synergy: 'Gut mit Merlinor oder Kapitän zum Nachsetzen.',
      synergyEn: 'Great with Merlinor or Captain for clean-up.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Pfeilsturm',
      score: 86,
      reason: 'Schneller Flächenzauber gegen breite Kleingruppen.',
      reasonEn: 'Storm of Arrows quickly clears wide low-HP swarm formations.',
      synergy: 'Hält eigenen Fernkämpfern den Rücken frei.',
      synergyEn: 'Keeps enemy swarms off your Ranged DPS.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Säureexplosion',
      score: 84,
      reason: 'Flächenkontrolle schwächt heranstürmende Gruppen frühzeitig.',
      reasonEn: 'Acid Burst weakens and melts rushing swarm packs early.',
      synergy: 'Kombiniert sich gut mit stabiler Front.',
      synergyEn: 'Combines well with a sturdy Frontline.',
      nextFigure: 'Ritter'
    }
  ],
  Front: [
    {
      name: 'Merlinor',
      score: 92,
      reason: 'Konzentrierter Magieschaden bricht zähe Front-Einheiten schnell auf.',
      reasonEn: 'High-output magic DPS shreds tanky Frontline troops quickly.',
      synergy: 'Braucht eigene Front oder Ingenieur als Schutz.',
      synergyEn: 'Requires a Frontline tank or Engineer protection.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Parasit',
      score: 89,
      reason: 'Zieht maximalen Wert, wenn eine schwere gegnerische Frontfigur übernommen wird.',
      reasonEn: 'Gets massive value by hijacking a heavy enemy Frontline tank.',
      synergy: 'Stark mit eigenem Schutz oder Verzögerung.',
      synergyEn: 'Strong with defensive screening and stalls.',
      nextFigure: 'Ingenieur'
    },
    {
      name: 'Kapitän',
      score: 85,
      reason: 'Zieht Schlüsselziele aus der Formation und bricht die Linie auf.',
      reasonEn: 'Captain hooks key targets out of formation and breaks the enemy line.',
      synergy: 'Harmoniert mit Spartheus und Flächenschaden.',
      synergyEn: 'Synergizes with Spartheus and AoE splash.',
      nextFigure: 'Boomling'
    },
    {
      name: 'Zerstörer',
      score: 83,
      reason: 'Hält im direkten Frontduell dagegen und baut Druck auf.',
      reasonEn: 'Waster brawls head-to-head on the Frontline and applies pressure.',
      synergy: 'Mit Steinhaut oder Feensegen verstärken.',
      synergyEn: 'Reinforce with Stone Skin or Fairy Blessing.',
      nextFigure: 'Steinhaut'
    },
    {
      name: 'Säureexplosion',
      score: 86,
      reason: 'Säure-Zauber schwächt schwere Front-Einheiten und bricht deren Rüstung auf.',
      reasonEn: 'Acid Burst weakens heavy Frontline tanks and softens their armor.',
      synergy: 'Optimal mit Merlinor oder Zerstörer.',
      synergyEn: 'Ideal with Merlinor or Waster.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Steinhaut',
      score: 85,
      reason: 'Verleiht deiner eigenen Front im direkten Schlagabtausch entscheidende Haltbarkeit.',
      reasonEn: 'Stone Skin grants your own Frontline decisive durability in head-to-head brawls.',
      synergy: 'Stark auf Spartheus, Zerstörer oder Ritter.',
      synergyEn: 'Strong on Spartheus, Waster, or Knight.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Blutrebe',
      score: 81,
      reason: 'Zähe Gegenfront, die lange im Nahkampf standhält.',
      reasonEn: 'Bloodvine anchors a resilient counter-frontline in prolonged brawls.',
      synergy: 'Stark mit Merlinor in der Hinterreihe.',
      synergyEn: 'Strong with Merlinor dealing DPS from behind.',
      nextFigure: 'Merlinor'
    }
  ],
  Zugriff: [
    {
      name: 'Ingenieur',
      score: 94,
      reason: 'Sichert deine hintere Reihe direkt gegen Sprung- und Zugriffs-Angriffe ab.',
      reasonEn: 'Engineer directly protects your backline against Assassin & Agent B dives.',
      synergy: 'Unverzichtbar neben Merlinor, Schnecke oder Sniper.',
      synergyEn: 'Essential next to Merlinor, Snail, or Sniper.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Spartheus',
      score: 86,
      reason: 'Stabile Einheit, die nicht sofort durch Zugriff ausgeschaltet wird.',
      reasonEn: 'Durable phalanx unit that cannot be burst down by dive troops.',
      synergy: 'Fundament für fast jede Aufstellung.',
      synergyEn: 'Core anchor for almost any team comp.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Ritter',
      score: 83,
      reason: 'Robuster Nahkämpfer ohne verwundbare Rückraum-Schwäche.',
      reasonEn: 'Solid Knight melee fighter with no fragile backline weakness.',
      synergy: 'Gut mit Flächenschaden kombinierbar.',
      synergyEn: 'Pairs well with AoE splash support.',
      nextFigure: 'Schnecke'
    },
    {
      name: 'Steinhaut',
      score: 81,
      reason: 'Schützt bedrohte Einheiten kurzfristig vor Burst-Schaden.',
      reasonEn: 'Stone Skin shields targeted troops against dive burst damage.',
      synergy: 'Stark bei bereits aufgebautem Feld.',
      synergyEn: 'High value once your board is established.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Schildling',
      score: 80,
      reason: 'Widerstandsfähige Antwort gegen schnelle Angreifer.',
      reasonEn: 'Shellbro shrugs off fast dive attackers with high durability.',
      synergy: 'Ergänzt Fernkämpfer zuverlässig.',
      synergyEn: 'Reliably peels for your Ranged DPS.',
      nextFigure: 'Kupid'
    }
  ],
  Fernkampf: [
    {
      name: 'Agent B',
      score: 90,
      reason: 'Direkter Zugriff auf ungeschützte gegnerische Fernkämpfer.',
      reasonEn: 'Agent B dives straight onto exposed enemy Ranged DPS.',
      synergy: 'Stark, wenn deine Front das Feuer auf sich zieht.',
      synergyEn: 'Deadly while your Frontline tanks enemy fire.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Assassine',
      score: 89,
      reason: 'Springt gezielt in die gegnerische Hinterreihe und schaltet Schützen aus.',
      reasonEn: 'Assassin leaps directly into the enemy backline to eliminate shooters.',
      synergy: 'Mit Spartheus oder Ritter an der Front kombinieren.',
      synergyEn: 'Combine with Spartheus or Knight up front.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Spartheus',
      score: 87,
      reason: 'Fängt mit seinen Schilden die ersten Fernkampf-Salven zuverlässig ab.',
      reasonEn: 'Spartheus shields absorb incoming ranged volleys reliably.',
      synergy: 'Schützt eigene Schützen wie Merlinor.',
      synergyEn: 'Screens your own carries like Merlinor.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Kapitän',
      score: 85,
      reason: 'Bedroht wertvolle Fernkämpfer direkt mit seinem Haken.',
      reasonEn: 'Captain threatens enemy backline carries directly with his hook.',
      synergy: 'Kombiniert sich stark mit Nahkampf-Front.',
      synergyEn: 'Pairs strongly with melee Frontline troops.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Steinhaut',
      score: 80,
      reason: 'Reduziert den Schaden gegnerischer Salven auf deine Front.',
      reasonEn: 'Stone Skin mitigates heavy ranged volley damage on your Frontline.',
      synergy: 'Gut für geschlossene Formationen.',
      synergyEn: 'Great for compact formations.',
      nextFigure: 'Ritter'
    }
  ],
  Fläche: [
    {
      name: 'Spartheus',
      score: 91,
      reason: 'Einzelne zähe Front-Einheit statt verwundbarer Kleingruppen gegen Flächenschaden.',
      reasonEn: 'Tanky Frontline unit instead of fragile swarms that melt to AoE.',
      synergy: 'Mit Merlinor für hohen Einzelziel-Druck.',
      synergyEn: 'Pair with Merlinor for high single-target pressure.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Merlinor',
      score: 88,
      reason: 'Schaltet Flächenschaden-Einheiten aus sicherer Distanz aus.',
      reasonEn: 'Picks off enemy AoE troops like Snail and Boomling from range.',
      synergy: 'Mit Ingenieur vor Zugriff schützen.',
      synergyEn: 'Protect with Engineer against backline dives.',
      nextFigure: 'Ingenieur'
    },
    {
      name: 'Assassine',
      score: 86,
      reason: 'Greift langsame Flächen-Einheiten wie Schnecke oder Boomling direkt an.',
      reasonEn: 'Jumps directly onto slow AoE units like Snail or Boomling.',
      synergy: 'Braucht eine Front zur Ablenkung.',
      synergyEn: 'Needs a Frontline tank to draw aggro first.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Königlop',
      score: 84,
      reason: 'Hohe Lebenspunkte überstehen Flächenexplosionen deutlich besser als Schwärme.',
      reasonEn: 'Kingclops high HP pool survives AoE blasts far better than swarm units.',
      synergy: 'Gut mit Einzelziel-Schützen.',
      synergyEn: 'Strong with single-target Ranged DPS.',
      nextFigure: 'Kupid'
    },
    {
      name: 'Steinhaut',
      score: 88,
      reason: 'Schutz-Zauber fängt Explosions- und Flächenschaden auf deine Kerntruppen ab.',
      reasonEn: 'Stone Skin absorbs explosive and AoE splash damage on your core units.',
      synergy: 'Stark mit Spartheus und Königlop.',
      synergyEn: 'Strong with Spartheus and Kingclops.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Volltreffer',
      score: 85,
      reason: 'Präzisions-Zauber schaltet Flächen-Einheiten wie Schnecke oder Boomling direkt aus.',
      reasonEn: 'Dead Shot snipes enemy AoE dealers like Snail or Boomling directly.',
      synergy: 'Hält deine Front frei von Flächenschaden.',
      synergyEn: 'Relieves AoE pressure on your Frontline.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Agent B',
      score: 83,
      reason: 'Schneller Zugriff auf gegnerische Flächen-Schützen.',
      reasonEn: 'Fast backline access to snipe enemy AoE dealers.',
      synergy: 'Mit Front-Blocker kombinieren.',
      synergyEn: 'Combine with a Frontline blocker.',
      nextFigure: 'Ritter'
    }
  ],
  Schutz: [
    {
      name: 'TNT',
      score: 89,
      reason: 'Sprengschaden bricht geschützte Formationen und Türme direkt auf.',
      reasonEn: 'Explosive blast breaks turtled formations and Sentinel Towers open.',
      synergy: 'Stark mit Front-Blockern und Fernkampf.',
      synergyEn: 'Strong with Frontline blockers and Ranged DPS.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Meteorschauer',
      score: 88,
      reason: 'Starker Flächenzauber zerschlägt defensive Schutz-Formationen und Wächtertürme.',
      reasonEn: 'Meteor Shower smashes defensive bunkered formations and Sentinel Towers.',
      synergy: 'Optimal mit TNT oder Merlinor.',
      synergyEn: 'Ideal with TNT or Merlinor.',
      nextFigure: 'Merlinor'
    },
    {
      name: 'Merlinor',
      score: 87,
      reason: 'Konstanter Magieschaden überwindet defensive Aufstellungen.',
      reasonEn: 'Sustained magic damage wears down defensive setups.',
      synergy: 'Hinter Spartheus optimal geschützt.',
      synergyEn: 'Optimally protected behind Spartheus.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Säureexplosion',
      score: 85,
      reason: 'Säure-Zauber weicht geschützte Stellungen und Schilde effektiv auf.',
      reasonEn: 'Acid Burst melts through shielded positions and defensive setups.',
      synergy: 'Gut mit Front-Druck kombinierbar.',
      synergyEn: 'Pairs well with Frontline pressure.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Parasit',
      score: 85,
      reason: 'Übernimmt geschützte Schlüsselfiguren und dreht die Verteidigung um.',
      reasonEn: 'Parasite hijacks protected key units and turns their defense against them.',
      synergy: 'Mit eigener Front absichern.',
      synergyEn: 'Screen with your own Frontline.',
      nextFigure: 'Spartheus'
    },
    {
      name: 'Boomling',
      score: 83,
      reason: 'Flächen-Burst trifft eng beieinander stehende Schutz-Formationen.',
      reasonEn: 'AoE rocket burst punishes tightly bunkered defensive formations.',
      synergy: 'Mit Spartheus kombinieren.',
      synergyEn: 'Pair with Spartheus.',
      nextFigure: 'Spartheus'
    }
  ]
};

export const SYNERGY_CHAINS = [
  {
    pair: ['Spartheus', 'Merlinor'],
    next: 'Ingenieur',
    role: 'Schutz',
    reason: 'Spartheus blockt vorn, Merlinor liefert Schaden – Ingenieur schützt Merlinor zusätzlich vor Hinterreihen-Zugriff.',
    reasonEn: 'Spartheus tanks up front while Merlinor deals DPS – Engineer guards Merlinor against backline dives.'
  },
  {
    pair: ['Bienenkorb', 'Spartheus'],
    next: 'Feensegen',
    role: 'Verstärkung',
    reason: 'Spartheus hält die Linie, während der Bienenkorb viele Einheiten erzeugt, die von Verstärkungen profitieren.',
    reasonEn: 'Spartheus holds the line while Beetank spawns units that scale multiplicatively with Fairy Blessing.'
  },
  {
    pair: ['TNT', 'Spartheus'],
    next: 'Merlinor',
    role: 'Fernkampf',
    reason: 'Nach dem Flächenschaden von TNT räumt Merlinor überlebende Einzelziele hinter Spartheus auf.',
    reasonEn: 'After TNT softens the enemy pack, Merlinor cleans up surviving targets from behind Spartheus.'
  },
  {
    pair: ['Zerstörer', 'Merlinor'],
    next: 'Steinhaut',
    role: 'Schutz',
    reason: 'Steinhaut hält den Zerstörer an der Front länger am Leben, damit Merlinor frei wirken kann.',
    reasonEn: 'Stone Skin keeps Waster alive longer on the Frontline so Merlinor can free-cast.'
  },
  {
    pair: ['Schnecke', 'Ingenieur'],
    next: 'Spartheus',
    role: 'Front',
    reason: 'Schnecke und Ingenieur sichern den Rückraum; Spartheus ergänzt die fehlende Frontlinie.',
    reasonEn: 'Snail and Engineer lock down the backline; Spartheus adds the missing Frontline anchor.'
  },
  {
    pair: ['Drakling', 'Gans'],
    next: 'Feensegen',
    role: 'Verstärkung',
    reason: 'Zwei Schwarm-Karten erzeugen maximale Masse für gruppenweite Verstärkungs-Effekte.',
    reasonEn: 'Whelp + Goose create maximum unit count for team-wide Fairy Blessing buffs.'
  },
  {
    pair: ['Parasit', 'Spartheus'],
    next: 'Boomling',
    role: 'Fläche',
    reason: 'Falls der Gegner auf deinen Parasiten mit Schwärmen reagiert, räumt Boomling diese sofort ab.',
    reasonEn: 'If the enemy counters your Parasite with Swarm troops, Boomling clears them immediately.'
  }
];

export function normalizeCardName(name) {
  if (!name) return '';
  const clean = String(name).trim();
  const lower = clean.toLowerCase();
  if (
    lower === 'bientank' ||
    lower === 'bienen-tank' ||
    lower === 'bienentank' ||
    lower === 'beetank' ||
    lower === 'beetank (hive)'
  ) {
    return 'Bienenkorb';
  }
  if (lower === 'verwüster' || lower === 'waster' || lower === 'waster (destroyer)') {
    return 'Zerstörer';
  }
  return clean;
}

export function findCard(name, customCards = CARDS) {
  if (!name) return { name: '', icon: '🃏', imageUrl: null, role: 'Einheit / Item', strength: 8 };
  const clean = normalizeCardName(name);
  const lower = clean.toLowerCase();

  const exact = customCards.find((c) => {
    if (c.name.toLowerCase() === lower) return true;
    const enFull = (EN_CARD_NAMES[c.name] || '').toLowerCase();
    const enBase = enFull.replace(/\s*\([^)]*\)/g, '').trim();
    return enFull === lower || enBase === lower;
  });

  if (exact) {
    return {
      ...exact,
      imageUrl: exact.imageUrl || CARD_IMAGES[exact.name] || null
    };
  }
  return {
    name: clean,
    icon: '🎯',
    imageUrl: CARD_IMAGES[clean] || null,
    role: 'Einheit / Item',
    strength: 8,
    owned: true,
    inDeck: true,
    inSelection: true
  };
}

/**
 * Berechnet sofort und ohne KI-Wartezeit das Ranking aus der gespeicherten Datenbank (dbEntries)
 * kombiniert mit Community-Bewertungen (good_votes / bad_votes), dem gewählten 3-Stufen-Filter
 * ('all' | 'deck' | 'selection') und den hinterlegten eigenen Spielstärken.
 */
export function buildDatabaseAdvice({
  enemyItems = [],
  myPicks = [],
  dbEntries = [],
  userCards = CARDS,
  filterScope = 'all',
  unitScope,
  spellScope,
  lang = 'de'
}) {
  const isEn = lang === 'en';
  const effectiveUnitScope = unitScope || filterScope || 'all';
  const effectiveSpellScope = spellScope || filterScope || 'all';

  const cardMap = new Map(userCards.map((c) => [c.name.toLowerCase(), c]));
  const allowedByFilter = (itemName) => {
    const c = cardMap.get(String(itemName).toLowerCase());
    if (!c) return true;
    const activeScope = c.kind === 'spell' ? effectiveSpellScope : effectiveUnitScope;
    if (activeScope === 'deck') return Boolean(c.inDeck);
    if (activeScope === 'selection') return Boolean(c.inSelection);
    return true;
  };

  const merged = new Map();

  enemyItems.forEach((enemyName) => {
    const enemyCard = findCard(enemyName, userCards);
    const enemyDisp = getCardDisplayName(enemyName, lang);
    const matchingDb = dbEntries.filter(
      (e) => normalizeCardName(e.enemy_item).toLowerCase() === String(enemyName).toLowerCase()
    );

    const roleFallbacks =
      ROLE_COUNTER_MATRIX[enemyCard.role] || ROLE_COUNTER_MATRIX.Front;

    const combinedSources = [
      ...matchingDb.map((e) => {
        const canonicalReaction = normalizeCardName(e.reaction_item);
        const fb = roleFallbacks.find(
          (f) => f.name.toLowerCase() === canonicalReaction.toLowerCase()
        );
        return {
          id: e.id,
          enemy_item: normalizeCardName(e.enemy_item),
          name: canonicalReaction,
          role: e.role || findCard(canonicalReaction, userCards).role,
          baseScore: Number(e.base_score || 84),
          reason: isEn
            ? fb?.reasonEn || localizeTacticalText(e.reason, 'en')
            : e.reason,
          synergyNote: isEn
            ? fb?.synergyEn || localizeTacticalText(e.synergy_note || 'Kombiniere mit stabiler Front oder Fernkampf.', 'en')
            : e.synergy_note || 'Kombiniere mit stabiler Front oder Fernkampf.',
          nextFigure: normalizeCardName(e.next_figure || 'Spartheus'),
          uncertainty: isEn
            ? localizeTacticalText(e.uncertainty || 'Datenbank-Einschätzung · Community-Heuristik', 'en')
            : e.uncertainty || 'Datenbank-Einschätzung · Community-Heuristik',
          sourceLabel: e.source_label || (isEn ? 'Community DB' : 'Community-Datenbank'),
          goodVotes: Number(e.good_votes || 0),
          badVotes: Number(e.bad_votes || 0),
          fromDb: true
        };
      }),
      ...roleFallbacks
        .filter(
          (f) =>
            !matchingDb.some(
              (m) => normalizeCardName(m.reaction_item).toLowerCase() === f.name.toLowerCase()
            )
        )
        .map((f) => ({
          id: null,
          enemy_item: enemyName,
          name: f.name,
          role: findCard(f.name, userCards).role,
          baseScore: f.score,
          reason: isEn
            ? `${f.reasonEn} (vs. ${enemyDisp})`
            : `${f.reason} (Gegen ${enemyName})`,
          synergyNote: isEn ? f.synergyEn : f.synergy,
          nextFigure: f.nextFigure || 'Spartheus',
          uncertainty: isEn
            ? 'Instant Database · Role Counter Heuristic'
            : 'Sofort-Datenbank · Rollen-Heuristik',
          sourceLabel: isEn ? 'Community Base' : 'Community-Basis',
          goodVotes: 3,
          badVotes: 0,
          fromDb: false
        }))
    ];

    userCards.forEach((uc) => {
      if (uc.name.toLowerCase() === String(enemyName).toLowerCase()) return;
      if (!combinedSources.some((s) => s.name.toLowerCase() === uc.name.toLowerCase())) {
        const roleDisp = getRoleDisplayName(uc.role, lang);
        combinedSources.push({
          id: null,
          enemy_item: enemyName,
          name: uc.name,
          role: uc.role,
          baseScore: 74,
          reason: isEn
            ? `Flexible roster option vs. ${enemyDisp} (${roleDisp}).`
            : `Flexibler Einsatz aus deinem Bestand gegen ${enemyName} (${uc.role}).`,
          synergyNote: isEn
            ? 'Keep a balanced Frontline and Backline formation.'
            : 'Achte auf ausgewogene Front- und Rückraum-Aufteilung.',
          nextFigure: uc.role === 'Front' ? 'Merlinor' : 'Spartheus',
          uncertainty: isEn
            ? 'Role Estimate · Limited Community Data'
            : 'Rollenschätzung · noch wenige Community-Daten',
          sourceLabel: isEn ? 'Roster Base' : 'Katalog-Basis',
          goodVotes: 1,
          badVotes: 0,
          fromDb: false
        });
      }
    });

    combinedSources.forEach((item) => {
      if (!allowedByFilter(item.name)) return;
      const userCard = findCard(item.name, userCards);
      const strength = Number(userCard.strength ?? userCard.orange ?? 8);
      const strengthDelta = Math.max(-4, Math.min(6, Math.round((strength - 8) * 1.2)));
      const netVotes = item.goodVotes - item.badVotes;
      const communityBonus = Math.max(-8, Math.min(8, Math.round(netVotes * 0.6)));
      const hasSynergy = myPicks.some((p) =>
        SYNERGY_CHAINS.some((s) => s.pair.includes(p) && s.pair.includes(item.name))
      );
      const synergyBonus = hasSynergy ? 4 : 0;

      const finalScore = Math.max(
        40,
        Math.min(99, item.baseScore + strengthDelta + communityBonus + synergyBonus)
      );

      const prev = merged.get(item.name);
      if (!prev || finalScore > prev.score) {
        merged.set(item.name, {
          ...item,
          strength,
          strengthDelta,
          communityBonus,
          score: finalScore
        });
      }
    });
  });

  const sorted = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));

  const activeContext = myPicks.length
    ? myPicks
    : sorted[0]
    ? [sorted[0].name]
    : ['Spartheus'];

  const synergies = [];
  SYNERGY_CHAINS.forEach((chain) => {
    if (chain.pair.some((p) => activeContext.includes(p))) {
      synergies.push({
        title: chain.pair.map((n) => getCardDisplayName(n, lang)).join(' + '),
        combination: [...chain.pair, chain.next],
        explanation: isEn ? chain.reasonEn : chain.reason
      });
    }
  });

  if (!synergies.length) {
    const firstDisp = getCardDisplayName(activeContext[0], lang);
    synergies.push({
      title: isEn
        ? `${firstDisp} + Frontline / Ranged Core`
        : `${activeContext[0]} + Front-/Fernkampf-Kombination`,
      combination: [activeContext[0], 'Spartheus', 'Merlinor'],
      explanation: isEn
        ? 'Pair your counter pick with a sturdy Frontline (Spartheus) and Ranged DPS (Merlinor).'
        : 'Kombiniere deine Reaktion mit einer stabilen Front (Spartheus) und Rückraum-Schaden (Merlinor).'
    });
  }

  const pickedLower = new Set(myPicks.map((p) => p.toLowerCase()));
  const nextFigures = [];

  sorted.forEach((r) => {
    if (
      r.nextFigure &&
      !pickedLower.has(r.nextFigure.toLowerCase()) &&
      allowedByFilter(r.nextFigure) &&
      !nextFigures.some((n) => n.name === r.nextFigure)
    ) {
      const nfCard = findCard(r.nextFigure, userCards);
      const rDisp = getCardDisplayName(r.name, lang);
      nextFigures.push({
        name: nfCard.name,
        role: nfCard.role,
        reason: isEn
          ? `Recommended follow-up with ${rDisp}: ${r.synergyNote}`
          : `Empfohlene Ergänzung zu ${r.name}: ${r.synergyNote}`,
        unlocksSynergyWith: r.name,
        uncertainty: isEn ? 'Database Synergy · Estimate' : 'Datenbank-Synergie · Schätzung'
      });
    }
  });

  SYNERGY_CHAINS.forEach((chain) => {
    const matchedPick = activeContext.find((p) => chain.pair.includes(p));
    if (
      matchedPick &&
      !pickedLower.has(chain.next.toLowerCase()) &&
      allowedByFilter(chain.next) &&
      !nextFigures.some((n) => n.name === chain.next)
    ) {
      nextFigures.push({
        name: chain.next,
        role: chain.role,
        reason: isEn ? chain.reasonEn : chain.reason,
        unlocksSynergyWith: matchedPick,
        uncertainty: isEn ? 'Community Synergy · Estimate' : 'Community-Synergie · Schätzung'
      });
    }
  });

  userCards
    .filter((c) => allowedByFilter(c.name) && !pickedLower.has(c.name.toLowerCase()))
    .slice(0, 4)
    .forEach((c) => {
      if (nextFigures.length < 3 && !nextFigures.some((n) => n.name === c.name)) {
        const roleDisp = getRoleDisplayName(c.role, lang);
        nextFigures.push({
          name: c.name,
          role: c.role,
          reason: isEn
            ? `Strong ${roleDisp} follow-up (Lv. ${c.strength || 8}) for your next draft pick.`
            : `Starke ${c.role}-Ergänzung (Stärke ${c.strength || 8}) für deinen nächsten Pick.`,
          unlocksSynergyWith: activeContext[0] || (isEn ? 'Your Draft' : 'Deinem Draft'),
          uncertainty: isEn ? 'Roster Recommendation' : 'Bestands-Empfehlung'
        });
      }
    });

  const formatScope = (s) => {
    if (isEn) {
      return s === 'deck' ? 'Collection' : s === 'selection' ? 'Loadout' : 'All';
    }
    return s === 'deck' ? 'Sammlung' : s === 'selection' ? 'Aufstellung' : 'Alle';
  };

  const scopeSummary =
    effectiveUnitScope === effectiveSpellScope
      ? formatScope(effectiveUnitScope)
      : isEn
      ? `Units: ${formatScope(effectiveUnitScope)} · Spells: ${formatScope(effectiveSpellScope)}`
      : `Einheiten: ${formatScope(effectiveUnitScope)} · Zauber: ${formatScope(effectiveSpellScope)}`;

  const enemyNamesDisp = enemyItems.map((n) => getCardDisplayName(n, lang)).join(', ');

  return {
    summaryTip: enemyItems.length
      ? isEn
        ? `Instant database ranking vs. ${enemyNamesDisp} (${scopeSummary}) factoring in community votes & your card levels.`
        : `Sofort-Ranking aus der Datenbank gegen ${enemyItems.join(', ')} (${scopeSummary}) inkl. Community-Bewertungen & deinen Spielstärken.`
      : isEn
      ? 'Select an enemy unit or spell above for instant database counter rankings.'
      : 'Wähle oben eine gegnerische Einheit oder einen Zauber für das sofortige Datenbank-Ranking.',
    reactionRanking: sorted,
    synergies: synergies.slice(0, 3),
    nextFigureRecommendations: nextFigures.slice(0, 3)
  };
}
