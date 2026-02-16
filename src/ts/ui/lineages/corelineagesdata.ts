import { BaseTreeSeriesType } from "../../constants";
import { Mutation, SummaryTree } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";
import { Pythia } from "../../pythia/pythia";
import { SharedState } from "../../sharedstate";
import { isTip } from "../../util/treeutils";
import { UNSET } from "../common";
import { DisplayNode, NULL_NODE_CODE } from "./displaynode";
import { Distribution } from "../distribution";
import { MccTreeCanvas } from "../mcctreecanvas";
import { FieldTipCount, NodeMetadata, NodeMetadataValues } from "../nodemetadata";
import { getMRCA, NodePair, NodeRelationType, TreeHint } from "./lineagescommon";
import { NodeMutationsData } from "./nodemutationsdata";
import { MiniMapData, MRCANodeCreator, TreeNode } from "./minimapdata";



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


export type HighlightData = {
  node: DisplayNode,
  date: number,
  mutation: Mutation | null
};


export type ChartData = {
  nodeDistributions: BaseTreeSeriesType,
  prevalenceNodes : DisplayNode[],
  minDate: number,
  maxDate: number
  nodeComparisonData: NodeMutationsData[],
  nodePairs: NodePair[],
  nodes: DisplayNode[]
}

type getYFunction = (_: number) => number;

export type updateFunction = (_: ChartData)=>void;

export class CoreLineagesData {

  /* interface to push updates */
  update: updateFunction;

  /* shared data stores that we need */
  sharedState: SharedState;
  pythia: Pythia | null = null;
  nodeMetadata: NodeMetadata | null = null;
  tipIds: string[] = [];
  isApobecEnabled = false;



  /*
  local copies of data that gets updated
  every time the MCC switches
  */
  private summaryTree: SummaryTree | null = null;
  private nodeChildCount: number[] = [];
  private nodeConfidence: number[] = [];
  private getY: getYFunction | null = null;



  /*
  current state
  */
  private rootNode : DisplayNode;
  private selectedNodes: DisplayNode[] = [];
  /*
  the minimap includes nodes that are _not_ selected:
    inferred nodes
    highlight node
  */
  private minimapData: MiniMapData | null = null;
  private selectable = true;
  private constrainHoverByCredibility = false;


  private highlightNode: DisplayNode;
  private highlightDate: number = UNSET;
  private highlightMutation: Mutation | null = null;


  /*
  for the prevalence chart, we need a node like object
  to represent the uninfected population.
  */
  private nullNode: DisplayNode;

  constructor(sharedState: SharedState, update: updateFunction) {
    this.update = update;
    this.sharedState = sharedState;
    this.nullNode = this.getNodeDisplay(NULL_NODE_CODE, false, false);
    /* create a placeholder for */
    this.rootNode = this.getNodeDisplay(UNSET, true, true);
    this.highlightNode = this.getNodeDisplay(UNSET, false, false)
  }

  activate() {
    this.pythia = this.sharedState.pythia;
  }

  deactivate() {
    this.pythia = null;
  }

  initNodeData(mccTreeCanvas: MccTreeCanvas, isApobecEnabled: boolean) {
    const summaryTree = mccTreeCanvas.tree as SummaryTree;
    if (summaryTree !== this.summaryTree) {
      /* prep the data and methods that will allow for fast processing of nodes */

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
      this.nodeChildCount = childCounts;
      this.summaryTree = summaryTree;
      this.nodeConfidence = mccTreeCanvas.creds;
      this.getY = (n:number)=>mccTreeCanvas.getZoomY(n);
      this.nodeMetadata = this.sharedState.mccConfig.nodeMetadata;
      this.tipIds = this.sharedState.getTipIds();
      this.isApobecEnabled = isApobecEnabled;
      const mrcaMaker : MRCANodeCreator = (nodeIndex: number)=>this.getNodeDisplay(nodeIndex, true, false);
      this.minimapData = new MiniMapData(summaryTree, childCounts, mrcaMaker);
      if (rootIndex !== this.rootNode.index) {
        this.getNodeDisplay(rootIndex, true, true, this.rootNode);
      }
      this.minimapData.setData([this.rootNode]);
      if (this.sharedState.nodeList.length > 0) {
        // this.nodeAIndex = this.sharedState.nodeList[0];
        // if (this.sharedState.nodeList.length > 1) {
        //   this.nodeBIndex = this.sharedState.nodeList[1];
        //   this.mrcaIndex = this.checkMRCA(this.nodeAIndex, this.nodeBIndex);
        // }
      }

      this.setChartData();
    }
  }

