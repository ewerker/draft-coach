// Descriptive evidence, not causal proof or automatic weight adjustment.
export function ruleEvidence(games, clicks, rules){
  const titles=new Map();
  for(const rule of rules){
    for(const title of new Set([rule.title,rule.texts?.de?.title,rule.texts?.en?.title].filter(Boolean))){
      const ids=titles.get(title)??new Set();ids.add(rule.id);titles.set(title,ids);
    }
  }
  const byCapture=new Map();
  for(const click of clicks){
    if(click.ergebnis!=='gesendet'||!Number.isSafeInteger(click.aufnahme)||!click.karte)continue;
    const entries=byCapture.get(click.aufnahme)??[];entries.push(click);byCapture.set(click.aufnahme,entries);
  }
  const ruleIds=new Set(rules.map(rule=>rule.id));
  const results=new Map(rules.map(rule=>[rule.id,{id:rule.id,wins:0,losses:0,other:0,decisions:0,examples:[]}]));
  for(const game of games){
    const perGame=new Map();
    for(const frame of game.reviewFrames??[]){
      for(const click of byCapture.get(frame.id)??[]){
        const time=Date.parse(click.zeit);
        if(!Number.isFinite(time)||time<game.started||time>game.ended||click.partie&&click.partie!==game.id)continue;
        const candidates=(frame.advice?.evaluated??[]).filter(e=>e.name===click.karte&&
          (!Number.isInteger(click.position)||e.index===click.position-1));
        if(candidates.length!==1)continue;
        for(const used of candidates[0].rules??[]){
          let id=used.id;
          if(!id){const matches=titles.get(used.title);if(matches?.size===1)id=[...matches][0];}
          if(!ruleIds.has(id))continue;
          const usage=perGame.get(id)??{decisions:new Set(),examples:[]};
          if(!usage.decisions.has(frame.id)){usage.decisions.add(frame.id);usage.examples.push({matchId:game.id,capture:frame.id,outcome:game.outcome,ended:game.ended});}
          perGame.set(id,usage);
        }
      }
    }
    for(const [id,usage] of perGame){
      const result=results.get(id);
      result[game.outcome==='gewonnen'?'wins':game.outcome==='verloren'?'losses':'other']++;
      result.decisions+=usage.decisions.size;
      result.examples.push(...usage.examples);
    }
  }
  for(const row of results.values()){
    row.examples=row.examples.sort((a,b)=>b.ended-a.ended).slice(0,8);
    row.signal=row.wins+row.losses>=3&&row.losses>=2&&row.losses>row.wins?'review':
      row.wins>=3&&row.wins>row.losses*2?'positive':'insufficient';
  }
  return [...results.values()];
}
