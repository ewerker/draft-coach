"""Independent match-level field pilot; no threshold fitting on the test set."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time
import numpy as np
import vision

spec = importlib.util.spec_from_file_location('army_vision', Path(__file__).with_name('army-vision.py'))
army = importlib.util.module_from_spec(spec)
spec.loader.exec_module(army)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def empty():
    return dict(images=0, matches=set(), tp=0, fp=0, fn=0, errors=0, types={}, strata={},
        countEligible=0, countExact=0, countAbsoluteError=0, stageEligible=0, stageCorrect=0, times=[], truncated=0)


def score(out, case, prediction, elapsed, geometry, truncated=False):
    out['images'] += 1
    out['matches'].add(case['matchId'])
    names = {row['name'] for row in prediction}
    truth = {army.canonical(row['name']) for row in case['truth']}
    out['times'].append(elapsed)
    out['truncated'] += int(truncated)
    out['tp'] += len(names & truth)
    out['fp'] += len(names-truth)
    out['fn'] += len(truth-names)
    for name in truth | names:
        for destination, key in ((out['types'], name), (out['strata'], '|'.join([name, case.get('language', 'unknown'), geometry['layout'], case.get('phase') or 'unknown']))):
            row = destination.setdefault(key, dict(tp=0, fp=0, fn=0))
            row['tp'] += int(name in names and name in truth)
            row['fp'] += int(name in names and name not in truth)
            row['fn'] += int(name not in names and name in truth)
    for name in truth:
        rows = [r for r in case['truth'] if army.canonical(r['name']) == name]
        counts = {r['count'] for r in rows if r.get('count') is not None}
        predicted = next((r for r in prediction if r['name'] == name), None)
        # User count is the total of this type on the whole side; repeated boxes
        # with the same total must not be added together. Conflicts are excluded.
        if len(counts) == 1 and not truncated:
            actual = next(iter(counts))
            estimate = predicted.get('visibleMinimum', predicted.get('visualMatches', 0)) if predicted else 0
            out['countEligible'] += 1
            out['countExact'] += int(actual == estimate)
            out['countAbsoluteError'] += abs(actual-estimate)
        stages = {r['stage'] for r in rows if r.get('stage') is not None}
        for stage in stages:
            out['stageEligible'] += 1
            if predicted and any(form.get('stage') == stage for form in predicted.get('forms', [])):
                out['stageCorrect'] += 1


def finish(out):
    out['matches'] = len(out['matches'])
    out['precision'] = out['tp']/(out['tp']+out['fp']) if out['tp']+out['fp'] else None
    out['recall'] = out['tp']/(out['tp']+out['fn']) if out['tp']+out['fn'] else None
    out['countMAE'] = out['countAbsoluteError']/out['countEligible'] if out['countEligible'] else None
    out['stageAccuracy'] = out['stageCorrect']/out['stageEligible'] if out['stageEligible'] else None
    times = out.pop('times')
    out['latency'] = {label: round(float(np.percentile(times, pct)), 2) if times else None for label, pct in [('p50', 50), ('p95', 95), ('p99', 99), ('max', 100)]}
    out['maxTimeMs'] = out['latency']['max']
    for row in list(out['types'].values()) + list(out['strata'].values()):
        row['precision'] = row['tp']/(row['tp']+row['fp']) if row['tp']+row['fp'] else None
        row['recall'] = row['tp']/(row['tp']+row['fn']) if row['tp']+row['fn'] else None
    return out


def evaluate(data):
    started = time.perf_counter()
    hashes = {digest(case['path']) for case in data['cases']}
    examples = [entry for entry in data['examples'] if digest(entry['path']) not in hashes]
    backend = 'onnx' if importlib.util.find_spec('onnxruntime') and importlib.util.find_spec('onnx') else 'numpy'
    build_started = time.perf_counter()
    detector = army.PrototypeDetector(examples, vision.load, backend)
    build_ms = round((time.perf_counter()-build_started)*1000, 2)
    results = {engine: {side: empty() for side in ('own', 'enemy')} for engine in ('baseline', 'prototype')}
    controls = {engine: {side: empty() for side in ('own', 'enemy')} for engine in results}
    cases = []
    for case in data['cases']:
        geometry = None
        record = dict(id=case['id'], matchId=case['matchId'], side=case['side'], language=case.get('language'), predictions={})
        try:
            load_start = time.perf_counter()
            image, geometry = vision.load(case['path'], True)
            record['loadMs'] = round((time.perf_counter()-load_start)*1000, 2)
            for engine in results:
                begin = time.perf_counter()
                if engine == 'baseline':
                    prediction = vision.match_field_references(image, examples, case['side'])
                    truncated = False
                else:
                    detected = detector.detect(image, case['side'], case.get('phase') or 'battle_choice')
                    prediction, truncated = detected['groups'], detected['truncated']
                elapsed = round((time.perf_counter()-begin)*1000, 2)
                score(results[engine][case['side']], case, prediction, elapsed, geometry, truncated)
                if case.get('reviewPurpose') == 'control':
                    score(controls[engine][case['side']], case, prediction, elapsed, geometry, truncated)
                record['predictions'][engine] = dict(groups=prediction, elapsedMs=elapsed, truncated=truncated)
        except Exception as error:
            record['error'] = str(error)
            for engine in results:
                results[engine][case['side']]['errors'] += 1
                if case.get('reviewPurpose') == 'control':
                    controls[engine][case['side']]['errors'] += 1
        cases.append(record)
    for engine in results:
        for side in results[engine]:
            results[engine][side] = finish(results[engine][side])
            controls[engine][side] = finish(controls[engine][side])
    covered = {army.canonical(entry['name']) for entry in examples}
    return dict(schemaVersion=1, method=army.VERSION, backend=backend, selection='fixed_before_test',
        modelBuildMs=build_ms, elapsedMs=round((time.perf_counter()-started)*1000, 2),
        trainingExamples=len(examples), excludedDuplicateExamples=len(data['examples'])-len(examples),
        trainingTypes=sorted(covered), missingTypes=sorted(set(data.get('unitNames', []))-covered),
        independentTestMatches=sorted({case['matchId'] for case in data['cases']}),
        thresholds=dict(correlation=.80, descriptor=.89, outsidePoolDescriptor=.94, classMargin=.055,
                        bodyCorrelation=army.BODY_CORRELATION, outsidePoolBodyCorrelation=army.OUTSIDE_POOL_BODY_CORRELATION),
        prototypeBudgetMsPerSide=army.PILOT_SIDE_BUDGET_MS,
        results=results, controlResults=controls, cases=cases,
        limits=['Type scores are not probabilities.', 'Counts are visible minima, not total army sizes.',
            'No learned evolution label when the player left stage blank.', 'Combat positions do not prove army ownership.',
            'No automatic rule activation or tactical efficacy claim.'])


if __name__ == '__main__':
    try:
        print(json.dumps(evaluate(json.load(sys.stdin)), ensure_ascii=False), flush=True)
    except Exception as error:
        print(str(error), file=sys.stderr, flush=True)
        sys.exit(1)
