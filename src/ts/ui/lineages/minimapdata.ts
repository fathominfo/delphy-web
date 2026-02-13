import { SummaryTree } from "../../pythia/delphy_api";
import { UNSET } from "../common";
import { DisplayNode } from "./displaynode";

export class TreeNode {
  node: DisplayNode;
  parent: TreeNode | null = null;
  children: TreeNode[] = [];

  constructor(node: DisplayNode) {
    this.node = node;
  }

  addChild(node: TreeNode): void {
    this.children.push(node);
  }

}

export class MiniMapData {

  root: TreeNode;
  found: TreeNode[];


  constructor(nodes:DisplayNode[], tree:SummaryTree){
    if (nodes.length === 0) {
      throw new Error("can't build a tree out of nothing");
    }
    nodes.sort((a, b)=>a.generationsFromRoot - b.generationsFromRoot);
    this.found = [];
    this.root = new TreeNode(nodes.shift() as DisplayNode);
    this.found[this.root.node.index] = this.root;
    nodes.forEach(n=>{
      let parent = n.index;
      while (this.found[parent] === undefined && parent !== UNSET) {
        parent = tree.getParentIndexOf(parent);
      }
      if (parent === UNSET) {
        throw new Error("couldn't find an ancestral node. maybe the assumption that sorting by `generationsFromRoot` is a bad one?");
      }
      const parentNode = this.found[parent];
      const tn = new TreeNode(n);
      tn.parent = parentNode;
      parentNode.addChild(tn);
      this.found[n.index] = tn;
    });
  }

}

