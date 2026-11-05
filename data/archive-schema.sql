CREATE TABLE partien (
 id TEXT PRIMARY KEY, modus TEXT NOT NULL, coach_modus TEXT, ergebnis TEXT NOT NULL,
 beginn_ms INTEGER NOT NULL, ende_ms INTEGER NOT NULL, aufnahmezahl INTEGER NOT NULL,
 aufnahme_ids_json TEXT, quelle TEXT NOT NULL, notiz TEXT NOT NULL
);

CREATE TABLE klickprotokoll (
 id INTEGER PRIMARY KEY, partie_id TEXT NOT NULL REFERENCES partien(id),
 aufnahme INTEGER NOT NULL, zeit TEXT NOT NULL, art TEXT NOT NULL,
 karte TEXT, ergebnis TEXT NOT NULL, details_json TEXT NOT NULL
);

CREATE TABLE belege (
 aufnahme INTEGER PRIMARY KEY, partie_id TEXT NOT NULL REFERENCES partien(id),
 titel TEXT NOT NULL, quellbild TEXT NOT NULL, ausschnitt_json TEXT, breite INTEGER NOT NULL,
 hoehe INTEGER NOT NULL, mime TEXT NOT NULL, sha256 TEXT NOT NULL, bild BLOB NOT NULL
);

CREATE TABLE erkenntnisse (
 id TEXT PRIMARY KEY, gilt_fuer TEXT NOT NULL, belegstand TEXT NOT NULL, coach_stand TEXT NOT NULL,
 titel TEXT NOT NULL, beobachtung TEXT NOT NULL, details_json TEXT NOT NULL
);

CREATE TABLE erkenntnis_beleg (
 erkenntnis_id TEXT NOT NULL REFERENCES erkenntnisse(id),
 aufnahme INTEGER NOT NULL REFERENCES belege(aufnahme),
 reihenfolge INTEGER NOT NULL,
 PRIMARY KEY(erkenntnis_id, aufnahme)
);

CREATE TABLE partie_protokoll (
          partie_id TEXT PRIMARY KEY REFERENCES partien(id), details_json TEXT NOT NULL
        );
