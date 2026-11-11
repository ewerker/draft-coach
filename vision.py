"""Offline visual prototype. One JSON request/response per line; no network calls."""
import sys, os, json, time, traceback
import base64
import hashlib
from collections import OrderedDict
from pathlib import Path
ROOT = Path(__file__).resolve().parent
import cv2
import numpy as np
import vision_english
cv2.setNumThreads(2)
IMAGES = ROOT / 'references'
CANON = {'Verwüster':'Zerstörer', 'Bientank':'Bienenkorb'}
templates = []
numbers = []
REFERENCE_WIDTH = 1080
REFERENCE_HEIGHT = 2340
REFERENCE_RATIO = REFERENCE_WIDTH / REFERENCE_HEIGHT

def decode(path):
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None: raise ValueError('Bild nicht lesbar')
    return img

def load(path, with_geometry=False):
    img = decode(path)
    h,w = img.shape[:2]
    geometry = screen_geometry(img)
    if geometry is None:
        raise ValueError(f'Für {w} × {h} Pixel wurde kein passender Spielbereich gefunden.')
    normalized = normalize_screen(img,geometry['content'])
    return (normalized,geometry) if with_geometry else normalized

def normalize_screen(img, content):
    x,y,cw,ch = content
    return cv2.resize(img[y:y+ch,x:x+cw], (REFERENCE_WIDTH,REFERENCE_HEIGHT),
                      interpolation=cv2.INTER_AREA if cw>=REFERENCE_WIDTH else cv2.INTER_LINEAR)

