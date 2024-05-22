import { NodeIndex, Tree, PhyloTree, SummaryTree, MccTree } from './delphy_api';
import { isTip } from '../util/treeutils';
import { UNSET } from '../ui/common';
import { TipList, randBigInt } from './pythiacommon';
// import { resetLogTreeCount, logTree} from '../util//logtree';


/*
A summary tree where at each node, we find the most common split among base trees, and
use that to create the child nodes.
*/


type BaseTreeNodeData = { treeIndex: number, nodeIndex: number, isExactMatch: boolean };
type BaseTreeSplitData = { time: number, leftTips: TipList, rightTips: TipList, baseNode: BaseTreeNodeData };
type SplitData = { times: number[], baseNodes: BaseTreeNodeData[], leftTips: TipList, rightTips: TipList };


class TreeNodeHashes {
  /* a list of the tips at each node */
  private _nodeTips: TipList[];
  tree: PhyloTree;

  constructor(tree: PhyloTree, tipFingerprints: BigInt64Array) {
    this.tree = tree;
    const nodeCount = tree.getSize(),
      nodeTips: TipList[] = Array(nodeCount),
      root = tree.getRootIndex(),
      q: number[] = [root];
    let i = 0;
    /*
    build a queue of nodes to process starting at the root and
    working down, breadth first.
    when it gets to a tip, it creates a new tiplist,
    which manages the hash specific to this node.
    */
    while (i < q.length) {
      const index = q[i],
        left = tree.getLeftChildIndexOf(index);
      if (left !== UNSET) {
        q.push(left);
        q.push(tree.getRightChildIndexOf(index));
      } else {
        nodeTips[index] = new TipList();
        nodeTips[index].add(index, tipFingerprints);
      }
      i++;
    }
    /*
    iterate upward through the inner nodes,
    creating a new TipList at each one and setting
    its hash from its direct descendants
    */
    while (i > 0) {
      i--;
      const index = q[i];
      if (nodeTips[index] === undefined) {
        const left = nodeTips[tree.getLeftChildIndexOf(index)],
          right = nodeTips[tree.getRightChildIndexOf(index)];
        nodeTips[index] = new TipList();
        nodeTips[index].merge(left, right);
      }
    }
    this._nodeTips = nodeTips;
  }

  getNodeTipCount(nodeIndex: number) : number {
    return this._nodeTips[nodeIndex].getCount();
  }

  getNodeTips(nodeIndex: number): TipList {
    return this._nodeTips[nodeIndex];
  }

  getNodeKeys() : string[] {
    // return this._nodeTips.map(getKey);
    const arr: string[] = [];
    this._nodeTips.forEach((tipList, index)=>arr[index] = tipList.getKey());
    return arr;
  }

}


class Node {
  index: number;
  parent: Node | null;
  left: Node | null;
  right: Node | null;
  time: number;
  timeDistribution: number[];
  confidence: number;

  baseNodes: BaseTreeNodeData[];
  // splitNodes: BaseTreeNodeData[];

  tips: TipList;


  constructor(index: number, parent: Node | null, tips: TipList) {
    this.parent = parent;
    this.index = index;
    this.left = null;
    this.right = null;
    this.time = 0;
    this.confidence = 0;
    this.timeDistribution = [];
    this.baseNodes = [];
    // this.splitNodes = [];
    this.tips = tips;
  }

  setParent(parent: Node) {
    this.parent = parent;
  }

  setData(times : number[], baseNodes: BaseTreeNodeData[], // splitNodes: BaseTreeNodeData[],
    confidence: number, left: Node | null, right: Node | null): void {
    this.timeDistribution = times;
    this.confidence = confidence;
    this.time = times.reduce((tot, n)=>tot+n, 0) / times.length;
    this.left = left;
    this.right = right;
    this.baseNodes = baseNodes;
    // this.splitNodes = splitNodes;
  }

}





export class MostCommonSplitTree implements SummaryTree {

