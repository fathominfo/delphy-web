import { BaseTreeSeriesType } from "../../constants";
import { Mutation, SummaryTree } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";
import { Pythia } from "../../pythia/pythia";
import { SharedState } from "../../sharedstate";
import { isTip } from "../../util/treeutils";
import { getMedian, UNSET } from "../common";
import { DisplayNode } from "./displaynode";
import { Distribution } from "../distribution";
import { MccTreeCanvas } from "../mcctreecanvas";
import { FieldTipCount, NodeMetadata, NodeMetadataValues } from "../nodemetadata";
import { NodePair, NodeRelationType, TreeHint } from "./lineagescommon";
import { NodeMutationsData } from "./nodemutationsdata";



export type NodeHoverData = {
  indices: number[],
  hint: TreeHint,
  displayNode: DisplayNode | null
};


export type NodeSelectData = {
  updated: boolean,
  hint: TreeHint,
  selectable: boolean
};


export type ChartData = {
  nodeListData: DisplayNode[],
  nodeDistributions: BaseTreeSeriesType | null,
  prevalenceNodes : DisplayNode[],
  minDate: number,
  maxDate: number
  nodeComparisonData: NodeMutationsData[],
  nodeAIsUpper: boolean,
  nodeDisplays: DisplayNode[],
  nodePairs: NodePair[],
  nodes: DisplayNode[]
}

type getYFunction = (_: number) => number;

export class CoreLineagesData {

  /* shared data stores that we need */
  sharedState: SharedState;
  pythia: Pythia | null = null;
  nodeMetadata: NodeMetadata | null = null;
  tipIds: string[] = [];



  /*
  local copies of data that gets updated
  every time the MCC switches
  */
  summaryTree: SummaryTree | null = null;
  nodeChildCount: number[] = [];
  nodeConfidence: number[] = [];
  getY: getYFunction | null = null;



  /*
  current state
  */
  nodeAIndex = UNSET;
  nodeBIndex = UNSET;
  mrcaIndex = UNSET;
  rootIndex = UNSET;
  nodeANode : DisplayNode | null = null;
  nodeBNode : DisplayNode | null = null;
  mrcaNode : DisplayNode | null = null;
  rootNode : DisplayNode | null = null;
  nodes: DisplayNode[] = [];


  nodeComparisonData: NodeMutationsData[] = [];


  hoveredNode: number = UNSET;
  hoveredDate: number = UNSET;
  selectable = true;

  constrainHoverByCredibility = false;
  highlightNode: DisplayNode | null = null;
  highlightDate: number = UNSET;
  highlightMutation: Mutation | null = null;


  /*
  for the prevalence chart, we need a node like object
  to represent the uninfected population.
  */
  nullNode: DisplayNode;

  constructor(sharedState: SharedState) {
    this.sharedState = sharedState;
    this.nullNode =  this.getNodeDisplay(UNSET, UNSET, false, false);
  }

  activate() {
    this.pythia = this.sharedState.pythia;
  }

  deactivate() {
    this.pythia = null;
  }

  initNodeData(mccTreeCanvas: MccTreeCanvas) : boolean {
    const summaryTree = mccTreeCanvas.tree as SummaryTree;
    if (summaryTree !== this.summaryTree) {
      const nodeCount = summaryTree.getSize(),
        rootIndex = summaryTree.getRootIndex(),
        childCounts = new Array(nodeCount);
      childCounts.fill(0);
      for (let i = 0; i < nodeCount; i++) {
        if (isTip(summaryTree,i)) {
          /* this is a tip */
          let ii = i;
          while (ii !== UNSET) {
            childCounts[ii]++;
            ii = summaryTree.getParentIndexOf(ii);
          }
        }
      }
      this.rootIndex = rootIndex;
      this.nodeAIndex = UNSET;
      this.nodeBIndex = UNSET;
      this.mrcaIndex = UNSET;
      if (this.sharedState.nodeList.length > 0) {
        this.nodeAIndex = this.sharedState.nodeList[0];
        if (this.sharedState.nodeList.length > 1) {
          this.nodeBIndex = this.sharedState.nodeList[1];
          this.mrcaIndex = this.checkMRCA(this.nodeAIndex, this.nodeBIndex, summaryTree);
        }
      }
      this.nodeChildCount = childCounts;
      this.summaryTree = summaryTree;
      this.nodeConfidence = mccTreeCanvas.creds;
      this.getY = (n:number)=>mccTreeCanvas.getZoomY(n);
      this.nodeMetadata = this.sharedState.mccConfig.nodeMetadata;
      this.tipIds = this.sharedState.getTipIds();
      return true;
    }
    return false;
  }