def screen_geometry(img):
    height,width = img.shape[:2]
    if height<=width:
        return None
    content = [0,0,width,height]
    layout = 'full'
    if abs(width/height-REFERENCE_RATIO)>.02:
        # Only trim solid black margins that touch an outside edge.
        dark = img.max(axis=2)<=12
        # Determine content bounds from rows and columns with visible game pixels.
        rows = np.flatnonzero((~dark).mean(axis=1)>.02)
        columns = np.flatnonzero((~dark).mean(axis=0)>.02)
        if not len(rows) or not len(columns):
            return None
        x,y = int(columns[0]),int(rows[0])
        right,bottom = int(columns[-1])+1,int(rows[-1])+1
        cw,ch=right-x,bottom-y
        bands=(img[:y],img[bottom:],img[:,:x],img[:,right:])
        if cw and ch and abs(cw/ch-REFERENCE_RATIO)<=.012 and any(band.size for band in bands) and all(
                not band.size or np.mean(band.max(axis=2)<=12)>=.995 for band in bands):
            content=[x,y,cw,ch]
            layout='black-margins'
        elif width/height>REFERENCE_RATIO:
            # Wider portrait screens may keep the choice panel centered at the same scale.
            cw=round(height*REFERENCE_RATIO)
            content=[(width-cw)//2,0,cw,height]
            if not has_centered_layout(normalize_screen(img,content)):
                return None
            layout='centered'
        else:
            return None
    return {'width':width,'height':height,'content':content,
            'referenceWidth':REFERENCE_WIDTH,'referenceHeight':REFERENCE_HEIGHT,'layout':layout}

def cut(img,box):
    x1,y1,x2,y2 = map(int,box)
    return img[y1:y2,x1:x2]

def normalize(mask, size=56):
    ys,xs = np.where(mask>0)
    if len(xs)<8: return np.zeros((size,size),np.float32)
    mask = mask[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h,w = mask.shape
    ratio = (size-6)/max(h,w)
    scaled = cv2.resize(mask, (max(1,round(w*ratio)),max(1,round(h*ratio))),interpolation=cv2.INTER_AREA)
    out = np.zeros((size,size),np.float32)
    y,x=(size-scaled.shape[0])//2,(size-scaled.shape[1])//2
    out[y:y+scaled.shape[0],x:x+scaled.shape[1]] = scaled/255
    return out

def feature(roi):
    # In-game drawings have dark outlines. Background/card decoration is excluded.
    dark = (roi.max(axis=2)<100).astype(np.uint8)*255
    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark)
    keep=np.zeros_like(dark)
    if n>1:
        largest=max(stats[1:,cv2.CC_STAT_AREA])
        for k in range(1,n):
            if stats[k,cv2.CC_STAT_AREA]>=max(20,largest*.06): keep[labels==k]=255
    return normalize(keep)

def digit_feature(roi):
    b,g,r=cv2.split(roi)
    white=((roi.min(axis=2)>175)&((roi.max(axis=2).astype(int)-roi.min(axis=2))<65)).astype(np.uint8)*255
    n,labels,stats,_=cv2.connectedComponentsWithStats(white)
    clean=np.zeros_like(white)
    for k in range(1,n):
        x,y,w,h,area=stats[k]
        if area>=5 and h>=roi.shape[0]*.28 and w<roi.shape[1]*.95: clean[labels==k]=255
    return normalize(clean,40)

def similarity(a,b):
    den=np.linalg.norm(a)*np.linalg.norm(b)
    return float(np.sum(a*b)/den) if den else 0.

def add_template(img,name,box,source):
    roi=cut(img,box)
    templates.append({'name':CANON.get(name,name),'feature':feature(roi),'source':source})

def add_digit(img,value,box):
    numbers.append((value,digit_feature(cut(img,box))))

def prepare():
    p1=load(IMAGES/'einheiten-teil-1.png')
    rows=[(['Spinne','Agent B','Verwüster','Merlinor'],450,603,[5,7,8,10],[9,10,10,11],385,710),
          (['Ritter','Kupid','Gans','TNT'],900,1065,[5,7,4,9],[10,11,10,11],852,1175),
          (['Schnecke','Assassine','Splime','Königlop'],1280,1468,[8,10,5,8],[10,11,10,10],1252,1576),
          (['Verwüster','Ingenieur','Maulwurf','Bientank'],1680,1860,[8,7,7,6],[10,11,11,10],1655,1975)]
    for names,y1,y2,blue,orange,by,oy in rows:
        for c,name in enumerate(names):
            x=22+c*260
            add_template(p1,name,[x+26,y1,x+225,y2],'Sammlung 1')
            add_digit(p1,blue[c],[x+213,by-21,x+255,by+22])
            add_digit(p1,orange[c],[x+6,oy-24,x+63,oy+25])
    p2=load(IMAGES/'einheiten-teil-2.png')
    for names,y1,y2 in [(['Schildling','Merlinor','Parasit','Sniper'],970,1148),(['Blutrebe','Spartheus','Sixshoot','Totem'],1360,1548),(['Boomling','Obergeist','Drakling','Agent B'],1750,1940)]:
        for c,name in enumerate(names):
            x=22+c*260; add_template(p2,name,[x+25,y1,x+225,y2],'Sammlung 2')
    p3=load(IMAGES/'einheiten-teil-3.png')
    for c,name in enumerate(['Spinne','Kapitän','Astra']):
        x=22+c*260
        add_template(p3,name,[x+24,1655,x+230,1840],'Sammlung 3')
        add_digit(p3,[5,10,1][c],[x+213,1616-22,x+255,1616+24])
        add_digit(p3,[9,13,6][c],[x+6,1938-25,x+63,1938+25])
    add_digit(p3,7,[288,1518,345,1568])
    # Visual anchors identify screen phase, not a stored per-image answer.
    global deck_anchor, battle_anchor, collection_anchor, spells_anchor
    deck_anchor=cv2.cvtColor(cut(load(IMAGES/'schlacht-teil-1.png'),[170,690,920,775]),cv2.COLOR_BGR2GRAY)
    battle_anchor=cv2.cvtColor(cut(load(IMAGES/'kampf-spielstaerke-1.png'),[90,1110,990,1300]),cv2.COLOR_BGR2GRAY)
    collection_anchor=cv2.cvtColor(cut(p1,[130,245,410,300]),cv2.COLOR_BGR2GRAY)
    spells_anchor=cv2.cvtColor(cut(load(IMAGES/'zauber-teil-1.png'),[660,245,850,300]),cv2.COLOR_BGR2GRAY)

def classify(img,box,preferred=None):
    f=feature(cut(img,box)); by_name={}
    for t in templates:
        score=similarity(f,t['feature'])
        if t['name'] not in by_name or score>by_name[t['name']]: by_name[t['name']]=score
    ranked=sorted(by_name.items(),key=lambda x:-x[1])
    name,score=ranked[0]; margin=score-ranked[1][1]
    accepted=score>=.56 and margin>=.035
    pool_hint=False
    if not accepted and preferred:
        scoped=[(candidate,value) for candidate,value in ranked if candidate in preferred]
        if scoped:
            candidate,value=scoped[0]
            scoped_margin=value-(scoped[1][1] if len(scoped)>1 else 0)
            # The pool can resolve a near tie but cannot supply missing visual evidence.
            if value>=.56 and score-value<=.025 and scoped_margin>=.035:
                name,score,margin=candidate,value,scoped_margin
                accepted=pool_hint=True
    return {'name':name if accepted else None,'candidate':name,'similarity':round(score,3),'margin':round(margin,3),'box':box,'poolHint':pool_hint,'alternatives':[{'name':n,'similarity':round(s,3)} for n,s in ranked[:3]]}

reference_feature_cache={}
def apply_learned_references(img,phase,offers,examples):
    # Near-identical verified icons only; never infer an action or quantity.
    for card in offers:
        box=card.get('box')
        if not box: continue
        current=feature(cut(img,box)); scores={}
        for entry in examples:
            if entry.get('phase')!=phase or not entry.get('name') or len(entry.get('box',[]))!=4: continue
            key=(entry.get('path'),tuple(entry['box']))
            try:
                if key not in reference_feature_cache: reference_feature_cache[key]=feature(cut(load(key[0]),entry['box']))
                score=similarity(current,reference_feature_cache[key]);scores[entry['name']]=max(score,scores.get(entry['name'],0))
            except (OSError,ValueError,cv2.error): continue
        ranked=sorted(scores.items(),key=lambda x:-x[1])
        if ranked and ranked[0][1]>=.99 and (len(ranked)==1 or ranked[0][1]-ranked[1][1]>=.04):
            card.update(name=ranked[0][0],candidate=ranked[0][0],learnedReference=True)

field_reference_cache={}
def match_field_references(img,examples,side):
    # Visual matches are tentative, not verified unit counts or upgrade levels.
    candidates=[entry for entry in examples if entry.get('phase')==side+'_field' and len(entry.get('box',[]))==4][:40]
    if not candidates:return []
    top=250 if side=='enemy' else 1170
    field=cv2.resize(cv2.cvtColor(img,cv2.COLOR_BGR2GRAY),None,fx=.5,fy=.5,interpolation=cv2.INTER_AREA)[top//2:(top+920)//2]
    matches={}
    for entry in candidates:
        key=(entry.get('path'),tuple(entry['box']))
        try:
            if key not in field_reference_cache:
                source=cv2.resize(cv2.cvtColor(load(key[0]),cv2.COLOR_BGR2GRAY),None,fx=.5,fy=.5,interpolation=cv2.INTER_AREA)
                x1,y1,x2,y2=entry['box'];field_reference_cache[key]=source[y1//2:y2//2,x1//2:x2//2]
            template=field_reference_cache[key]
            if template.shape[0]>field.shape[0] or template.shape[1]>field.shape[1] or np.std(template)<8:continue
            scores=cv2.matchTemplate(field,template,cv2.TM_CCOEFF_NORMED)
            h,w=template.shape
            for _ in range(40):
                _,score,_,(x,y)=cv2.minMaxLoc(scores)
                if score<.96:break
                box=[x*2,y*2+top,(x+w)*2,(y+h)*2+top]
                matches.setdefault(entry['name'],[]).append((float(score),box))
                scores[max(0,y-h//2):min(scores.shape[0],y+h//2+1),max(0,x-w//2):min(scores.shape[1],x+w//2+1)]=-1
        except (OSError,ValueError,cv2.error):continue
    result=[]
    for name,rows in matches.items():
        chosen=[]
        for score,box in sorted(rows,key=lambda item:-item[0]):
            x1,y1,x2,y2=box
            if any(abs((x1+x2)-(old[1][0]+old[1][2]))<max(x2-x1,old[1][2]-old[1][0])*.7 and
                   abs((y1+y2)-(old[1][1]+old[1][3]))<max(y2-y1,old[1][3]-old[1][1])*.7 for old in chosen):continue
            chosen.append((score,box))
        if chosen:result.append({'name':name,'similarity':round(chosen[0][0],3),'box':chosen[0][1],
                                 'visualMatches':len(chosen),'strength':None,'tentative':True})
    return sorted(result,key=lambda row:-row['similarity'])[:4]

def match_enemy_references(img,examples):
    return match_field_references(img,examples,'enemy')

def number(img,box):
    f=digit_feature(cut(img,box)); scores={}
    for value,t in numbers: scores[value]=max(scores.get(value,0),similarity(f,t))
    ranked=sorted(scores.items(),key=lambda x:-x[1]); v,s=ranked[0]
    return {'value':v if s>=.70 and s-ranked[1][1]>=.025 else None,'candidate':v,'similarity':round(s,3),'box':box}

def anchor_score(img,box,anchor):
    roi=cv2.cvtColor(cut(img,box),cv2.COLOR_BGR2GRAY)
    if roi.shape!=anchor.shape: roi=cv2.resize(roi,(anchor.shape[1],anchor.shape[0]))
    return float(cv2.matchTemplate(roi,anchor,cv2.TM_CCOEFF_NORMED)[0,0])

def has_spell_choice_panel(img, layout='full'):
    def blue_fraction(top,bottom):
        hue,sat,value=cv2.split(cv2.cvtColor(img[top:bottom,35:1045],cv2.COLOR_BGR2HSV))
        return np.mean((hue>=78)&(hue<=113)&(sat>=40)&(value>=135))
    # The spell tray is turquoise edge to edge. The Comeback Bonus backdrop
    # is also blue, but extends beyond the upper and lower tray edges.
    top=(910,919) if layout=='centered' else (945,962)
    if layout=='centered' and not any(has_orange_badge(img,[x+104,1025,x+162,1075]) for x in (180,540,900)):
        return False
    if blue_fraction(990,1005)<=.7 or blue_fraction(1550,1576)<=.8:
        return False
    if blue_fraction(*top)<.25 and blue_fraction(1592,1606)<.25:
        return True
    # During a Comeback Bonus, the blue backdrop stays behind the spell cards.
    bottom=blue_fraction(1592,1606)
    if blue_fraction(1520,1530)>=.40 or sum(
            has_orange_badge(img,[x+104,1025,x+162,1075]) for x in (180,540,900))<2:
        return False
    if bottom>.8:
        return True
    # In some arenas the uncovered field cuts through the lower blue strip.
    return layout=='full' and bottom>.25 and sum(card['name'] is not None for card in spell_choices(img,'en'))>=2

def has_orange_badge(img,box):
    h,s,v=cv2.split(cv2.cvtColor(cut(img,box),cv2.COLOR_BGR2HSV))
    return np.mean((h>=7)&(h<=37)&(s>85)&(v>120))>.18

def has_battle_card_tray(img):
    badges=sum(has_orange_badge(img,[241+c*340,1022,294+c*340,1070]) for c in range(3))
    if badges<2:
        return False
    return all(np.mean(cut(img,[35+c*340,1380,355+c*340,1475]).max(axis=2)<90)>.035
               for c in range(3))

def collection_tab_scores(img, kind):
    box,anchor=([130,245,410,300],collection_anchor) if kind=='units' else ([660,245,850,300],spells_anchor)
    return anchor_score(img,box,anchor),anchor_score(img,box,vision_english.tabs[kind])

def active_collection_tab(img, kind):
    blue=img[295,580].astype(int)
    orange=img[295,75].astype(int)
    return blue[0]-blue[2]>=45 if kind=='spells' else orange[2]-orange[0]>=65

def has_centered_layout(img):
    return (read_hearts(img,'centered') is not None or has_spell_choice_panel(img,'centered') or has_battle_card_tray(img) or
            deck_choice_offset(img,'centered') is not None or deck_choice_offset(img,'centered','en') is not None or
            max(collection_tab_scores(img,'units'))>.90 or
            max(collection_tab_scores(img,'spells'))>.90)

def deck_choice_offset(img, layout, language='de'):
    english=language=='en'
    anchor=vision_english.deck_anchor if english else deck_anchor
    if anchor_score(img,[170,690,920,775],anchor)>.88:
        return (0,0)
    if layout!='centered':
        return None
    region=lettering(cut(img,[110,628,950,808]))
    label=vision_english.deck_label if english else deck_label_anchor
    _,score,_,(x,y)=cv2.minMaxLoc(cv2.matchTemplate(region,label,cv2.TM_CCOEFF_NORMED))
    dx,dy=x+110-(334 if english else 196),y+628-705
    if score>(.60 if english else .48) and abs(dx)<=45 and abs(dy)<=65:
        return dx,dy
    return None

def english_deck_offset(img):
    region=lettering(cut(img,[120,650,960,805]))
    score,_,top,_=vision_english.strongest(region,vision_english.deck_masks)
    if score<.70:
        return None
    dy=top+650-705
    icons=[classify(img,[75+c*350,940+dy,318+c*350,1140+dy]) for c in range(3)]
    return (0,dy) if sum(card['name'] is not None and card['similarity']>=.66 for card in icons)>=2 else None

def read_deck_caption(img,x,dy,language='de'):
    region=lettering(cut(img,[x+8,1135+dy,x+304,1245+dy]))
    matches={}
    patterns=english_battle_names if language=='en' else battle_names
    for name,pattern in patterns:
        if pattern.shape[0]>region.shape[0] or pattern.shape[1]>region.shape[1]:
            continue
        score=cv2.minMaxLoc(cv2.matchTemplate(region,pattern,cv2.TM_CCOEFF_NORMED))[1]
        matches[name]=max(matches.get(name,0),score)
    ranked=sorted(matches.items(),key=lambda item:-item[1])
    name,score=ranked[0]
    margin=score-ranked[1][1]
    if score>=.72 and margin>=.08:
        return {'name':name,'candidate':name,'similarity':round(score,3),'margin':round(margin,3),
                'captionMargin':round(margin,3),'poolHint':False,'nameSource':'Kartenbeschriftung'}
    return {}

def use_deck_caption(card,caption,layout,language):
    # Preserve existing thresholds; a very distinct label can identify an otherwise unknown icon.
    return (layout=='centered' or language=='en' or caption.get('similarity',0)>=.85 or
            (not card.get('name') and caption.get('name') and caption.get('similarity',0)>=.84 and
             caption.get('captionMargin',0)>=.30))

def enemy_lineup_side_dx(img,layout,dy):
    # Some Battle layouts start the opponent row at x=100 rather than x=10.
    # The first card changes the area at x=115 from red background to card fill.
    def red_fraction(x):
        patch=cut(img,[x,350+dy,x+10,480+dy])
        if patch.size==0:return 1.0
        hsv=cv2.cvtColor(patch,cv2.COLOR_BGR2HSV)
        return float(np.mean(((hsv[:,:,0]<10)|(hsv[:,:,0]>170))&(hsv[:,:,1]>70)))
    if red_fraction(40)>.90 and red_fraction(115)<.55:return 0
    return -82 if layout=='centered' else -90

def read_small_deck_caption(img,x,top,bottom,language='de'):
    region=lettering(cut(img,[x+5,top,x+220,bottom]))
    if np.count_nonzero(region)<20:return {}
    matches={}
    patterns=enemy_deck_names_en if language=='en' else enemy_deck_names_de
    for name,pattern in patterns:
        if pattern.shape[0]>region.shape[0] or pattern.shape[1]>region.shape[1]:
            continue
        score=cv2.minMaxLoc(cv2.matchTemplate(region,pattern,cv2.TM_CCOEFF_NORMED))[1]
        matches[name]=max(matches.get(name,0),score)
    ranked=sorted(matches.items(),key=lambda item:-item[1])
    if len(ranked)<2: return {}
    name,score=ranked[0]; margin=score-ranked[1][1]
    if score>=.80 and margin>=.09:
        return {'name':name,'candidate':name,'similarity':round(score,3),'margin':round(margin,3),
                'poolHint':False,'nameSource':'opponent-deck-caption'}
    return {}

def read_enemy_deck_caption(img,x,dy,language='de'):
    return read_small_deck_caption(img,x,490+dy,560+dy,language)

def read_hearts(img, layout='full'):
    # The scoreboard keeps four slots per side. Filled slots face outwards.
    def slots(centers, top, hue_start, hue_end):
        result=[]
        for x in centers:
            hue,sat,value=cv2.split(cv2.cvtColor(img[top:top+13,x-8:x+8],cv2.COLOR_BGR2HSV))
            colored=((hue>=hue_start)&(hue<=hue_end)) if hue_start<=hue_end else ((hue>=hue_start)|(hue<=hue_end))
            if np.mean(colored&(sat>=75)&(value>=100))>=.75:
                result.append(1)
            elif np.mean(value<=45)>=.85:
                result.append(0)
            else:
                return None
        return result
    phone=(271,(182,237,292,347),(733,788,843,898))
    wide=(222,(166,221,276,331),(727,782,837,892))
    for top,left,right in ((wide,phone) if layout=='centered' else (phone,)):
        own=slots(left,top,98,123)
        enemy=slots(right,top,170,12)
        if own is not None and enemy is not None and own==sorted(own,reverse=True) and enemy==sorted(enemy) and any(own+enemy):
            return {'own':sum(own),'enemy':sum(enemy)}
    return None

def spell_choices(img,language):
    offers=[]
    for position,x in enumerate((180,540,900)):
        badge=[x+104,1000,x+162,1075]
        if not has_orange_badge(img,badge):
            continue
        caption=lettering(cut(img,[x-155,1290,x+155,1450]))
        # Spell captions may use a different language than the Coach UI.
        primary,secondary=(english_spell_names,german_spell_names) if language=='en' else (german_spell_names,english_spell_names)
        def ranked(patterns):
            return sorted(((vision_english.strongest(caption,masks)[0],name) for name,masks in patterns.items()),reverse=True)
        scores=ranked(primary)
        if scores[0][0]<.67 or scores[0][0]-scores[1][0]<.10:
            scores=ranked(secondary)
        score,name=scores[0]
        if score<.67 or score-scores[1][0]<.10:
            name=None
        offers.append({'name':name,'position':position,'action':'spell','quantity':None,
                       'box':[x-145,1080,x+145,1460],
                       'orange':number(img,badge)})
    return offers

def mark_reinforcement_variants(img,offers):
    groups={}
    for card in offers:
        if card['name'] and card['action'] in ('upgrade','multiply','multiply_upgrade'):
            groups.setdefault((card['name'],card['action']),[]).append(card)
    for group in groups.values():
        if len(group)<2:
            continue
        for index,card in enumerate(group,1):
            x1,y1,x2,y2=card['box']
            icon=cut(img,[x1+15,y1+8,x2-15,y2-8])
            sample=cv2.resize(icon,(12,12),interpolation=cv2.INTER_AREA)
            card['variantIndex']=index
            card['variantSample']=(sample//16).flatten().tolist()


with np.load(ROOT/'data'/'match-results.npz',allow_pickle=False) as result_data:
    result_labels=[(outcome,cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_LINEAR))
                   for outcome in ('gewonnen','verloren')
                   for key in (outcome+'_de',outcome+'_en')
                   for mask in (result_data[key],) for scale in (.94,1,1.06)]


with np.load(ROOT/'data'/'new-result-de.npz',allow_pickle=False) as data:
    new_loss_de=data['loss'].copy()
    new_win_de=data['win'].copy()
    new_continue_de=data['continue_button'].copy()
    new_replay_de=data['replay'].copy()
    new_home_de=data['home'].copy()
    new_mastery_de=data['mastery_de'].copy()
    new_mastery_holen=data['holen_mastery_de'].copy()
    new_win_en=data['win_en'].copy()
    new_continue_en=data['continue_en'].copy()
    new_replay_en=data['replay_en'].copy()
    new_home_en=data['home_en'].copy()
    new_loss_en=data['loss_en'].copy()
    new_mastery_en=data['mastery_en'].copy()
    new_mastery_claim=data['claim_mastery_en'].copy()

def new_result_navigation(small,outcome):
    gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY)
    heading=gray[25:67,16:152]
    button=gray[300:355,25:143]
    variants=[(new_win_de,new_continue_de),(new_win_en,new_continue_en)] if outcome=='gewonnen' else [(new_loss_de,new_continue_de),(new_loss_en,new_continue_en)]
    for pattern,button_pattern in variants:
        if cv2.minMaxLoc(cv2.matchTemplate(heading,pattern,cv2.TM_CCOEFF_NORMED))[1]<.94:continue
        _,score,_,(x,y)=cv2.minMaxLoc(cv2.matchTemplate(button,button_pattern,cv2.TM_CCOEFF_NORMED))
        if score<.94:continue
        x+=25+button_pattern.shape[1]/2;y+=300+button_pattern.shape[0]/2
        return {'step':'result','mode':None,'point':[x/168,y/364]}
    return None

with np.load(ROOT/'data'/'battle-navigation.npz',allow_pickle=False) as navigation_data:
    navigation_labels={name:navigation_data[name] for name in navigation_data.files}


def navigation_button(gray,name,area,step,mode=None):
    x0,y0,x1,y1=area
    pattern=navigation_labels[name]
    _,score,_,(x,y)=cv2.minMaxLoc(cv2.matchTemplate(gray[y0:y1,x0:x1],pattern,cv2.TM_CCOEFF_NORMED))
    if score<.87:
        return None
    x+=x0+pattern.shape[1]/2
    y+=y0+pattern.shape[0]/2
    return {'step':step,'mode':mode,'point':[x/168,y/364]}


def game_navigation(small,outcome):
    gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY)
    if outcome:
        new_result=new_result_navigation(small,outcome)
        if new_result:return new_result
        area=(25,283,143,347)
        return navigation_button(gray,'result',area,'result') or navigation_button(gray,'result_de',area,'result')
    # German mastery rewards can appear between the result and replay screens.
    title_area=gray[102:155,18:150];button_area=gray[268:323,30:138]
    for title_pattern,button_pattern in ((new_mastery_de,new_mastery_holen),(new_mastery_en,new_mastery_claim)):
        title_score=cv2.minMaxLoc(cv2.matchTemplate(title_area,title_pattern,cv2.TM_CCOEFF_NORMED))[1]
        if title_score>=.90:
            _,score,_,(x,y)=cv2.minMaxLoc(cv2.matchTemplate(button_area,button_pattern,cv2.TM_CCOEFF_NORMED))
            hsv=cv2.cvtColor(small[280:314,41:127],cv2.COLOR_BGR2HSV)
            gold=np.mean((hsv[:,:,0]>15)&(hsv[:,:,0]<40)&(hsv[:,:,1]>80))
            if (score>=.70 and gold>=.30) or (title_score>=.95 and score>=.65 and gold>=.35):
                return {'step':'reward','mode':None,'point':[.5,297/364]}
    # The new Draft end screen offers a direct replay and a home button.
    left=gray[291:340,5:85];right=gray[291:340,83:163]
    for replay_pattern,home_pattern in ((new_replay_de,new_home_de),(new_replay_en,new_home_en)):
        if (cv2.minMaxLoc(cv2.matchTemplate(left,replay_pattern,cv2.TM_CCOEFF_NORMED))[1]>=.94 and
            cv2.minMaxLoc(cv2.matchTemplate(right,home_pattern,cv2.TM_CCOEFF_NORMED))[1]>=.94):
            _,_,_,(x,y)=cv2.minMaxLoc(cv2.matchTemplate(left,replay_pattern,cv2.TM_CCOEFF_NORMED))
            return {'step':'replay','mode':'draft','point':[(5+x+replay_pattern.shape[1]/2)/168,(291+y+replay_pattern.shape[0]/2)/364]}
    if cv2.minMaxLoc(cv2.matchTemplate(gray[78:119,16:153],
                                      navigation_labels['mastery_title'],cv2.TM_CCOEFF_NORMED))[1]>=.89:
        return navigation_button(gray,'mastery_continue',(25,289,143,356),'reward')
    panel=gray[125:226,10:158]
    if any(cv2.minMaxLoc(cv2.matchTemplate(panel,navigation_labels[name],cv2.TM_CCOEFF_NORMED))[1]>=.86
           for name in ('arena_win_panel','arena_loss_panel','arena_stronger_panel','arena_weaker_panel','arena_weaker_win_panel','arena_stronger_panel_de','arena_weaker_panel_de','arena_equal_panel_de')):
        area=(25,292,143,356)
        return (navigation_button(gray,'arena_recap',area,'recap','arena') or
                navigation_button(gray,'arena_recap_de',area,'recap','arena'))
    side=small[85:250,4].astype(int)
    draft_loss=np.mean(side[:,2]-side[:,1])>25 and any(cv2.minMaxLoc(cv2.matchTemplate(
        gray[37:86,16:152],navigation_labels[name],cv2.TM_CCOEFF_NORMED))[1]>=.86
        for name in ('draft_loss_panel','draft_loss_panel_de'))
    if draft_loss or np.mean(side[:,1]-side[:,2])>13:
        area=(25,292,143,361)
        return (navigation_button(gray,'draft_recap',area,'recap','draft') or
                navigation_button(gray,'draft_recap_de',area,'recap','draft'))
    if cv2.minMaxLoc(cv2.matchTemplate(gray[335:358,61:107],
                                      navigation_labels['claim_tab_de'],cv2.TM_CCOEFF_NORMED))[1]>=.86:
        claim=navigation_button(gray,'claim_de',(28,260,141,315),'claim','draft')
        if claim:
            return claim
    for mode,tab in (('draft',gray[308:364,52:117]),('arena',gray[308:364,115:168])):
        for suffix in ('','_de'):
            pattern=navigation_labels[mode+'_lobby'+suffix]
            if cv2.minMaxLoc(cv2.matchTemplate(tab,pattern,cv2.TM_CCOEFF_NORMED))[1]>=.86:
                # The paid button template includes the price below its label.
                button=navigation_button(gray,mode+'_home'+suffix,(12,237,156,314),'home',mode)
                if button:
                    return button
                if mode=='arena':
                    label=navigation_labels['arena_paid_label'+('_en' if suffix=='' else suffix)]
                    region=gray[250:289,32:136]
                    _,label_score,_,(label_x,label_y)=cv2.minMaxLoc(
                        cv2.matchTemplate(region,label,cv2.TM_CCOEFF_NORMED))
                    coin=navigation_labels['arena_paid_coin']
                    _,coin_score,_,(coin_x,coin_y)=cv2.minMaxLoc(
                        cv2.matchTemplate(region,coin,cv2.TM_CCOEFF_NORMED))
                    label_x+=32
                    label_y+=250
                    coin_x+=32
                    coin_y+=250
                    coin_region=small[coin_y:coin_y+coin.shape[0],coin_x:coin_x+coin.shape[1]]
                    hsv=cv2.cvtColor(coin_region,cv2.COLOR_BGR2HSV)
                    gold_fraction=np.mean((hsv[:,:,0]>=12)&(hsv[:,:,0]<=40)&(hsv[:,:,1]>=100)&(hsv[:,:,2]>=150))
                    if (label_score>=.88 and (coin_score>=.88 or coin_score>=.76 and gold_fraction>=.55) and
                        abs(coin_x-(label_x+label.shape[1]/2+4))<=12 and
                        1<=coin_y-(label_y+label.shape[0])<=14):
                        return {'step':'home','mode':'arena',
                                'point':[(label_x+label.shape[1]/2)/168,(coin_y+4)/364]}
    return None


def match_outcome(img):
    return match_outcome_small(cv2.resize(img,(168,364),interpolation=cv2.INTER_AREA))


def match_outcome_small(small):
    for result in ('gewonnen','verloren'):
        if new_result_navigation(small,result):return result
    # Reward screens have a blue backdrop around the animated heading.
    sides=small[85:220,[2,3,4,163,164,165]]
    if np.mean((sides[:,:,0].astype(int)-sides[:,:,2])>35)<.68:
        return None
    heading=cv2.cvtColor(small[84:189,16:152],cv2.COLOR_BGR2GRAY)
    scores={'gewonnen':0,'verloren':0}
    for outcome,pattern in result_labels:
        score=cv2.minMaxLoc(cv2.matchTemplate(heading,pattern,cv2.TM_CCOEFF_NORMED))[1]
        scores[outcome]=max(scores[outcome],score)
    best,other=sorted(scores,key=scores.get,reverse=True)
    return best if scores[best]>=.79 and scores[best]-scores[other]>=.10 else None


def normal_draft_deck_evidence(phase,is_showdown,offers,comeback):
    # Goose is normally offered as +5; that quantity alone is not a special round.
    return (phase=='battle_choice' and not is_showdown and not comeback and
            not any(card.get('action')=='multiply_upgrade' or
                    ((card.get('quantity') or 0)>4 and not (card.get('name')=='Gans' and card.get('action')=='add' and card.get('quantity')==5))
                    for card in offers))

def recognize(path,preferred=None,language='de',learned_banners=(),learned_references=(),field_analysis=True):
    start=time.perf_counter()
    caption_ms=0.0
    raw=decode(path)
    geometry=screen_geometry(raw)
    if geometry is None:
        return {'phase':'unknown','offers':[],'enemy':[],'own':[],'geometry':None,
                'notes':['Spielbereich auf dieser Aufnahme nicht zugeordnet. Das Originalbild bleibt sichtbar.'],
                'visionMs':round((time.perf_counter()-start)*1000,1)}
    img=normalize_screen(raw,geometry['content'])
    small=cv2.resize(img,(168,364),interpolation=cv2.INTER_AREA)
    outcome=match_outcome_small(small)
    navigation=game_navigation(small,outcome)
    mode_hint=navigation['mode'] if navigation and navigation['step']=='home' else None
    if outcome or navigation or mode_hint:
        return {'phase':outcome or 'unknown','matchOutcome':outcome,'navigation':navigation,'modeHint':mode_hint,'offers':[],'enemy':[],'own':[],
                'geometry':geometry,'visionMs':round((time.perf_counter()-start)*1000,1)}
    phase='unknown'; offers=[]; enemies=[]; own=[]; notes=[]; last_deck_reroll=False
    deck=deck_choice_offset(img,geometry['layout'],language)
    english_deck=language=='en' and deck is None and (deck:=english_deck_offset(img)) is not None
    # Deck choice has the fixed banner. Battle choices have large jagged cards.
    hsv=cv2.cvtColor(cut(img,[0,0,1080,350]),cv2.COLOR_BGR2HSV)
    red_header=float(np.mean(((hsv[:,:,0]<15)|(hsv[:,:,0]>170))&(hsv[:,:,1]>100)))
    special_step=showdown_step(img)
    is_showdown=special_step is not None
    field_visible=float(np.mean(cut(img,[350,800,700,960])[:,:,1]))>115
    combat=special_step is not None or (red_header<.45 and field_visible)
    hearts=read_hearts(img,geometry['layout'])
    battle_cards=(combat or field_visible or hearts is not None) and has_battle_card_tray(img)
    if deck is not None:
        phase='deck_choice'
        gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY)
        last_deck_reroll=bool(
            cv2.minMaxLoc(cv2.matchTemplate(gray[204:253,21:147],navigation_labels['reroll_button'],cv2.TM_CCOEFF_NORMED))[1]>=.90 and
            cv2.minMaxLoc(cv2.matchTemplate(gray[317:334,75:94],navigation_labels['deck_last_step'],cv2.TM_CCOEFF_NORMED))[1]>=.94)
        dx,dy=deck
        for c in range(3):
            x=40+c*350+dx
            card=classify(img,[x+35,940+dy,x+278,1140+dy],preferred); card.update(position=c,action='add',quantity=None)
            caption=read_deck_caption(img,x,dy,language)
            if use_deck_caption(card,caption,geometry['layout'],language):
                card.update(caption)
            if english_deck:
                card['experimentalLanguage']=True
            card['orange']=number(img,[x+14,1242+dy,x+69,1308+dy]); card['blue']=number(img,[x+251,885+dy,x+300,934+dy])
            offers.append(card)
        for side,y1,y2,by,oy,target in [('enemy',365,502,328,582,enemies),('own',1734,1857,1697,1949,own)]:
            centered=geometry['layout']=='centered'
            side_dx=enemy_lineup_side_dx(img,geometry['layout'],dy) if side=='enemy' else (25 if centered else 0)
            for c in range(4):
                x=100+c*225+side_dx
                card=classify(img,[x+23,y1+dy,x+177,y2+dy],preferred if side=='own' else None)
                if side=='enemy' and not card['name']:
                    snail_score=similarity(feature(cut(img,[x+23,y1+dy,x+177,y2+dy])),enemy_snail_feature)
                    if snail_score>=.82 and snail_score-card['similarity']>=.10:
                        card.update(name='Schnecke',candidate='Schnecke',similarity=round(snail_score,3),margin=round(snail_score-card['similarity'],3),poolHint=False)
                if side=='enemy':
                    caption=read_enemy_deck_caption(img,x,dy,language)
                    if caption: card.update(caption)
                    elif card['similarity']<.70 or card.get('margin',0)<.08: card['name']=None
                else:
                    caption=read_small_deck_caption(img,x,1810+dy,1920+dy,language)
                    if caption: card.update(caption)
                if card['similarity']>.56 and card['name']:
                    card['box']=[x+30,y1+dy-(40 if side=='enemy' else 55),x+230,y2+dy+110]
                    if side=='enemy':
                        orange=number(img,[x+20,560+dy,x+86,625+dy])
                        blue=number(img,[x+190,300+dy,x+245,360+dy])
                    else:
                        orange=number(img,[x+7,oy+dy-23,x+48,oy+dy+23]); blue=number(img,[x+170,by+dy-19,x+205,by+dy+19])
                    card.update(position=c,side=side,orange=orange,blue=blue)
                    target.append(card)
    elif active_collection_tab(img,'units') and max(collection_tab_scores(img,'units'))>.90:
        phase='collection'
    elif active_collection_tab(img,'spells') and max(collection_tab_scores(img,'spells'))>.90:
        phase='spells'
    elif (combat or hearts is not None) and has_spell_choice_panel(img,geometry['layout']):
        phase='spell_choice'
        offers=spell_choices(img,language)
    elif combat or battle_cards:
        # A dimmed comeback overlay can make the header too red, even with three visible cards.
        phase='battle' if combat else 'unknown'
        if battle_cards:
            for c in range(3):
                x=35+c*340
                card=classify(img,[x+25,1090,x+295,1305]); card.update(position=c,action='unknown',quantity=None,
                    visible=bool(has_orange_badge(img,[x+206,1022,x+259,1070])))
                card['orange']=number(img,[x+206,1022,x+259,1070]); card['blue']=number(img,[x+270,1024,x+317,1073])
                caption_started=time.perf_counter()
                card.update(read_battle_caption(img,x,None if special_step else preferred,card,language))
                caption_ms+=(time.perf_counter()-caption_started)*1000
                if card['action']=='unknown':
                    caption=cv2.cvtColor(cut(img,[x+22,1385,x+300,1475]),cv2.COLOR_BGR2GRAY)
                    for pattern,name,action in legacy_captions:
                        likeness=cv2.matchTemplate(caption,pattern,cv2.TM_CCOEFF_NORMED)[0,0]
                        if likeness>.94:
                            card.update(name=name,candidate=name,action=action,quantity=2,
                                        similarity=round(float(likeness),3),poolHint=False)
                            break
                offers.append(card)
            # Crowded fights can match those colors. Require actual card text
            # or a pair of readable level badges before publishing choices.
            if any(card['name'] for card in offers) or sum(card['orange']['value'] is not None for card in offers)>=2:
                phase='battle_choice'
            else:
                offers=[]
    else: notes.append('Bildschirmtyp noch nicht sicher erkannt.')
    if phase in ('battle_choice','deck_choice'):
        apply_learned_references(img,phase,offers,learned_references)
    if phase=='battle_choice':
        mark_reinforcement_variants(img,offers)
    if phase!='battle_choice' or not all(card['name'] for card in offers):
        special_step=None
    if special_step:
        notes.append(f'Showdown-Auswahl {special_step}/2 · mögliche Angebote aus der Sammlung.')
    deck_evidence=normal_draft_deck_evidence(phase,is_showdown,offers,has_comeback_label(img))
    enemy_started=time.perf_counter()
    enemy_event=read_enemy_banner(img,language,learned_banners) if phase in ('battle','battle_choice','spell_choice') or (phase=='unknown' and hearts is not None) else None
    enemy_ms=(time.perf_counter()-enemy_started)*1000
    enemy_visual=match_field_references(img,learned_references,'enemy') if field_analysis and phase in ('battle','battle_choice','spell_choice') else []
    own_visual=match_field_references(img,learned_references,'own') if field_analysis and phase in ('battle','battle_choice','spell_choice') else []
    if any(card.get('experimentalLanguage') for card in offers):
        notes.append('Englische Spielbilder werden probeweise erkannt. Automatisches Antippen bleibt für experimentell erkannte Angebote aus.')
    spell_button=None
    if phase=='battle_choice' and hearts is not None:
        star=cut(img,[950,1627,1020,1702])
        if cv2.matchTemplate(star,spell_button_star,cv2.TM_SQDIFF_NORMED)[0,0]<.025:
            spell_button=[950,1627,1020,1702]
    return {'enemyVisual':enemy_visual,'ownVisual':own_visual,'spellButton':spell_button,'phase':phase,'specialStep':special_step,'deckEvidence':deck_evidence,'lastDeckReroll':last_deck_reroll,'offers':offers,'enemy':enemies,'own':own,'enemyEvent':enemy_event,'hearts':hearts,'notes':notes,'visionMs':round((time.perf_counter()-start)*1000,1),'visionProfile':{'captionMs':round(caption_ms,1),'enemyBannerMs':round(enemy_ms,1)},'engine':'Lokaler OpenCV-Vergleich; Ähnlichkeiten sind keine Wahrscheinlichkeiten','geometry':geometry,'layout':'1080×2340, experimentell'}

def lettering(img):
    return ((img.min(axis=2)>200)&(np.ptp(img,axis=2)<45)).astype(np.uint8)

def has_comeback_label(img):
    mask=lettering(cut(img,[220,820,860,1000]))[::2,::2]
    return cv2.minMaxLoc(cv2.matchTemplate(mask,comeback_label,cv2.TM_CCOEFF_NORMED))[1]>.67

def enemy_banner_region(img):
    # The red banner is centered. Its gold and blue badges sit side by side.
    x0,y0=170,365
    hue,sat,value=cv2.split(cv2.cvtColor(img[y0:500,x0:930],cv2.COLOR_BGR2HSV))
    def badges(mask):
        _,_,stats,_=cv2.connectedComponentsWithStats(mask.astype(np.uint8))
        return [tuple(map(int,row[:4])) for row in stats[1:] if
                49<=row[2]<=105 and 49<=row[3]<=96 and row[4]>=1100]
    gold=badges((hue>=10)&(hue<=32)&(sat>90)&(value>200))
    blue=badges((hue>=87)&(hue<=116)&(sat>80)&(value>140))
    for gx,gy,gw,gh in gold:
        for bx,by,bw,bh in blue:
            if not (500<=gx+x0<=750 and abs(bx-gx-gw)<=13 and abs(gy-by)<=15):
                continue
            left=max(x0,REFERENCE_WIDTH-(bx+x0+bw)-14)
            box=[left,gy+y0+9,gx+x0-11,gy+y0+min(gh,67)]
            if box[2]-box[0]<80:
                continue
            label=cut(img,box)
            h,s,v=cv2.split(cv2.cvtColor(label,cv2.COLOR_BGR2HSV))
            if np.mean(((h<=3)|(h>=178))&(s>=90)&(s<=158)&(v>=198))>=.22:
                return lettering(label),box
    return None

def enemy_banner_number(part, sign):
    if part.shape[1]<15:
        return None
    count,labels,stats,_=cv2.connectedComponentsWithStats(part)
    glyphs=sorted((int(stats[k,0]),k) for k in range(1,count) if stats[k,3]>=17 and stats[k,4]>55)
    if len(glyphs) not in (2,3):
        return None
    features=[normalize((labels==idx).astype(np.uint8)*255,40) for _,idx in glyphs]
    if similarity(features[0],banner_glyphs[sign])<.7:
        return None
    digits=[]
    for feature in features[1:]:
        scores={}
        for value,template in banner_digits:
            scores[value]=max(scores.get(value,0),similarity(feature,template))
        ranked=sorted(scores,key=scores.get,reverse=True)
        value=ranked[0]
        if scores[value]<.76 or scores[value]-scores[ranked[1]]<.035:
            return None
        digits.append(str(value))
    return int(''.join(digits))

def banner_template(img):
    region=enemy_banner_region(img)
    if region is None:
        return None
    label,box=region
    x,y,width,height=cv2.boundingRect(label)
    if width<35 or height<12:
        return None
    target_width=min(384,round(width*48/height))
    if target_width<1:
        return None
    mask=cv2.resize(label[y:y+height,x:x+width],(target_width,48),interpolation=cv2.INTER_NEAREST)
    return [''.join(str(value) for value in row) for row in mask]


def learned_enemy_banner(img,language,templates):
    eligible=[entry for entry in templates if entry['language']==language]
    if not eligible:
        return None
    rows=banner_template(img)
    if rows is None:
        return None
    mask=banner_mask(rows)
    matches={}
    for entry in eligible:
        pattern=banner_mask(entry['rows'])
        if abs(pattern.shape[1]-mask.shape[1])>mask.shape[1]*.06:
            continue
        resized=cv2.resize(pattern,(mask.shape[1],48),interpolation=cv2.INTER_NEAREST)
        score=float(cv2.matchTemplate(mask,resized,cv2.TM_CCOEFF_NORMED)[0,0])
        key=(entry['name'],entry['action'],entry['quantity'])
        matches[key]=max(matches.get(key,0),score)
    ranked=sorted(matches,key=matches.get,reverse=True)
    if not ranked or matches[ranked[0]]<.91 or (len(ranked)>1 and matches[ranked[0]]-matches[ranked[1]]<.06):
        return None
    name,action,quantity=ranked[0]
    return {'name':name,'action':action,'quantity':quantity,'box':enemy_banner_region(img)[1]}


def read_enemy_banner(img,language='de',learned_banners=()):
    learned=learned_enemy_banner(img,language,learned_banners)
    if learned:
        return learned
    region=enemy_banner_region(img)
    if region is None:
        return None
    label,box=region
    matches={}
    patterns=english_banner_names if language=='en' else banner_names
    for name,pattern in patterns:
        height,width=pattern.shape
        if height>label.shape[0] or width>label.shape[1]:
            continue
        _,score,_,(left,_) = cv2.minMaxLoc(cv2.matchTemplate(label,pattern,cv2.TM_CCOEFF_NORMED))
        if name not in matches or score>matches[name][0]:
            matches[name]=(score,left,width)
    if len(matches)<2:
        return None
    name,runner_up=sorted(matches,key=lambda key:matches[key][0],reverse=True)[:2]
    score,left,width=matches[name]
    if score<.60 or score-matches[runner_up][0]<.10:
        return None
    prefix=label[:,:max(0,left-3)]
    suffix=label[:,left+width+3:]
    added=enemy_banner_number(prefix,'plus')
    multiple=enemy_banner_number(suffix,'times')
    if added:
        action,quantity='add',added
    elif similarity(normalize(suffix*255,40),banner_glyphs['times_up'])>=.89:
        action,quantity='multiply_upgrade',2
    elif multiple==2:
        action,quantity='multiply',multiple
    elif similarity(normalize(suffix*255,40),banner_glyphs['up'])>=.77:
        action,quantity='upgrade',None
    else:
        return None
    return {'name':name,'action':action,'quantity':quantity,'box':box}

def showdown_step(img):
    region=lettering(cut(img,[498,2030,583,2282]))
    for step,pattern in showdown_counters:
        if cv2.minMaxLoc(cv2.matchTemplate(region,pattern,cv2.TM_CCOEFF_NORMED))[1]>.84:
            return step
    return None


_caption_cache=OrderedDict()
_CAPTION_CACHE_LIMIT=512

def read_battle_caption(img, x, preferred, icon=None, language='de'):
    # Cache only identical caption pixels and card-color classification. The
    # candidate pool and English icon evidence also affect the result.
    footer=lettering(cut(img,[x+11,1377,x+322,1480]))
    color=cv2.cvtColor(cut(img,[x+15,1080,x+36,1240]),cv2.COLOR_BGR2HSV)
    green=bool(np.mean((color[:,:,0]>=35)&(color[:,:,0]<=90)&(color[:,:,1]>55))>.55)
    purple=bool(np.mean((color[:,:,0]>=125)&(color[:,:,0]<=160)&(color[:,:,1]>80))>.55)
    identity=(icon.get('name'),icon.get('poolHint'),icon.get('similarity'),icon.get('margin')) if language=='en' and icon else None
    key=(language,tuple(sorted(preferred or ())),identity,green,purple,hashlib.blake2b(footer.tobytes(),digest_size=16).digest())
    if key in _caption_cache:
        _caption_cache.move_to_end(key)
        return dict(_caption_cache[key])
    result=_read_battle_caption_uncached(img,x,preferred,icon,language)
    _caption_cache[key]=dict(result)
    if len(_caption_cache)>_CAPTION_CACHE_LIMIT:
        _caption_cache.popitem(last=False)
    return result

def _read_battle_caption_uncached(img, x, preferred, icon=None, language='de'):
    footer = lettering(cut(img,[x+11,1377,x+322,1480]))
    matches = {}
    patterns=english_battle_names if language=='en' else battle_names
    for name,pattern in patterns:
        if pattern.shape[1]>footer.shape[1] or pattern.shape[0]>footer.shape[0]:
            continue
        _,score,_,(left,top)=cv2.minMaxLoc(cv2.matchTemplate(footer,pattern,cv2.TM_CCOEFF_NORMED))
        if name not in matches or score>matches[name][0]:
            matches[name]=(score,left,top,pattern.shape[1])
    ranked=sorted(matches,key=lambda name:matches[name][0],reverse=True)
    if language=='en' and (matches[ranked[0]][0]<.70 or matches[ranked[0]][0]-matches[ranked[1]][0]<.06):
        # These labels have identical spelling in both game languages. Animated
        # enlarged cards can fit a German-calibrated font scale more accurately.
        # Keep the full competing English vocabulary and the original margin;
        # never translate an arbitrary German label into an English match.
        shared={'Agent B','Astra','Boomling','Merlinor','Sniper','Spartheus','Splime','TNT','Totem'}
        for candidate,pattern in battle_names:
            if candidate not in shared or pattern.shape[1]>footer.shape[1] or pattern.shape[0]>footer.shape[0]:
                continue
            _,likeness,_,(left,top)=cv2.minMaxLoc(cv2.matchTemplate(footer,pattern,cv2.TM_CCOEFF_NORMED))
            if likeness>matches.get(candidate,(-1,))[0]:
                matches[candidate]=(likeness,left,top,pattern.shape[1])
        ranked=sorted(matches,key=lambda candidate:matches[candidate][0],reverse=True)
    name=ranked[0]
    score,left,top,width=matches[name]
    margin=score-matches[ranked[1]][0]
    pool_hint=False
    if margin<.06 and preferred:
        scoped=[candidate for candidate in ranked if candidate in preferred]
        if scoped and score-matches[scoped[0]][0]<=.02:
            other=matches[scoped[1]][0] if len(scoped)>1 else 0
            if matches[scoped[0]][0]-other>=.06:
                name=scoped[0]
                score,left,top,width=matches[name]
                pool_hint=True
    result={'name':None,'action':'unknown','quantity':None,'candidate':name,'similarity':round(score,3),'captionMargin':round(margin,3),'poolHint':pool_hint}
    if score<(.70 if language=='en' else .62) or (margin<.06 and not pool_hint):
        english=vision_english.card_caption(footer,icon or {}) if language=='en' else None
        if english is None:
            return result
        name=icon['name']
        score,left,top,width=english
        result.update(candidate=name,similarity=round(score,3),poolHint=False,experimentalLanguage=True)
    result['name']=name
    result['nameSource']='English caption and icon' if result.get('experimentalLanguage') else 'Kartenbeschriftung'
    # Gold, blue and green variants use the same name, with different operations.
    color=cv2.cvtColor(cut(img,[x+15,1080,x+36,1240]),cv2.COLOR_BGR2HSV)
    if np.mean((color[:,:,0]>=35)&(color[:,:,0]<=90)&(color[:,:,1]>55))>.55:
        result['action']='upgrade'
        return result
    if np.mean((color[:,:,0]>=125)&(color[:,:,0]<=160)&(color[:,:,1]>80))>.55:
        result.update(action='multiply_upgrade',quantity=2)
        return result
    prefix=footer[:,max(0,left-100):max(0,left-2)]
    suffix=footer[:,min(footer.shape[1],left+width+3):]
    # A wider name template can overlap the first few pixels of the x glyph.
    # Retry with the whole glyph, keeping the same x and 2 checks.
    restored_suffix=footer[:,max(0,left+width-8):]
    for part,operation in [(prefix,'add'),(suffix,'multiply'),(restored_suffix,'multiply')]:
        if part.shape[1]<14:
            continue
        count,labels,stats,_=cv2.connectedComponentsWithStats(part)
        # Ignore sparkles outside the card caption's text line.
        glyphs=sorted((tuple(stats[k]),k) for k in range(1,count)
                      if stats[k,4]>40 and stats[k,3]>=16 and abs(stats[k,1]-top)<=12)
        if len(glyphs) not in (2,3) or (operation=='multiply' and len(glyphs)!=2):
            continue
        _,sign_id=glyphs[0]
        sign=normalize((labels==sign_id).astype(np.uint8)*255,40)
        if similarity(sign,plus_sign if operation=='add' else multiply_sign)<.65:
            continue
        digits=[]
        for _,idx in glyphs[1:]:
            mask=normalize((labels==idx).astype(np.uint8)*255,40)
            scores_by_value={}
            for value,template in action_digits:
                scores_by_value[value]=max(similarity(mask,template),scores_by_value.get(value,0))
            candidates=sorted(((likeness,value) for value,likeness in scores_by_value.items()),reverse=True)
            likeness,value=candidates[0]
            if likeness<.76 or likeness-candidates[1][0]<.035:
                break
            digits.append(str(value))
        if len(digits)==len(glyphs)-1 and (operation!='multiply' or digits==['2']):
            result.update(action=operation,quantity=int(''.join(digits)))
            break
    return result


def collection_templates():
    rows = [
        ('einheiten-teil-1.png', 620, ['Spinne','Agent B','Zerstörer','Merlinor']),
        ('einheiten-teil-1.png', 1090, ['Ritter','Kupid','Gans','TNT']),
        ('einheiten-teil-1.png', 1490, ['Schnecke','Assassine','Splime','Königlop']),
        ('einheiten-teil-1.png', 1885, ['Zerstörer','Ingenieur','Maulwurf','Bienenkorb']),
        ('einheiten-teil-2.png', 1165, ['Schildling','Merlinor','Parasit','Sniper']),
        ('einheiten-teil-2.png', 1565, ['Blutrebe','Spartheus','Sixshoot','Totem']),
        ('einheiten-teil-2.png', 1965, ['Boomling','Obergeist','Drakling','Agent B']),
        ('einheiten-teil-3.png', 1850, ['Spinne','Kapitän','Astra']),
        ('zauber-teil-1.png', 1230, ['Steinhaut','¡ZAS!','Grabesbogenschützen','Wilder Überfall']),
        ('zauber-teil-1.png', 1630, ['Säureexplosion','Feensegen','Pfeilsturm','Wachs-Experiment']),
        ('zauber-teil-2.png', 1430, ['Volltreffer','Minenfeld','Meuchelbrigade','Wächtertürme']),
        ('zauber-teil-2.png', 1830, ['Meteorschauer','Schildkrötenplan','Upgrade-Roulette','Grabesruf']),
    ]
    result = {'units':[], 'spells':[]}
    images = {}
    for file,y,names in rows:
        if file not in images:
            images[file] = load(IMAGES/file)
        kind = 'units' if file.startswith('einheiten') else 'spells'
        for column,name in enumerate(names):
            x = 22+column*260
            radius=24 if kind=='units' else 32
            mask = lettering(cut(images[file],[x+10,y-radius,x+245,y+radius]))
            points = cv2.findNonZero(mask)
            if points is None:
                continue
            left,top,w,h = cv2.boundingRect(points)
            result[kind].append((name,mask[top:top+h,left:left+w]))
    return result


def read_collection(path, kind):
    img = load(path)
    spells = kind.endswith('spells')
    category = 'spells' if spells else 'units'
    # The active tab has a saturated blue or orange fill at the left edge.
    if not active_collection_tab(img,category):
        raise ValueError('Der gewählte Sammlungsreiter ist auf diesem Bild nicht erkennbar.')
    german,english=collection_tab_scores(img,category)
    names=vision_english.collection_names[category] if english>.90 and english>german else collection_names[category]
    cards = []
    deck = kind.startswith('deck-')
    starts = [95,414,733] if deck and spells else [22,282,542,802]
    top,bottom = (580,663) if deck else (885,2042)
    for x in starts:
        region = lettering(cut(img,[x+6,top,x+248,bottom]))
        hits = []
        for name,template in names:
            scores = cv2.matchTemplate(region,template,cv2.TM_CCOEFF_NORMED)
            while True:
                _,score,_,(_,y)=cv2.minMaxLoc(scores)
                if score<.70:
                    break
                center = y+template.shape[0]//2
                hits.append((score,name,top+center))
                scores[max(0,y-55):y+56,:] = -1
        accepted = []
        for score,name,y in sorted(hits,reverse=True):
            if any(abs(y-other)<100 for other in accepted):
                continue
            accepted.append(y)
            value = None
            if deck or y+110<2030:
                badge_y = 706 if deck else y+86
                value = number(img,[x+6,badge_y-25,x+63,badge_y+26])['value']
            cards.append({'name':name,'bottom_badge':value,'score':round(score,3),'x':x,'y':y})
    return sorted(cards,key=lambda c:(c['x'],c['y']) if deck else (c['y']//55,c['x']))

def build_calibration(file):
    prepare()
    names=collection_templates()
    add_digit(load(IMAGES/'kampf-auswahl-1.png'),12,[613,414,663,469])
    reference=load(IMAGES/'kampf-spielstaerke-1.png')
    arrays={name:globals()[name] for name in ('deck_anchor','battle_anchor','collection_anchor','spells_anchor')}
    arrays['deck_label_anchor']=lettering(cut(load(IMAGES/'schlacht-teil-1.png'),[196,705,883,755]))
    arrays['plus_sign']=normalize(lettering(cut(reference,[57,1406,91,1450]))*255,40)
    arrays['template_features']=np.stack([entry['feature'] for entry in templates])
    arrays['template_names']=np.array([entry['name'] for entry in templates])
    arrays['template_sources']=np.array([entry['source'] for entry in templates])
    arrays['digit_values']=np.array([value for value,_ in numbers])
    arrays['digit_features']=np.stack([pattern for _,pattern in numbers])
    for kind,entries in names.items():
        arrays[kind+'_names']=np.array([name for name,_ in entries])
        for index,(_,pattern) in enumerate(entries):
            arrays[f'{kind}_{index}']=pattern
    for index in range(3):
        left=35+index*340
        arrays[f'legacy_{index}']=cv2.cvtColor(cut(reference,[left+22,1385,left+300,1475]),cv2.COLOR_BGR2GRAY)
    np.savez_compressed(file,**arrays)

enemy_snail_feature=feature(decode(ROOT/'data'/'enemy-snail-reference.png'))
calibration_file=ROOT/'data'/'calibration.npz'
if __name__=='__main__' and '--build-calibration' in sys.argv:
    build_calibration(calibration_file)
    sys.exit()
with np.load(calibration_file,allow_pickle=False) as calibration:
    deck_anchor,battle_anchor,collection_anchor,spells_anchor,deck_label_anchor,plus_sign=(
        calibration[name] for name in ('deck_anchor','battle_anchor','collection_anchor','spells_anchor','deck_label_anchor','plus_sign')
    )
    templates=[{'name':name,'source':source,'feature':pattern} for name,source,pattern in
               zip(calibration['template_names'],calibration['template_sources'],calibration['template_features'])]
    numbers=list(zip(calibration['digit_values'].tolist(),calibration['digit_features']))
    collection_names={kind:[(name,calibration[f'{kind}_{index}'])
                            for index,name in enumerate(calibration[kind+'_names'])] for kind in ('units','spells')}
    legacy_captions=[(calibration[f'legacy_{index}'],name,action)
                     for index,name,action in [(0,'Boomling','add'),(1,'Astra','add'),(2,'Astra','multiply')]]

# Labeled level-12 badge from a verified card, usable for both game languages.
add_digit(decode(ROOT/'data'/'deck-choice-tnt.png'),12,[54,392,109,458])

def spell_caption_patterns(names):
    patterns={}
    for name,mask in names:
        patterns.setdefault(name,[]).extend(
            cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST)
            for scale in (.8,.9,1,1.1,1.2,1.3,1.4,1.5,1.6,1.75))
    return patterns

with np.load(ROOT/'data'/'spell-captions.npz',allow_pickle=False) as captions:
    verified_spell_names=[(name,captions[f'name_{i}']) for i,name in enumerate(captions['names'].tolist())]
    verified_english_spell_names=[(name,captions[f'english_{i}']) for i,name in enumerate(captions['english_names'].tolist())]
german_spell_names=spell_caption_patterns(collection_names['spells']+verified_spell_names)
english_spell_names=spell_caption_patterns(vision_english.collection_names['spells']+verified_english_spell_names)
comeback_label=(cv2.imdecode(np.fromfile(str(ROOT/'data'/'comeback-label.png'),dtype=np.uint8),cv2.IMREAD_GRAYSCALE)>0).astype(np.uint8)
calibrated_names=[
    (name,np.array([[int(pixel) for pixel in row] for row in rows],dtype=np.uint8))
    for name,patterns in json.loads((ROOT/'data'/'battle-names.json').read_text(encoding='utf-8')).items()
    for rows in (patterns if isinstance(patterns[0],list) else [patterns])
]
splime_caption_mask=(cv2.imdecode(np.fromfile(str(ROOT/'data'/'splime-caption.png'),dtype=np.uint8),cv2.IMREAD_GRAYSCALE)>0).astype(np.uint8)
calibrated_names.append(('Splime',splime_caption_mask))
battle_names=[
    (name,cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST))
    for name,mask in collection_names['units']+calibrated_names
    for scale in (.85,.90,.95,1,1.05,1.10,1.15,1.20,1.25,1.30,1.35,1.40)
]
english_battle_names=[
    (name,cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST))
    for name,mask in vision_english.collection_names['units']+vision_english.battle_names+[('Splime',splime_caption_mask)]
    for scale in (.85,.90,.95,1,1.05,1.10,1.15,1.20,1.25)
]
enemy_deck_names_de=[(name,cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST)) for name,mask in collection_names['units']+calibrated_names for scale in (.40,.45,.50,.55,.60,.65,.70,.75,.80,.85,.90,.95,1.0,1.05,1.10,1.15,1.20)]
own_captain_mask=(cv2.imdecode(np.fromfile(str(ROOT/'data'/'own-captain-caption.png'),dtype=np.uint8),cv2.IMREAD_GRAYSCALE)>0).astype(np.uint8)
enemy_deck_names_de.extend(('Kapitän',cv2.resize(own_captain_mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST)) for scale in (.9,.95,1,1.05,1.1))
enemy_deck_names_en=[(name,cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST)) for name,mask in vision_english.collection_names['units']+vision_english.battle_names+[('Splime',splime_caption_mask)] for scale in (.40,.45,.50,.55,.60,.65,.70,.75,.80,.85,.90,.95,1.0,1.05,1.10,1.15,1.20)]
action_digits=[(value,template) for value,template in numbers if 1<=value<=9]
for value,rows in json.loads((ROOT/'data'/'choice-digits.json').read_text(encoding='utf-8')).items():
    action_digits.append((int(value),np.array([[int(pixel) for pixel in row] for row in rows],dtype=np.float32)))
