"""CPU field pilot. ONNX prototype classification with local template proposals.

This is deliberately not a pretrained general-purpose neural object detector.
Examples come only from player-labelled, non-test matches. Similarity values
are uncalibrated scores, not probabilities. Hidden figures remain unknown.
"""
import hashlib
import json
import time
from collections import defaultdict
import cv2
import numpy as np

VERSION = 'army-prototypes-v3'
CANON = {'Verwüster': 'Zerstörer', 'Bientank': 'Bienenkorb'}
BODY_SCALES = (.62, .74, .86, 1., 1.14, 1.28, 1.42)
PILOT_SIDE_BUDGET_MS = 500
BODY_CORRELATION = .82
OUTSIDE_POOL_BODY_CORRELATION = .90


def canonical(name):
    return CANON.get(name, name)


def overlap(a, b):
    intersection = max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))
    return intersection / max(1, min((a[2]-a[0])*(a[3]-a[1]), (b[2]-b[0])*(b[3]-b[1])))


def descriptor(patch):
    gray = cv2.resize(cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY), (16, 24)).astype(np.float32)
    # Brightness normalization tolerates dim overlays; gradients reduce background bias.
    gray = (gray-gray.mean()) / max(12., float(gray.std()))
    edge = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    vertical = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    vector = np.concatenate([gray.ravel(), edge.ravel()*.15, vertical.ravel()*.15])
    return vector / max(1e-8, float(np.linalg.norm(vector)))


def body_patterns(gray):
    height, width = gray.shape
    # Keep the body and its outline. The head and nearby sprites can change
    # with evolution, spell effects, or a tighter formation.
    body = gray[int(.33 * height):int(.90 * height), int(.15 * width):int(.85 * width)]
    patterns = []
    for scale in BODY_SCALES:
        h, w = (round(length * .35 * scale) for length in body.shape)
        if min(h, w) < 9:
            continue
        pattern = cv2.resize(body, (w, h), interpolation=cv2.INTER_AREA)
        if np.std(pattern) >= 8:
            patterns.append(pattern)
    return patterns


def enemy_mole_instances(field, left, top):
    """Count distinct visible caps supported by the outline and brown body below."""
    hue, saturation, value = cv2.split(cv2.cvtColor(field, cv2.COLOR_BGR2HSV))
    caps = ((hue <= 4) | (hue >= 178)) & (saturation >= 125) & (saturation <= 150) & (value >= 134)
    bodies = (hue >= 11) & (hue <= 15) & (saturation >= 95) & (saturation <= 131) & (value >= 69) & (value <= 172)
    _, _, stats, centers = cv2.connectedComponentsWithStats(caps.astype(np.uint8))
    instances = []
    for (x, y, width, height, area), (center, _) in zip(stats[1:], centers[1:]):
        if not (17 <= width <= 52 and 12 <= height <= 38 and
                1 <= width / height <= 2.55 and .55 <= area / (width * height) <= .92):
            continue
        start, end = int(center - .34 * width), int(center + .34 * width) + 1
        rim = y + height
        body = bodies[rim + max(2, round(height * .10)):rim + round(height * .95), start:end]
        outline = value[rim - 1:rim + max(3, round(height * .27)), start:end]
        if not body.size or body.mean() < .51 or (outline < 70).mean() < .18:
            continue
        # The score is the evidence tier for this combined visual signature.
        # The box covers only the portion used to verify this instance.
        instances.append(dict(name='Maulwurf', box=[int(x+left), int(y+top),
            int(x+width+left), min(top+field.shape[0], int(rim+round(height*.95)+top))],
            score=.90, stage=None, formConfidence='unknown', appearanceId='mole-red-cap',
            poolConflict=False, typeConfidence='candidate', countConfidence='lower_bound', source='mole_signature'))
    return instances


