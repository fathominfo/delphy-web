import { Mutation, SummaryTree } from '../../pythia/delphy_api';
import { MutationDistribution } from '../../pythia/mutationdistribution';
import { DisplayNode } from './displaynode';

import { UNSET } from '../common';

export enum NodeRelationType {
  singleDescendant = 1,
  upperDescendant = 2,
  lowerDescendant = 3
}






export class NodePair {
  ancestor: DisplayNode;
  descendant: DisplayNode;
  relation: NodeRelationType;
  mutations : MutationDistribution[]

  constructor(ancestor: DisplayNode, descendant: DisplayNode,
    relation: NodeRelationType, mutations: MutationDistribution[]) {
    this.ancestor = ancestor;
    this.descendant = descendant;
    this.relation = relation;
    this.mutations = mutations;
  }

  getDescendant(): DisplayNode {
    return this.descendant;
  }

  getAncestor(): DisplayNode {
    return this.ancestor;
  }
}

export type HoverCallback = (nodeIndex: number, dateIndex: number, mutation: Mutation|null)=>void;
export type NodeCallback = (nodeIndex: number)=>void;
export type OpenMutationPageFncType = (mutation?: Mutation) => void;
export type KeyEventHandler = (event: KeyboardEvent)=>void;

export const MATCH_CLASS = "matching";
export const NO_MATCH_CLASS = "unmatching";

export const enum TreeHint {
  Hover,

  HoverRoot,
  HoverMrca,
  HoverNodeA,
  HoverNodeBDescendant,
  HoverNodeBCousin,

  PreviewNodeA,
  PreviewNodeBDescendant,
  PreviewNodeBCousin,

  MaxSelections,

  Zoom
}

export const TREE_HINT_CLASSES = [
  "hover",

  "hover-root",
  "hover-mrca",
  "hover-node-a",
  "hover-nodeB-descendant",
  "hover-nodeB-cousin",

  "preview-nodeA",
  "preview-nodeB-descendant",
  "preview-nodeB-cousin",

  "max-selections",

  "zoom"
]
export type SetHintType = (hint:TreeHint) => void;


/* should we provide an interface to this ? [mark 230524]*/
/* adding it for now! [katherine 230608] */
export const mutationPrevalenceThreshold = 0.5;


export const getMRCA = (index1: number, index2: number,
  summaryTree: SummaryTree, nodeChildCount: number[]): number => {
  /* check for a common ancestor that is not root */
  let mrcaIndex = UNSET;
  const root = summaryTree.getRootIndex();
  let i1 = index1,
    i2 = index2,
    steps = 0;
  while (i1 !== i2 && i1 !== root && i2 !== root) {
    /*
    the mrca will always have more tips
    so if we aren't matched yet, then take the
    parent of the node that has fewer tips.
    */
    const size1 = nodeChildCount[i1],
      size2 = nodeChildCount[i2];
    if (size1 < size2) {
      i1 = summaryTree.getParentIndexOf(i1);
    } else {
      i2 = summaryTree.getParentIndexOf(i2);
    }
    steps++;
    if (steps >= 1000) {
      console.warn(`we had a problem on ${index1} and ${index2}, setting mrca to root`)
      mrcaIndex = root;
      break;
    }
  }
  if (i1 === i2) {
    mrcaIndex = i1;
  } else if (i1 === root || i2 === root) {
    mrcaIndex = root;
  }
  return mrcaIndex;
}

export type getYFunction = (_: number) => number;