def banner_mask(rows):
    return np.array([[int(pixel) for pixel in row] for row in rows],dtype=np.uint8)

banner_samples=json.loads((ROOT/'data'/'enemy-banner.json').read_text(encoding='utf-8'))
banner_names=[(name,cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST))
              for name,mask in collection_names['units']+calibrated_names
              for scale in (1.0,1.15,1.3,1.45,1.6,1.75,1.9,2.05)]
banner_names.extend((name,cv2.resize(banner_mask(rows),None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST))
                    for name,rows in banner_samples['names'].items() for scale in (.94,1,1.06,1.12))
banner_names.extend((name,cv2.resize(banner_mask(rows),None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST))
                    for name,patterns in banner_samples.get('extra_names',{}).items()
                    for rows in patterns for scale in (.94,1,1.06,1.12))
english_banner_names=[
    (name,cv2.resize(mask,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST))
    for name,mask in [*vision_english.banner_names,
                      *((name,banner_mask(rows)) for name,rows in banner_samples.get('english_names',{}).items())]
    for scale in (.94,1,1.06,1.12)]
spell_button_star=decode(ROOT/'data'/'spells-button.png')
banner_glyphs={key:normalize(banner_mask(rows)*255,40) for key,rows in banner_samples['glyphs'].items()}
banner_digits=action_digits+[(int(key),mask) for key,mask in banner_glyphs.items() if key.isdigit()]
multiply_sign=cv2.warpAffine(plus_sign,cv2.getRotationMatrix2D((20,20),45,1),(40,40))
showdown_counters=[
    (int(step),np.array([[int(pixel) for pixel in row] for row in rows],dtype=np.uint8))
    for step,rows in json.loads((ROOT/'data'/'showdown-steps.json').read_text(encoding='utf-8')).items()
]
if '--file' in sys.argv:
    print(json.dumps(recognize(sys.argv[sys.argv.index('--file')+1]),ensure_ascii=False))
