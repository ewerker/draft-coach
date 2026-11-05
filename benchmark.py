import json,time,statistics
from pathlib import Path
import vision
ROOT=Path(__file__).resolve().parent
cases=[('schlacht-teil-1.png',['Drakling','Merlinor','Obergeist'],[11,11,7]),('schlacht-teil-2.png',['Boomling','Ritter','Kapitän'],[11,10,13]),('kampf-spielstaerke-1.png',['Boomling','Astra','Astra'],[11,6,6])]
rows=[]
for file,names,values in cases:
    attempts=[vision.recognize(vision.IMAGES/file) for _ in range(5)]
    r=attempts[-1]
    actual=[c['name'] for c in r['offers']]
    numbers=[c['orange']['value'] for c in r['offers']]
    rows.append({'image':file,'phase':r['phase'],'expected_names':names,'actual_names':actual,'correct_names':sum(a==b for a,b in zip(actual,names)),'total_names':len(names),'expected_orange':values,'actual_orange':numbers,'correct_orange':sum(a==b for a,b in zip(numbers,values)),'median_vision_ms':round(statistics.median(a['visionMs'] for a in attempts),1),'max_vision_ms':max(a['visionMs'] for a in attempts),'notes':r['notes']})
report={'method':'5 Wiederholungen je Bild, persistenter lokaler Prozess; inklusive Bildlesen und Größenanpassung, ohne ADB, Browser, Programmstart oder Empfehlung. Kleine bekannte Beispielsammlung, kein unabhängiger Genauigkeitsnachweis. Kampf-Beschriftungen sind auf genau diesem Kampf-Referenzbild kalibriert.','results':rows}
(ROOT/'data'/'benchmark.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