class PrototypeDetector:
    def __init__(self, examples, loader, backend='numpy'):
        self.templates = []
        self.backend = backend
        self.session = None
        seen = set()
        images = {}
        for entry in examples:
            if entry.get('phase') not in ('own_field', 'enemy_field') or not entry.get('name'):
                continue
            box = entry.get('box', [])
            if len(box) != 4:
                continue
            key = (entry['path'], tuple(box), canonical(entry['name']), entry.get('stage'))
            if key in seen:
                continue
            seen.add(key)
            try:
                if entry['path'] not in images:
                    images[entry['path']] = loader(entry['path'])
                image = images[entry['path']]
                x1, y1, x2, y2 = map(int, box)
                if not (0 <= x1 < x2 <= 1080 and 0 <= y1 < y2 <= 2340):
                    continue
                patch = image[y1:y2, x1:x2]
                if min(patch.shape[:2]) < 16 or np.std(patch) < 8:
                    continue
                full_gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
                self.templates.append(dict(name=canonical(entry['name']), stage=entry.get('stage'),
                    appearanceId=hashlib.sha256(patch.tobytes()).hexdigest()[:16],
                    gray=cv2.resize(full_gray, None, fx=.35, fy=.35, interpolation=cv2.INTER_AREA),
                    fullGray=full_gray, side=entry['phase'].split('_')[0],
                    bodyPatterns=body_patterns(full_gray),
                    vector=descriptor(patch), source=entry.get('referenceId'), matchId=entry.get('matchId')))
                if len(self.templates) >= 80:
                    break
            except (ValueError, OSError, cv2.error):
                continue
        self.weights = np.stack([row['vector'] for row in self.templates], axis=1) if self.templates else None
        if backend == 'onnx' and self.templates:
            # The same prototype bank as NumPy, executed by ONNX Runtime on CPU.
            import onnx
            import onnxruntime as ort
            from onnx import helper, numpy_helper, TensorProto
            graph = helper.make_graph([helper.make_node('MatMul', ['features', 'prototypes'], ['scores'])],
                'DraftCoachPrototypeHead', [helper.make_tensor_value_info('features', TensorProto.FLOAT, [None, self.weights.shape[0]])],
                [helper.make_tensor_value_info('scores', TensorProto.FLOAT, [None, self.weights.shape[1]])],
                [numpy_helper.from_array(self.weights.astype(np.float32), name='prototypes')])
            self.model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 17)], ir_version=10,
                producer_name='Draft Coach local prototype pilot')
            onnx.checker.check_model(self.model)
            options = ort.SessionOptions()
            options.intra_op_num_threads = 1
            options.inter_op_num_threads = 1
            self.session = ort.InferenceSession(self.model.SerializeToString(), sess_options=options, providers=['CPUExecutionProvider'])

    def detect_bodies(self, field, side, top, deadline, pool):
        best = {}
        truncated = False
        for template in self.templates:
            if template['side'] != side:
                continue
            name = template['name']
            conflict = bool(pool and name not in pool)
            for pattern in template['bodyPatterns']:
                if time.perf_counter() >= deadline:
                    truncated = True
                    break
                height, width = pattern.shape
                if height > field.shape[0] or width > field.shape[1]:
                    continue
                _, score, _, (x, y) = cv2.minMaxLoc(cv2.matchTemplate(field, pattern, cv2.TM_CCOEFF_NORMED))
                threshold = OUTSIDE_POOL_BODY_CORRELATION if conflict else BODY_CORRELATION
                if score < threshold or (name in best and score <= best[name]['score']):
                    continue
                box = [round(x/.35)+25, round(y/.35)+top,
                       round((x+width)/.35)+25, round((y+height)/.35)+top]
                best[name] = dict(name=name, box=box, score=float(score), stage=None,
                                  formConfidence='unknown', appearanceId=template['appearanceId'],
                                  poolConflict=conflict, typeConfidence='candidate',
                                  countConfidence='lower_bound', source='body_template')
            if truncated:
                break
        return sorted(best.values(), key=lambda row: -row['score']), truncated

    def detect(self, image, side, phase='battle_choice', budget_ms=PILOT_SIDE_BUDGET_MS, candidates=()):
        started = time.perf_counter()
        # Never search choice-card illustrations as if they were deployed troops.
        top, bottom = (325, 1015) if side == 'enemy' else ((1580, 2090) if phase in ('battle_choice', 'spell_choice') else (1170, 2090))
        field = image[top:bottom, 25:1055]
        small = cv2.resize(cv2.cvtColor(field, cv2.COLOR_BGR2GRAY), None, fx=.35, fy=.35, interpolation=cv2.INTER_AREA)
        # Reading only part of a Battle deck gives no negative evidence about
        # units that may be in the remaining slots.
        roster = {canonical(name) for name in candidates if name}
        pool = roster if len(roster) == 4 else set()
        moles = []
        if side == 'enemy' and 'Maulwurf' in pool and phase in ('battle_choice', 'spell_choice') and budget_ms > 0:
            moles = enemy_mole_instances(image[400:945, 25:1055], 25, 400)
        # Partition proposal time so each method can contribute under load.
        body_deadline = started + .55 * budget_ms / 1000
        bodies, truncated = self.detect_bodies(small, side, top, body_deadline, pool)
        proposals = []
        for template in self.templates:
            if (time.perf_counter()-started)*1000 > budget_ms:
                truncated = True
                break
            for scale in (.86, 1., 1.14):
                pattern = cv2.resize(template['gray'], None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
                h, w = pattern.shape
                if h > small.shape[0] or w > small.shape[1]:
                    continue
                scores = cv2.matchTemplate(small, pattern, cv2.TM_CCOEFF_NORMED)
                for _ in range(36):
                    _, score, _, (x, y) = cv2.minMaxLoc(scores)
                    if score < .80:
                        break
                    box = [round(x/.35)+25, round(y/.35)+top, round((x+w)/.35)+25, round((y+h)/.35)+top]
                    proposals.append(dict(box=box, correlation=float(score), template=template))
                    scores[max(0,y-h//2):y+h//2+1, max(0,x-w//2):x+w//2+1] = -1
        # Bound ONNX inference and cross-class suppression, including crowded scenes.
        spatial = []
        for row in sorted(proposals, key=lambda row: -row['correlation']):
            if not any(overlap(row['box'], old['box']) > .65 for old in spatial):
                spatial.append(row)
            if len(spatial) >= 200:
                truncated = True
                break
        instances, unknown = [], []
        if spatial and self.weights is not None:
            # Proposal downsampling can shift an otherwise exact icon by 1–3
            # pixels. Refine locally at full resolution instead of lowering the
            # class threshold (which would also accept more wrong types).
            full_gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            for row in spatial:
                x1,y1,x2,y2 = row['box']
                pattern = cv2.resize(row['template']['fullGray'], (x2-x1,y2-y1))
                left,right = max(25,x1-3),min(1055,x2+3)
                above,below = max(top,y1-3),min(bottom,y2+3)
                local = full_gray[above:below,left:right]
                if local.shape[0]>=pattern.shape[0] and local.shape[1]>=pattern.shape[1]:
                    _,_,_,(x,y) = cv2.minMaxLoc(cv2.matchTemplate(local,pattern,cv2.TM_CCOEFF_NORMED))
                    row['box'] = [left+x,above+y,left+x+x2-x1,above+y+y2-y1]
            features = np.stack([descriptor(image[r['box'][1]:r['box'][3], r['box'][0]:r['box'][2]]) for r in spatial]).astype(np.float32)
            scores = self.session.run(None, {'features': features})[0] if self.session else features @ self.weights
            for row, values in zip(spatial, scores):
                ranked = sorted(enumerate(values), key=lambda pair: -pair[1])
                best, score = ranked[0]
                exemplar = self.templates[best]
                other = next((float(value) for i, value in ranked if self.templates[i]['name'] != exemplar['name']), -1.)
                # Deck knowledge is a hint only. Never coerce an unknown sprite into the pool.
                conflict = bool(pool and exemplar['name'] not in pool)
                if score < (.94 if conflict else .89) or score-other < .055:
                    unknown.append(dict(box=row['box'], reason='ambiguous_type'))
                    continue
                stages = {self.templates[i]['stage'] for i, value in ranked if self.templates[i]['name'] == exemplar['name'] and score-value < .035}
                stage = exemplar['stage'] if len(stages) == 1 else None
                instances.append(dict(name=exemplar['name'], box=row['box'], score=round(float(score), 4),
                    stage=stage, formConfidence='labelled_prototype' if stage is not None else 'unknown',
                    appearanceId=exemplar['appearanceId'], poolConflict=conflict,
                    typeConfidence='candidate', countConfidence='lower_bound', source='onnx_prototype' if self.session else 'numpy_prototype'))
        detected_names = {row['name'] for row in instances}
        for body in bodies:
            if body['name'] in detected_names:
                continue
            if any(overlap(body['box'], row['box']) > .65 for row in instances):
                unknown.append(dict(box=body['box'], reason='ambiguous_type'))
                continue
            if any(other['name'] != body['name'] and abs(other['score'] - body['score']) < .055
                   and overlap(body['box'], other['box']) > .65 for other in bodies):
                unknown.append(dict(box=body['box'], reason='ambiguous_type'))
                continue
            # A body match provides one example of the type. Other instances
            # and the evolution stage need separate evidence.
            body['score'] = round(body['score'], 4)
            instances.append(body)
        if moles:
            instances = [row for row in instances if row['name'] != 'Maulwurf' and
                         not any(overlap(row['box'], mole['box']) > .65 for mole in moles)]
            instances.extend(moles)
        groups = []
        by_name = defaultdict(list)
        for instance in instances:
            by_name[instance['name']].append(instance)
        for name, rows in sorted(by_name.items()):
            groups.append(dict(name=name, visibleMinimum=len(rows), visibleMaximum=None,
                stage=None, forms=[dict(stage=stage, visibleMinimum=sum(r['stage'] == stage for r in rows)) for stage in sorted({r['stage'] for r in rows if r['stage'] is not None})],
                unknownFormCount=sum(r['stage'] is None for r in rows),
                typeConfidence='candidate', countConfidence='lower_bound',
                similarity=max(r['score'] for r in rows), poolConflict=any(r['poolConflict'] for r in rows)))
        return dict(side=side, groups=groups, instances=instances, unknownRegions=unknown,
            completeness='unknown', truncated=truncated, budgetMs=budget_ms,
            elapsedMs=round((time.perf_counter()-started)*1000, 2), method=VERSION, backend=self.backend)