elif __name__ == '__main__':
    print(json.dumps({'ready':True}),flush=True)
    for line in sys.stdin:
        try:
            req=json.loads(line)
            if 'preparation' in req:
                images = []
                for item in req['preparation']:
                    try:
                        cards=read_collection(item['path'],item['kind'])
                        lineup=read_collection(item['path'],'deck-'+item['kind']) if item['kind'] in ('units','spells') else []
                        images.append({**item,'cards':cards,'lineup':lineup})
                    except (ValueError,cv2.error) as exc:
                        images.append({**item,'cards':[],'error':str(exc)})
                result={'images':images}
            elif req.get('reviewCrop'):
                raw=decode(req['path'])
                geometry=screen_geometry(raw)
                image=normalize_screen(raw,geometry['content']) if geometry else None
                crop=cut(image,[25,900,1055,1565]) if image is not None else None
                ok,png=cv2.imencode('.png',crop) if crop is not None else (False,None)
                result={'image':base64.b64encode(png).decode('ascii') if ok else None}
            elif req.get('bannerTemplate'):
                raw=decode(req['path'])
                geometry=screen_geometry(raw)
                result={'rows':banner_template(normalize_screen(raw,geometry['content'])) if geometry else None}
            elif req.get('geometryOnly'):
                result={'geometry':screen_geometry(decode(req['path']))}
            else:
                result=recognize(req['path'],set(req.get('preferred') or []),req.get('language','de'),req.get('learnedBanners') or (),req.get('learnedReferences') or (),req.get('fieldAnalysis',True))
            result['id']=req['id']
        except Exception as exc:
            result={'id':req.get('id') if 'req' in locals() else None,'error':str(exc)}
        print(json.dumps(result,ensure_ascii=False),flush=True)
