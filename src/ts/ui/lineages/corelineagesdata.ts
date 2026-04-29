import { BaseTreeSeriesType } from "../../constants";
import { Mutation, SummaryTree } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";
import { Pythia } from "../../pythia/pythia";
import { SharedState } from "../../sharedstate";
import { assembleInheritanceTree, getTipCounts, InheritanceNode, isTip } from "../../util/treeutils";
import { UNDEF, UNSET } from "../common";
import { DisplayNode, NULL_NODE_CODE } from "./displaynode";
import { Distribution } from "../distribution";
import { MccTreeCanvas } from "../mcctreecanvas";
import { FieldTipCount, NodeMetadata, NodeMetadataValues } from "../nodemetadata";
import { getMRCA, getYFunction, NodePair, NodeRelationType, TreeHint } from "./lineagescommon";
import { NodeMutationsData } from "./nodemutationsdata";
import { SelectionTreeData, MRCANodeCreator, TreeNode } from "./selectiontreedata";
import { MccConfig } from "../mccconfig";



const DEFAULT_HI_CONFIDENCE = 0.9;
const DEFAULT_PEAK_PREVALENCE = 0.05;
const SELECTED_BY_PREVALENCE = 'prevalence';
const SELECTED_BY_USER = 'curated';

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
  nodes: DisplayNode[],
  rootNode: TreeNode | null,
  selectedRootIndex: number,
  peakPrevalence: number
}


export type updateFunction = (_: ChartData)=>void;

