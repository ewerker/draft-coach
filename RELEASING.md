# Versions- und Releaseablauf

Laufende Änderungen werden auf `main` committet und nach GitHub übertragen. Sie erhalten erst eine Versionsnummer, wenn der Projektinhaber den Stand ausdrücklich als Release bezeichnet.

Der Projektinhaber legt die Versionsnummer ausdrücklich fest. Die aktuelle Beta lautet **0.7.8**, Git-Tag **`v0.7.8`**. Zwischenstände erhöhen nur die Build-Nummer. Der GitHub Release verweist auf den freigegebenen Commit und beschreibt die Änderungen seit dem letzten Release.

Öffentliche Beispielscreenshots dürfen das Spiel und die aktive Aufstellung zeigen. Vor der Veröffentlichung auf Spielernamen, Kontodaten, Geräteadressen und Zugangsdaten prüfen. Private Laufzeitdaten und Sicherungen bleiben außerhalb des öffentlichen Repositorys.

## Release workflow in English

Commit ongoing work to `main` and push it to GitHub. Assign a version only when the project owner explicitly designates a release and version. The current beta is **0.7.8**, tag **`v0.7.8`**. Interim updates increase only the build number. Review public screenshots for private information. Gameplay and active lineups may be shown.

## Build identity for a local installation

A Git checkout reports its commit count and short commit ID when the server starts. After committing and synchronizing a separate installation, run `node stamp-build.mjs <installation-directory>` from this checkout before restarting that installation. The stamp records the committed identity in its ignored `runtime/build-info.json`; it must only be stamped after the installation files have been synchronized. The stamp checks installed program files and explicitly marks local differences. An unstamped copy reports an unknown build rather than guessing.
