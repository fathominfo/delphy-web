import { RANGE_CALLBACK_TYPE, UNSET } from "../common";
import { DisplayNode } from "./displaynode";
import { HoverCallback, NodePair, NodeRelationType, ToggleCallback } from "./lineagescommon";
import { TreeNode } from "./selectiontreedata";


const CONTROLS = document.querySelector("#lineages #lineages--schematic-controls") as HTMLDivElement;
const PREVALENCE_THRESHOLD_INPUT = CONTROLS.querySelector("#lineages--peak-prevalence input") as HTMLInputElement;
const GEO_INTRODUCTIONS_INPUT = CONTROLS.querySelector("#lineages--geo-introductions input") as HTMLInputElement;
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

const MIN_NODE_X_SPACING = 22;
const MAX_NODE_X_SPACING = 45;
const MIN_NODE_Y_SPACING = 22;
const MAX_NODE_Y_SPACING = 40;

const TEXT_LABEL_HEIGHT = 20;
const TEXT_LABEL_MIN_WIDTH = 20;
const TEXT_PADDING = 5;


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
  textLabelWidth: number = TEXT_LABEL_MIN_WIDTH;
  textLabelHeight: number = TEXT_LABEL_HEIGHT;

  constructor(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null,
    nodeHighlightCallback: HoverCallback
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

    const labelBackground = this.nameLabel.querySelector("rect") as SVGRectElement;
    labelBackground.addEventListener("pointerenter", ()=>nodeHighlightCallback(this.node.index, UNSET, null));
    labelBackground.addEventListener("pointerleave", ()=>nodeHighlightCallback(UNSET, UNSET, null));
  }

  position(_width: number, height: number, xSpacing: number, ySpacing: number) {
    this.xPos = MARGIN.left + this.stepsFromRoot * xSpacing;
    this.yPos = MARGIN.top + this.tipPlacement * ySpacing + height / 2;
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
      let xEnd = parent.xPos - this.xPos;
      const xStart = - this.textLabelWidth / 2;
      let yEnd = parent.yPos - this.yPos;
      if (yEnd > 0) yEnd -= parent.textLabelHeight / 2;
      else if (yEnd < 0) yEnd += parent.textLabelHeight / 2;
      else xEnd += parent.textLabelWidth / 2;
      const d = `M${ xStart } 0 L${ xEnd } 0 ${ xEnd } ${ yEnd }`;
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

    const label = mrca ? "" : node.label;
    textNode.textContent = label;
    nameLabel.classList.add(node.className);
    CONTAINER.appendChild(this.nameLabel);
    if (mrca) {
      this.textLabelWidth = 0;
      this.textLabelHeight = 0;
    } else {
      const tw = textNode.getComputedTextLength();
      this.textLabelWidth = Math.max(TEXT_LABEL_MIN_WIDTH, tw + TEXT_PADDING * 2);
      this.textLabelHeight = TEXT_LABEL_HEIGHT;
    }
    rect.setAttribute("width", `${ this.textLabelWidth}`);
    rect.setAttribute("x", `${ -(this.textLabelWidth) / 2}`);
    // if (!this.node.isRoot) {
    //   mutTextNode.textContent = `${this.mutationCount}`;
    //   CONTAINER.appendChild(this.mutLabel);
    //   this.mutLabel.classList.add(node.className);
    //   tw = mutTextNode.getComputedTextLength();
    //   mutRect.setAttribute("width", `${ tw + 10}`);
    //   mutRect.setAttribute("x", `${ -45 - (tw + 10) / 2}`);
    // }

  }

  pushBack(pushIt: boolean) : void {
    this.nameLabel.classList.toggle("back", pushIt);
    this.connector.classList.toggle("back", pushIt);
  }

}


