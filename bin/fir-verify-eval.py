#!/usr/bin/env python3
"""Compare verifier decisions on a verified run with human labels: python3 bin/fir-verify-eval.py <verified-dir> <labels.csv> [...]"""
import csv, glob, json, sys
d, files = sys.argv[1].rstrip('/'), sys.argv[2:]
lab = {}
for f in files:
    t = open(f, encoding='utf-8-sig').read(); sep = ';' if t.split('\n')[0].count(';') > t.split('\n')[0].count(',') else ','
    for r in csv.DictReader(open(f, encoding='utf-8-sig'), delimiter=sep):
        if r['human'].strip().lower() in ('pass', 'fail'): lab[(r['site'], r['task_id'])] = r['human'].strip().lower()
agree = disagree = 0
for f in sorted(glob.glob(d + '/*.json')):
    s = f.split('/')[-1][:-5]
    for x in json.load(open(f)).get('results', []):
        v = x.get('verifier'); h = lab.get((s, x['id']))
        if not v or not h: continue
        ok = (v == 'confirmed') == (h == 'pass')
        agree += ok; disagree += not ok
        if not ok: print(f"  disagree {s} {x['id']}: verifier={v} human={h} | {x.get('evidence_quote','')[:90]}")
print(f"verifier vs human on labelled passes: {agree} agree, {disagree} disagree")
