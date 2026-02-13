#!/usr/bin/env python3

import json
from os.path import dirname, exists, join, realpath
from os import makedirs

''' 
'''

HERE = dirname(realpath(__file__))

INPUT_DIR = join(HERE, 'input')
OUTPUT_DIR = realpath(join(HERE, 'output'))
if not exists(OUTPUT_DIR):
    makedirs(OUTPUT_DIR)




source = json.load(open(join(INPUT_DIR, 'palette.json'), 'r'))
source = source["Node"]
outf = open(join(OUTPUT_DIR, "palette.css"), 'w')

'''
not interested in taking the time to build a recursive traverser rn
'''
props_with_subs = ["Position", "Mutation", "Trend", "Timeline"]

for node_class in source:
    defs = source[node_class]
    for prop in defs:
        sub_defs = defs[prop]
        if prop in props_with_subs:
            for p2 in sub_defs:
                sub_sub_defs = sub_defs[p2]
                for p3 in sub_sub_defs:
                    val = sub_sub_defs[p3]
                    if p3 == "Static":
                        key = f"--{ node_class }-{ prop }-{ p2 }".lower()
                    else:
                        key = f"--{ node_class }-{ prop }-{ p2 }-{p3}".lower()
                    print(f"  {key}: {val};", file=outf)
        else:
            for p2 in sub_defs:
                val = sub_defs[p2]
                if p2 == "Static":
                    key = f"--{ node_class }-{ prop }".lower()
                else:
                    key = f"--{ node_class }-{ prop }-{ p2 }".lower()
                print(f"  {key}: {val};", file=outf)

outf.close()

    # "Fill": {
    #   "Static": "#FF0054",
    #   "On": "#F30049"
    # },
    # "Stroke": {
    #   "Static": "#B0001F",
    #   "Off": "#ED7285",
    #   "On": "#8E0008"
    # },
    # "Text": {
    #   "Static": "#B0001F",
    #   "On": "#9F0016"
    # },
    # "Tint": {
    #   "Static": "#ED7285"
    # },
    # "Trend": {
    #   "Stroke": {"Static": "#FF0054"}
    # },
    # "Position": {
    #   "Text": {"Static": "#D10033"}
    # },
    # "Mutation": {
    #   "Text": {"Static": "#8E0008"}
    # },
    # "Timeline": {
    #   "Fill": {"Static": "#ED7285"},
    #   "Stroke": {"Static": "#8E0008"},
    #   "Text": {"Static": "#8E0008"}
    # },