interface ParentMetadataType  {
  node: number,
  parentValue: string
}


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
  peakPrevalence: UNSET
};




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
  private tipCounts: number[] = [];
  private peakPrevalence: number[] = [];
  private getY: getYFunction | null = null;



  /*
  current state
  */
  private rootNode : DisplayNode;
  private selectedNodes: DisplayNode[] = [];
  private selectionReasons: Set<string>[] = [];
  private peakPrevalenceThreshold: number = DEFAULT_PEAK_PREVALENCE;
  private confidenceThreshold: number = DEFAULT_HI_CONFIDENCE;

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
      this.tipCounts = getTipCounts(summaryTree);
      this.getY = (n:number)=>mccTreeCanvas.getRawY(n);
      this.nodeMetadata = this.sharedState.mccConfig.nodeMetadata;
      this.tipIds = this.sharedState.getTipIds();
      this.isApobecEnabled = isApobecEnabled;
      const mrcaMaker : MRCANodeCreator = (nodeIndex: number)=>this.getNodeDisplay(nodeIndex, true, false);
      this.selectionTreeData = new SelectionTreeData(summaryTree, childCounts, mrcaMaker, this.getY);
      if (rootIndex !== this.rootNode.index) {
        this.getNodeDisplay(rootIndex, true, true, this.rootNode);
      }
      this.peakPrevalence.length = 0;
      this.selectNodesByImpact();
      this.selectionTreeData.setData(this.selectedNodes);
      this.setChartData();
    }
  }

  getHighImpactConfidentNodes(pythia: Pythia, tree: SummaryTree,
    minDate: number, maxDate: number, minPeak: number, minConf: number) : number [] {
    const nodeCount = this.nodeConfidence.length;
    const tipCount = (nodeCount + 1) / 2;
    const hiConf: number[] = [];
    for (let i = tipCount; i < nodeCount; i++) {
      if (this.nodeConfidence[i] >= minConf && this.tipCounts[i] > 1) {
        hiConf.push(i);
      }
    }
    /*
    do we have cached values for each node?
    */
    const anyMissing: boolean = hiConf.reduce((missing: boolean, nodeIndex: number)=>{
      const peak = this.peakPrevalence[nodeIndex];
      return missing || peak === undefined;
    }, false);
    if (anyMissing) {
      const peaks = pythia.getMaxPrevalence(hiConf, minDate, maxDate, tree);
      hiConf.forEach((node, i)=>{
        this.peakPrevalence[node] = peaks[i];
      });
    }
    const theNodes = hiConf.filter(node=>this.peakPrevalence[node] >= minPeak);
    /*
    with the selected nodes, build a tree. From there, evaluate
    how many descendants each node has. If has only one descendant, remove
    the descendant, unless that descendant has more than descendant.
    We're trying to remove strings of only one descendant, but preserve
    all branching points.
    */
    const reference: InheritanceNode = assembleInheritanceTree(tree, theNodes);
    const schematic: InheritanceNode = assembleInheritanceTree(tree, theNodes);
    const q = [schematic];
    const DEBUG_NODES = [6018, 5051, 4445, 3383, 3850, 3804 ];
    while (q.length > 0) {
      const node: InheritanceNode | undefined = q.shift();
      if (node) {
        if (DEBUG_NODES.indexOf(node.index) >= 0) {
          console.log(`
            debug`, node)
        }
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
    console.log(reference, schematic);
    theNodes.length = 0;
    q.length = 0;
    q.push(schematic);
    while (q.length > 0) {
      const node: InheritanceNode | undefined = q.shift();
      if (node) {
        theNodes.unshift(node.index);
        node.children.forEach(child=>q.push(child));
      }
    }
    return theNodes;
  }



  selectNodesByImpact() : void {
    const peakThreshold = this.peakPrevalenceThreshold;
    const confidenceThreshold = this.confidenceThreshold
    const pythia = this.pythia;
    let autoSelected: number[] = [];
    if (pythia) {
      const summaryTree = this.summaryTree as SummaryTree;
      const minDate = this.getMinDate();
      const maxDate = pythia.maxDate;
      // const startTime = Date.now();
      autoSelected = this.getHighImpactConfidentNodes(pythia, summaryTree, minDate, maxDate, peakThreshold, confidenceThreshold);
      // console.log(`elapsed: ${(Date.now() - startTime) / 1000} s for ${influentialNodes.length} nodes`, this.peakPrevalence);
    }
    this.setAutoNodeSelections(autoSelected, SELECTED_BY_PREVALENCE);
  }


  getMetadataTransitionNodes(mccConfig: MccConfig, field: string) : number[] {
    // const metadata = mccConfig.metadata;
    // const field = mccConfig.metadataField;
    const nodeValues = mccConfig.getMetadataValues(field);
    const summaryTree = this.summaryTree as SummaryTree;
    const rootNode = summaryTree.getRootIndex();
    const introductions: number[] = [];
    const q: ParentMetadataType[] = [
      {node: rootNode, parentValue: UNDEF}
    ];
    while (q.length > 0) {
      const item: ParentMetadataType | undefined = q.shift();
      if (item) {
        const { node, parentValue } = item;
        const nodeValue = nodeValues[node];
        if (node === rootNode) {
          // always include the root node
          introductions.push(node);
        }
        if (nodeValue !== UNDEF && parentValue !== UNDEF && nodeValue !== parentValue) {
          // we have a transition
          introductions.push(node);
        }
        const leftChild = summaryTree.getLeftChildIndexOf(node);
        if (leftChild !== UNSET) {
          q.push({ node: leftChild, parentValue: nodeValue });
          q.push({ node: summaryTree.getRightChildIndexOf(node), parentValue: nodeValue });
        }
      }
    }
    return introductions;
  }



  private setAutoNodeSelections(autoSelected: number[], selectionSource: string) : void {
    console.log(`adding automatic selections based on '${selectionSource}'`, autoSelected);
    const already: boolean[] = [];
    this.selectedNodes.map(node=>already[node.index] = true);
    /* clear previous selections, in case we are altering the criteria here (like node confidence, etc. ) */
    this.selectionReasons.forEach((reasons:Set<string>)=>{
      reasons.delete(selectionSource);
    });
    autoSelected.forEach(nodeIndex=>{
      if (this.selectionReasons[nodeIndex] === undefined) {
        this.selectionReasons[nodeIndex] = new Set();
      }
      this.selectionReasons[nodeIndex].add(selectionSource);
    });
    /* what nodes have reason to show up? */
    const shouldShow: number[] = [];
    this.selectionReasons.forEach((reasons, nodeIndex)=>{
      if (reasons.size > 0) {
        shouldShow.push(nodeIndex);
      }
    });
    shouldShow.forEach(nodeIndex=>{
      if (already[nodeIndex] === undefined) {
        const nd = this.getNodeDisplay(nodeIndex, false, nodeIndex === this.summaryTree?.getRootIndex());
        this.selectedNodes.push(nd);
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


  /*
  expects a number 0-100
  */
  updatePeakPrevalenceThreshold(yes: boolean, minPeak: number) : void {
    this.peakPrevalenceThreshold = minPeak / 100;
    if (yes) {
      this.selectNodesByImpact();
    } else {
      this.setAutoNodeSelections([], SELECTED_BY_PREVALENCE);
      if (this.selectedNodes.length === 0) {
        this.selectedNodes.push(this.rootNode);
      }
    }
    if (this.selectionTreeData) {
      this.selectionTreeData.setData(this.selectedNodes);
      this.setChartData();
    }
  }

  updateConfidenceThreshold(confidenceThreshold: number) : void {
    this.confidenceThreshold = confidenceThreshold;
    this.selectNodesByImpact();
    if (this.selectionTreeData) {
      this.selectionTreeData.setData(this.selectedNodes);
      this.setChartData();
    }
  }

  toggleMetadataTransitions(yes: boolean, field: string) : void {
    const pythia = this.pythia;
    const mccConfig: MccConfig = this.sharedState.mccConfig;
    if (!mccConfig || !mccConfig.metadata) return
    if (yes) {
      if (pythia && mccConfig.metadata.getFields().includes(field)) {
        const introductions = this.getMetadataTransitionNodes(mccConfig, field);
        this.setAutoNodeSelections(introductions, `metadata:${field}`);
      } else {
        console.debug(`somehow, we requested finding nodes by metadata transition…
          …but there's no metadata available.  
          `);
      }
    } else {
      /* find the nodes that were added by the transition, and clear them */
      this.setAutoNodeSelections([], `metadata:${field}`);
    }
    if (this.selectionTreeData) {
      if (this.selectedNodes.length > 0) {
        this.selectionTreeData.setData(this.selectedNodes);
      }
      this.setChartData();
    }
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
        minDate = this.getMinDate();
      const chartData: ChartData = structuredClone(defaultChartData)
      chartData.maxDate =maxDate;
      if (minimapData?.root) {
        chartData.rootNode = minimapData.root;
      }
      chartData.minDate = minDate;
      chartData.peakPrevalence = this.peakPrevalenceThreshold;
      const currentNodes = minimapData.found.filter(n=>n).map((treeNode: TreeNode)=>treeNode.node).filter(n=>n.isRoot || !n.isInferred);
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

        // console.log(toMap)
        minimap.setData(toMap);
        // if (nodeIndex === rootIndex) {
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
    this.setChartData();
  }


  dismissNode(nodeIndex: number) : void {
    const index = this.selectedNodes.map(node=>node.index).indexOf(nodeIndex);
    const node = this.selectedNodes.splice(index, 1)[0];
    this.selectionReasons[nodeIndex].delete(SELECTED_BY_USER);
    node.deactivate();
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

  getRootNode(): DisplayNode {
    return this.rootNode;
  }

}