  setChartData() {
    const pythia = this.pythia;
    if (pythia) {
      const chartData: ChartData = {
        nodeDistributions: [],
        prevalenceNodes: [],
        minDate: UNSET,
        maxDate: UNSET,
        nodeComparisonData: [],
        nodePairs: [],
        nodes: []
      };
      const summaryTree = this.summaryTree as SummaryTree;
      const minimapData = this.minimapData as MiniMapData;
      const getY = this.getY as getYFunction;
      const mccRef = pythia.getMcc(),
        minDate = pythia.getBaseTreeMinDate(),
        maxDate = pythia.maxDate;
      chartData.minDate = minDate;
      chartData.maxDate = maxDate;

      const currentNodes = minimapData.found.filter(n=>n).map((treeNode: TreeNode)=>treeNode.node);
      const currentIndices = currentNodes.map(n=>n.index).filter(i=>i!==UNSET);
      const nodePrevalenceData = pythia.getPopulationNodeDistribution(currentIndices, minDate, maxDate, summaryTree);
      const nodeDistributions = nodePrevalenceData.series;
      /* we want the default distribution to come first, so take it off the end and put it first */
      nodeDistributions.forEach(treeSeries=>treeSeries.unshift(treeSeries.pop() as number[]));
      chartData.nodeDistributions = nodeDistributions;
      minimapData.found.forEach(treeNode=>{
        const ancestor = treeNode.parent;
        if (ancestor) {
          const descendant = treeNode.node;
          let relation: NodeRelationType = NodeRelationType.singleDescendant;
          if (ancestor.children.length > 1) {
            const other: TreeNode = ancestor.children.filter(tn=>tn.node!==descendant)[0];
            if (getY(other.node.index) > getY(descendant.index)) {
              relation = NodeRelationType.upperDescendant;
            } else {
              relation = NodeRelationType.upperDescendant;
            }
          }
          const nodePair: NodePair = this.assembleNodePair(ancestor.node, descendant, relation);
          chartData.nodePairs.push(nodePair);
        }
      });
      chartData.nodes = currentNodes;
      chartData.nodeComparisonData = chartData.nodePairs.map(np=>{
        const ancestorSeries: Distribution = np.ancestor.series as Distribution;
        const descendantSeries: Distribution = np.descendant.series as Distribution;
        return new NodeMutationsData(np, ancestorSeries.median, descendantSeries.median, minDate, maxDate, this.isApobecEnabled)
      });
      /*
      add an empty node before the root to represent the uninfected population
      in the prevalence chart
      */
      const prevalenceNodes = currentNodes.slice(0);
      prevalenceNodes.unshift(this.nullNode);
      chartData.prevalenceNodes = prevalenceNodes;
      mccRef.release();
      this.update(chartData);
    }

  }




  assembleNodePair(ancestor: DisplayNode, descendant: DisplayNode, relation: NodeRelationType): NodePair {
    const pythia = this.pythia as Pythia;
    const tree = this.summaryTree as SummaryTree;
    const mutTimes : MutationDistribution[] = pythia.getMccMutationsBetween(ancestor.index, descendant.index, tree);
    return new NodePair(ancestor, descendant, relation, mutTimes);
  }



  checkNewHighlight(nodeIndex: number, date: number, mutation: Mutation | null): boolean{
    if (nodeIndex === this.highlightNode.index && date === this.highlightDate && mutation === this.highlightMutation) {
      return false;
    }
    const minimap = this.minimapData as MiniMapData;

    let displayNode: DisplayNode | null = null;
    if (nodeIndex === UNSET) {
      this.getNodeDisplay(UNSET, false, false, this.highlightNode);
    } else {
      /* do any existing nodes match?  */
      minimap.found.filter(n=>n).forEach(treeNode=>{
        if (treeNode.node.index === nodeIndex) {
          displayNode = treeNode.node;
        }
      });
      /* if not, set the data on the highlight node */
      if (displayNode === null) {
        this.getNodeDisplay(nodeIndex, false, false, this.highlightNode);
      } else {
        this.highlightNode.copyFrom(displayNode);
      }
    }

    this.highlightDate = date;
    this.highlightMutation =  mutation;
    return true;
  }

