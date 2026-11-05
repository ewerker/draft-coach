// Ephemeral question/answer flow. No match state and no persistence.
export function getSimplePool(cards, mode) {
  return cards.filter(c => (c.kind === 'spell' ? Boolean(c.inSelection) : mode === 'arena' ? Boolean(c.inDeck) : Boolean(c.inSelection)));
}
export function parseSimpleCommand(text) {
  const raw = String(text || '').trim();
  const reset = /\b(?:start|starte|starten|startet|spiel\s*start|spiel\s*starten|neues\s+spiel|start\s+game)\b/i.test(raw);
  const stop = /\b(?:spiel\s*ende|ende\s+spiel|spiel\s*stopp|(?:stop|end)\s+game|game\s+over)\b/i.test(raw);
  const help = /\b(?:hilf\s+mir|hilfmir|hilfe|help\s+me|help)\b/i.test(raw);
  const clean = value => value
    .replace(/\b(?:start|starte|starten|startet|spiel\s*start|spiel\s*starten|neues\s+spiel|start\s+game|hilf\s+mir|hilfmir|hilfe|help\s+me|help)\b/ig, ' ')
    .replace(/\b(?:erstes?|erstens|zweites?|zweitens|drittes?|drittens|viertes?|viertens|item|items|einheit|einheiten|und|hat|has|der|die|das)\b/ig, ' ').trim();
  // "Gegner" names the enemies, "Gegner hat" adds what stands on their board, "Ich habe" marks your own cards.
  const marker = /\b(?:gegner\s+hat|(?:enemy|opponent)\s+has|ich\s+habe|i\s+have|gegner|opponent|enemy)\b|^\s*(?:hat|has)\b/ig;
  const marks = [...raw.matchAll(marker)];
  const segments = [];
  if (!marks.length) segments.push({ target: null, text: clean(raw), replace: false });
  else {
    if (marks[0].index > 0) segments.push({ target: null, text: clean(raw.slice(0, marks[0].index)), replace: false });
    marks.forEach((match, i) => {
      const own = /\b(?:ich\s+habe|i\s+have)\b/i.test(match[0]);
      const board = !own && /\b(?:hat|has)\b/i.test(match[0]);
      segments.push({
        target: own ? 'own' : board ? 'board' : 'query',
        replace: !board && !own,
        text: clean(raw.slice(match.index + match[0].length, marks[i + 1]?.index ?? raw.length))
      });
    });
  }
  return { reset, stop, help, segments };
}

export function advanceSimpleQuestion(previous, command, extractNames) {
  const empty = () => ({ query: [], board: [], own: [], target: 'query', pendingEnemy: false });
  if (command.stop) return empty();
  let next = command.reset
    ? empty()
    : { query: [...previous.query], board: [...previous.board], own: [...(previous.own || [])], target: previous.target || 'query', pendingEnemy: Boolean(previous.pendingEnemy) };
  for (const segment of command.segments) {
    const names = extractNames(segment.text);
    if (segment.replace) {
      // Defer an isolated "Gegner": the next speech fragment may be "hat …".
      if (!names.length) { next.pendingEnemy = true; continue; }
      next = { ...empty(), own: [...next.own] };
    }
    if (segment.target === 'board' || segment.target === 'own') next.pendingEnemy = false;
    else if (next.pendingEnemy && names.length) next = { ...empty(), own: [...next.own] };
    if (segment.target) next.target = segment.target;
    const limit = next.target === 'query' ? 4 : Infinity;
    next[next.target] = [...new Set([...(next[next.target] || []), ...names])].slice(0, limit);
  }
  if (command.help && next.pendingEnemy) return empty();
  return next;
}
export function rankSimpleCounters({enemyItems,enemyBoardItems=[],ownItems=[],cards,mode,dbEntries=[],lang='de',buildAdvice}) {
  enemyItems = [...new Set([...enemyItems, ...enemyBoardItems])];
  const own=new Set(ownItems.map(name=>String(name).toLowerCase()));
  const pool=getSimplePool(cards,mode).filter(card=>!own.has(card.name.toLowerCase()));
  if(!enemyItems.length)return [];
  const scored=pool.map(candidate=>{
    // Preserve shared engine / deep-analysis behavior: constrain a private copy.
    const scoped=cards.map(c=>({...c,inSelection:c.name===candidate.name,inDeck:c.name===candidate.name}));
    const scores=enemyItems.map(enemy=>{
      const advice=buildAdvice({enemyItems:[enemy],myPicks:[],userCards:scoped,dbEntries,unitScope:'selection',spellScope:'selection',lang});
      return advice.reactionRanking.find(r=>r.name===candidate.name)?.score??40;
    });
    const average=scores.reduce((a,b)=>a+b,0)/scores.length;
    return {...candidate,score:average*.75+Math.min(...scores)*.25};
  }).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  return [...scored.filter(c=>c.kind==='unit').slice(0,3),...scored.filter(c=>c.kind==='spell').slice(0,1)];
}
