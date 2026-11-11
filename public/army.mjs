import {displayNames} from './language.mjs';
const copy={de:{own:'Eigene Aufstellung',enemy:'Gegnerische Aufstellung',upper:'Oberer Spielfeldbereich',lower:'Unterer Spielfeldbereich',
  unknown:'Keine Figur in diesem Bild sicher erkannt.',stockUnknown:'Bestand noch offen.',image:'Bildtreffer der letzten Aufnahme',ownChoices:'aus Wahlen geschätzt',enemyChoices:'aus Gegnerzügen geschätzt',minimum:'sichtbar mindestens',countUnknown:'Gesamtzahl unbekannt',form:'Ausbau unbekannt',
  waiting:'Noch keine getrennte Truppenbeobachtung.',stale:'Ältere Beobachtung',candidate:'Kandidat',repeated:'aufeinanderfolgende Bilder',
  warning:'Geeignete Aufstellungsbilder ergänzen die gespeicherte Aufstellung.',combat:'Während des Kampfes können sich beide Seiten im selben Bildbereich befinden.',
  conflict:'Widerspruch zum bekannten Deck',action:'Mehr sichtbar als aus sicher erfassten Hinzufügungen: Verdopplung, Eingriff oder Zählabweichung möglich.',
  labels:'Stufe / Sterne',partial:'Analyse hat ihr Zeitbudget erreicht; Ergebnis unvollständig.',error:'Truppenanalyse pausiert nach einem Fehler; Kartenerkennung läuft weiter.'},
 en:{own:'Your formation',enemy:'Enemy formation',upper:'Upper battlefield area',lower:'Lower battlefield area',
  unknown:'No unit identified in this image.',stockUnknown:'Formation still unknown.',image:'Sightings in the latest capture',ownChoices:'estimated from choices',enemyChoices:'estimated from enemy moves',minimum:'at least visible',countUnknown:'Total unknown',form:'Evolution unknown',waiting:'No separate army observation yet.',
  stale:'Earlier observation',candidate:'Candidate',repeated:'consecutive frames',warning:'Eligible formation sightings supplement the remembered formation.',
  combat:'During combat, units from either side can occupy the same area.',conflict:'Conflicts with the known deck',
  action:'More visible than safely recorded additions suggest: doubling, manual intervention or a counting error is possible.',labels:'Level / stars',partial:'Analysis reached its time budget; incomplete result.',
  error:'Army analysis paused after an error; card recognition remains available.'}};
export function renderArmy(root,observation,status,language,stock,now=Date.now()){
  const t=copy[language],el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  const showImage=root.querySelector('details')?.open??false;
  root.replaceChildren();
  if(status?.error)root.append(el('p',t.error,'muted'));
  if(stock?.finished)root.append(el('p',(language==='en'?'Last match':'Letzte Partie')+' · #'+stock.matchId.slice(0,8),'muted'));
  if(stock)for(const side of ['enemy','own']){
    const section=el('section','','army-side');
    section.append(el('h4',t[side]));
    if(!stock[side].length)section.append(el('p',t.stockUnknown,'muted'));
    for(const row of stock[side]){
      const source=row.source==='formation'?t.minimum:side==='own'?t.ownChoices:t.enemyChoices;
      const count=row.source==='formation'?'≥'+row.count:'≈'+row.count;
      section.append(el('p',`${displayNames(row.name,language)} · ${count} · ${source}`));
    }
    root.append(section);
  }
  if(!observation){root.append(el('p',t.waiting,'muted'));return;}
  const image=el('details','');image.open=showImage;
  image.append(el('summary',t.image));
  const age=Math.max(0,now-observation.capturedAt),stale=age>6000;
  image.append(el('p',`${stale?t.stale:t.candidate} · #${observation.frameId} · ${new Date(observation.capturedAt).toLocaleTimeString(language==='en'?'en-GB':'de-DE')} · ${observation.elapsedMs??'—'} ms`,'muted'));
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
    image.append(section);
  }
  image.append(el('p',combat?t.combat:t.warning,'muted'));
  root.append(image);
}
