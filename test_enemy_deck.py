import unittest
from pathlib import Path
import numpy as np
import vision

class OpponentDeckRecognition(unittest.TestCase):
    def image(self,number):
        image=np.zeros((2340,1080,3),dtype=np.uint8)
        image[280:650,:910]=vision.decode(Path('data')/('opponent-deck-'+str(number)+'.png'))
        return image

    def test_caption_corrects_obergeist_and_does_not_invent_fourth_card(self):
        image=self.image(30830)
        self.assertEqual(vision.read_enemy_deck_caption(image,10,0)['name'],'Maulwurf')
        self.assertEqual(vision.read_enemy_deck_caption(image,235,0)['name'],'Obergeist')
        self.assertEqual(vision.read_enemy_deck_caption(image,685,0),{})

    def test_tnt_label_and_level(self):
        image=self.image(30577)
        self.assertEqual(vision.read_enemy_deck_caption(image,460,0)['name'],'TNT')
        self.assertEqual(vision.number(image,[480,560,546,625])['value'],13)

if __name__=='__main__': unittest.main()
