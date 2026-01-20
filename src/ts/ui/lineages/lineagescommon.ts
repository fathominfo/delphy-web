import { Mutation } from '../../pythia/delphy_api';
import { MutationDistribution } from '../../pythia/mutationdistribution';
import { DisplayNode, getNodeClassName, UNSET } from '../common';
import { DistributionSeries } from '../timedistributioncanvas';
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


export class NodeDistributionSeries extends DistributionSeries {
  nodeType: DisplayNode;

  constructor(type: DisplayNode, times: number[], className: string, color?: string) {
    super(times, className, color);
    this.nodeType = type;
  }
}

export class NodeSVGSeriesGroup extends SVGSeriesGroup {

  setNodeClass(className: string, toggle=true) {
    this.g.classList.toggle(className, toggle);
  }
}


export class NodeTimeDistributionChart extends TimeDistributionChart {

  setSeries(series: NodeDistributionSeries[]) {
    super.setSeries(series);
    this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
      const nodeGroup = (group as NodeSVGSeriesGroup);
      const series = this.series[i] as NodeDistributionSeries;
      const className = getNodeClassName(series.nodeType);
      nodeGroup.setNodeClass(className);
      nodeGroup.setNodeClass("tip", series.distribution.range === 0);
    });
  }

  setMatching(node:DisplayNode) {
    if (node === UNSET) {
      this.svgGroups.forEach((group: SVGSeriesGroup)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        nodeGroup.setNodeClass("matching", false);
        nodeGroup.setNodeClass("unmatching", false);
      });
    } else {
      this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        const series = this.series[i] as NodeDistributionSeries;
        if (series.nodeType === node) {
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
  color: string,
  label: string,
  type: DisplayNode,
  className: string,
  times: number[],
  series: NodeDistributionSeries | null
};

export const getAncestorType = (npt: NodePairType): DisplayNode => {
  // incorrectly gives ancestor=nodeB for nodeAToNodeB?

  // const mod = npt % 3;
  // const nodeType: DisplayNode = mod === 0 ? DisplayNode.root
  //   : mod === 1 ? DisplayNode.mrca
  //     : npt < NodePairType.rootToNodeB ? DisplayNode.nodeA : DisplayNode.nodeB;

  switch (npt) {
  case NodePairType.rootToMrca:
  case NodePairType.rootToNodeA:
  case NodePairType.rootToNodeB:
  case NodePairType.rootOnly:
    return DisplayNode.root;
  case NodePairType.mrcaToNodeA:
  case NodePairType.mrcaToNodeB:
    return DisplayNode.mrca;
  case NodePairType.nodeAToNodeB:
    return DisplayNode.nodeA;
  case NodePairType.nodeBToNodeA:
    return DisplayNode.nodeB;
  default:
    return DisplayNode.nodeB;
  }

  // return nodeType;
}


const descendantTypes:DisplayNode[] = [DisplayNode.nodeA, DisplayNode.nodeB, DisplayNode.mrca]

export const getDescendantType = (npt: NodePairType)=>{
  if (npt === NodePairType.rootOnly) return UNSET;
  const index = Math.floor(npt / 3);
  return descendantTypes[index];
}

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
}


export type NodeComparisonData = {
  nodePair : NodePair,
  upperNodeTimes: number[],
  lowerNodeTimes: number[],
  overlapCount: number
}


export type NodeCallback = (node:DisplayNode | typeof UNSET)=>void;
export type DismissCallback = (node:DisplayNode)=>void;
export type HoverCallback = (node: DisplayNode)=>void;
export type OpenMutationPageFncType = (mutation?: Mutation) => void;

export const MATCH_CLASS = "matching";
export const NO_MATCH_CLASS = "unmatching";
