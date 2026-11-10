import tempfile
import unittest
from pathlib import Path
import cv2
import numpy as np
import vision

class FieldReferenceTests(unittest.TestCase):
    def test_separate_sides_and_multiple_visual_matches(self):
        rng=np.random.default_rng(42)
        image=np.full((2340,1080,3),125,dtype=np.uint8)
        pattern=rng.integers(0,256,(60,60,3),dtype=np.uint8)
        image[400:460,200:260]=pattern
        image[400:460,400:460]=pattern
        image[1500:1560,200:260]=pattern
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'source.png'
            cv2.imencode('.png',image)[1].tofile(str(path))
            enemy={'path':str(path),'phase':'enemy_field','name':'A','box':[200,400,260,460]}
            own={'path':str(path),'phase':'own_field','name':'B','box':[200,1500,260,1560]}
            observed=vision.match_field_references(image,[enemy,own],'enemy')
            self.assertEqual([(item['name'],item['visualMatches']) for item in observed],[('A',2)])
            observed=vision.match_field_references(image,[enemy,own],'own')
            self.assertEqual([(item['name'],item['visualMatches']) for item in observed],[('B',1)])
            self.assertTrue(observed[0]['tentative'])
            self.assertIsNone(observed[0]['strength'])

if __name__=='__main__':unittest.main()
