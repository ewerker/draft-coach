import {displayNames} from './language.mjs';
const copy={de:{title:'Truppenbeobachtung · Pilot',own:'Eigene Aufstellung',enemy:'Gegnerische Aufstellung',upper:'Oberer Spielfeldbereich',lower:'Unterer Spielfeldbereich',
  unknown:'Keine Figur sicher zugeordnet; Bestand unbekannt.',minimum:'sichtbar mindestens',countUnknown:'Gesamtzahl unbekannt',form:'Ausbau unbekannt',
  waiting:'Noch keine getrennte Truppenbeobachtung.',stale:'Ältere Beobachtung',candidate:'Kandidat',repeated:'aufeinanderfolgende Bilder',
  warning:'Experimentelle Bildschätzung. Noch nicht für die Tippberechnung freigegeben.',combat:'Im Kampf beweist die Position keine Zugehörigkeit. Diese Zahlen ersetzen nicht die letzte Aufstellung.',
  conflict:'Widerspruch zum bekannten Deck',action:'Mehr sichtbar als aus sicher erfassten Hinzufügungen: Verdopplung, Eingriff oder Zählabweichung möglich.',
  labels:'Stufe / Sterne',partial:'Analyse hat ihr Zeitbudget erreicht; Ergebnis unvollständig.',error:'Truppenanalyse pausiert nach einem Fehler; Kartenerkennung läuft weiter.'},
 en:{title:'Army observation · pilot',own:'Your formation',enemy:'Enemy formation',upper:'Upper battlefield area',lower:'Lower battlefield area',
  unknown:'No unit confidently assigned; forces unknown.',minimum:'at least visible',countUnknown:'Total unknown',form:'Evolution unknown',waiting:'No separate army observation yet.',
  stale:'Earlier observation',candidate:'Candidate',repeated:'consecutive frames',warning:'Experimental image estimate. Not approved for recommendations yet.',
  combat:'During combat, position does not prove ownership. These figures do not replace the last formation.',conflict:'Conflicts with the known deck',
  action:'More visible than safely recorded additions suggest: doubling, manual intervention or a counting error is possible.',labels:'Level / stars',partial:'Analysis reached its time budget; incomplete result.',
  error:'Army analysis paused after an error; card recognition remains available.'}};
export function renderArmy(root,observation,status,language,now=Date.now()){
  const t=copy[language],el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  root.replaceChildren();
  if(status?.error)root.append(el('p',t.error,'muted'));
  if(!observation){root.append(el('p',t.waiting,'muted'));return;}
  const age=Math.max(0,now-observation.capturedAt),stale=age>6000;
  root.append(el('p',`${stale?t.stale:t.candidate} · #${observation.frameId} · ${new Date(observation.capturedAt).toLocaleTimeString(language==='en'?'en-GB':'de-DE')} · ${observation.elapsedMs??'—'} ms`,'muted'));
  const combat=observation.context!=='formation';
  for(const side of ['enemy','own']){
    const data=observation.sides[side],label=combat?(side==='enemy'?t.upper:t.lower):(side==='enemy'?t.enemy:t.own);
    const section=el('section','','army-side');section.append(el('h4',label));
    if(!data.groups.length)section.append(el('p',t.unknown,'muted'));
    for(const group of data.groups){
      section.append(el('p',`${displayNames(group.name,language)} · ${t.minimum} ${group.visibleMinimum} · ${t.countUnknown}`));
      const forms=group.forms.map(f=>`${f.stage}: ≥${f.visibleMinimum}`).join(', ');
      section.append(el('p',`${forms?`${language==='en'?'Reported evolution':'Angegebener Ausbau'} ${forms}`:t.form} · ${t.labels} ${group.level??'?'}/${group.stars??'?'} · ${group.observedConsecutively} ${t.repeated}`,'muted'));
      if(group.poolConflict)section.append(el('p',t.conflict,'army-warning'));
      if(group.actionCountConflict)section.append(el('p',t.action,'army-warning'));
    }
    if(data.truncated)section.append(el('p',t.partial,'army-warning'));
    root.append(section);
  }
  root.append(el('p',combat?t.combat:t.warning,'muted'));
}
