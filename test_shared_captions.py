"""Regression: enlarged English Spartheus UP! was rejected as ambiguous."""
import unittest
from unittest.mock import patch
from pathlib import Path
import numpy as np
import vision


class SharedCaptionTests(unittest.TestCase):
    def image(self):
        image=np.zeros((2340,1080,3),np.uint8)
        image[1000:1500,715:1080]=vision.decode(Path(__file__).with_name('data')/'spartheus-up-en-animated.png')
        return image

    def test_enlarged_upgrade_has_name_and_action_in_both_languages_without_a_pool_hint(self):
        image=self.image()
        for language in ('en','de'):
            with self.subTest(language=language):
                result=vision.read_battle_caption(image,715,None,None,language)
                self.assertEqual((result['name'],result['action'],result['quantity']),('Spartheus','upgrade',None))
                self.assertGreaterEqual(result['captionMargin'],.06)
                self.assertFalse(result['poolHint'])
                self.assertFalse(result.get('experimentalLanguage',False))

    def test_a_green_card_without_a_readable_label_stays_unknown(self):
        image=np.zeros((2340,1080,3),np.uint8)
        image[1080:1240,730:751]=[60,200,60]
        result=vision.read_battle_caption(image,715,{'Spartheus'},None,'en')
        self.assertIsNone(result['name'])
        self.assertEqual(result['action'],'unknown')

    def test_caption_cache_preserves_the_corrected_result(self):
        image=self.image()
        a=vision.read_battle_caption(image,715,{'Spartheus','Schnecke'},None,'en')
        b=vision.read_battle_caption(image,715,{'Spartheus','Schnecke'},None,'en')
        self.assertEqual(a,b)
        self.assertEqual(a['name'],'Spartheus')

    def test_spartheus_double_survives_name_template_overlap(self):
        image=np.zeros((2340,1080,3),np.uint8)
        image[1377:1480,376:687]=vision.decode(Path(__file__).with_name('data')/'spartheus-double-en-footer.png')
        result=vision.read_battle_caption(image,365,None,None,'en')
        self.assertEqual((result['name'],result['action'],result['quantity']),('Spartheus','multiply',2))

    def test_english_cupid_banner_keeps_the_name_and_number(self):
        text=vision.decode(Path(__file__).with_name('data')/'cupid-banner-en-plus9.png')[:,:,0]//255
        with patch.object(vision,'enemy_banner_region',return_value=(text,[0,0,258,58])):
            result=vision.read_enemy_banner(None,'en')
        self.assertEqual((result['name'],result['action'],result['quantity']),('Kupid','add',9))


if __name__=='__main__':unittest.main()
