"""Evaluate field recognition on whole matches withheld from template training."""
import sys, json, time, hashlib
from collections import Counter
import vision

def digest(path):
    with open(path,'rb') as handle:
        return hashlib.sha256(handle.read()).digest()

def evaluate(data):
    # Exact duplicate screenshots must never be present on both sides.
    test_hashes={digest(case['path']) for case in data['cases']}
    examples=[entry for entry in data['examples'] if digest(entry['path']) not in test_hashes]
    result={side:dict(images=0,matches=[],tp=0,fp=0,fn=0,errors=0,countEligible=0,countExact=0,countAbsoluteError=0,stageEligible=0,timesMs=[],types={}) for side in ('own','enemy')}
    for case in data['cases']:
        out=result[case['side']]
        out['images']+=1
        if case['matchId'] not in out['matches']:out['matches'].append(case['matchId'])
        truth={entry['name'] for entry in case['truth']}
        try:
            started=time.perf_counter()
            prediction=vision.match_field_references(vision.load(case['path']),examples,case['side'])
            out['timesMs'].append(round((time.perf_counter()-started)*1000))
        except Exception:
            out['errors']+=1
            continue
        names={entry['name'] for entry in prediction}
        out['tp']+=len(truth&names);out['fp']+=len(names-truth);out['fn']+=len(truth-names)
        for name in truth|names:
            per=out['types'].setdefault(name,{'tp':0,'fp':0,'fn':0})
            per['tp']+=int(name in truth and name in names)
            per['fp']+=int(name not in truth and name in names)
            per['fn']+=int(name in truth and name not in names)
        for name in truth:
            rows=[entry for entry in case['truth'] if entry['name']==name]
            counts={entry['count'] for entry in rows if entry.get('count') is not None}
            if len(counts)==1:
                actual=next(iter(counts));estimated=next((entry['visualMatches'] for entry in prediction if entry['name']==name),0)
                out['countEligible']+=1;out['countExact']+=int(actual==estimated);out['countAbsoluteError']+=abs(actual-estimated)
            if any(entry.get('stage') is not None for entry in rows):out['stageEligible']+=1
    for out in result.values():
        out['matches']=len(out['matches'])
        out['precision']=out['tp']/(out['tp']+out['fp']) if out['tp']+out['fp'] else None
        out['recall']=out['tp']/(out['tp']+out['fn']) if out['tp']+out['fn'] else None
        out['maxTimeMs']=max(out.pop('timesMs'),default=None)
    return result

if __name__=='__main__':
    try: print(json.dumps(evaluate(json.load(sys.stdin)),ensure_ascii=False),flush=True)
    except Exception as error:
        print(str(error),file=sys.stderr,flush=True);sys.exit(1)