  setCredibilityConstrained(constrained: boolean) : void {
    this.constrainHoverByCredibility = constrained;
  }

  setSelectable(selectable: boolean): void {
    this.selectable = selectable;
  }


  setChartData(nodeIndices: number[], isApobecEnabled: boolean
  ): ChartData {
    const pythia = this.pythia,
      chartData: ChartData = {
        nodeListData: [],
        nodeDistributions: null,
        prevalenceNodes: [],
        minDate: UNSET,
        maxDate: UNSET,
        nodeComparisonData: [],
        nodeAIsUpper: true,
        nodeDisplays: [],
        nodePairs: [],
        nodes: []
      };
    const [rootIndex, mrcaIndex, nodeAIndex, nodeBIndex] = nodeIndices;
    if (rootIndex !== UNSET) this.rootIndex = rootIndex;
    if (pythia) {

      const summaryTree = this.summaryTree as SummaryTree;
      const getY = this.getY as getYFunction;
      const mccRef = pythia.getMcc(),
        minDate = pythia.getBaseTreeMinDate(),
        maxDate = pythia.maxDate;
      chartData.minDate = minDate;
      chartData.maxDate = maxDate;
      const currentIndices = [rootIndex, mrcaIndex, nodeAIndex, nodeBIndex];
      const nodeTimes: number[][] = [];
      currentIndices.filter(index=> index !== UNSET)
        .forEach(index=>{
          nodeTimes[index] = pythia.getNodeTimeDistribution(index, summaryTree);
        });

      let nodes: DisplayNode[] = currentIndices.map((index, dn)=>{
        const isInferred = index === rootIndex || index === mrcaIndex;
        const isRoot = index === rootIndex;
        const nd = this.getNodeDisplay(index, dn, isInferred, isRoot);
        chartData.nodes[dn] = nd;
        return nd;
      });
      const nodeClasses: DisplayNode[] = [];
      nodes.forEach(node=>{
        if (node.index !== UNSET) {
          nodeClasses[node.index] = node;
          node.times = nodeTimes[node.index];
        }
      });
      if (nodeAIndex === UNSET && nodeBIndex === UNSET) {
        /* we clear all but the root node */

        this.setSelectable(true);
      } else {
        let nodePair: NodePair;
        if (mrcaIndex === UNSET) {
          /* if there is no mrca, then we connect the root directly to the other nodes */
          if (nodeAIndex === UNSET) {
            if (nodeBIndex !== UNSET) {
              nodePair = this.assembleNodePair(nodeClasses[rootIndex], nodeClasses[nodeBIndex], NodeRelationType.singleDescendant, pythia, summaryTree);
              chartData.nodePairs.push(nodePair);
            }
            this.setSelectable(true);
          } else if (nodeBIndex === UNSET || nodeBIndex === nodeAIndex) {
            /* we have node 1 without node 2 */
            nodePair = this.assembleNodePair(nodeClasses[rootIndex], nodeClasses[nodeAIndex], NodeRelationType.singleDescendant, pythia, summaryTree);
            chartData.nodePairs.push(nodePair);
            this.setSelectable(true);
          } else {
            /*
              we have both node 1 and node 2, but no mrca.
              this could mean both are descended from root,
              or one is descended from the other.
              We know we have two pairs, and in the first one
              the ancestor node is root. So the questions are:
                in the second pair, is the ancestor node root, nodeA, or nodeB?
                  this

              */
            const mrca = this.getMRCA(nodeAIndex, nodeBIndex, summaryTree),
              ancestor1Index = rootIndex;
            let ancestor2Index = rootIndex,
              descendant1Index = rootIndex,
              descendant2Index = rootIndex,
              rel1: NodeRelationType = NodeRelationType.singleDescendant,
              rel2: NodeRelationType = NodeRelationType.singleDescendant;
            if (mrca === rootIndex) {
              descendant1Index = nodeAIndex;
              descendant2Index = nodeBIndex;
              const nodeAIsUpper = getY(nodeAIndex) < getY(nodeBIndex);
              if (nodeAIsUpper) {
                rel1 = NodeRelationType.upperDescendant;
                rel2 = NodeRelationType.lowerDescendant;
              } else {
                rel1 = NodeRelationType.lowerDescendant;
                rel2 = NodeRelationType.upperDescendant;
              }
            } else if (mrca === nodeAIndex) {
              descendant1Index = nodeAIndex;
              ancestor2Index = nodeAIndex;
              descendant2Index = nodeBIndex;
            } else if (mrca === nodeBIndex) {
              descendant1Index = nodeBIndex;
              ancestor2Index = nodeBIndex;
              descendant2Index = nodeAIndex;
            } else {
              console.warn("need to revisit how node pairs are made");
            }
            nodePair = this.assembleNodePair(nodeClasses[ancestor1Index], nodeClasses[descendant1Index], rel1, pythia, summaryTree);
            chartData.nodePairs.push(nodePair);
            nodePair = this.assembleNodePair(nodeClasses[ancestor2Index], nodeClasses[descendant2Index], rel2, pythia, summaryTree);
            chartData.nodePairs.push(nodePair);
            // this.disableSelections();
          }

        } else {
          const nodeAIsUpper = getY(nodeAIndex) < getY(nodeBIndex);
          let relA: NodeRelationType;
          let relB: NodeRelationType;
          if (nodeAIsUpper) {
            relA = NodeRelationType.upperDescendant;
            relB = NodeRelationType.lowerDescendant;
          } else {
            relA = NodeRelationType.lowerDescendant;
            relB = NodeRelationType.upperDescendant;
          }
          nodePair = this.assembleNodePair(nodeClasses[rootIndex], nodeClasses[mrcaIndex], NodeRelationType.singleDescendant, pythia, summaryTree);
          chartData.nodePairs.push(nodePair);
          nodePair = this.assembleNodePair(nodeClasses[mrcaIndex], nodeClasses[nodeAIndex], relA, pythia, summaryTree);
          chartData.nodePairs.push(nodePair);
          nodePair = this.assembleNodePair(nodeClasses[mrcaIndex], nodeClasses[nodeBIndex], relB, pythia, summaryTree);
          chartData.nodePairs.push(nodePair);
          // this.disableSelections();
        }
      }
      chartData.nodeListData = nodeClasses;
      nodes = nodes.filter(({index})=>index>=0);
      const nodeIndices = nodes.map(({index})=>index),
        nodePrevalenceData = pythia.getPopulationNodeDistribution(nodeIndices, minDate, maxDate, summaryTree),
        nodeDistributions = nodePrevalenceData.series;
      chartData.nodeDisplays = nodes.slice(0);
      chartData.nodeComparisonData = chartData.nodePairs.map(np=>{
        const ascendantTimes = nodeTimes[np.ancestor.index],
          descendantTimes = nodeTimes[np.descendant.index] || [],
          ancestorMedianDate = getMedian(ascendantTimes),
          descendantMedianDate = getMedian(descendantTimes);
        return new NodeMutationsData(np, ancestorMedianDate, descendantMedianDate, minDate, maxDate, isApobecEnabled)
      });
      chartData.nodeAIsUpper = getY(nodeAIndex) < getY(nodeBIndex);
      /* we want the default distribution to come first, so take it off the end and put it first */
      nodeDistributions.forEach(treeSeries=>treeSeries.unshift(treeSeries.pop() as number[]));
      chartData.nodeDistributions = nodeDistributions;
      /*
      add an empty node before the root to represent the uninfected population
      in the prevalence chart
      */
      const prevalenceNodes = nodes.slice(0);
      prevalenceNodes.unshift(this.nullNode);
      chartData.prevalenceNodes = prevalenceNodes;
      mccRef.release();

    }
    return chartData;
  }




