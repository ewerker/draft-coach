import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('field_learning',Path(__file__).with_name('field-learning.py'))
learning=importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)

class FieldLearningTests(unittest.TestCase):
    def test_truth_metrics_and_duplicate_training_are_independent(self):
        with tempfile.TemporaryDirectory() as tmp:
            test=Path(tmp)/'test.png';test.write_bytes(b'case')
            duplicate=Path(tmp)/'duplicate.png';duplicate.write_bytes(b'case')
            training=Path(tmp)/'training.png';training.write_bytes(b'different')
            examples=[dict(path=str(duplicate),phase='enemy_field',name='A'),dict(path=str(training),phase='enemy_field',name='B')]
            cases=[dict(path=str(test),matchId='m1',side='enemy',truth=[dict(name='A',count=3,stage=1),dict(name='B',count=None,stage=None)])]
            def recognize(image,used,side):
                self.assertEqual([e['name'] for e in used],['B'])
                return [dict(name='A',visualMatches=2),dict(name='C',visualMatches=1)]
            with patch.object(learning.vision,'load',return_value=object()),patch.object(learning.vision,'match_field_references',side_effect=recognize):
                metrics=learning.evaluate(dict(examples=examples,cases=cases))['enemy']
            self.assertEqual((metrics['tp'],metrics['fp'],metrics['fn']),(1,1,1))
            self.assertEqual((metrics['precision'],metrics['recall']),(.5,.5))
            self.assertEqual((metrics['countEligible'],metrics['countExact'],metrics['countAbsoluteError']),(1,0,1))
            self.assertEqual(metrics['stageEligible'],1)

if __name__=='__main__':unittest.main()
