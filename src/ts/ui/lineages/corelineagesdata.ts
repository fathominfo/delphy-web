import { BaseTreeSeriesType } from "../../constants";
import { Mutation, SummaryTree } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";
import { Pythia } from "../../pythia/pythia";
import { SharedState } from "../../sharedstate";
import { assembleInheritanceTree, getTipCounts, InheritanceNode, isTip } from "../../util/treeutils";
import { ColorOption, numericSortReverse, UNDEF, UNSET } from "../common";
import { DisplayNode, NULL_NODE_CODE } from "./displaynode";
import { Distribution } from "../distribution";
import { MccTreeCanvas } from "../mcctreecanvas";
import { FieldTipCount, NodeMetadata, NodeMetadataValues } from "../nodemetadata";
import { getMRCA, getYFunction, METADATA_NONE_OPTION, NodePair, NodeRelationType, TreeHint } from "./lineagescommon";
import { NodeMutationsData } from "./nodemutationsdata";
import { SelectionTreeData, MRCANodeCreator, TreeNode } from "./selectiontreedata";
import { MccConfig } from "../mccconfig";



const DEFAULT_HI_CONFIDENCE = 0.9;
const DEFAULT_PEAK_PREVALENCE = 0.05;
const AUTO_SELECTED = 'poweredbydelphy';
const SELECTED_BY_USER = 'curated';

const SCHEMATIC_MIN_SIZE = 12;


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

export interface IntroductionData {
  nodeIndex: number,
  value: string,
  upstreamValue: string
}


export type ChartData = {
  nodeDistributions: BaseTreeSeriesType,
  prevalenceNodes : DisplayNode[],
  minDate: number,
  maxDate: number
  nodeComparisonData: NodeMutationsData[],
  nodePairs: NodePair[],
  nodes: DisplayNode[],
  rootNode: TreeNode | null,
  selectedRootIndex: number,
  peakPrevalence: number,
  fieldIntroductions: IntroductionData[],
  metadataField: string | null,
  isFullyAuto: boolean
}


export type UpdateFunction = (_: ChartData)=>void;


const defaultChartData : ChartData = {
  nodeDistributions: [],
  prevalenceNodes: [],
  minDate: UNSET,
  maxDate: UNSET,
  nodeComparisonData: [],
  nodePairs: [],
  nodes: [],
  rootNode: null,
  selectedRootIndex: UNSET,
  peakPrevalence: UNSET,
  fieldIntroductions: [],
  metadataField: null,
  isFullyAuto: false
};




export class CoreLineagesData {

  /* interface to push updates */
  update: UpdateFunction;

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
  private tipCounts: number[] = [];
  private peakPrevalence: number[] = [];
  private metadataTransitionNodes: { [_: string] : number[]} = {};
  private getY: getYFunction | null = null;



  /*
  current state
  */
  private rootNode : DisplayNode;
  private selectedNodes: DisplayNode[] = [];
  private selectionReasons: Set<string>[] = [];
  private peakPrevalenceThreshold: number = DEFAULT_PEAK_PREVALENCE;
  private confidenceThreshold: number = DEFAULT_HI_CONFIDENCE;
  private filteringByPeakPrevalence = true;
  private filteringByMetadataField: string | null = null;
  private fieldIntroductions: IntroductionData[] = [];

  /*
  bypassed nodes happen when the user selects an inner
  node to be the root, and there are selected nodes
  that are not descendants of the new root.
  */
  private bypassedNodes: DisplayNode[] = [];
  /*
  the minimap includes nodes that are _not_ selected:
    inferred nodes
    highlight node
  */
  private selectionTreeData: SelectionTreeData | null = null;
  private selectable = true;
  private constrainHoverByCredibility = false;


  private highlightNode: DisplayNode;
  private highlightDate: number = UNSET;
  private highlightMutation: Mutation | null = null;


  /*
  for the prevalence chart, we need a node like object
  to represent the uninfected population.
  */
  nullNode: DisplayNode;

  constructor(sharedState: SharedState, update: UpdateFunction) {
    this.update = update;
    this.sharedState = sharedState;
    this.nullNode = this.getNodeDisplay(NULL_NODE_CODE, false, false);
    /* create a placeholder for */
    this.rootNode = this.getNodeDisplay(UNSET, true, true);
    this.highlightNode = this.getNodeDisplay(UNSET, false, false)
  }