/*
this draws a simple schematic to show the relations
between nodes in the tree. The current intent is that
there is only one of these.
*/
export class NodeSchematic {
  hasMRCA: boolean;
  highlightIndex: number = UNSET;
  nodeHighlightCallback: HoverCallback;
  rootNode: TreeNodeDisplay | null = null;
  nodes: TreeNodeDisplay[] = [];
  tipCount = 0;
  stepCount = 0;
  width: number = UNSET;
  height: number = UNSET;
  xSpacing = MAX_NODE_X_SPACING;
  ySpacing = MAX_NODE_Y_SPACING;
  maxGenerations = UNSET;
  tipRange = UNSET;
  rootPositon = UNSET;


  constructor(nodeHighlightCallback: HoverCallback,
    prevThresholdCallback: RANGE_CALLBACK_TYPE,
    geoIntroCallback: ToggleCallback) {
    this.hasMRCA = false;
    this.nodeHighlightCallback = nodeHighlightCallback;
    PREVALENCE_THRESHOLD_INPUT.addEventListener("input", ()=>{
      prevThresholdCallback(parseFloat(PREVALENCE_THRESHOLD_INPUT.value));
    });
    GEO_INTRODUCTIONS_INPUT.addEventListener("input", ()=>{
      geoIntroCallback(GEO_INTRODUCTIONS_INPUT.checked);
    });
  }


  resize() {
    const { offsetWidth, offsetHeight } = WRAPPER;
    this.width = offsetWidth;
    /*
    The wrapper div is 3 px taller than the svg.
    Not sure why. [mark 260409]
    */
    this.height = offsetHeight - 3;
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
    const { width, height, xSpacing, ySpacing } = this;
    // console.log('render minimap', width, height, this.stepCount, this.tipCount);
    CONTAINER.innerHTML = '';
    this.setSpacing();
    this.nodes.forEach(display=>display.position(width, height, xSpacing, ySpacing));
    this.nodes.forEach(display=>display.renderLabel());
    this.nodes.forEach(display=>display.renderConnector());
  }

  setSpacing() {
    const { width, height, maxGenerations, tipRange } = this;
    let xSpacing = (width - 40 - 10) / maxGenerations;
    let ySpacing = (height - 20) / tipRange * 0.6;
    xSpacing = Math.max(Math.min(xSpacing, MAX_NODE_X_SPACING), MIN_NODE_X_SPACING);
    ySpacing = Math.max(Math.min(ySpacing, MAX_NODE_Y_SPACING), MIN_NODE_Y_SPACING);
    this.xSpacing = xSpacing;
    this.ySpacing = ySpacing;
  }


  setHighlightNode() {
    if (this.highlightIndex === UNSET) {
      this.nodes.forEach(display=>display.pushBack(false));
    } else {
      this.nodes.forEach(display=>display.pushBack(display.node.index !== this.highlightIndex));
    }
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
    let maxTipPlacement = Number.MIN_SAFE_INTEGER;
    let minTipPlacement = Number.MAX_SAFE_INTEGER;
    this.maxGenerations = 0;
    if (rootNode) {
      const q = [rootNode];
      while (q.length > 0) {
        const treeNode = q.shift() as TreeNode;
        const node = treeNode.node;
        this.maxGenerations = Math.max(this.maxGenerations, treeNode.stepsFromRoot);
        if (Number.isFinite(treeNode.tipPlacement)) {
          maxTipPlacement = Math.max(maxTipPlacement, treeNode.tipPlacement);
          minTipPlacement = Math.min(minTipPlacement, treeNode.tipPlacement);
        }
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
        const tnd: TreeNodeDisplay = new TreeNodeDisplay(treeNode,
          mutationCount, relationType, parent, this.nodeHighlightCallback);
        this.nodes.push(tnd);
        lookup[node.index] = tnd;
      }
      this.tipRange = maxTipPlacement - minTipPlacement;
      this.rootPositon = maxTipPlacement / this.tipRange;
      this.setSpacing();
    }
  }


  highlightNode(node: DisplayNode) : void {
    if (node.index !== this.highlightIndex) {
      this.highlightIndex = node.index;
      requestAnimationFrame(()=>this.setHighlightNode());
    }
  }


}