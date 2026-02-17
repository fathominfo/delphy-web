import { getMutationName, NUC_LOOKUP } from "../../constants";
import { Mutation } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";

import { nfc, UNSET } from "../common";
import { DisplayNode } from "./displaynode";
import { MATCH_CLASS, NO_MATCH_CLASS, HoverCallback, mutationPrevalenceThreshold, NodePair } from "./lineagescommon";
import { TreeNode } from "./minimapdata";


const MUTATION_LIMIT = 30;

const MUTATION_TEMPLATE = document.querySelector("#subway .station") as HTMLDivElement;
MUTATION_TEMPLATE?.remove();

type MATCH_HANDLER_TYPE = (node: DisplayNode | null, mutation: Mutation | null)=>void;

class Track {
  startNode: DisplayNode | null = null
  endNode: DisplayNode | null = null;
  line: HTMLDivElement;
  terminus: HTMLDivElement;
  signage: HTMLSpanElement;
  mutationCount: number = UNSET;
  label = "";
  mutationList: MutationDistribution[] = [];
  mutationDivs: HTMLDivElement[] = [];


  constructor(line: HTMLElement | null, matchHandler: MATCH_HANDLER_TYPE) {
    this.line = line as HTMLDivElement;
    this.terminus = this.line.querySelector(".terminus.exit") as HTMLDivElement;
    this.signage = this.line.querySelector(".transit .signage .count") as HTMLSpanElement;
    const stations = this.line.querySelector(".stations") as HTMLDivElement;
    for (let i = 0; i < MUTATION_LIMIT; i++) {
      const mutDiv = MUTATION_TEMPLATE.cloneNode(true) as HTMLDivElement;
      this.mutationDivs.push(mutDiv);
      stations.appendChild(mutDiv);
      mutDiv.addEventListener("pointerenter", ()=>{
        const mut = this.mutationList[i]?.mutation;
        if (mut) {
          matchHandler(this.endNode, mut);
        } else {
          matchHandler(this.endNode, null);}
      });
      // mutDiv.addEventListener("pointerleave", ()=>matchHandler(UNSET, null));
    }
    this.line.addEventListener("pointerleave", ()=>{
      console.log('leaving line')
      matchHandler(null, null)
    });
  }

  set(startNode:DisplayNode, endNode:DisplayNode, mutations:MutationDistribution[]) {
    this.startNode = startNode;
    this.endNode = endNode;
    // this.label = endNode === null ? '' : NODE_LABELS[endNode].toUpperCase();
    this.mutationList = mutations;
    this.mutationCount = mutations.length;
  }

  render() {
    this.line.classList.remove(MATCH_CLASS);
    this.line.classList.remove(NO_MATCH_CLASS);
    // this.line.setAttribute("data-from", NODE_LABELS[this.startNode]);
    // this.line.setAttribute("data-to", NODE_LABELS[this.endNode]);
    this.terminus.textContent = this.label;
    this.signage.textContent = nfc(this.mutationCount);
    if (this.mutationCount > MUTATION_LIMIT) {
      this.mutationDivs.forEach(div=>div.classList.add("hidden"));
    } else {
      for (let i = 0; i < MUTATION_LIMIT; i++) {
        const mutDiv = this.mutationDivs[i];
        const mut = this.mutationList[i]?.mutation;
        if (mut) {
          (mutDiv.querySelector(".transfer.from") as HTMLSpanElement).textContent = NUC_LOOKUP[mut.from];
          (mutDiv.querySelector(".train") as HTMLSpanElement).textContent = `${mut.site}`;
          (mutDiv.querySelector(".transfer.to") as HTMLSpanElement).textContent = NUC_LOOKUP[mut.to];
          mutDiv.classList.remove("hidden");
          mutDiv.classList.remove(MATCH_CLASS);
          mutDiv.classList.remove(NO_MATCH_CLASS);
        } else {
          mutDiv.classList.add("hidden");
        }
      }
    }
  }

