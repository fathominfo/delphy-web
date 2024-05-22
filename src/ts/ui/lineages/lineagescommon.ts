import { MutationDistribution } from '../../pythia/mutationdistribution';
import { DisplayNode, UNSET } from '../common';

export enum NodePairType {
  rootToNode1 = 0,
  mrcaToNode1 = 1,
  node2ToNode1 = 2,

  rootToNode2 = 3,
  mrcaToNode2 = 4,
  node1ToNode2 = 5,

  rootToMrca = 6,

  rootOnly = 7

}


export type NodeDisplay = { index: number, color: string, label: string, type: DisplayNode, className: string };

export const getAncestorType = (npt: NodePairType): DisplayNode => {
  // incorrectly gives ancestor=node2 for node1ToNode2?

  // const mod = npt % 3;
  // const nodeType: DisplayNode = mod === 0 ? DisplayNode.root
  //   : mod === 1 ? DisplayNode.mrca
  //     : npt < NodePairType.rootToNode2 ? DisplayNode.node1 : DisplayNode.node2;

  switch (npt) {
  case NodePairType.rootToMrca:
  case NodePairType.rootToNode1:
  case NodePairType.rootToNode2:
  case NodePairType.rootOnly:
    return DisplayNode.root;
  case NodePairType.mrcaToNode1:
  case NodePairType.mrcaToNode2:
    return DisplayNode.mrca;
  case NodePairType.node1ToNode2:
    return DisplayNode.node1;
  case NodePairType.node2ToNode1:
    return DisplayNode.node2;
  default:
    return DisplayNode.node2;
  }

  // return nodeType;
}


const descendantTypes:DisplayNode[] = [DisplayNode.node1, DisplayNode.node2, DisplayNode.mrca]

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
  node1Times: number[],
  node2Times: number[],
  overlapCount: number
}


export type NodeCallback = (node:DisplayNode | typeof UNSET)=>void;
export type DismissCallback = (node:DisplayNode)=>void;