  assembleNodePair(ancestor: DisplayNode, descendant: DisplayNode,
    relation: NodeRelationType, pythia: Pythia, tree: SummaryTree): NodePair {
    const mutTimes : MutationDistribution[] = pythia.getMccMutationsBetween(ancestor.index, descendant.index, tree);
    return new NodePair(ancestor, descendant, relation, mutTimes);
  }



  checkNewHighlight(displayNode: DisplayNode | null, date: number, mutation: Mutation | null): boolean{
    if (displayNode === this.highlightNode && date === this.highlightDate && mutation === this.highlightMutation) {
      return false;
    }
    this.highlightNode = displayNode;
    this.highlightDate = date;
    this.highlightMutation =  mutation;
    return true;
  }


  getSelectedTipIds(): string[] {
    const ids: string[] = [];
    [this.nodeAIndex, this.nodeBIndex].forEach(index=>{
      if (index !== UNSET) {
        const metadata = this.nodeMetadata?.getNodeMetadata(index);
        if (metadata) {
          const id = metadata.id?.value;
          if (id) {
            ids.push(id);
          }
        }
      }
    });
    return ids;
  }


  setNodeSelection() : void {
    const nodes = [ this.nodeAIndex, this.nodeBIndex].filter(n=>n!==UNSET);
    if (nodes.length > 0) {
      this.sharedState.setNodeSelection(nodes);
    }
  }

