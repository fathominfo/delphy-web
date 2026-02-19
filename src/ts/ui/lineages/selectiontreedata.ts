import { SummaryTree } from "../../pythia/delphy_api";
import { UNSET } from "../common";
import { DisplayNode } from "./displaynode";
import { getMRCA, getYFunction } from "./lineagescommon";


export type MRCANodeCreator = (nodeIndex: number  )=>DisplayNode;


export class TreeNode {
  node: DisplayNode;
  parent: TreeNode | null = null;
  children: TreeNode[] = [];
  stepsFromRoot = 0;
  tipPlacement = 0;

  constructor(node: DisplayNode) {
    this.node = node;
  }

  addChild(node: TreeNode): void {
    this.children.push(node);
    node.parent = this;
  }

  removeChild(node: TreeNode): void {
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
  }

}

export class SelectionTreeData {

  root: TreeNode | null = null;
  found: TreeNode[] = [];
  tree: SummaryTree;
  nodeChildCount: number[];
  mrcaMaker: MRCANodeCreator;
  getY: getYFunction;

  constructor(tree:SummaryTree, nodeChildCount: number[],
    mrcaMaker: MRCANodeCreator, getY: getYFunction) {
    this.tree = tree;
    this.nodeChildCount = nodeChildCount;
    this.mrcaMaker = mrcaMaker;
    this.getY = getY;
  }

  setData(nodes:DisplayNode[]) {
    if (nodes.length === 0) {
      throw new Error("can't build a tree out of nothing");
    }
    const { tree, nodeChildCount, mrcaMaker } = this;
    let maxSteps = 0;
    /*
    process the nodes closer to root first,
    so that ancestor nodes are created before their descendants.
    */

    nodes.sort((a: DisplayNode, b: DisplayNode)=>a.generationsFromRoot - b.generationsFromRoot);
    this.found = [];
    this.root = new TreeNode(nodes.shift() as DisplayNode);
    this.found[this.root.node.index] = this.root;

    nodes.forEach(n=>{
      let ancestor = n.index;
      const tn = new TreeNode(n);
      /* find the parent nodes among all the current nodes */
      while (this.found[ancestor] === undefined && ancestor !== UNSET) {
        ancestor = tree.getParentIndexOf(ancestor);
      }
      if (ancestor === UNSET) {
        throw new Error("couldn't find an ancestral node. maybe the assumption that sorting by `generationsFromRoot` is a bad one?");
      }
      const ancestorTreeNode = this.found[ancestor];
      if (ancestorTreeNode.children.length === 0) {
        ancestorTreeNode.addChild(tn);
      } else {
        /*
        if the ancestor already has a child, there may
        be an MRCA for the nodes that is not this particular
        ancestor
        */
        const mrcas: [TreeNode, number][] = ancestorTreeNode.children.map(other=>{
          const mrcaIndex = getMRCA(n.index, other.node.index, tree, nodeChildCount);
          return [other, mrcaIndex];
        });
        let assigned = false;
        mrcas.forEach(([other, mrcaIndex])=>{
          if (mrcaIndex !== ancestor) {
            /*
            create a TreeNode for the MRCA
            and update the relationships
            */
            const mrca: DisplayNode = mrcaMaker(mrcaIndex);
            const mrcaTreeNode = new TreeNode(mrca);
            ancestorTreeNode.removeChild(other);
            ancestorTreeNode.addChild(mrcaTreeNode);
            mrcaTreeNode.addChild(other);
            mrcaTreeNode.addChild(tn);
            mrca.setMRCAName(this.getMRCAName(mrcaTreeNode));
            if (mrca.mrcaName.indexOf("MRCA") > 4) {
              console.log("let's try this again");
              this.getMRCAName(mrcaTreeNode)
            }
            this.found[mrcaIndex] = mrcaTreeNode;
            assigned = true;
          }
        });
        if (!assigned) {
          ancestorTreeNode.addChild(tn);
        }
        /* reset the name of the original parent to include all nodes */
        if (!ancestorTreeNode.node.isRoot) {
          const mrcaName = this.getMRCAName(ancestorTreeNode);
          ancestorTreeNode.node.setMRCAName(mrcaName);
          if (ancestorTreeNode.node.mrcaName.indexOf("MRCA") > 4) {
            console.log("let's try this again");
            this.getMRCAName(ancestorTreeNode);
          }
        }
      }
      this.found[n.index] = tn;
    });


    const tips: TreeNode[] = [];
    this.found.forEach((treeNode: TreeNode)=>{
      if (treeNode.children.length === 0) {
        tips.push(treeNode);
      } else if (treeNode.children.length > 2) {
        console.warn(`the schematic tree building is not binary`, treeNode);
      }
    });
    tips.sort((a, b)=>this.getY(a.node.index) - this.getY(b.node.index));
    const numTips = tips.length;
    const midTips = numTips / 2;
    tips.forEach((tn, i)=>{
      tn.tipPlacement = i - midTips;
    });

    const q: TreeNode[] = [this.root];
    /*
    build a queue starting with root,
    followed by the children of each generation
    */
    let i = 0;
    while (i < q.length) {
      const tn = q[i];
      if (!tn.parent) {
        tn.stepsFromRoot = 0;
      } else {
        tn.stepsFromRoot = tn.parent.stepsFromRoot + 1;
      }
      tn.children.forEach(c=>q.push(c));
      maxSteps = Math.max(maxSteps, tn.stepsFromRoot);
      i++;
    }
    while (q.length > 0) {
      const tn = q.pop() as TreeNode;
      const childCount = tn.children.length;
      /*
      given the way the queue is built up, each child will
      have had its `tipPlacement` set.
       */
      if (childCount > 0) {
        tn.children.sort((a, b)=>a.tipPlacement - b.tipPlacement);
        const total = tn.children.reduce((tot, child)=>tot + child.tipPlacement, 0);
        tn.tipPlacement = total / childCount;
      } else if (tn.parent === null) {
        tn.tipPlacement = 0;
      }
    }

    // console.log('selection tree data ready');
    // this.found.forEach(tn=>console.log(`   ${tn.node.index} ${tn.node.name} ${tn.xPos} ${tn.yPos} ${tn.stepsFromRoot} `));




  }


  collectDescendantSelections(tn: TreeNode, tips: string[]): void{
    if (tn.node.isInferred) {
      tn.children.forEach(c=>this.collectDescendantSelections(c, tips));
    } else {
      tips.push(tn.node.label);
    }
  }



  getMRCAName(tnd: TreeNode): string {
    const tips: string[] = [];
    this.collectDescendantSelections(tnd, tips);
    tips.sort();
    const mrcaName = `MRCA of ${tips.join(',')}`;
    return mrcaName;
  }


  getRoot() : TreeNode {
    if (this.root === null) {
      throw new Error("can't access root tree node before setting data");
    }
    return this.root;
  }

}

