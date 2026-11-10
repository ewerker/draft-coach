import unittest
from pathlib import Path
import cv2
import vision

class NewGermanResultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.image=vision.decode(Path(__file__).resolve().parent/'data'/'test-new-result-de.png')

    def test_loss_and_continue_are_recognized(self):
        self.assertEqual(vision.match_outcome_small(self.image),'verloren')
        nav=vision.game_navigation(self.image,'verloren')
        self.assertEqual(nav['step'],'result')
        self.assertTrue(.4<nav['point'][0]<.6 and .85<nav['point'][1]<.98)

    def test_missing_heading_or_button_does_not_confirm_result(self):
        for box in [(25,67,16,152),(300,355,25,143)]:
            image=self.image.copy();y1,y2,x1,x2=box;image[y1:y2,x1:x2]=0
            self.assertIsNone(vision.new_result_navigation(image,'verloren'))
            self.assertIsNone(vision.match_outcome_small(image))

    def test_win_and_continue_are_recognized(self):
        image=vision.decode(Path(__file__).resolve().parent/'data'/'test-new-win-de.png')
        self.assertEqual(vision.match_outcome_small(image),'gewonnen')
        self.assertEqual(vision.game_navigation(image,'gewonnen')['step'],'result')
        self.assertIsNone(vision.new_result_navigation(image,'verloren'))
        image[300:355,25:143]=0
        self.assertIsNone(vision.match_outcome_small(image))

    def test_german_mastery_claim_requires_title_and_button(self):
        image=vision.decode(Path(__file__).resolve().parent/'data'/'test-mastery-claim-de.png')
        nav=vision.game_navigation(image,None)
        self.assertEqual(nav['step'],'reward')
        self.assertTrue(.35<nav['point'][0]<.65 and .72<nav['point'][1]<.9)
        for box in [(102,155,18,150),(268,323,30,138)]:
            copy=image.copy();y1,y2,x1,x2=box;copy[y1:y2,x1:x2]=0
            self.assertIsNone(vision.game_navigation(copy,None))

    def test_replay_requires_both_buttons(self):
        image=vision.decode(Path(__file__).resolve().parent/'data'/'test-new-replay-de.png')
        nav=vision.game_navigation(image,None)
        self.assertEqual((nav['step'],nav['mode']),('replay','draft'))
        self.assertTrue(.1<nav['point'][0]<.5 and .8<nav['point'][1]<.95)
        image[291:340,83:163]=0
        self.assertIsNone(vision.game_navigation(image,None))

if __name__=='__main__':unittest.main()