  size: number;
  rootIndex: number;
  nodes: Node[];
  baseTreeHashes: TreeNodeHashes[];
  tipHashes: BigInt64Array;

  /*
  the reference tree is merely a convenient accessor
  to all the base trees that we need in order to
  build this new tree
  */
  constructor(referenceTree: MccTree) {
    const startTime = Date.now();
    const tipIndices: number[] = [],
      nodeCount = referenceTree.getSize(),
      treeCount = referenceTree.getNumBaseTrees(),
      baseTreeHashes: TreeNodeHashes[] = new Array(treeCount),
      baseCladeCounts : {[name: string]: BaseTreeNodeData[]} = {};
    this.nodes = Array(nodeCount);
    this.tipHashes = new BigInt64Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      if (isTip(referenceTree, i)) {
        tipIndices.push(i);
        this.tipHashes[i] = randBigInt();
        /* instantiate the nodes corresponding to the tips */
        const tipList = new TipList();
        tipList.add(i, this.tipHashes);
        const node = new Node(i, null, tipList),
          time = referenceTree.getTimeOf(i),
          baseNodes:BaseTreeNodeData[] = [];
        for (let t = 0; t < treeCount; t++) {
          baseNodes.push({nodeIndex: i, treeIndex: t, isExactMatch: true});
        }
        node.setData([time], baseNodes, 1, null, null);
        this.nodes[i] = node;
      }
    }
    // resetLogTreeCount();
    for (let treeIndex = 0; treeIndex < treeCount; treeIndex++) {
      const tree = referenceTree.getBaseTree(treeIndex),
        treeTips = new TreeNodeHashes(tree, this.tipHashes),
        keyList = treeTips.getNodeKeys();
      baseTreeHashes[treeIndex] = treeTips;
      keyList.forEach((cladeKey, nodeIndex)=>{
        if (!baseCladeCounts[cladeKey]) baseCladeCounts[cladeKey] = [];
        const isExactMatch = true;
        baseCladeCounts[cladeKey].push({nodeIndex, treeIndex, isExactMatch});
      });
      // logTree(tree);
    }

    let index = 0;
    const setNextIndex = ()=>{
      while (this.nodes[index]) {
        index++;
      }
    }
    setNextIndex();
    this.rootIndex = index;
    this.size = nodeCount;
    this.baseTreeHashes = baseTreeHashes;
    const rootTipList = new TipList();
    tipIndices.forEach(i=>rootTipList.add(i, this.tipHashes));
    const root = new Node(this.rootIndex, null, rootTipList);
    this.nodes[this.rootIndex] = root;
    /*
    each node in this tree is based on the tips:
    we take the set of tips N
    for every base tree
      find the MRCA for the set of tips N.
        The MRCA might have exactly the same tips, or it may have more.
      get the two descendant nodes of the MRCA, and the tips in each node.
        we will call this the split, separating the nodes into two buckets.
      map the tips N into those two buckets
      generate a key to represent the split
    We track the frequency of the splits across all base trees.
    Once complete, whichever split occurs most frequently is the split we will use.
    create new nodes based on the buckets created by the split, and repeat until
      we are at the tips.
    */

