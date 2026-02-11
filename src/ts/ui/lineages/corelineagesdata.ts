import { BaseTreeSeriesType } from "../../constants";
import { Mutation, SummaryTree } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";
import { Pythia } from "../../pythia/pythia";
import { SharedState } from "../../sharedstate";
import { isTip } from "../../util/treeutils";
import { DisplayNodeClass, getMedian, UNSET } from "../common";
import { MccTreeCanvas } from "../mcctreecanvas";
import { FieldTipCount, NodeMetadata, NodeMetadataValues } from "../nodemetadata";
import { NodeDisplay, NodeDistribution, NodePair, NodePairType, TreeHint } from "./lineagescommon";
import { NodeMutationsData } from "./nodemutationsdata";



export type NodeHoverData = {
  mrcaIndex: number,
  nodeAIndex: number,
  nodeBIndex: number,
  hint: TreeHint,
  displayNode: DisplayNodeClass | null
};


export type NodeSelectData = {
  updated: boolean,
  hint: TreeHint,
  selectable: boolean
};


export type NodeListItemData = {
  confidence: number,
  index: number,
  childCount: number,
  isLocked: boolean,
  metadata: NodeMetadataValues | null
}

export type ChartData = {
  nodeListData: NodeListItemData[],
  nodeDistributions: BaseTreeSeriesType | null,
  prevalenceNodes : NodeDisplay[],
  minDate: number,
  maxDate: number
  nodeComparisonData: NodeMutationsData[],
  nodeAIsUpper: boolean,
  nodes: NodeDisplay[],
  nodePairs: NodePair[]
}


export class CoreLineagesData {

  sharedState: SharedState;
  pythia: Pythia | null = null;
  prevMcc: SummaryTree | null = null;

  nodeAIndex = UNSET;
  nodeBIndex = UNSET;
  mrcaIndex = UNSET;
  rootIndex = UNSET;
  nodeANode : DisplayNodeClass | null = null;
  nodeBNode : DisplayNodeClass | null = null;
  mrcaNode : DisplayNodeClass | null = null;
  rootNode : DisplayNodeClass | null = null;

  nodeChildCount: number[] = [];

  maxVal = 0;

  nodeComparisonData: NodeMutationsData[] = [];


  hoveredNode: number = UNSET;
  hoveredDate: number = UNSET;
  selectable = true;

  constrainHoverByCredibility = false;
  highlightNode: DisplayNodeClass | null = null;
  highlightDate: number = UNSET;
  highlightMutation: Mutation | null = null;


  constructor(sharedState: SharedState) {
    this.sharedState = sharedState;
  }

  activate() {
    this.pythia = this.sharedState.pythia;
  }

  deactivate() {
    this.pythia = null;
  }

  setCredibilityConstrained(constrained: boolean) : void {
    this.constrainHoverByCredibility = constrained;
  }

  setSelectable(selectable: boolean): void {
    this.selectable = selectable;
  }


