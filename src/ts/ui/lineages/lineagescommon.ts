import { Mutation, SummaryTree } from '../../pythia/delphy_api';
import { MutationDistribution } from '../../pythia/mutationdistribution';
import { DisplayNode } from './displaynode';

import { Distribution } from '../distribution';
import { SVGSeriesGroup, TimeDistributionChart } from '../timedistributionchart';
import { UNSET } from '../common';

export enum NodeRelationType {
  singleDescendant = 1,
  upperDescendant = 2,
  lowerDescendant = 3
}

/*

Extensions to the classes that make up a TimeDistributionChart

*/


// export class NodeDistribution extends Distribution {
//   nodeClass: DisplayNode;

//   constructor(type: DisplayNode, times: number[]) {
//     super(times);
//     this.nodeClass = type;
//   }
// }

export class NodeSVGSeriesGroup extends SVGSeriesGroup {

  node: DisplayNode | null = null;

  setNode(node: DisplayNode, toggle=true) {
    this.node = node;
    this.g.classList.toggle(node.className, toggle);
  }

  setNodeClass(className: string, toggle=true) {
    this.g.classList.toggle(className, toggle);
  }
}


export class NodeTimeDistributionChart extends TimeDistributionChart {

  setNodeSeries(nodes: DisplayNode[]) {
    const serieses: Distribution[] = [];
    const correspondingNodes: DisplayNode[] = [];
    nodes.forEach(node=>{
      if (node.series !== null) {
        correspondingNodes.push(node);
        serieses.push(node.series);
      }
    });
    super.setSeries(serieses);
    this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
      const nodeGroup = (group as NodeSVGSeriesGroup);
      const node = correspondingNodes[i];
      nodeGroup.setNode(node);
      nodeGroup.setNodeClass("tip", node.series === null || node.series.range === 0);
    });
  }

  setMatching(matchNode:DisplayNode | null) {
    if (matchNode === null) {
      this.svgGroups.forEach((group: SVGSeriesGroup)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        nodeGroup.setNodeClass("matching", false);
        nodeGroup.setNodeClass("unmatching", false);
      });
    } else {
      this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        const node = nodeGroup.node;
        if (node === matchNode) {
          nodeGroup.setNodeClass("matching");
          nodeGroup.setNodeClass("unmatching", false);
        } else {
          nodeGroup.setNodeClass("matching", false);
          nodeGroup.setNodeClass("unmatching");
        }
      });
    }
  }
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
export type TreeHoverCallback = (nodeIndex: number, dateIndex: number)=>void;
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