  activate() {
    this.pythia = this.sharedState.pythia;
    this.filteringByMetadataField = this.sharedState.mccConfig.metadataField;
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
      this.tipCounts = getTipCounts(summaryTree);
      this.getY = (n:number)=>mccTreeCanvas.getRawY(n);
      const mccConfig = this.sharedState.mccConfig;
      this.nodeMetadata = mccConfig.nodeMetadata;
      this.tipIds = this.sharedState.getTipIds();
      this.isApobecEnabled = isApobecEnabled;
      const mrcaMaker : MRCANodeCreator = (nodeIndex: number)=>this.getNodeDisplay(nodeIndex, true, false);
      this.selectionTreeData = new SelectionTreeData(summaryTree, childCounts, mrcaMaker, this.getY);
      if (rootIndex !== this.rootNode.index) {
        this.getNodeDisplay(rootIndex, true, true, this.rootNode);
      }
      this.peakPrevalence.length = 0;
      this.setNodePeakPrevalence(this.confidenceThreshold);
      if (this.filteringByPeakPrevalence) {
        this.autoSelectPeakPrevalence();
      }
      this.metadataTransitionNodes = {};
      if (this.filteringByMetadataField !== null) {
        const introductions = this.getMetadataTransitionNodes(mccConfig, this.filteringByMetadataField);
        this.metadataTransitionNodes[this.filteringByMetadataField] = introductions;
      }
      this.setAutoNodeSelections();
      this.setTreeData();
      this.setMetadataTransitions();
      this.setChartData();
    }
  }

  // getNodeMetadataColors(): string[] {
  //   const mccConfig = this.sharedState.mccConfig;
  //   const nodeColors: string[] = [];
  //   if (mccConfig.metadataColors && mccConfig.metadataField) {
  //     // string: {color: string, active: boolean}
  //     const nodeValues = mccConfig.getMetadataValues();
  //     this.selectedNodes.forEach(n=>{
  //       const index = n.index;
  //       const value = nodeValues[index];
  //       const color = mccConfig.getMetadataColor(value);
  //       nodeColors[index] = color;
  //     });
  //   }
  //   return nodeColors;
  // }



  setNodePeakPrevalence(minConf: number) {
    const pythia = this.pythia;
    if (pythia) {
      const hiConf: number[] = this.getConfidentInnerNodes(minConf);
      /*
      do we have cached values for each node?
      */
      const anyMissing: boolean = hiConf.reduce((missing: boolean, nodeIndex: number)=>{
        const peak = this.peakPrevalence[nodeIndex];
        return missing || peak === undefined;
      }, false);
      if (anyMissing) {
        const tree = this.summaryTree as SummaryTree;
        const minDate = this.getMinDate();
        const maxDate = pythia.maxDate;
        const peaks = pythia.getMaxPrevalence(hiConf, minDate, maxDate, tree);
        hiConf.forEach((node, i)=>{
          this.peakPrevalence[node] = peaks[i];
        });
      }
    }
  }

  getConfidentInnerNodes(minConf: number): number[] {
    const nodeCount = this.nodeConfidence.length;
    const tipCount = (nodeCount + 1) / 2;
    const hiConf: number[] = [];
    for (let i = tipCount; i < nodeCount; i++) {
      if (this.nodeConfidence[i] >= minConf && this.tipCounts[i] > 1) {
        hiConf.push(i);
      }
    }
    return hiConf;
  }


  getHighImpactConfidentNodes(minPeak: number, minConf: number) : number [] {
    const tree = this.summaryTree as SummaryTree;
    const hiConf: number[] = this.getConfidentInnerNodes(minConf);
    let theNodes = hiConf.filter(node=>this.peakPrevalence[node] >= minPeak);
    /* build a tree for the selected nodes */
    const schematic: InheritanceNode = assembleInheritanceTree(tree, theNodes);
    this.trimLongBranches(schematic);
    theNodes = this.getNodesInTree(schematic);
    return theNodes;
  }


  /*
  In the tree, we don't want to see many nodes in a row that only
  have 1 child each. For example, in a structure like

  node 0 +
         +-- node 1 --- node 2 --- node 3 --- node 4 +
                                                     + node 5

  node 2 and node 3 aren't adding any new information. Node 1 is important
  as the first child of the branching point, and Node 4 is important as the
  last node before the branching point. In this case, the goal would be:

  node 0 +
         +-- node 1 --- node 4 +
                               + node 5

  In order to eliminate nodes like 2 and 3, evaluate how many descendants
  each node has.If has only one descendant, check whether that descendant
  is a branching point (that is, check that the descendant in turn has more
  than one descendant). If it has one or none, remove it.
  */

  trimLongBranches(schematic: InheritanceNode) : void {
    const q = [schematic];
    while (q.length > 0) {
      const node: InheritanceNode | undefined = q.shift();
      if (node) {
        if (node.children.length > 1) {
          node.children.forEach(child=>q.push(child));
        } else if (node.children.length === 1) {
          const child = node.children[0];
          if (child.children.length <= 1) {
            node.children = child.children;
            if (node.children.length === 1) {
              /*
              maybe the new array is also one child,
              so put this item back in the queue
              */
              q.push(node);
            }
          } else {
            node.children.forEach(child=>q.push(child));
          }
        }
      }
    }
  }

  getNodesInTree(tree: InheritanceNode) : number[] {
    // console.log(reference, schematic);
    const theNodes: number[] = [];
    const q: InheritanceNode[] = [];
    q.push(tree);
    while (q.length > 0) {
      const node: InheritanceNode | undefined = q.shift();
      if (node) {
        theNodes.unshift(node.index);
        node.children.forEach(child=>q.push(child));
      }
    }
    return theNodes;
  }



  /*
  find the threshold for peak prevalence that gives us a good
  number of nodes to display
  */
  autoSelectPeakPrevalence() : void {
    /* get a sorted version of the prevalences */
    const sortedPrevalences = this.peakPrevalence.slice(0);
    sortedPrevalences.sort(numericSortReverse);
    /*
    get the total number of nodes visible at each threshold.
    store them in an array like [threshold, count]
    */
    const aboveThresholdCounts: [number, number][] = [];
    sortedPrevalences.forEach((t, count)=>{
      const asPct = Math.floor(t * 100);
      aboveThresholdCounts.push([asPct, count]);
    });
    // console.log(this.peakPrevalence.map((n,i)=>[n, this.tipCounts[i], this.nodeConfidence[i]]));
    // console.log(sortedPrevalences);
    // console.log(aboveThresholdCounts);
    /*
    `aboveThresholdCounts` might not reflect the actual number
    of nodes that will show up onscreen (since we try to `trimLongBranches`).
    find a good starting point, then get the number of nodes we will trim.
    Lower the threshold until we get the minimum.
    */
    let index = aboveThresholdCounts.length - 1;
    while (index >= 0 && aboveThresholdCounts[index][1] > SCHEMATIC_MIN_SIZE) {
      index--;
    }
    if (index < 0) this.peakPrevalenceThreshold = 1; // 100%
    else {
      const tree = this.summaryTree as SummaryTree;
      let prev: number;
      let nodes: number[];
      let schematic: InheritanceNode;
      while (index < aboveThresholdCounts.length) {
        prev = aboveThresholdCounts[index][0] / 100;
        nodes = this.peakPrevalence.map((n, i)=>[n, i])
          .filter(([n])=>n >= prev)
          .map(([_,i])=>i); // eslint-disable-line @typescript-eslint/no-unused-vars
        schematic = assembleInheritanceTree(tree, nodes);
        this.trimLongBranches(schematic);
        nodes = this.getNodesInTree(schematic);
        if (nodes.length >= SCHEMATIC_MIN_SIZE) {
          this.peakPrevalenceThreshold = prev;
          break;
        }
        index++;
      }
      if (index < 0) {
        this.peakPrevalenceThreshold = 1;
      }
    }
  }

  getMetadataTransitionNodes(mccConfig: MccConfig, field: string) : number[] {
    // const metadata = mccConfig.metadata;
    // const field = mccConfig.metadataField;
    const { confidenceThreshold, nodeConfidence } = this;
    const tree = this.summaryTree as SummaryTree;
    const nodeValues = mccConfig.getMetadataValues(field);
    const summaryTree = this.summaryTree as SummaryTree;
    const rootIndex = this.rootNode.index;
    const introductions: number[] = [];
    const q: number[] = [rootIndex];
    while (q.length > 0) {
      const index: number | undefined = q.shift();
      if (index !== undefined) {
        const nodeValue = nodeValues[index];
        if (index === rootIndex) {
          // always include the root node
          introductions.push(index);
        } else if (nodeConfidence[index] >= confidenceThreshold) {
          let hiConfAncestorIndex = tree.getParentIndexOf(index);
          while (hiConfAncestorIndex !== UNSET && !(nodeConfidence[hiConfAncestorIndex] >= confidenceThreshold)) {
            hiConfAncestorIndex = tree.getParentIndexOf(hiConfAncestorIndex);
          }
          if (hiConfAncestorIndex !== UNSET) {
            const parentValue = nodeValues[hiConfAncestorIndex];
            // console.log(index, nodeValue, nodeConfidence[index], hiConfAncestorIndex, parentValue, nodeConfidence[hiConfAncestorIndex]);
            if (nodeValue !== UNDEF && parentValue !== undefined && parentValue !== UNDEF && nodeValue !== parentValue) {
              // we have a transition
              introductions.push(index);
            }
          }
        }
        const leftChild = summaryTree.getLeftChildIndexOf(index);
        if (leftChild !== UNSET) {
          q.push(leftChild);
          q.push(summaryTree.getRightChildIndexOf(index));
        }
      }
    }
    return introductions;
  }



  private setAutoNodeSelections() : void {
    /* clear previous selections, in case we are altering the criteria here (like node confidence, etc. ) */
    this.selectionReasons.forEach((reasons:Set<string>)=>{
      reasons.delete(AUTO_SELECTED);
    });
    const peakThreshold = this.peakPrevalenceThreshold;
    const confidenceThreshold = this.confidenceThreshold
    const autoSelected = this.getHighImpactConfidentNodes(peakThreshold, confidenceThreshold);
    autoSelected.forEach(nodeIndex=>{
      if (this.selectionReasons[nodeIndex] === undefined) {
        this.selectionReasons[nodeIndex] = new Set();
      }
      this.selectionReasons[nodeIndex].add(AUTO_SELECTED);
    });
    this.updateSelectedNodesFromReasons();
  }

  private updateSelectedNodesFromReasons() {
    /* what nodes have reason to show up? */
    const shouldShow: number[] = [];
    this.selectionReasons.forEach((reasons, nodeIndex)=>{
      if (reasons.size > 0) {
        shouldShow.push(nodeIndex);
      }
    });
    const already: boolean[] = [];
    this.selectedNodes.map(node=>already[node.index] = true);
    shouldShow.forEach(nodeIndex=>{
      if (already[nodeIndex] === undefined) {
        if (nodeIndex !== this.rootNode.index) {
          const nd = this.getNodeDisplay(nodeIndex, false, nodeIndex === this.summaryTree?.getRootIndex());
          nd.isLocked = true;
          this.selectedNodes.push(nd);
        }
      } else {
        delete already[nodeIndex];
      }
    })
    /* delete and deactivate the ones we don't need anymore */
    for (let i = this.selectedNodes.length - 1; i >= 0; i--) {
      const dn = this.selectedNodes[i];
      if (already[dn.index] !== undefined) {
        dn.deactivate();
        this.selectedNodes.splice(i, 1);
      }
    }
  }


  togglePeakPrevalenceSelection(active: boolean) : void {
    console.log(`togglePeakPrevalenceSelection(${active})`)
    this.filteringByPeakPrevalence = active;
    if (active) {
      this.setAutoNodeSelections();
    } else {
      this.selectionReasons.forEach((reasons:Set<string>)=>{
        reasons.delete(AUTO_SELECTED);
      });
      this.updateSelectedNodesFromReasons();
    }
    if (this.selectionTreeData) {
      this.setTreeData();
      this.setMetadataTransitions();
      this.setChartData();
    }
  }

  clearCurated() : void {
    this.selectionReasons.forEach((reasons:Set<string>)=>{
      reasons.delete(SELECTED_BY_USER);
    });
    this.updateSelectedNodesFromReasons();
    if (this.selectionTreeData) {
      this.setTreeData();
      this.setMetadataTransitions();
      this.setChartData();
    }
  }

  removeNonTransitions() : void {
    console.log(`find the nodes that aren't transitions, and clear them`);
    const lookup: boolean[] = [];
    this.fieldIntroductions.forEach(intro=>lookup[intro.nodeIndex] = true);
    /* also include root */
    lookup[this.rootNode.index] = true;
    for (let i = this.selectedNodes.length - 1; i >= 0; i--) {
      const index = this.selectedNodes[i].index;
      if (lookup[index] === undefined) {
        this.selectedNodes.splice(i, 1);
      }
    }
    if (this.selectionTreeData) {
      this.setTreeData();
      this.setChartData();
    }
  }


  /*
  expects a number 0-100
  */
  updatePeakPrevalenceThreshold(increment: boolean) : void {
    let newPct = this.peakPrevalenceThreshold * 100;
    newPct += increment ? 1 : -1;
    this.peakPrevalenceThreshold = Math.min(Math.max(0, newPct / 100),1);
    this.setAutoNodeSelections();
    if (this.selectionTreeData) {
      this.setTreeData();
      this.setMetadataTransitions();
      this.setChartData();
    }
  }

  updateConfidenceThreshold(confidenceThreshold: number) : void {
    this.confidenceThreshold = confidenceThreshold;
    this.setAutoNodeSelections();
    if (this.selectionTreeData) {
      this.setTreeData();
      this.setChartData();
    }
  }

  highlightMetadataTransitions(field: string) : void {
    const mccConfig: MccConfig = this.sharedState.mccConfig;
    if (!mccConfig || !mccConfig.metadata) return
    if (field === METADATA_NONE_OPTION) {
      this.filteringByMetadataField = null;
      this.fieldIntroductions.length = 0;
      mccConfig.setColorSystem(ColorOption.confidence);
    } else {
      this.filteringByMetadataField = field;
      mccConfig.setColorSystem(ColorOption.confidence);
      mccConfig.setMetadataField(field);
      this.setMetadataTransitions();
    }
    this.setChartData();
  }

  setMetadataTransitions() : void {
    const field = this.filteringByMetadataField;
    if (field === null) return;
    const mccConfig: MccConfig = this.sharedState.mccConfig;
    const fieldIntroductions: IntroductionData[] = []

    /* build a list of the current nodes that have introductions */
    /* start with a lookup of the current metadata values */
    const nodeValues = mccConfig.getMetadataValues(field);
    const candidateNodes = this.selectedNodes.slice(0);
    const allNodes = [this.rootNode].concat(candidateNodes);
    if (this.highlightNode.index !== UNSET && !allNodes.map(n=>n.index).includes(this.highlightNode.index)) {
      candidateNodes.push(this.highlightNode);
      allNodes.push(this.highlightNode);
    }
    const selectedValues: string [] = [];
    allNodes.forEach(n=>{
      selectedValues[n.index] = nodeValues[n.index];
    });
    const tree = this.summaryTree as SummaryTree;
    candidateNodes.forEach(node=>{
      const nodeIndex = node.index;
      const value = nodeValues[nodeIndex];
      let parentIndex = tree.getParentIndexOf(nodeIndex);
      while (parentIndex !== UNSET && selectedValues[parentIndex] === undefined) {
        parentIndex = tree.getParentIndexOf(parentIndex);
      }
      if (parentIndex >= 0) {
        const upstreamValue = nodeValues[parentIndex];
        if (upstreamValue !== value) {
          fieldIntroductions.push({nodeIndex, value, upstreamValue});
        }
      }
    }
    );
    this.fieldIntroductions = fieldIntroductions;
  }


  setTreeData() : void {
    const tree = this.summaryTree as SummaryTree;
    const selectionTree = this.selectionTreeData as SelectionTreeData;
    const candidateNodes = this.selectedNodes;
    if (!candidateNodes.map(n=>n.index).includes(this.rootNode.index)) {
      candidateNodes.unshift(this.rootNode);
    }
    const rootIndex = this.rootNode.index;
    /*
    if we have set a custom root node,
    auto selecting nodes by prevalence may include nodes
    that aren't descendants of the current root. So filter
    them out.
    */
    if (tree.getRootIndex() !== rootIndex) {
      for (let i = candidateNodes.length - 1; i >= 0; i--) {
        let index = candidateNodes[i].index;
        while (index !== UNSET && index !== rootIndex) {
          index = tree.getParentIndexOf(index);
        }
        if (index === UNSET) {
          candidateNodes.splice(i, 1);
        }
      }
    }
    selectionTree.setData(candidateNodes);

  }


  getMinDate() : number {
    if (this.pythia) {
      let minDate = this.pythia.getBaseTreeMinDate();
      const actualRootIndex = (this.summaryTree as SummaryTree).getRootIndex()
      if (this.rootNode.index !== actualRootIndex && this.rootNode.series) {
        /* what is the earliest date for the selected node? */
        minDate = this.rootNode.series.bandTimes[0];
      }
      return minDate;
    }
    return UNSET;
  }


  setChartData() {
    const pythia = this.pythia;
    if (pythia) {
      const summaryTree = this.summaryTree as SummaryTree;
      const minimapData = this.selectionTreeData as SelectionTreeData;
      const getY = this.getY as getYFunction;
      const mccRef = pythia.getMcc(),
        maxDate = pythia.maxDate,
        minDate = this.getMinDate(),
        actualRootIndex = summaryTree.getRootIndex();
      const chartData: ChartData = structuredClone(defaultChartData)
      chartData.maxDate =maxDate;
      if (minimapData?.root) {
        chartData.rootNode = minimapData.root;
      }
      chartData.minDate = minDate;
      chartData.peakPrevalence = this.peakPrevalenceThreshold;
      chartData.metadataField = this.filteringByMetadataField;
      chartData.selectedRootIndex = this.rootNode.index === actualRootIndex ? UNSET : this.rootNode.index;
      chartData.isFullyAuto = this.isAutoselectingActive();
      const currentNodes = minimapData.found.filter(n=>n).map((treeNode: TreeNode)=>treeNode.node).filter(n=>n.isRoot || !n.isInferred);
      const currentIndices = currentNodes.map(n=>n.index).filter(i=>i!==UNSET);
      const nodePrevalenceData = pythia.getPopulationNodeDistribution(currentIndices, minDate, maxDate, summaryTree);
      const nodeDistributions = nodePrevalenceData.series;
      /* we want the default distribution to come first, so take it off the end and put it first */
      nodeDistributions.forEach(treeSeries=>treeSeries.unshift(treeSeries.pop() as number[]));
      chartData.nodeDistributions = nodeDistributions;
      chartData.fieldIntroductions = this.fieldIntroductions.slice();
      minimapData.found.forEach(treeNode=>{
        const ancestor = treeNode.parent;
        if (ancestor && ancestor.node.index !== UNSET) {
          const descendant = treeNode.node;
          if (descendant.index === UNSET) return;
          let relation: NodeRelationType = NodeRelationType.singleDescendant;
          if (ancestor.children.length > 1) {
            const other: TreeNode = ancestor.children.filter(tn=>tn.node!==descendant)[0];
            if (getY(other.node.index) > getY(descendant.index)) {
              relation = NodeRelationType.upperDescendant;
            } else {
              relation = NodeRelationType.lowerDescendant;
            }
          }
          const nodePair: NodePair = this.assembleNodePair(ancestor.node, descendant, relation);
          chartData.nodePairs.push(nodePair);
        }
      });
      // console.log(`${currentNodes.length} nodes`, currentIndices)
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
    // console.log(`setting highlight node to ${nodeIndex}`)
    const minimap = this.selectionTreeData as SelectionTreeData;

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

  hoverNode(nodeIndex: number, _date:number): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    // let _hint: TreeHint = TreeHint.Zoom;
    // this.highlightDate = date;
    const prevIndex = this.highlightNode.index;
    if (nodeIndex !== prevIndex) {
      if (this.constrainHoverByCredibility
        && nodeIndex !== UNSET
        && this.nodeConfidence[nodeIndex] < this.sharedState.mccConfig.confidenceThreshold) {
        /*
        if we don't meet the credibility threshold, don't deselect the current selection.
        the thinking is that the nodes are usually so dense that this would make it
        very hard to select the node you are after.
        */
        return;
      } else {
        const minimap = this.selectionTreeData as SelectionTreeData;
        const toMap: DisplayNode[] = [this.rootNode].concat(this.selectedNodes);
        if (nodeIndex === UNSET) {
          // _hint = TreeHint.Zoom;
          this.getNodeDisplay(UNSET, false, false, this.highlightNode);
        } else {
          this.getNodeDisplay(nodeIndex, false, false, this.highlightNode);
          /*
          does the hovered node match an existing selection or MRCA?
          */
          const match = minimap.found.filter(treeNode=>treeNode)
            .map(tn=>tn.node)
            .filter(node=>(node.isInferred || node.isLocked) && node.index === nodeIndex)[0];
          if (match) {
            if (match.isInferred) {
              // set the label from the mrca
              this.highlightNode.label = match.label;
            } else {
              this.highlightNode.copyFrom(match);
            }
          } else {
            toMap.push(this.highlightNode);
          }
        }
        minimap.setData(toMap);
      }
      this.setMetadataTransitions();
      this.setChartData();
    }
  }

  selectNode(nodeIndex: number) : void {
    if (nodeIndex === UNSET || nodeIndex === this.rootNode.index) return;
    const alreadyThereIndex = this.selectedNodes.map(node=>node.index).indexOf(nodeIndex);
    if (alreadyThereIndex >= 0) {
      /* clicking on a node that's already there removes it */
      const selection = this.selectedNodes.splice(alreadyThereIndex, 1)[0];
      selection.unlock();
      /*
      We're assuming that if the user cleared this node, then they
      don't want to see it, even if it was added due to metadata
      transitions or it's a high impact node.
      Note that this will not persist: if the user adjusts the
      prevalence or confidence criteria, or toggles the metadata
      display, if this node meets the new criteria, it will be shown
      again. Should we add a `don't auto select this node again` option?
      */
      this.selectionReasons[nodeIndex].clear();
    } else {
      let selection: DisplayNode = this.highlightNode;
      if (nodeIndex !== this.highlightNode.index) {
        /* could the node be an MRCA? That would not be in currentNodes */
        const minimap = this.selectionTreeData as SelectionTreeData;
        const mrcaTreeNode = minimap.found.filter(treeNode=>{
          return treeNode
            && treeNode.node.isInferred
            && treeNode.node.index === nodeIndex;
        })[0];
        if (mrcaTreeNode) {
          selection = mrcaTreeNode.node;
        } else {
          selection = this.getNodeDisplay(nodeIndex, false, false);
        }
      }
      selection.lock();
      this.selectedNodes.push(selection);
      if (this.selectionReasons[nodeIndex] === undefined) {
        this.selectionReasons[nodeIndex] = new Set();
      }
      this.selectionReasons[nodeIndex].add(SELECTED_BY_USER);
      /* prep the next hover */
      this.highlightNode = this.getNodeDisplay(UNSET, false, false);
    }
    this.setMetadataTransitions();
    this.setChartData();
  }


  dismissNode(nodeIndex: number | number[]) : void {
    const lookup: boolean[] = [];
    if (nodeIndex instanceof Array) {
      nodeIndex.forEach(n=>lookup[n] = true);
    } else {
      lookup[nodeIndex] = true;
    }
    for (let i = this.selectedNodes.length - 1; i >= 0; i--) {
      const index = this.selectedNodes[i].index;
      if (lookup[index]){
        const node = this.selectedNodes.splice(i, 1)[0];
        this.selectionReasons[node.index].clear();
        node.deactivate();
      }
    }
    this.setMetadataTransitions();
    /* reset the hover */
    this.hoverNode(UNSET, UNSET);
  }

  selectRoot(nodeIndex: number) : void {
    if (nodeIndex === this.rootNode.index) return;
    const summaryTree = this.summaryTree as SummaryTree;
    const actualRootIndex = summaryTree.getRootIndex();
    /* restore the selected nodes*/
    console.log(`restoring ${this.bypassedNodes.length} nodes`, this.bypassedNodes.map(n=>n.name).join(','))
    this.bypassedNodes.forEach(node=>this.selectedNodes.push(node));
    this.bypassedNodes.length = 0;
    if (nodeIndex === UNSET || nodeIndex === actualRootIndex) {
      this.rootNode.isInferred = true;
      this.rootNode.index = actualRootIndex;
      this.rootNode = this.getNodeDisplay(actualRootIndex, true, true, this.rootNode);
    } else {
      /* since this node is becoming root, remove it from the selections */
      const oldNode = this.bypassNode(nodeIndex);
      this.rootNode.isInferred = false;
      this.rootNode.copyDataFrom(oldNode);
      // this.rootNode.index = nodeIndex;
      /* check that all the selected nodes fall under the root */
      const toFind: boolean[] = [];
      this.selectedNodes.forEach(n=>toFind[n.index] = false);
      const q: number[] = [nodeIndex];
      /*
      traverse the tree from our new root, checking off the nodes
      we need to find
      */
      while (q.length > 0) {
        const index = q.pop() as number;
        toFind[index] = true;
        const left = summaryTree.getLeftChildIndexOf(index);
        const right = summaryTree.getRightChildIndexOf(index);
        if (left !== UNSET) {
          q.push(left);
          q.push(right); // if there's a left, there's a right
        }
      }
      toFind.forEach((found, i)=>{
        if (!found) this.bypassNode(i);
      });
    }
    const minimap = this.selectionTreeData as SelectionTreeData;
    const toMap: DisplayNode[] = [this.rootNode].concat(this.selectedNodes);
    minimap.setData(toMap);
    this.setChartData();
  }

  bypassNode(nodeIndex: number) : DisplayNode {
    const node = this.selectedNodes.find(n=>n.index === nodeIndex) as DisplayNode;
    const index = this.selectedNodes.indexOf(node);
    this.selectedNodes.splice(index, 1);
    this.bypassedNodes.push(node);
    return node;
  }


  isASelectedNode(nodeIndex: number) : boolean {
    return this.rootNode.index === nodeIndex || this.selectedNodes.map(n=>n.index).includes(nodeIndex);
  }


  /* returns a display node only if it's among the current selections */
  getSelection(nodeIndex: number) : DisplayNode | null {
    let node : DisplayNode | null = null;
    if (this.rootNode.index === nodeIndex) {
      node = this.rootNode;
    } else {
      const arrIndex = this.selectedNodes.map(n=>n.index).indexOf(nodeIndex);
      if (arrIndex >= 0) {
        node = this.selectedNodes[arrIndex];
      }
    }
    return node;
  }


  isAutoselectingActive() : boolean {
    const peakThreshold = this.peakPrevalenceThreshold;
    const confidenceThreshold = this.confidenceThreshold
    const autoSelected = this.getHighImpactConfidentNodes(peakThreshold, confidenceThreshold);
    let isAuto = true;
    /* something has been added by curation, not automatically  */
    // this.selectionReasons.forEach((nodeReasons, nodeIndex)=>{
    //   /* we removed something from the auto configuration */
    //   if (!autoSelected.includes(nodeIndex)) {
    //     isAuto = false;
    //   }
    //   /* check whether this is not auto selected */
    //   let notAuto = true;
    //   nodeReasons.forEach(entry=>{
    //     if (entry === AUTO_SELECTED) {
    //       notAuto = false;
    //     }
    //   });
    //   if (notAuto) {
    //     isAuto = false;
    //   }
    // });

    /* auto selections have something to add for us */
    const tree = this.summaryTree as SummaryTree;
    const actualRoot = tree.getRootIndex();
    const currentRoot = this.rootNode.index;
    const isCuratedRoot = actualRoot !== currentRoot;
    autoSelected.forEach(nodeIndex=>{
      const reasons = this.selectionReasons[nodeIndex];
      if (reasons === undefined || reasons.size === 0) {
        /*
        check that this node is a descendant of the current root
        */
        if (isCuratedRoot) {
          let ancestor = nodeIndex;
          while (ancestor !== currentRoot && ancestor !== UNSET) {
            ancestor = tree.getParentIndexOf(ancestor);
          }
          if (ancestor === currentRoot) {
            isAuto = false;
          }
        } else {
          isAuto = false;
        }
      }
    });
    return isAuto;
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
      generationsFromRoot = 0;
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

  getRootNode(): DisplayNode {
    return this.rootNode;
  }

  getCurrentMetadataField(): string | null {
    return this.filteringByMetadataField;
  }
}