    const q: Node[] = [root],
      processChild = (tips: TipList, parent: Node)=>{
        let n: Node,
          nIndex : number;
        if (tips.getCount() === 1) {
          nIndex = tips.tips[0];
          n = this.nodes[nIndex];
          n.setParent(parent);
        } else {
          setNextIndex();
          nIndex = index;
          n = new Node(nIndex, parent, tips);
          /*
          important! put this node into the nodes array
          before getting the index for the next node.
          */
          this.nodes[nIndex] = n;
          q.push(n);
        }
        return n;
      };
    while (q.length > 0){
      const parent: Node | undefined= q.pop();
      if (parent) {
        const tips: TipList = parent.tips,
          parentSplit: SplitData = getSplit(baseTreeHashes, tips, this.tipHashes),
          {times, baseNodes, leftTips, rightTips} = parentSplit;
        const right = processChild(rightTips, parent),
          left = processChild(leftTips, parent);
        /* this sets the confidence for this node based on the number of times the split occurs */
        // const confidence = baseNodes.length / treeCount;
        /*
        this sets confidence like the MCC, based on how often this set of tips occurs together
        among the base trees. It could be the case that this particular set of tips
        never happens among the base trees.
        */
        const key: string = tips.getKey(),
          baseTreeNodes = baseCladeCounts[key] || [],
          confidence = baseTreeNodes.length / treeCount;
        // console.debug(tips.tips.map(t=>`${t}`).join(), leftTips.tips.map(t=>`${t}`).join(), baseCladeCounts[key], treeCount);
        // console.debug(`${tips.getCount()} tips, baseNodes.length = ${baseNodes.length}`)
        parent.setData(times, baseNodes, confidence, left, right);
      }
    }
    console.debug(`${Date.now() - startTime} ms to build the HFS`);
    // logTree(this)
  }


  getSize(): number {
    return this.size;
  }

  getRootIndex(): NodeIndex {
    return this.rootIndex;
  }

  getParentIndexOf(nodeIndex: NodeIndex) : NodeIndex {
    const parent = this.nodes[nodeIndex].parent;
    return parent ? parent.index : -1;
  }

  getNumChildrenOf(nodeIndex: NodeIndex): number {
    const left = this.nodes[nodeIndex].left;
    return left ? 2 : 0;
  }

  getLeftChildIndexOf(nodeIndex: NodeIndex): NodeIndex {
    try {
      const left = this.nodes[nodeIndex].left;
      return left ? left.index : -1;
    } catch (err) {
      throw new Error(`could not retrieve node at index ${ nodeIndex } (${this.nodes.length} nodes available)`)
    }
  }

  getRightChildIndexOf(nodeIndex: NodeIndex): NodeIndex {
    const right = this.nodes[nodeIndex].right;
    return right ? right.index : -1;
  }

  getTimeOf(nodeIndex: NodeIndex): number {
    return this.nodes[nodeIndex].time;
  }
  getMrcaTimeOf(nodeIndex: number): number {
    throw new Error(`MostCommonSplitTree.getMrcaTimeOf not implemented, called for nodeIndex ${nodeIndex}`);
    // return this.nodes[nodeIndex].time;
  }

  getNumBaseTrees(): number {
    return this.baseTreeHashes.length;
  }

  getBaseTree(baseTreeIndex: number): PhyloTree {
    return this.baseTreeHashes[baseTreeIndex].tree;
  }

  getCorrespondingNodeInBaseTree(nodeIndex: NodeIndex, baseNodeIndex: number): number {
    const baseNodes = this.nodes[nodeIndex].baseNodes;
    return baseNodes[baseNodeIndex].nodeIndex;
  }

  isExactMatchInBaseTree(nodeIndex: NodeIndex, baseNodeIndex: number): boolean {
    const baseNodes = this.nodes[nodeIndex].baseNodes;
    return baseNodes[baseNodeIndex].isExactMatch;
  }


  getNodeConfidence() : number[] {
    return this.nodes.map(node=>node.confidence);
  }

}




/*
from @pvarilly
if this becomes a performance bottleneck,
using a priority queue keyed on time to always walk up the link of the
latest node among a working set of nodes might scale better
(you end up walking up all the links from the tips to the MRCA only once,
and as you do so, the size of the working set goes down
until it reaches "1" at the MRCA).
*/

const findMrcaForPair = (tree: Tree, nodeIndex1: number, nodeIndex2: number)=>{
  if (nodeIndex1 === -1 || nodeIndex2 === -1) {
    throw new Error("you've gone too far");
  }
  let n1 = nodeIndex1,
    n2 = nodeIndex2;
  while (n1 !== n2) {
    if (tree.getTimeOf(n1) > tree.getTimeOf(n2)) {
      n1 = tree.getParentIndexOf(n1);
    } else {
      n2 = tree.getParentIndexOf(n2);
    }
  }
  return n1;
};

