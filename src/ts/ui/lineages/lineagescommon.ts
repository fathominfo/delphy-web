import { Mutation } from '../../pythia/delphy_api';
import { MutationDistribution } from '../../pythia/mutationdistribution';
import { DisplayNode } from '../displaynode';

import { Distribution } from '../distribution';
import { SVGSeriesGroup, TimeDistributionChart } from '../timedistributionchart';

export enum NodePairType {
  rootToNodeA = 0,
  mrcaToNodeA = 1,
  nodeBToNodeA = 2,

  rootToNodeB = 3,
  mrcaToNodeB = 4,
  nodeAToNodeB = 5,

  rootToMrca = 6,

  rootOnly = 7

}


export enum NodeRelationType {
  singleDescendant = 1,
  upperDescendant = 2,
  lowerDescendant = 3
}





/*

Extensions to the classes that make up a TimeDistributionChart

*/


export class NodeDistribution extends Distribution {
  nodeClass: DisplayNode;

  constructor(type: DisplayNode, times: number[]) {
    super(times);
    this.nodeClass = type;
  }
}

export class NodeSVGSeriesGroup extends SVGSeriesGroup {

  setNodeClass(className: string, toggle=true) {
    this.g.classList.toggle(className, toggle);
  }
}


export class NodeTimeDistributionChart extends TimeDistributionChart {

  setSeries(series: NodeDistribution[]) {
    super.setSeries(series);
    this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
      const nodeGroup = (group as NodeSVGSeriesGroup);
      const series = this.series[i] as NodeDistribution;
      if (series.nodeClass) {
        nodeGroup.setNodeClass(series.nodeClass.className);
      }
      nodeGroup.setNodeClass("tip", series.range === 0);
    });
  }

  setMatching(node:DisplayNode | null) {
    if (node === null) {
      this.svgGroups.forEach((group: SVGSeriesGroup)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        nodeGroup.setNodeClass("matching", false);
        nodeGroup.setNodeClass("unmatching", false);
      });
    } else {
      this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        const series = this.series[i] as NodeDistribution;
        if (series.nodeClass === node) {
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









export type NodeDisplay = {
  index: number,
  label: string,
  type: DisplayNode | null,
  times: number[],
  series: NodeDistribution | null
};

export class NodePair {
  ancestor: DisplayNode;
  descendant: DisplayNode;
  pairType : NodePairType;
  relation: NodeRelationType;
  mutations : MutationDistribution[]

  constructor(ancestor: DisplayNode, descendant: DisplayNode,
    pairType : NodePairType, relation: NodeRelationType, mutations: MutationDistribution[]) {
    this.ancestor = ancestor;
    this.descendant = descendant;
    this.pairType = pairType;
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

export type HoverCallback = (node:DisplayNode | null, dateIndex: number, mutation: Mutation|null)=>void;
export type TreeHoverCallback = (nodeIndex:number, dateIndex: number)=>void;
export type TreeSelectCallback = (nodeIndex: number)=>void;
export type DismissCallback = (node:DisplayNode)=>void;
export type NodeCallback = (displayNode: DisplayNode)=>void;
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


