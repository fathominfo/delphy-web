import { PREVALENCE_CALLBACK_TYPE, UNSET } from "../common";
import { DisplayNode } from "./displaynode";
import { HoverCallback, MetadataToggleCallback, NodeCallback, NodePair, NodeRelationType } from "./lineagescommon";
import { TreeNode } from "./selectiontreedata";


const CONTROLS = document.querySelector("#lineages #lineages--schematic-controls") as HTMLDivElement;
const PREVALENCE_THRESHOLD_TOGGLE = CONTROLS.querySelector("#lineages--peak-prevalence-toggle input") as HTMLInputElement;
const PREVALENCE_THRESHOLD_SLIDER = CONTROLS.querySelector("#lineages--peak-prevalence-selector") as HTMLInputElement;
const PREVALENCE_THRESHOLD_READOUT = CONTROLS.querySelector("#lineages--peak-prevalence--readout") as HTMLSpanElement
const METADATA_TRANSITION_TEMPLATE = CONTROLS.querySelector(".lineages--metadata-transitions") as HTMLDivElement;
const METADATA_PARENT = METADATA_TRANSITION_TEMPLATE.parentNode as HTMLDivElement;
METADATA_TRANSITION_TEMPLATE.remove();
const WRAPPER = document.querySelector("#subway") as HTMLDivElement;
const CONTAINER = WRAPPER.querySelector("svg") as SVGElement;
const LABEL_TEMPLATE = CONTAINER.querySelector(".label") as SVGGElement;
const MUTATION_COUNT_TEMPLATE = CONTAINER.querySelector(".mut-count") as SVGGElement;
const CONNECTOR_TEMPLATE = CONTAINER.querySelector(".connector") as SVGLineElement;
const CAR_CONTROLS = CONTAINER.querySelector("#subway--car-actions") as HTMLDivElement;
const CAR_CONTROLS_RECT = CAR_CONTROLS.querySelector("#subway--car-action-container") as SVGRectElement;
const CAR_CONTROLS_DISMISS  = CAR_CONTROLS.querySelector("#subway--car-dismiss--fo") as SVGElement;
const CAR_CONTROLS_EXPAND = CAR_CONTROLS.querySelector("#subway--car-expansion--fo") as SVGElement;
const CAR_CONTROLS_EXPAND_INPUT = CAR_CONTROLS_EXPAND.querySelector("input") as HTMLInputElement;
CAR_CONTROLS.remove();


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
  srcTipPlacement: number;
  xPos: number = UNSET;
  yPos: number = UNSET;
  parent: TreeNodeDisplay | null = null;
  children: TreeNodeDisplay[] = [];
  stepsFromRoot: number;
  tipPlacement: number;
  mutationCount: number;
  relation: NodeRelationType | typeof UNSET;
  nameLabel: SVGGElement;
  mutLabel: SVGGElement;
  connector: SVGPathElement;
  textLabelWidth: number = TEXT_LABEL_MIN_WIDTH;
  textLabelHeight: number = TEXT_LABEL_HEIGHT;
  isCollapsed = false;
  isTip = false;

  constructor(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null,
    nodeHighlightCallback: HoverCallback
  ) {
    this.node = src.node;
    /* track the positioning of the node in the MCC tree */
    this.srcTipPlacement = src.tipPlacement;
    /* this will be the placement in this display */
    this.tipPlacement = UNSET;
    this.stepsFromRoot = src.stepsFromRoot;
    this.mutationCount = mutCount;
    this.relation = relation;
    this.nameLabel = LABEL_TEMPLATE.cloneNode(true) as SVGGElement;
    this.mutLabel = MUTATION_COUNT_TEMPLATE.cloneNode(true) as SVGGElement;
    this.parent = parent;
    this.connector = CONNECTOR_TEMPLATE.cloneNode(true) as SVGPathElement;
    this.isTip = src.children.length === 0;

    const labelBackground = this.nameLabel.querySelector("rect") as SVGRectElement;
    labelBackground.addEventListener("pointerenter", ()=>{
      nodeHighlightCallback(this.node.index, UNSET, null);
      CAR_CONTROLS_RECT.setAttribute("width", `${this.textLabelWidth + 30}`);
      CAR_CONTROLS_RECT.setAttribute("x", `${ -6 - this.textLabelWidth / 2}`);
      CAR_CONTROLS_DISMISS.setAttribute("x", `${ this.textLabelWidth / 2 + 8}`);
      CAR_CONTROLS_EXPAND.setAttribute("x", `${ this.textLabelWidth / 2 + 8}`);
      CAR_CONTROLS.setAttribute("transform", `translate(${this.xPos}, ${this.yPos})`)
      CAR_CONTROLS_EXPAND.classList.toggle("hidden", this.isTip);
      CAR_CONTROLS_EXPAND_INPUT.checked = !this.isCollapsed;
      CONTAINER.appendChild(CAR_CONTROLS);
      CONTAINER.appendChild(this.nameLabel);
      // console.log(`highlighting ${this.node.index} ${CAR_CONTROLS_EXPAND_INPUT.checked}`);
    });
  }


  setStateFromNode(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null
  ) {
    this.srcTipPlacement = src.tipPlacement;
    this.tipPlacement = UNSET;
    this.stepsFromRoot = src.stepsFromRoot;
    this.mutationCount = mutCount;
    this.relation = relation;
    this.parent = parent;
    this.isTip = src.children.length === 0;
    /*
    the children of the source node might not be displayed here
    */
    this.children.length = 0;
  }

  addDescendant(desc: TreeNodeDisplay) {
    this.children.push(desc);
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
    // const label = `${node.index}`;
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
  metadataTransitionCallback: MetadataToggleCallback;
  pairsByDescendant: NodePair[] = [];
  rootNode: TreeNode | null = null;
  rootNodeDisplay: TreeNodeDisplay | null = null;
  nodes: TreeNodeDisplay[] = [];
  stepCount = 0;
  width: number = UNSET;
  height: number = UNSET;
  xSpacing = MAX_NODE_X_SPACING;
  ySpacing = MAX_NODE_Y_SPACING;
  maxGenerations = UNSET;
  tipRange = UNSET;
  rootPositon = UNSET;
  metadataFieldCount = 0;


  constructor(nodeHighlightCallback: HoverCallback,
    prevThresholdCallback: PREVALENCE_CALLBACK_TYPE,
    metadataTransitionCallback: MetadataToggleCallback,
    dismissNodeCallback: NodeCallback
  ) {
    this.hasMRCA = false;
    this.nodeHighlightCallback = nodeHighlightCallback;
    PREVALENCE_THRESHOLD_SLIDER.addEventListener("input", ()=>{
      prevThresholdCallback(PREVALENCE_THRESHOLD_TOGGLE.checked, parseFloat(PREVALENCE_THRESHOLD_SLIDER.value));
    });
    PREVALENCE_THRESHOLD_TOGGLE.addEventListener("input", ()=>{
      prevThresholdCallback(PREVALENCE_THRESHOLD_TOGGLE.checked, parseFloat(PREVALENCE_THRESHOLD_SLIDER.value));
    });
    this.metadataTransitionCallback = metadataTransitionCallback;
    CAR_CONTROLS.addEventListener("pointerleave", ()=>{
      nodeHighlightCallback(UNSET, UNSET, null);
      CAR_CONTROLS.remove();
    });
    CAR_CONTROLS_DISMISS.addEventListener("click", ()=>{
      dismissNodeCallback(this.highlightIndex);
      this.highlightIndex = UNSET;
      this.setHighlightNode();
    });
    CAR_CONTROLS_EXPAND_INPUT.addEventListener("input", ()=>{
      const node = this.nodes.filter(display=>display.node.index === this.highlightIndex)[0];
      if (node) {
        node.isCollapsed = !CAR_CONTROLS_EXPAND_INPUT.checked;
        // console.log(`node ${this.highlightIndex} is collapsed: ${ node.isCollapsed }, is checked: ${CAR_CONTROLS_EXPAND_INPUT.checked}`)
        // console.log('collapse / expand calling this.nodeSchematic.setLayout()')
        this.setLayout();
        this.requestRender();
      }
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
    // console.log('resize calling this.nodeSchematic.setLayout()')
    this.setLayout();
    requestAnimationFrame(()=>{
      CONTAINER.setAttribute("viewBox", `0 0 ${ this.width} ${ this.height}`);
      CONTAINER.setAttribute("width", `${ this.width}`);
      CONTAINER.setAttribute("height", `${ this.height}`);
      this.render();
    });
  }


  requestRender() {
    requestAnimationFrame(()=>this.render());
  }


  render() {
    const { width, height } = this;
    // console.log('render minimap', width, height, this.stepCount, this.tipCount);
    CONTAINER.innerHTML = '';
    const { xSpacing, ySpacing } = this;
    this.nodes.forEach(display=>display.position(width, height, xSpacing, ySpacing));
    this.nodes.forEach(display=>display.renderLabel());
    this.nodes.forEach(display=>display.renderConnector());
  }

  setSpacing() {
    const { width, height, maxGenerations, tipRange } = this;
    if (width === UNSET || height === UNSET) return;
    let xSpacing = (width - 70) / maxGenerations;
    let ySpacing = (height - 20) / tipRange * 0.6;
    // console.log(MIN_NODE_X_SPACING, MAX_NODE_X_SPACING, this.xSpacing, xSpacing );
    xSpacing = Math.max(Math.min(xSpacing, MAX_NODE_X_SPACING, this.xSpacing), MIN_NODE_X_SPACING);
    ySpacing = Math.max(Math.min(ySpacing, MAX_NODE_Y_SPACING, this.ySpacing), MIN_NODE_Y_SPACING);
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


  setPrevalenceSelectors(prevalenceActive: boolean, peakPrevalence: number) : void {
    const pct = Math.round(peakPrevalence * 100);
    PREVALENCE_THRESHOLD_READOUT.textContent = `${pct}%`;
    PREVALENCE_THRESHOLD_SLIDER.value = `${pct}`;
  }

  setMetadataSelectors(metadataFields : string[]) : void {
    if (metadataFields.length !== this.metadataFieldCount) {
      const fieldsChecked: {[_: string]: boolean} = {};
      METADATA_PARENT.querySelectorAll(".lineages--metadata-transitions").forEach((ele:Element)=>{
        const input = ele.querySelector("input") as HTMLInputElement;
        const fieldSpan = ele.querySelector(".lineages--metadata-field") as HTMLSpanElement;
        const fieldName = (fieldSpan.textContent || '').toLowerCase();
        const checked = input.checked;
        fieldsChecked[fieldName] = checked;
        ele.remove();
      });
      metadataFields.forEach((mdField:string)=>{
        if (mdField.toLowerCase() === "id" || mdField.toLowerCase() === "accession" ) return;
        const mdDiv = METADATA_TRANSITION_TEMPLATE.cloneNode(true) as HTMLDivElement;
        const input = mdDiv.querySelector("input") as HTMLInputElement;
        const fieldSpan = mdDiv.querySelector(".lineages--metadata-field") as HTMLSpanElement;
        fieldSpan.textContent = mdField;
        const wasChecked = fieldsChecked[mdField.toLowerCase()];
        input.checked = !!wasChecked;
        input.addEventListener("input", ()=>{
          this.metadataTransitionCallback(input.checked, mdField);
        });
        METADATA_PARENT.appendChild(mdDiv);
      });
      this.metadataFieldCount = metadataFields.length;
    }
  }


  /*
  @param pairs: contains mutation data for each track that we will display.
  @param rootNode: the root node of the tree we will display.
    We can traverse the entire tree by traversing the children of each node.
  */
  setData(pairs: NodePair[], rootNode: TreeNode | null) {
    // console.debug(src.map(ncd=>`${NodePairType[ncd.nodePair.pairType]} ${ncd.nodePair.mutations.length} mutations, nodeAIsUpper ? ${nodeAIsUpper}`));
    this.rootNode = rootNode;
    this.pairsByDescendant = [];
    // this.nodes.length = 0;
    pairs.forEach(pair=>{
      // index the mutations by the descendent
      this.pairsByDescendant[pair.descendant.index] = pair;
    });
    // this.setLayout();
  }

  setLayout() {
    const lookup: TreeNodeDisplay[] = [];
    const previous: TreeNodeDisplay[] = [];
    this.nodes.forEach(tnd=>previous[tnd.node.index] = tnd);
    this.stepCount = 0;
    this.nodes.length = 0;
    const tips: TreeNodeDisplay[] = [];
    this.maxGenerations = 0;
    if (this.rootNode) {
      const q = [this.rootNode];
      const displayQ: TreeNodeDisplay[] = [];
      while (q.length > 0) {
        const treeNode = q.shift() as TreeNode;
        const node = treeNode.node;
        // console.log(`handling ${node.index} ${node.label}`);
        this.maxGenerations = Math.max(this.maxGenerations, treeNode.stepsFromRoot);
        const pair = this.pairsByDescendant[node.index];
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
        let tnd: TreeNodeDisplay = previous[treeNode.node.index];
        if (!tnd) {
          tnd = new TreeNodeDisplay(treeNode, mutationCount, relationType, parent, this.nodeHighlightCallback);
        } else {
          tnd.setStateFromNode(treeNode, mutationCount, relationType, parent );
        }
        if (treeNode === this.rootNode) {
          this.rootNodeDisplay = tnd;
        }
        if (parent) parent.addDescendant(tnd);
        this.nodes.push(tnd);
        // if (tnd.isCollapsed) {
        //   console.log(`    ${tnd.node.label} is collapsed`, tnd.node.childCount);
        // }
        if (treeNode.children.length === 0) {
          tips.push(tnd);
        } else if (tnd.isCollapsed) {
          tips.push(tnd);
        } else {
          treeNode.children.forEach(tn=>q.push(tn));
        }
        lookup[node.index] = tnd;
        displayQ.unshift(tnd);
      }
      this.tipRange = tips.length - 1;
      const halfRange = this.tipRange / 2;
      /* align the tree according to the MCC tree */
      tips.sort((a,b)=>a.srcTipPlacement - b.srcTipPlacement);
      tips.forEach((tnd, i)=>tnd.tipPlacement = i - halfRange);


      while (displayQ.length > 0) {
        const tnd: TreeNodeDisplay = displayQ.shift() as TreeNodeDisplay;
        if (tnd) {
          const count = tnd.children.length;
          if (count > 0) {
            tnd.tipPlacement = tnd.children.reduce((tot: number, child: TreeNodeDisplay)=>tot+child.tipPlacement, 0) / count;
          }
        }
      }
      if (this.rootNodeDisplay) this.rootPositon = this.rootNodeDisplay.tipPlacement;
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