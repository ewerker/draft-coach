"""Conservative fallback for English labels without a language service."""
import json
import os
from pathlib import Path

import cv2
import numpy as np

with np.load(Path(__file__).resolve().parent/'data'/'english-collection.npz',allow_pickle=False) as collection:
    tabs = {kind: collection[kind+'_tab'] for kind in ('units','spells')}
    collection_names = {
        kind: [(name,collection[f'{kind}_{index}']) for index,name in enumerate(collection[kind+'_names'].tolist())]
        for kind in tabs
    }

with np.load(Path(__file__).resolve().parent/'data'/'english-battle.npz',allow_pickle=False) as battle:
    battle_names = [(name,battle[f'name_{index}']) for index,name in enumerate(battle['names'].tolist())]
    deck_anchor = battle['deck_anchor']
    deck_label = battle['deck_label']


def text_masks(text, heights):
    font = cv2.FONT_HERSHEY_DUPLEX
    size, baseline = cv2.getTextSize(text, font, 1.5, 3)
    image = np.zeros((size[1] + baseline + 8, size[0] + 8), np.uint8)
    cv2.putText(image, text, (4, size[1] + 4), font, 1.5, 1, 3, cv2.LINE_8)
    x, y, width, height = cv2.boundingRect(image)
    glyphs = image[y:y + height, x:x + width]
    for target_height in heights:
        for ratio in (.9, 1.05):
            target_width = max(1, round(width * target_height / height * ratio))
            yield cv2.resize(glyphs, (target_width, target_height), interpolation=cv2.INTER_NEAREST)


names = json.loads(os.environ.get('DRAFT_COACH_ENGLISH_NAMES', '{}'))
card_masks = {name: list(text_masks(label, (22, 28, 34, 40, 47)))
              for name, label in names.items() if label != name}
deck_masks = [mask for text in ('Build your deck!', 'Choose your deck!', 'Draft your deck!')
              for mask in text_masks(text, (29, 37, 44, 51))]


def strongest(region, masks):
    best = (0.0, 0, 0, 0)
    for mask in masks:
        height, width = mask.shape
        if height > region.shape[0] or width > region.shape[1]:
            continue
        _, score, _, (left, top) = cv2.minMaxLoc(cv2.matchTemplate(region, mask, cv2.TM_CCOEFF_NORMED))
        if score > best[0]:
            best = (score, left, top, width)
    return best


def card_caption(region, icon):
    # The name must corroborate a clear, unscoped image match.
    name = icon.get('name')
    if (name not in card_masks or icon.get('poolHint') or
            icon.get('similarity', 0) < .66 or icon.get('margin', 0) < .05):
        return None
    match = strongest(region, card_masks[name])
    return match if match[0] >= .63 else None
