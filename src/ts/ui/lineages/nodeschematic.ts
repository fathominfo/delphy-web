import { nfc, UNSET } from "../common";
import { DisplayNode } from "./displaynode";
import { MATCH_CLASS, NO_MATCH_CLASS, HoverCallback, mutationPrevalenceThreshold, NodePair, NodeRelationType } from "./lineagescommon";
import { TreeNode } from "./selectiontreedata";



const WRAPPER = document.querySelector("#subway") as HTMLDivElement;
const CONTAINER = WRAPPER.querySelector("svg") as SVGElement;
const LABEL_TEMPLATE = CONTAINER.querySelector(".label") as SVGGElement;
const MUTATION_COUNT_TEMPLATE = CONTAINER.querySelector(".mut-count") as SVGGElement;
const CONNECTOR_TEMPLATE = CONTAINER.querySelector(".connector") as SVGLineElement;

[LABEL_TEMPLATE, MUTATION_COUNT_TEMPLATE, CONNECTOR_TEMPLATE].forEach(el=>el.remove());

const MARGIN  = {
  top: 10,
  bottom: 10,
  left: 40,
  right: 10
}

const MAX_TIP_DISTANCE = 40;
const NODE_X_SPACING = 45;


class TreeNodeDisplay {
  node: DisplayNode;
  xPos: number = UNSET;
  yPos: number = UNSET;
  parent: TreeNodeDisplay | null = null;
  stepsFromRoot: number;
  tipPlacement: number;
  mutationCount: number;
  relation: NodeRelationType | typeof UNSET;
  nameLabel: SVGGElement;
  mutLabel: SVGGElement;
  connector: SVGPathElement;

  constructor(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null
  ) {
    this.node = src.node;
    this.tipPlacement = src.tipPlacement;
    this.stepsFromRoot = src.stepsFromRoot;
    this.mutationCount = mutCount;
    this.relation = relation;
    this.nameLabel = LABEL_TEMPLATE.cloneNode(true) as SVGGElement;
    this.mutLabel = MUTATION_COUNT_TEMPLATE.cloneNode(true) as SVGGElement;
    this.parent = parent;
    this.connector = CONNECTOR_TEMPLATE.cloneNode(true) as SVGPathElement;
  }

  position(_width: number, height: number) {
    this.xPos = MARGIN.left + this.stepsFromRoot * NODE_X_SPACING;
    this.yPos = MARGIN.top + this.tipPlacement * MAX_TIP_DISTANCE + height / 2;
    const elements = [this.nameLabel];
    if (!this.node.isRoot) {
      elements.push(this.mutLabel);
      elements.push(this.connector);
    }
    elements.forEach(el=>{
      el.setAttribute("transform", `translate(${ this.xPos }, ${ this.yPos })`)
    });
  }

  renderConnector() {
    if (this.parent !== null) {
      const parent = this.parent;
      const xDiff = parent.xPos - this.xPos;
      const yDiff = parent.yPos - this.yPos;
      const d = `M0 0 L${ xDiff } 0 ${ xDiff } ${ yDiff }`;
      this.connector.setAttribute("d", d);

      CONTAINER.appendChild(this.connector);
      this.connector.classList.add(this.node.className);
    }
  }

  renderLabel() {
    const { node, nameLabel } = this;
    const mrca = node.isInferred && !node.isRoot;
    const textNode = nameLabel.querySelector("text") as SVGTextElement;
    const rect = nameLabel.querySelector("rect") as SVGRectElement;
    // const mutTextNode = this.mutLabel.querySelector("text") as SVGTextElement;
    // const mutRect = this.mutLabel.querySelector("rect") as SVGRectElement;

    const label = mrca ? "M" : node.label;
    textNode.textContent = label;
    nameLabel.classList.add(node.className);
    CONTAINER.appendChild(this.nameLabel);
    const tw = textNode.getComputedTextLength();
    rect.setAttribute("width", `${ tw + 10}`);
    rect.setAttribute("x", `${ -(tw + 10) / 2}`);
    // if (!this.node.isRoot) {
    //   mutTextNode.textContent = `${this.mutationCount}`;
    //   CONTAINER.appendChild(this.mutLabel);
    //   this.mutLabel.classList.add(node.className);
    //   tw = mutTextNode.getComputedTextLength();
    //   mutRect.setAttribute("width", `${ tw + 10}`);
    //   mutRect.setAttribute("x", `${ -45 - (tw + 10) / 2}`);
    // }

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
  nodeHighlightCallback: HoverCallback;
  rootNode: TreeNodeDisplay | null = null;
  nodes: TreeNodeDisplay[] = [];
  tipCount = 0;
  stepCount = 0;
  width: number = UNSET;
  height: number = UNSET;


  constructor(nodeHighlightCallback: HoverCallback) {
    this.hasMRCA = false;
    this.highlightedNode = null;
    this.nodeHighlightCallback = nodeHighlightCallback;
  }


  resize() {
    const { offsetWidth, offsetHeight } = WRAPPER;
    this.width = offsetWidth;
    this.height = offsetHeight;
    requestAnimationFrame(()=>{
      CONTAINER.setAttribute("viewBox", `0 0 ${ this.width} ${ this.height}`);
      CONTAINER.setAttribute("width", `${ this.width}`);
      CONTAINER.setAttribute("height", `${ this.height}`);
      this.requestRender();
    });
  }


  requestRender() {
    requestAnimationFrame(()=>this.render());
  }


  render() {
    const { width, height } = this;
    console.log('render minimap', width, height, this.stepCount, this.tipCount);
    CONTAINER.innerHTML = '';
    this.nodes.forEach(display=>display.position(width, height));
    this.nodes.forEach(display=>display.renderConnector());
    this.nodes.forEach(display=>display.renderLabel());
  }

  /*
  @param pairs: contains mutation data for each track that we will display.
  @param rootNode: the root node of the tree we will display.
    We can traverse the entire tree by traversing the children of each node.
  */
  setData(pairs: NodePair[], rootNode: TreeNode | null) {
    // console.debug(src.map(ncd=>`${NodePairType[ncd.nodePair.pairType]} ${ncd.nodePair.mutations.length} mutations, nodeAIsUpper ? ${nodeAIsUpper}`));

    const pairsByDescendant: NodePair[] = [];
    pairs.forEach(pair=>{
      // index the mutations by the descendent
      pairsByDescendant[pair.descendant.index] = pair;
    });
    const lookup: TreeNodeDisplay[] = [];
    this.tipCount = 0;
    this.stepCount = 0;
    this.nodes.length = 0;
    if (rootNode) {
      const q = [rootNode];
      while (q.length > 0) {
        const treeNode = q.shift() as TreeNode;
        const node = treeNode.node;
        treeNode.children.forEach(tn=>q.push(tn));
        const pair = pairsByDescendant[node.index];
        let mutationCount = 0;
        let relationType: NodeRelationType | typeof UNSET = UNSET;
        if (pair) {// no pair for root
          mutationCount = pair.mutations.length;
          relationType = pair.relation;
        }
        let parent = null;
        if (treeNode.parent) {
          parent = lookup[treeNode.parent.node.index];
        }
        const tnd: TreeNodeDisplay = new TreeNodeDisplay(treeNode, mutationCount, relationType, parent);
        this.nodes.push(tnd);
        lookup[node.index] = tnd;
      }
    }
  }


  highlightNode(node: DisplayNode) : void {
    if (node.index !== this.highlightedNode?.index) {
      this.highlightedNode = node;
    }
  }


}