  setChartData(rootIndex:number, mrcaIndex:number, nodeAIndex:number, nodeBIndex:number,
    mccTreeCanvas: MccTreeCanvas, isApobecEnabled: boolean
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
        nodes: [],
        nodePairs: []
      };
    if (pythia) {


      const mccRef = pythia.getMcc(),
        minDate = pythia.getBaseTreeMinDate(),
        maxDate = pythia.maxDate,
        nodeConfidence = mccTreeCanvas.creds,
        summaryTree = mccTreeCanvas.tree as SummaryTree,
        nodeMetadata = this.sharedState.mccConfig.nodeMetadata,
        tipIds = this.sharedState.getTipIds();
      chartData.minDate = minDate;
      chartData.maxDate = maxDate;
      let setMRCA = false,
        setA = false,
        setB = false;

      const currentIndices = [rootIndex, mrcaIndex, nodeAIndex, nodeBIndex];
      let nodes: NodeDisplay[] = currentIndices.map(getNodeDisplay);
      const nodeTimes: number[][] = [];
      currentIndices.filter(index=> index !== UNSET)
        .forEach(index=>{
          nodeTimes[index] = pythia.getNodeTimeDistribution(index, summaryTree);
        });


      // let nodes: NodeDisplay[] = [rootIndex, mrcaIndex, nodeAIndex, nodeBIndex].map((index, i)=>getNodeDisplay(index, i));
      nodes.forEach(node=>{
        if (node.type !== null && node.index >= 0) {
          node.times = nodeTimes[node.index];
          node.series = new NodeDistribution(node.type, node.times);
        }
      });
      if (nodeAIndex === UNSET && nodeBIndex === UNSET) {
        /* we clear all but the root node */
        const nodePair = this.assembleNodePair(rootIndex, UNSET, NodePairType.rootOnly, pythia, summaryTree);
        chartData.nodePairs.push(nodePair);
        this.setSelectable(true);
      } else {
        let nodePair: NodePair;
        if (mrcaIndex === UNSET) {
          /* if there is no mrca, then we connect the root directly to the other nodes */
          if (nodeAIndex === UNSET) {
            if (nodeBIndex !== UNSET) {
              setB = true;
              nodePair = this.assembleNodePair(rootIndex, nodeBIndex, NodePairType.rootToNodeB, pythia, summaryTree);
              chartData.nodePairs.push(nodePair);
            }
            this.setSelectable(true);
          } else if (nodeBIndex === UNSET || nodeBIndex === nodeAIndex) {
            /* we have node 1 without node 2 */
            setA = true;
            nodePair = this.assembleNodePair(rootIndex, nodeAIndex, NodePairType.rootToNodeA, pythia, summaryTree);
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
              ancestor1: NodeDisplay | null = nodes.filter(n=>n.label === "Root")[0],
              ancestor1Index = rootIndex;
            let descendant1: NodeDisplay | null = null,
              ancestor2: NodeDisplay | null = null,
              descendant2: NodeDisplay | null = null,
              ancestor2Index = rootIndex,
              descendant1Index = rootIndex,
              descendant2Index = rootIndex,
              pair1: NodePairType = NodePairType.rootToNodeA,
              pair2: NodePairType = NodePairType.rootToNodeB;

            if (mrca === rootIndex) {
              pair1 = NodePairType.rootToNodeA;
              descendant1 = nodes.filter(n=>n.label === "A")[0];
              descendant1Index = nodeAIndex;
              pair2 = NodePairType.rootToNodeB;
              descendant2 = nodes.filter(n=>n.label === "B")[0];
              descendant2Index = nodeBIndex;
            } else if (mrca === nodeAIndex) {
              pair1 = NodePairType.rootToNodeA;
              descendant1 = nodes.filter(n=>n.label === "A")[0];
              descendant1Index = nodeAIndex;
              pair2 = NodePairType.nodeAToNodeB;
              ancestor2 = nodes.filter(n=>n.label === "A")[0];
              ancestor2Index = nodeAIndex;
              descendant2 = nodes.filter(n=>n.label === "B")[0];
              descendant2Index = nodeBIndex;
            } else if (mrca === nodeBIndex) {
              pair1 = NodePairType.rootToNodeB;
              descendant1 = nodes.filter(n=>n.label === "B")[0];
              descendant1Index = nodeBIndex;
              pair2 = NodePairType.nodeBToNodeA;
              ancestor2 = nodes.filter(n=>n.label === "B")[0];
              ancestor2Index = nodeBIndex;
              descendant2 = nodes.filter(n=>n.label === "A")[0];
              descendant2Index = nodeAIndex;
            } else {
              console.warn("need to revisit how node pairs are made");
            }
            setA = true;
            setB = true;
            nodePair = this.assembleNodePair(ancestor1Index, descendant1Index, pair1, pythia, summaryTree);
            chartData.nodePairs.push(nodePair);
            nodePair = this.assembleNodePair(ancestor2Index, descendant2Index, pair2, pythia, summaryTree);
            chartData.nodePairs.push(nodePair);
            // this.disableSelections();
          }

        } else {
          setA = true;
          setB = true;
          setMRCA = true;
          nodePair = this.assembleNodePair(rootIndex, mrcaIndex, NodePairType.rootToMrca, pythia, summaryTree);
          chartData.nodePairs.push(nodePair);
          nodePair = this.assembleNodePair(mrcaIndex, nodeAIndex, NodePairType.mrcaToNodeA, pythia, summaryTree);
          chartData.nodePairs.push(nodePair);
          nodePair = this.assembleNodePair(mrcaIndex, nodeBIndex, NodePairType.mrcaToNodeB, pythia, summaryTree);
          chartData.nodePairs.push(nodePair);
          // this.disableSelections();
        }
      }
      if (setMRCA) {
        chartData.nodeListData[1] = {
          confidence: nodeConfidence[mrcaIndex],
          index: mrcaIndex,
          childCount: this.nodeChildCount[mrcaIndex],
          isLocked: false,
          metadata: this.getNodeMetadata(mrcaIndex, nodeMetadata, tipIds)
        };
      }
      if (setA) {
        const nodeALocked = nodeAIndex === this.nodeAIndex;
        chartData.nodeListData[2] = {
          confidence: nodeConfidence[nodeAIndex],
          index: nodeAIndex,
          childCount: this.nodeChildCount[nodeAIndex],
          isLocked: nodeALocked,
          metadata: this.getNodeMetadata(nodeAIndex, nodeMetadata, tipIds)
        };
      }
      if (setB) {
        const nodeBLocked = nodeBIndex === this.nodeBIndex;
        chartData.nodeListData[3] = {
          confidence: nodeConfidence[nodeBIndex],
          index: nodeBIndex,
          childCount: this.nodeChildCount[nodeBIndex],
          isLocked: nodeBLocked,
          metadata: this.getNodeMetadata(nodeBIndex, nodeMetadata, tipIds)
        };
      }



      nodes = nodes.filter(({index})=>index>=0);
      const nodeIndices = nodes.map(({index})=>index),
        nodePrevalenceData = pythia.getPopulationNodeDistribution(nodeIndices, minDate, maxDate, summaryTree),
        nodeDistributions = nodePrevalenceData.series;
      chartData.nodes = nodes;
      chartData.nodeComparisonData = chartData.nodePairs.map(np=>{
        const ascendantTimes = nodeTimes[np.index1],
          descendantTimes = nodeTimes[np.index2] || [],
          ancestorMedianDate = getMedian(ascendantTimes),
          descendantMedianDate = getMedian(descendantTimes);
        return new NodeMutationsData(np, ancestorMedianDate, descendantMedianDate, minDate, maxDate, isApobecEnabled)
      });
      chartData.nodeAIsUpper = mccTreeCanvas.getZoomY(nodeAIndex) < mccTreeCanvas.getZoomY(nodeBIndex);
      /* we want the default distribution to come first, so take it off the end and put it first */
      nodeDistributions.forEach(treeSeries=>treeSeries.unshift(treeSeries.pop() as number[]));
      chartData.nodeDistributions = nodeDistributions;
      /*
      add an empty node before the root to represent the uninfected population
      in the prevalence chart
      */
      const prevalenceNodes = nodes.slice(0);
      prevalenceNodes.unshift({ index: UNSET, label: 'other', type: null, times: [], series: null });
      chartData.prevalenceNodes = prevalenceNodes;
      mccRef.release();

    }
    return chartData;
  }



  assembleNodePair(index1: number, index2: number, nodePairType: NodePairType, pythia: Pythia, tree: SummaryTree): NodePair {
    const mutTimes : MutationDistribution[] = pythia.getMccMutationsBetween(index1, index2, tree);
    return new NodePair(index1, index2, nodePairType, mutTimes);
  }



  checkNewHighlight(displayNode: DisplayNodeClass | null, date: number, mutation: Mutation | null): boolean{
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
        const metadata = this.sharedState.mccConfig.nodeMetadata?.getNodeMetadata(index);
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

  updateNodeData(summaryTree: SummaryTree) : boolean {
    if (summaryTree !== this.prevMcc) {
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
      this.prevMcc = summaryTree;
      return true;
    }
    return false;
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
    let displayNode: DisplayNodeClass|null = null;
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

    return { mrcaIndex, nodeAIndex, nodeBIndex, hint, displayNode};

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


  getNodeMetadata(nodeIndex:number, nodeMetadata: NodeMetadata | null, tipIds:string[]) {
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




}


const getNodeDisplay = (index: number, dnIndex: number) => {
  const dnc = new DisplayNodeClass(dnIndex);
  dnc.setIndex(index);
  return {
    index: index,
    label: dnc.name,
    type: dnc,
    times: [],
    series: null
  };
}


