// Only a complete, confident header may replace the previously saved lineup.
export function collectionLineup(images, kind, previous, expected) {
  const relevant=images.filter(image=>image.kind===kind);
  const complete=relevant.map(image=>image.lineup||[]).filter(cards=>
    cards.length===expected && cards.every(card=>card.name && card.score>=0.8) &&
    new Set(cards.map(card=>card.name)).size===expected &&
    new Set(cards.map(card=>card.x)).size===expected);
  if(!complete.length)return {chosen:previous, incomplete:relevant.length>0, conflict:false};
  const latest=complete.at(-1).map(card=>card.name);
  return {chosen:latest,incomplete:false,conflict:complete.some(cards=>cards.map(card=>card.name).join('\0')!==latest.join('\0'))};
}