  hoverNode(nodeIndex: number, date:number): void {
    let hint: TreeHint = TreeHint.Zoom;
    this.highlightDate = date;
    if (nodeIndex !== this.highlightNode.index) {
      if (!this.constrainHoverByCredibility || this.nodeConfidence[nodeIndex] >= this.sharedState.mccConfig.confidenceThreshold) {
        this.getNodeDisplay(nodeIndex, false, false, this.highlightNode);
      }
      const minimap = this.minimapData as MiniMapData;
      const toMap: DisplayNode[] = [this.rootNode].concat(this.selectedNodes);
      if (nodeIndex !== UNSET) {
        toMap.push(this.highlightNode);
      }
      console.log(toMap)
      minimap.setData(toMap);
      if (nodeIndex === UNSET) {
        hint = TreeHint.Zoom;
      // } else if (nodeIndex === rootIndex) {
      //   /* new hover on existing node */
      //   displayNode = null;
      //   hint = TreeHint.HoverRoot;
      // } else if (nodeIndex === mrcaIndex) {
      //   /* new hover on existing node */
      //   displayNode = this.mrcaNode;
      //   hint = TreeHint.HoverMrca;
      // } else if (nodeIndex === nodeAIndex) {
      //   /* new hover on existing node */
      //   displayNode = this.nodeANode;
      //   hint = TreeHint.HoverNodeA;
      // } else if (nodeIndex === nodeBIndex) {
      //   /* new hover on existing node */
      //   displayNode = this.nodeBNode;
      //   if (mrcaIndex === UNSET) {
      //     hint = TreeHint.HoverNodeBDescendant;
      //   } else {
      //     hint = TreeHint.HoverNodeBCousin;
      //   }
      // } else if (nodeAIndex === UNSET && nodeIndex !== nodeBIndex) {
      //   /* selecting node 1 */
      //   nodeAIndex = nodeIndex;
      //   displayNode = this.nodeANode;
      //   if (nodeBIndex !== UNSET) {
      //     mrcaIndex = this.checkMRCA(nodeAIndex, nodeBIndex);
      //   }
      //   hint = TreeHint.PreviewNodeA;
      // } else if (nodeBIndex === UNSET && nodeIndex !== nodeAIndex) {
      //   /* selecting node 2 */
      //   nodeBIndex = nodeIndex;
      //   mrcaIndex = this.checkMRCA(nodeAIndex, nodeBIndex);
      //   displayNode = this.nodeBNode;
      //   if (mrcaIndex === UNSET) {
      //     hint = TreeHint.PreviewNodeBDescendant;
      //   } else {
      //     hint = TreeHint.PreviewNodeBCousin;
      //   }
      }

    }

    this.setChartData();

  }

  selectNode(nodeIndex: number) : void {

    // if (nodeIndex === this.nodeAIndex || nodeIndex === this.nodeBIndex) {
    //   /* clicking on an already selected node */
    //   return {updated: false, hint: TreeHint.Hover, selectable: false}
    // }
    // let hint = TreeHint.Hover;
    // let selectable = this.selectable;
    // if (this.nodeAIndex === UNSET) {
    //   this.nodeAIndex = nodeIndex;
    //   hint = TreeHint.HoverNodeA;
    // } else if (this.nodeBIndex === UNSET) {
    //   this.nodeBIndex = nodeIndex;
    // }

    // if (this.nodeAIndex !== UNSET && this.nodeBIndex !== UNSET) {
    //   this.mrcaIndex = this.checkMRCA(this.nodeAIndex, this.nodeBIndex);
    //   this.setSelectable(false);
    //   if (nodeIndex === this.nodeBIndex) {
    //     if (this.mrcaIndex === UNSET) {
    //       hint = TreeHint.HoverNodeBDescendant;
    //     } else {
    //       hint = TreeHint.HoverNodeBCousin;
    //     }
    //   }
    // } else {
    //   selectable = true;
    // }
    // return {updated: true, hint, selectable}

    if (this.selectedNodes.includes(this.highlightNode)) {
      return;
    }
    this.highlightNode.lock();
    this.selectedNodes.push(this.highlightNode);
    /* check for an MRCA  and add it if need be */

    /* prep the next hover */
    this.highlightNode = this.getNodeDisplay(UNSET, false, false);
    this.setChartData();
  }


  dismissNode(nodeIndex: number) : void {
    const index = this.selectedNodes.map(node=>node.index).indexOf(nodeIndex);
    const node = this.selectedNodes.splice(index, 1)[0];
    node.deactivate();
    this.hoverNode(UNSET, UNSET);
  }


  setCredibilityConstrained(constrained: boolean) : void {
    this.constrainHoverByCredibility = constrained;
  }

  setSelectable(selectable: boolean): void {
    this.selectable = selectable;
  }



  getSelectedTipIds(): string[] {
    const ids: string[] = [];
    [].forEach(index=>{
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
    const nodes: number[] = [];
    if (nodes.length > 0) {
      this.sharedState.setNodeSelection(nodes);
    }
  }




  checkMRCA(index1: number, index2: number): number {
    const mrca = getMRCA(index1, index2, this.summaryTree as SummaryTree, this.nodeChildCount);
    if (mrca === this.rootNode.index || mrca === index1 || mrca === index2) {
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


  getNodeDisplay(index: number, isInferred: boolean, isRoot: boolean,
    existingNode: DisplayNode | null = null
  ): DisplayNode {
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
    let dnc: DisplayNode;
    if (existingNode !== null) {
      existingNode.setData(index, generationsFromRoot, isInferred,
        isRoot, confidence, childCount, series, metadata);
      dnc = existingNode;
    } else {
      dnc = new DisplayNode(index, generationsFromRoot, isInferred,
        isRoot, confidence, childCount, series, metadata);
    }
    return dnc;
  }

  getHighlights() : HighlightData {
    const node = this.highlightNode;
    const date = this.highlightDate;
    const mutation = this.highlightMutation;
    return { node, date, mutation };
  }

  selectionsAvailable() : boolean {
    return this.selectable;
  }


}

