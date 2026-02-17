import { moduleRunnerTransform } from "vite";
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
  /* 0 - 1 */
  xPos = 0;
  /* 0 - 1 */
  yPos = 0;

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
    // const sortByGenerations = (a: TreeNode, b: TreeNode)=>a.node.generationsFromRoot - b.node.generationsFromRoot;
    const collectDescendantSelections = (tn: TreeNode, tips: string[])=>{
      if (tn.node.isInferred) {
        tn.children.forEach(c=>collectDescendantSelections(c, tips));
      } else {
        tips.push(tn.node.name);
      }
    };
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
      if (ancestorTreeNode.children.length == 0) {
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
            const tips: string[] = [n.name];
            collectDescendantSelections(mrcaTreeNode, tips);
            tips.sort();
            mrca.name = `MRCA of ${tips.join(',')}`;
            this.found[mrcaIndex] = mrcaTreeNode;
            // console.log(mrca.name);
            mrcaTreeNode.addChild(tn);
          }
        });
        /* reset the name of the original parent to include all nodes */
        const ogAncestor = this.found[ancestor];
        if (!ogAncestor.node.isRoot) {
          const tips: string[] = [];
          collectDescendantSelections(ogAncestor, tips);
          tips.sort();
          ogAncestor.node.name = `MRCA of ${tips.join(',')}`;
          // console.log(ogAncestor.node.name);
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
    tips.forEach((tn, i)=>{
      tn.yPos = i / (numTips - 1.0);
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
      tn.xPos = tn.stepsFromRoot / (maxSteps - 1);
      /*
      given the way the queue is built up, each child will
      have had its `yPos` set.
       */
      if (childCount > 0) {
        tn.children.sort((a, b)=>a.yPos - b.yPos);
        const total = tn.children.reduce((tot, child)=>tot + child.yPos, 0);
        tn.yPos = total / childCount;
      }
    }



  }


  getRoot() : TreeNode {
    if (this.root === null) {
      throw new Error("can't access root tree node before setting data");
    }
    return this.root;
  }

}

