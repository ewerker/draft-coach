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

class DraftEvidence(unittest.TestCase):
    def test_goose_plus_five_is_normal_but_special_offers_are_not(self):
        goose={'name':'Gans','action':'add','quantity':5}
        self.assertTrue(vision.normal_draft_deck_evidence('battle_choice',False,[goose],False))
        self.assertFalse(vision.normal_draft_deck_evidence('battle_choice',True,[goose],False))
        self.assertFalse(vision.normal_draft_deck_evidence('battle_choice',False,[{'name':'Assassine','action':'add','quantity':12}],False))
        self.assertFalse(vision.normal_draft_deck_evidence('battle_choice',False,[{'name':'Gans','action':'multiply_upgrade','quantity':2}],False))

class DeckCaption(unittest.TestCase):
    def test_tnt_on_real_card_can_resolve_unknown_icon(self):
        image=np.zeros((2340,1080,3),dtype=np.uint8)
        image[850:1320,0:360]=vision.decode(Path('data')/'deck-choice-tnt.png')
        caption=vision.read_deck_caption(image,40,0,'de')
        self.assertEqual(caption['name'],'TNT')
        self.assertEqual(vision.number(image,[54,1242,109,1308])['value'],12)
        self.assertTrue(vision.use_deck_caption({'name':None},caption,'full','de'))
        self.assertFalse(vision.use_deck_caption({'name':'Ritter'},caption,'full','de'))
        self.assertFalse(vision.use_deck_caption({'name':None},{**caption,'captionMargin':.1},'full','de'))

class OpponentRowGeometry(unittest.TestCase):
    def image(self,name):
        image=np.zeros((2340,1080,3),dtype=np.uint8)
        image[280:650,:910]=vision.decode(Path('data')/name)
        return image

    def test_layouts_preserve_original_and_shifted_positions(self):
        old=self.image('opponent-deck-30577.png')
        shifted=self.image('opponent-deck-shifted.png')
        self.assertEqual(vision.enemy_lineup_side_dx(old,'full',0),-90)
        self.assertEqual(vision.enemy_lineup_side_dx(shifted,'full',0),0)
        self.assertEqual(vision.classify(shifted,[123,365,277,502])['name'],'Splime')
        self.assertEqual(vision.read_enemy_deck_caption(shifted,325,0)['name'],'Gans')
        self.assertEqual(vision.read_enemy_deck_caption(shifted,550,0)['name'],'Spartheus')

if __name__=='__main__': unittest.main()
