import { moduleRunnerTransform } from "vite";
import { SummaryTree } from "../../pythia/delphy_api";
import { UNSET } from "../common";
import { DisplayNode } from "./displaynode";
import { getMRCA } from "./lineagescommon";


export type MRCANodeCreator = (nodeIndex: number  )=>DisplayNode;


export class TreeNode {
  node: DisplayNode;
  parent: TreeNode | null = null;
  children: TreeNode[] = [];

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

export class MiniMapData {

  root: TreeNode | null = null;
  found: TreeNode[] = [];
  tree: SummaryTree;
  nodeChildCount: number[];
  mrcaMaker: MRCANodeCreator;

  constructor(tree:SummaryTree, nodeChildCount: number[], mrcaMaker: MRCANodeCreator) {
    this.tree = tree;
    this.nodeChildCount = nodeChildCount;
    this.mrcaMaker = mrcaMaker;
  }

  setData(nodes:DisplayNode[]) {
    if (nodes.length === 0) {
      throw new Error("can't build a tree out of nothing");
    }
    const { tree, nodeChildCount, mrcaMaker } = this;
    const sortByGenerations = (a: DisplayNode, b: DisplayNode)=>a.generationsFromRoot - b.generationsFromRoot;
    const collectTips = (tn: TreeNode, tips: string[])=>{
      if (tn.node.isInferred) {
        tn.children.forEach(c=>collectTips(c, tips));
      } else {
        tips.push(tn.node.name);
      }
    };
    nodes.sort(sortByGenerations);
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
      let ancestorTreeNode = this.found[ancestor];
      /*
      if the ancestor already has a child, there may
      be an MRCA for the nodes that is not this particular
      ancestor
      */
      if (ancestorTreeNode.children.length > 0) {
        const other: TreeNode = ancestorTreeNode.children[0];
        const mrcaIndex: number = getMRCA(n.index, other.node.index, tree, nodeChildCount);
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
          collectTips(mrcaTreeNode, tips);
          tips.sort();
          mrca.name = `MRCA of ${tips.join(',')}`;
          this.found[mrcaIndex] = mrcaTreeNode;
          console.log(mrca.name);
          ancestorTreeNode = mrcaTreeNode;
        }
      }
      ancestorTreeNode.addChild(tn);
      this.found[n.index] = tn;
    });
  }


  getRoot() : TreeNode {
    if (this.root === null) {
      throw new Error("can't access root tree node before setting data");
    }
    return this.root;
  }

}