  handleMatch(node: DisplayNode,mutation:Mutation | null) {
    if (mutation === null) {
      this.line.classList.remove(MATCH_CLASS);
      this.line.classList.remove(NO_MATCH_CLASS);
    } else {
      const mutationName = getMutationName(mutation);
      let anyMatches = false;
      this.mutationList.forEach((mut:MutationDistribution, i)=>{
        const name = getMutationName(mut.mutation);
        if (name === mutationName) {
          anyMatches = true;
          this.mutationDivs[i].classList.add(MATCH_CLASS);
          this.mutationDivs[i].classList.remove(NO_MATCH_CLASS);
        } else {
          this.mutationDivs[i].classList.remove(MATCH_CLASS);
          this.mutationDivs[i].classList.add(NO_MATCH_CLASS);
        }
      });
      if (anyMatches) {
        this.line.classList.add(MATCH_CLASS);
        this.line.classList.remove(NO_MATCH_CLASS);
      } else {
        this.line.classList.remove(MATCH_CLASS);
        this.line.classList.add(NO_MATCH_CLASS);
      }
    }

  }

}


class TreeNodeDisplay extends TreeNode {
  upstreamMutations: Mutation[];

  constructor(node: DisplayNode, src: TreeNode,
    upstreamMutations: Mutation[]) {
    super(node);
    this.parent = src.parent;
    this.children = src.children;
    this.upstreamMutations = upstreamMutations;
  }

}


/*
this draws a simple schematic to show the relations
between nodes in the tree. The current intent is that
there is only one of these.
*/
export class NodeSchematic {
  hasMRCA: boolean;
  highlightedNode: DisplayNode | null;
  highlightedMutation: Mutation | null;
  nodeHighlightCallback: HoverCallback;
  rootNode: TreeNodeDisplay | null = null;
  div: HTMLDivElement;
  nodes: TreeNodeDisplay[] = [];
  tipCount = 0;
  stepCount = 0;


  constructor(nodeHighlightCallback: HoverCallback) {
    this.hasMRCA = false;
    this.highlightedNode = null;
    this.highlightedMutation = null;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.div = document.querySelector("#subway") as HTMLDivElement;
  }


  handleMutationMatch(node: DisplayNode | null, mutation: Mutation | null) {
    //
  }

  requestRender() {
    requestAnimationFrame(()=>this.render());
  }


  render() {
    //
  }

  /*
  @param src: contains data for each track that we will display.
  @param indexes: the node index in the MCC for root, mrca, nodeA, and nodeB. Each can be `UNSET`.
  @param nodeAIsUpper: when both nodeA and nodeB are set, indicates whether the display of
    node A should be the upper track or the lower track
  */
  setData(pairs: NodePair[], rootNode: TreeNode | null) {
    // console.debug(src.map(ncd=>`${NodePairType[ncd.nodePair.pairType]} ${ncd.nodePair.mutations.length} mutations, nodeAIsUpper ? ${nodeAIsUpper}`));

    const mutations: MutationDistribution[][] = [];
    pairs.forEach(pair=>{
      // index the mutations by the descendent
      mutations[pair.descendant.index] = pair.mutations;
    });
    this.tipCount = 0;
    this.stepCount = 0;
    this.nodes.length = 0;
    if (rootNode) {
      const q = [rootNode];
      while (q.length > 0) {
        const treeNode = q.shift() as TreeNode;
        treeNode.children.forEach(tn=>q.push(tn));
        let muts: Mutation[] = [];
        if (mutations[treeNode.node.index]) {
          muts = mutations[treeNode.node.index].map(md=>md.mutation);
        }
        const tnd: TreeNodeDisplay = new TreeNodeDisplay(treeNode.node, treeNode, muts);
        this.nodes.push(tnd);
      }
    }
    console.log(this.stepCount, this.tipCount, this.nodes)

  }


  highlightNode(node: DisplayNode, mutation: Mutation|null) : void {
    if (node.index !== this.highlightedNode?.index || mutation !== this.highlightedMutation) {
      this.highlightedNode = node;
      this.highlightedMutation = mutation;
      this.handleMutationMatch(node, mutation);
    }
  }


}