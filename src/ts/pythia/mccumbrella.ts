import {PhyloTree, SummaryTree, Mutation} from './delphy_api';
import {BackLink, MccNodeBackLinks, TipList, randBigInt} from './pythiacommon';
import {isTip} from '../util/treeutils';
import { UNSET } from '../ui/common';

type BaseNodeInfo = {baseTreeNodeIndex: number, treeIndex: number, time: number, isExactMatch: boolean};
type NodeReference = {refIndex: number, basis: BaseNodeInfo[]};

export class MccUmbrella implements SummaryTree {
  treeCount: number;
  nodeCount: number;
  tipCount: number;
  rootIndex: number;
  basis: SummaryTree;
  /* tracks base tree nodes for each node in the umbrella tree */
  nodeReferences: NodeReference[];
  times: number[];
  parents: number[];
  children: number[][];
  creds: number[];



  /*
  @param backlinks provides pointers from base tree nodes to corresponding
  mcc nodes, along with an indicator of whether the node is an
  exact match or matches to the MRCA of the tips in the base tree node.

  we need to identify nodes in the base trees that are linked to mutations

  but also track which node in each tree corresponds to the summary tree node

  */
  constructor(mcc: SummaryTree, backlinks: MccNodeBackLinks) {
    if (mcc instanceof MccUmbrella) {
      throw new Error("Building an umbrella tree from another umbrella tree is not supported");
    }
    this.basis = mcc;
    const nodeCount = mcc.getSize();
    this.tipCount = (nodeCount + 1) / 2;
    this.treeCount = mcc.getNumBaseTrees();
    const rootIndex = mcc.getRootIndex();
    /* node bases point */
    const nodesToInclude: BaseNodeInfo[][] = Array(nodeCount);
    const tally = (treeIndex: number, baseTreeNodeIndex: number, time: number)=>{
      const backLink: BackLink = backlinks[treeIndex][baseTreeNodeIndex],
        mccNodeIndex = backLink.nodeIndex,
        isExactMatch = backLink.isExactMatch;
      if (!nodesToInclude[mccNodeIndex]) {
        nodesToInclude[mccNodeIndex] = [];
      }
      nodesToInclude[mccNodeIndex].push({treeIndex, baseTreeNodeIndex, time, isExactMatch});
    };
    /* what mcc nodes have mutations */
    for (let treeIndex = 0; treeIndex < this.treeCount; treeIndex++) {
      const tree: PhyloTree = mcc.getBaseTree(treeIndex);
      for (let i = 0; i < nodeCount; i++) {
        let found = i === tree.getRootIndex() || isTip(tree, i);
        if (!found) {
          tree.forEachMutationOf(i, (_:Mutation)=>{ // eslint-disable-line @typescript-eslint/no-unused-vars
            found = true;
          });
        }
        if (found) {
          tally(treeIndex, i, tree.getTimeOf(i));
        }
      }
    }
    /* build the means of looking up base tree nodes */
    this.nodeReferences = [];
    const mccToUmbrella: number[] = [];
    let newRootIndex = -1;
    nodesToInclude.forEach((_, mccIndex)=>{
      if (mccIndex === rootIndex) {
        newRootIndex = this.nodeReferences.length;
      }
      mccToUmbrella[mccIndex] = this.nodeReferences.length;
      const basis: BaseNodeInfo[] = [];
      for (let treeIndex = 0; treeIndex < mcc.getNumBaseTrees(); treeIndex++) {
        const baseTreeNodeIndex = mcc.getCorrespondingNodeInBaseTree(mccIndex, treeIndex),
          tree = mcc.getBaseTree(treeIndex),
          time = tree.getTimeOf(baseTreeNodeIndex),
          isExactMatch = mcc.isExactMatchInBaseTree(mccIndex, treeIndex);
        basis.push({baseTreeNodeIndex, treeIndex, time, isExactMatch})
      }
      this.nodeReferences.push({
        refIndex: mccIndex,
        basis: basis
      });
    });
    // /* test that the tips are in the correct locations */
    // let messaged = false;
    // this.nodeReferences.forEach((ref, i)=>{
    //   if (isTip(mcc, i) && !messaged && i !== ref.refIndex) {
    //     console.warn(`tip ${ref.refIndex} is not at the expected location in the umbrella tree (it's at ${i}) instead. There may be more.`);
    //     messaged = true;
    //   }
    // });
    this.nodeCount = this.nodeReferences.length;
    this.rootIndex = newRootIndex;
    /*
    Assign parents.
    For each node we are keeping, traverse ancestors in the mcc until
    we find a match.
    */

    this.parents = Array(this.nodeCount).fill(-1);
    this.children = [];

    this.nodeReferences.forEach((nb, index)=>{
      this.children[index] = [];
      if (nb.refIndex !== rootIndex) {
        /*
        traverse the source tree to find the parent node.
        traverse upward until we find an inner node that
        is one of the nodes we are saving.
        */
        let mccIndex = mcc.getParentIndexOf(nb.refIndex);
        while (mccIndex !== UNSET && mccToUmbrella[mccIndex] === undefined) {
          mccIndex = mcc.getParentIndexOf(mccIndex);
        }
        if (mccIndex === UNSET || mccToUmbrella[mccIndex] === undefined) {
          console.debug('we have a false root', nb.refIndex, newRootIndex)
        }
        const parentIndex = mccToUmbrella[mccIndex];
        this.parents[index] = parentIndex;
      }
    });
    this.parents.forEach((parentIndex, index)=>{
      if (parentIndex >= 0) {
        this.children[parentIndex].push(index);
      }
    });

    // console.log(`root mcc ${rootIndex} umbrella ${this.rootIndex} parent ${this.parents[this.rootIndex]}`, this.nodeReferences[this.rootIndex]);
    this.times = this.nodeReferences.map((item)=>item.basis.map(nodeInfo=>nodeInfo.time).reduce((tot,t)=>tot+t) / item.basis.length);
    this.creds = Array(this.nodeCount).fill(0);
    this.setConfidence(mcc);
    console.log(`umbrella removes ${nodeCount - this.nodeCount} nodes`);
  }

