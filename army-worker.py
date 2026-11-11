"""Separate, bounded field observation worker; never blocks choice recognition."""
import importlib.util
import json
from pathlib import Path
import sys
import time
import hashlib
import cv2
import vision

spec = importlib.util.spec_from_file_location('army_vision', Path(__file__).with_name('army-vision.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
detector, revision = None, None

def analyze(request):
    global detector, revision
    started = time.perf_counter()
    if request.get('revision') != revision or detector is None:
        backend = 'onnx' if importlib.util.find_spec('onnxruntime') and importlib.util.find_spec('onnx') else 'numpy'
        test_hashes = {hashlib.sha256(Path(path).read_bytes()).digest() for path in request.get('testPaths', [])}
        examples = [row for row in request.get('examples', []) if hashlib.sha256(Path(row['path']).read_bytes()).digest() not in test_hashes]
        detector = module.PrototypeDetector(examples, vision.load, backend)
        revision = request.get('revision')
    image, geometry = vision.load(request['path'], True)
    sides = {}
    for side in ('enemy', 'own'):
        sides[side] = detector.detect(image, side, request.get('phase'),
            candidates=request.get('enemyCandidates', []) if side == 'enemy' and request.get('mode') == 'arena' else (),
            own_candidates=request.get('ownCandidates', []) if side == 'own' else ())
    return dict(schemaVersion=1, frameId=request['id'], matchId=request.get('matchId'), capturedAt=request['capturedAt'],
        phase=request['phase'], language=request.get('language', 'de'), mode=request.get('mode'), geometry=geometry,
        modelRevision=revision, backend=detector.backend, sides=sides,
        elapsedMs=round((time.perf_counter()-started)*1000, 2))

if __name__ == '__main__':
    cv2.setNumThreads(1)
    print(json.dumps({'ready': True}), flush=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            print(json.dumps({'id': request['id'], 'result': analyze(request)}, ensure_ascii=False), flush=True)
        except Exception as error:
            print(json.dumps({'id': locals().get('request', {}).get('id'), 'error': str(error)}), flush=True)
