import unittest
from pathlib import Path
import cv2
import vision

class PaidLobbyNavigationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.small=vision.decode(Path(__file__).resolve().parent/'data'/'test-paid-lobby-200.png')

    def test_paid_lobby_with_200_coins(self):
        result=vision.game_navigation(self.small,None)
        self.assertIsNotNone(result)
        self.assertEqual((result['step'],result['mode']),('home','arena'))
        self.assertTrue(.4<result['point'][0]<.6 and .73<result['point'][1]<.84)

    def test_gray_coin_is_not_a_paid_lobby(self):
        image=self.small.copy()
        roi=image[280:288,88:97]
        gray=cv2.cvtColor(roi,cv2.COLOR_BGR2GRAY)
        image[280:288,88:97]=cv2.cvtColor(gray,cv2.COLOR_GRAY2BGR)
        self.assertIsNone(vision.game_navigation(image,None))

    def test_missing_battle_label_is_not_a_paid_lobby(self):
        image=self.small.copy()
        image[266:278,55:111]=0
        self.assertIsNone(vision.game_navigation(image,None))

if __name__=='__main__':
    unittest.main()