  getRootIndex(): number {return this.rootIndex;}
  getSize(): number {return this.nodeCount; }
  getNumBaseTrees(): number { return this.treeCount;}
  getBaseTree(baseTreeIndex: number): PhyloTree { return this.basis.getBaseTree(baseTreeIndex);}
  getCorrespondingNodeInBaseTree(nodeIndex: number, baseNodeIndex: number): number {
    return this.nodeReferences[nodeIndex].basis[baseNodeIndex].baseTreeNodeIndex;
  }
  getParentIndexOf(nodeIndex: number): number {return this.parents[nodeIndex];}
  isExactMatchInBaseTree(nodeIndex: number, baseNodeIndex: number): boolean {
    return this.nodeReferences[nodeIndex].basis[baseNodeIndex].isExactMatch;
  }


  getNumChildrenOf(nodeIndex: number): number {
    return this.children[nodeIndex].length;
  }
  getTimeOf(nodeIndex: number): number {return this.times[nodeIndex]}
  getMrcaTimeOf(nodeIndex: number): number {
    throw new Error(`MccUmbrella.getMrcaTimeOf not implemented, called for nodeIndex ${nodeIndex}`);
    // return this.times[nodeIndex];
  }
  getLeftChildIndexOf(nodeIndex: number): number {return this.children[nodeIndex][0];}
  getRightChildIndexOf(nodeIndex: number): number {
    const desc = this.children[nodeIndex];
    return desc[desc.length - 1];
  }
  getChild(nodeIndex: number, childIndex: number) : number {
    return this.children[nodeIndex][childIndex];
  }
  getChildren(nodeIndex: number) : number[] {
    return this.children[nodeIndex].slice(0);
  }

  getConfidence() : number[] {
    return this.creds.slice();
  }


  setConfidence(mcc: SummaryTree): void {

    const tipCount = this.tipCount;
    const tipFingerprints = new BigInt64Array(tipCount);
    /* tips are the same in all trees, even there are a different number of nodes */
    for (let i = 0; i < tipCount; i++) {
      tipFingerprints[i] = randBigInt();
    }
    /*
    for each node in each base tree,
      set the key from the tips
    */
    const matchTallies: {[key: string]: number} = {};
    const phyloTreeNodeCount = mcc.getSize();
    const treeCount = this.getNumBaseTrees();
    for (let t = 0; t < treeCount; t++) {
      const tipTallies:TipList[] = [],
        tree = mcc.getBaseTree(t);
      /* initialize */
      for (let n = 0; n < phyloTreeNodeCount; n++) {
        tipTallies[n] = new TipList();
      }
      /*
      for each tip, traverse upwards to the root
      adding the key for each tip as we go
      */
      for (let i = 0; i < tipCount; i++) {
        let p = i;
        while (p !== UNSET) {
          tipTallies[p].add(i, tipFingerprints);
          p = tree.getParentIndexOf(p);
        }
      }
      /* add the keys for this tree to the tally for all trees */
      tipTallies.forEach(tt=>{
        const key = tt.getKey();
        if (matchTallies[key]) matchTallies[key]++;
        else matchTallies[key] = 1;
      });
    }
    /*
    for each node in the umbrella, find the key from the tips, set confidence
    */
    const nodeTallies: TipList[] = [];
    for (let i = 0; i < this.nodeCount; i++) {
      nodeTallies[i] = new TipList();
    }
    for (let i = 0; i < tipCount; i++) {
      let p = i;
      while (p !== UNSET) {
        nodeTallies[p].add(i, tipFingerprints);
        p = this.getParentIndexOf(p);
      }
    }
    /* set the credibility scores for each node */
    this.creds = Array(this.nodeCount).fill(0);
    for (let i = 0; i < this.nodeCount; i++) {
      const key = nodeTallies[i].getKey();
      this.creds[i] = (matchTallies[key] || 0) / treeCount;
    }

  }



}