const findMrcaForTips = (tree: Tree, tips: TipList)=>{
  const tipList = tips.getTips();
  tipList.sort((a: NodeIndex, b: NodeIndex)=>tree.getTimeOf(b) - tree.getTimeOf(a));
  let ancestor = tipList.shift() as number,
    nodeIndex: number;
  while (tipList.length > 0) {
    nodeIndex = tipList.shift() as number;
    ancestor = findMrcaForPair(tree, ancestor, nodeIndex);
  }
  return ancestor;
};


/*
for a given tree
find the node that is ancestor to all the tips
find its children
bucket the tips according to those child nodes

performance wise, this is O(N^2), and will blow up on larger trees.
we could use something like Union-Find (https://en.wikipedia.org/wiki/Disjoint-set_data_structure)
to do the partitioning (a node is in the same set, left or right, as its parent).

*/
const splitBaseTreeTips = (treeNodeHashes: TreeNodeHashes, tips: TipList, treeIndex: number, tipFingerprints: BigInt64Array)=>{
  /*
  find the mrca for the tips in this tree
  */
  const tree = treeNodeHashes.tree,
    nodeIndex = findMrcaForTips(tree, tips),
    /*
    how is that node split?
    */
    left = tree.getLeftChildIndexOf(nodeIndex),
    sourceTips = treeNodeHashes.getNodeTips(left),
    leftTips: TipList = new TipList(),
    rightTips: TipList = new TipList(),
    time: number = tree.getTimeOf(nodeIndex),
    /* does the number of tips at the node we found match the number of tips for which we found an MRCA? */
    isExactMatch = tips.getCount() === treeNodeHashes.getNodeTipCount(nodeIndex),
    baseNode: BaseTreeNodeData = { nodeIndex, treeIndex, isExactMatch },
    result: BaseTreeSplitData = { time, leftTips, rightTips, baseNode };
  /*
  assign the tips in our list to those buckets
  */
  tips.tips.forEach(t=>(sourceTips.tips.indexOf(t) >= 0 ? leftTips: rightTips).add(t, tipFingerprints));
  return result;
};


const getPairKey = (tips1: TipList, tips2: TipList)=>{
  /*
  TODO:
  At this point, we are trying to find a consistent identifier
  for the way the set of tips is split. Because we are starting
  from the same set of tips, if we can identify the split
  by getting a unique name for just one of the children. [mark 230308]
  */
  const key1 = tips1.getKey(),
    key2 = tips2.getKey(),
    pair = [key1, key2];
  pair.sort();
  return pair[0];
};


const getSplit = (treeNodeHashes: TreeNodeHashes[], tipList: TipList, tipFingerprints: BigInt64Array)=>{
  const pairs: { [key: string]: SplitData } = {},
    times: number[] = [],
    nodeTips: BaseTreeNodeData[] = [];
  for (let i = 0; i < treeNodeHashes.length; i++) {
    const {time, leftTips, rightTips, baseNode} = splitBaseTreeTips(treeNodeHashes[i], tipList, i, tipFingerprints),
      pairKey: string = getPairKey(leftTips, rightTips);
    if (!pairs[pairKey]) {
      pairs[pairKey] = {leftTips, rightTips, baseNodes: [], times: []};
    }
    pairs[pairKey].baseNodes.push(baseNode);
    times.push(time);
    nodeTips.push(baseNode);
  }
  const bestPair: SplitData = Object.values(pairs).reduce((a,b)=>a.baseNodes.length > b.baseNodes.length ? a : b);
  /*
  in this case, we are interested in the time of every MRCA,
  not just the times associated with the most common MRCA
  */
  bestPair.baseNodes = nodeTips;
  bestPair.times = times;
  return bestPair;
};


