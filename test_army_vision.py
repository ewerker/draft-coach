import importlib.util
from pathlib import Path
import tempfile
import unittest
import cv2
import numpy as np

spec=importlib.util.spec_from_file_location('army',Path(__file__).with_name('army-vision.py'))
army=importlib.util.module_from_spec(spec);spec.loader.exec_module(army)

class ArmyVision(unittest.TestCase):
    def setUp(self):
        self.image=np.full((2340,1080,3),120,np.uint8)
        self.pattern=np.full((100,80,3),120,np.uint8)
        cv2.ellipse(self.pattern,(40,53),(28,40),0,0,360,(30,30,30),-1)
        cv2.ellipse(self.pattern,(40,53),(22,34),0,0,360,(240,70,40),-1)
        cv2.circle(self.pattern,(33,30),9,(245,245,245),-1)
        cv2.rectangle(self.pattern,(29,60),(52,69),(10,10,10),-1)
        self.image[420:520,200:280]=self.pattern
        self.image[420:520,450:530]=self.pattern
        self.image[1720:1820,200:280]=self.pattern
        self.example=dict(path='image',phase='enemy_field',name='Verwüster',box=[200,420,280,520],stage=None)

    def test_shared_sprite_templates_keep_sides_separate_and_do_not_invent_forms(self):
        detector=army.PrototypeDetector([self.example],lambda _:self.image)
        enemy=detector.detect(self.image,'enemy')
        own=detector.detect(self.image,'own')
        self.assertEqual([(g['name'],g['visibleMinimum']) for g in enemy['groups']],[('Zerstörer',2)])
        self.assertEqual(own['groups'][0]['visibleMinimum'],1)
        self.assertEqual(own['groups'][0]['forms'],[])
        self.assertIsNone(own['groups'][0]['visibleMaximum'])

    def test_neither_choices_nor_blank_background_are_troops(self):
        detector=army.PrototypeDetector([self.example],lambda _:self.image)
        blank=np.full_like(self.image,120)
        blank[1100:1200,200:280]=self.pattern
        for side in ('enemy','own'):
            self.assertEqual(detector.detect(blank,side)['groups'],[])
        self.assertEqual(army.PrototypeDetector([],lambda _:self.image).detect(self.image,'own')['groups'],[])

    def test_body_can_identify_type_when_the_head_is_covered(self):
        example = {**self.example, 'stage': 2}
        detector = army.PrototypeDetector([example], lambda _: self.image)
        covered = np.full_like(self.image, 120)
        sprite = self.pattern.copy()
        # An overlay changes the upper third but leaves the body visible.
        sprite[:33] = np.random.default_rng(7).integers(0, 255, sprite[:33].shape, dtype=np.uint8)
        covered[420:520, 200:280] = sprite
        result = detector.detect(covered, 'enemy')
        self.assertEqual([(row['name'], row['source'], row['stage']) for row in result['instances']],
                         [('Zerstörer', 'body_template', None)])
        self.assertIsNone(result['groups'][0]['visibleMaximum'])

    @unittest.skipUnless(importlib.util.find_spec('onnx') and importlib.util.find_spec('onnxruntime'),'optional ONNX dependencies not installed')
    def test_onnx_and_numpy_detector_agree(self):
        numpy=army.PrototypeDetector([self.example],lambda _:self.image,'numpy')
        onnx=army.PrototypeDetector([self.example],lambda _:self.image,'onnx')
        a=numpy.detect(self.image,'enemy');b=onnx.detect(self.image,'enemy')
        self.assertEqual(a['groups'],b['groups'])
        self.assertEqual([r['box'] for r in a['instances']],[r['box'] for r in b['instances']])

    def test_elapsed_budget_is_reported_as_partial(self):
        detector=army.PrototypeDetector([self.example],lambda _:self.image)
        self.assertTrue(detector.detect(self.image,'own',budget_ms=-1)['truncated'])

if __name__=='__main__':unittest.main()
