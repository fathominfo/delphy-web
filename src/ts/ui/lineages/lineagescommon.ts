import { Mutation } from '../../pythia/delphy_api';
import { MutationDistribution } from '../../pythia/mutationdistribution';
import { DisplayNodeClass, DisplayNodes } from '../common';
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






/*

Extensions to the classes that make up a TimeDistributionChart

*/


export class NodeDistribution extends Distribution {
  nodeClass: DisplayNodeClass;

  constructor(type: DisplayNodeClass, times: number[]) {
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
      nodeGroup.setNodeClass(series.nodeClass.className);
      nodeGroup.setNodeClass("tip", series.range === 0);
    });
  }

  setMatching(node:DisplayNodeClass | null) {
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
  type: DisplayNodeClass | null,
  times: number[],
  series: NodeDistribution | null
};

const descendantTypes:DisplayNodeClass[] = DisplayNodes.filter(dn=>dn.name !== "root");

export class NodePair {
  index1: number;
  index2: number;
  pairType : NodePairType;
  mutations : MutationDistribution[]

  constructor(index1: number, index2: number,  pairType : NodePairType, mutations: MutationDistribution[]) {
    this.index1 = index1;
    this.index2 = index2;
    this.pairType = pairType;
    this.mutations = mutations;
  }

  getDescendantType() {
    if (this.pairType === NodePairType.rootOnly) return null;
    const index = Math.floor(this.pairType / 3);
    return descendantTypes[index];
  }

  getAncestorType(): DisplayNodeClass {
    switch (this.pairType) {
    case NodePairType.rootToMrca:
    case NodePairType.rootToNodeA:
    case NodePairType.rootToNodeB:
    case NodePairType.rootOnly:
      return DisplayNodes.filter(dn=>dn.className === 'root')[0];
    case NodePairType.mrcaToNodeA:
    case NodePairType.mrcaToNodeB:
      return  DisplayNodes.filter(dn=>dn.className === 'mrca')[0];
    case NodePairType.nodeAToNodeB:
      return  DisplayNodes.filter(dn=>dn.className === 'nodeA')[0];
    case NodePairType.nodeBToNodeA:
      return  DisplayNodes.filter(dn=>dn.className === 'nodeB')[0];
    default:
      return  DisplayNodes.filter(dn=>dn.className === 'root')[0];
    }

  }
}

export type HoverCallback = (node:DisplayNodeClass | null, dateIndex: number, mutation: Mutation|null)=>void;
export type TreeHoverCallback = (nodeIndex:number, dateIndex: number)=>void;
export type TreeSelectCallback = (nodeIndex: number)=>void;
export type DismissCallback = (node:DisplayNodeClass)=>void;
export type NodeCallback = (displayNode: DisplayNodeClass)=>void;
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