  getMRCA(index1: number, index2: number, mcc: SummaryTree): number {
    /* check for a common ancestor that is not root */
    let mrcaIndex = UNSET;
    const root = mcc.getRootIndex();
    let i1 = index1,
      i2 = index2,
      steps = 0;
    while (i1 !== i2 && i1 !== root && i2 !== root) {
      /*
      the mrca will always have more tips
      so if we aren't matched yet, then take the
      parent of the node that has fewer tips.
      */
      const size1 = this.nodeChildCount[i1],
        size2 = this.nodeChildCount[i2];
      if (size1 < size2) {
        i1 = mcc.getParentIndexOf(i1);
      } else {
        i2 = mcc.getParentIndexOf(i2);
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


  handleNodeHover(nodeIndex: number, date:number, mccTreeCanvas : MccTreeCanvas): NodeHoverData {
    const rootIndex = this.rootIndex;
    let mrcaIndex = this.mrcaIndex,
      nodeAIndex = this.nodeAIndex,
      nodeBIndex = this.nodeBIndex,
      hint: TreeHint = TreeHint.Zoom;
    if (!this.constrainHoverByCredibility || mccTreeCanvas.creds[nodeIndex] >= this.sharedState.mccConfig.confidenceThreshold) {
      this.hoveredNode = nodeIndex;
    }
    this.hoveredDate = date;
    let displayNode: DisplayNode|null = null;
    if (nodeIndex === UNSET) {
      hint = TreeHint.Zoom;
    } else if (nodeIndex === rootIndex) {
      /* new hover on existing node */
      displayNode = null;
      hint = TreeHint.HoverRoot;
    } else if (nodeIndex === mrcaIndex) {
      /* new hover on existing node */
      displayNode = this.mrcaNode;
      hint = TreeHint.HoverMrca;
    } else if (nodeIndex === nodeAIndex) {
      /* new hover on existing node */
      displayNode = this.nodeANode;
      hint = TreeHint.HoverNodeA;
    } else if (nodeIndex === nodeBIndex) {
      /* new hover on existing node */
      displayNode = this.nodeBNode;
      if (mrcaIndex === UNSET) {
        hint = TreeHint.HoverNodeBDescendant;
      } else {
        hint = TreeHint.HoverNodeBCousin;
      }
    } else if (nodeAIndex === UNSET && nodeIndex !== nodeBIndex) {
      /* selecting node 1 */
      nodeAIndex = nodeIndex;
      displayNode = this.nodeANode;
      if (nodeBIndex !== UNSET) {
        mrcaIndex = this.checkMRCA(nodeAIndex, nodeBIndex, mccTreeCanvas.tree as SummaryTree);
      }
      hint = TreeHint.PreviewNodeA;
    } else if (nodeBIndex === UNSET && nodeIndex !== nodeAIndex) {
      /* selecting node 2 */
      nodeBIndex = nodeIndex;
      mrcaIndex = this.checkMRCA(nodeAIndex, nodeBIndex, mccTreeCanvas.tree as SummaryTree);
      displayNode = this.nodeBNode;
      if (mrcaIndex === UNSET) {
        hint = TreeHint.PreviewNodeBDescendant;
      } else {
        hint = TreeHint.PreviewNodeBCousin;
      }
    }

    return { indices: [mrcaIndex, nodeAIndex, nodeBIndex], hint, displayNode} as NodeHoverData;

  }

  handleNodeSelect(nodeIndex: number, mcc: SummaryTree) : NodeSelectData {

    if (nodeIndex === this.nodeAIndex || nodeIndex === this.nodeBIndex) {
      /* clicking on an already selected node */
      return {updated: false, hint: TreeHint.Hover, selectable: false}
    }
    let hint = TreeHint.Hover;
    let selectable = this.selectable;
    if (this.nodeAIndex === UNSET) {
      this.nodeAIndex = nodeIndex;
      hint = TreeHint.HoverNodeA;
    } else if (this.nodeBIndex === UNSET) {
      this.nodeBIndex = nodeIndex;
    }

    if (this.nodeAIndex !== UNSET && this.nodeBIndex !== UNSET) {
      this.mrcaIndex = this.checkMRCA(this.nodeAIndex, this.nodeBIndex, mcc);
      this.setSelectable(false);
      if (nodeIndex === this.nodeBIndex) {
        if (this.mrcaIndex === UNSET) {
          hint = TreeHint.HoverNodeBDescendant;
        } else {
          hint = TreeHint.HoverNodeBCousin;
        }
      }
    } else {
      selectable = true;
    }
    return {updated: true, hint, selectable}
  }




  checkMRCA(index1: number, index2: number, mcc: SummaryTree): number {
    const mrca = this.getMRCA(index1, index2, mcc);
    if (mrca === this.rootIndex || mrca === index1 || mrca === index2) {
      return UNSET;
    }
    return mrca;
  }


  getNodeMetadata(nodeIndex:number): NodeMetadataValues | null {
    if (nodeIndex === UNSET) return null;
    const nodeMetadata: NodeMetadata | null = this.nodeMetadata;
    const tipIds: string[] = this.tipIds;
    let md = null;
    if (nodeMetadata) {
      md = nodeMetadata.getNodeMetadata(nodeIndex);
    } else if (nodeIndex < tipIds.length) {
      const value =  tipIds[nodeIndex],
        counts: FieldTipCount = {};
      counts[value] = 1;
      md = {id: {value, counts}};
    }
    return md;
  }


  getNodeDisplay(index: number, dnIndex: number, isInferred: boolean, isRoot: boolean): DisplayNode {
    const summaryTree = this.summaryTree;
    let confidence = UNSET;
    let childCount = 0;
    let times: number[] = [];
    const metadata = this.getNodeMetadata(index);
    let generationsFromRoot = UNSET;
    if (index !== UNSET && summaryTree !== null) {
      let parent = index;
      const rootIndex = summaryTree.getRootIndex();
      while (parent !== rootIndex) {
        parent = summaryTree.getParentIndexOf(parent);
        generationsFromRoot++;
      }
      confidence = this.nodeConfidence[index];
      childCount = this.nodeChildCount[index];
      times = (this.pythia as Pythia).getNodeTimeDistribution(index, summaryTree);
    }
    const series = new Distribution(times);
    const dnc = new DisplayNode(dnIndex, generationsFromRoot, isInferred,
      isRoot, confidence, childCount, series, metadata);
    dnc.setIndex(index);
    return dnc;
  }



}

