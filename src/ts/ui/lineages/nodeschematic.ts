import { getPercentLabel, nfc, SET_PREVALENCE_CALLBACK_TYPE, UNSET } from "../common";
import { IntroductionData } from "./corelineagesdata";
import { DisplayNode } from "./displaynode";
import { DismissNodeCallback, HoverCallback, METADATA_NONE_OPTION, MetadataToggleCallback, NodeCallback, NodePair, NodeRelationType } from "./lineagescommon";
import { TreeNode } from "./selectiontreedata";


const METADATA_FIELD_SELECTOR = "#lineages--metadata-transitions label";

const CONTROLS = document.querySelector("#lineages #lineages--schematic-controls") as HTMLDivElement;
const COUNT_SPAN = document.querySelector("#lineages--schematic-count") as HTMLSpanElement;

const PREVALENCE_THRESHOLD_LESS = CONTROLS.querySelector("#lineages--peak-prevalence-less") as HTMLButtonElement;
const PREVALENCE_THRESHOLD_MORE = CONTROLS.querySelector("#lineages--peak-prevalence-more") as HTMLButtonElement;
const PREVALENCE_THRESHOLD_READOUT = CONTROLS.querySelector("#lineages--peak-prevalence--readout") as HTMLSpanElement
const METADATA_TRANSITION_TEMPLATE = CONTROLS.querySelector(METADATA_FIELD_SELECTOR) as HTMLDivElement;
const METADATA_PARENT = METADATA_TRANSITION_TEMPLATE.parentNode as HTMLDivElement;
METADATA_TRANSITION_TEMPLATE.remove();
const WRAPPER = document.querySelector("#subway") as HTMLDivElement;
const CONTAINER = WRAPPER.querySelector("svg") as SVGElement;
const LABEL_TEMPLATE = CONTAINER.querySelector(".label") as SVGGElement;
const MUTATION_COUNT_TEMPLATE = CONTAINER.querySelector(".mut-count") as SVGGElement;
const CONNECTOR_TEMPLATE = CONTAINER.querySelector(".connector") as SVGLineElement;
const CAR_CONTROLS = CONTAINER.querySelector("#subway--car-actions") as HTMLDivElement;
const CAR_CONTROLS_DISMISS = CAR_CONTROLS.querySelector("#subway--node-dismiss") as HTMLButtonElement;
const CAR_CONTROLS_ROOT_SELECT = CAR_CONTROLS.querySelector("#subway--set-root") as HTMLButtonElement;
const CAR_CONTROLS_ROOT_RESET = CAR_CONTROLS.querySelector("#subway--reset-root") as HTMLButtonElement;


const CONTROL_W = 212;
const CONTROL_H = 70;
const CONTROL_Y1 = 14;
const CONTROL_Y2 = -10;
const CONTROL_Y3 = -55;

CAR_CONTROLS.remove();


[LABEL_TEMPLATE, MUTATION_COUNT_TEMPLATE, CONNECTOR_TEMPLATE].forEach(el=>el.remove());

const MARGIN  = {
  top: CONTROL_H,
  bottom: CONTROL_H,
  left: CONTROL_W,
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
  treeNode: TreeNode;
  xPos: number = UNSET;
  yPos: number = UNSET;
  parent: TreeNodeDisplay | null = null;
  children: TreeNodeDisplay[] = [];
  introduction: IntroductionData | null = null;
  stepsFromRoot: number;
  tipPlacement: number;
  mutationCount: number;
  relation: NodeRelationType | typeof UNSET;
  nameLabel: SVGGElement;
  mutLabel: SVGGElement;
  connector: SVGPathElement;
  textLabelWidth: number = TEXT_LABEL_MIN_WIDTH;
  textLabelHeight: number = TEXT_LABEL_HEIGHT;
  isTip = false;

  constructor(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null,
    nodeHighlightCallback: HoverCallback
  ) {
    this.treeNode = src;
    /* this will be the placement in this display */
    this.tipPlacement = UNSET;
    this.stepsFromRoot = UNSET;
    this.mutationCount = mutCount;
    this.relation = relation;
    this.nameLabel = LABEL_TEMPLATE.cloneNode(true) as SVGGElement;
    this.mutLabel = MUTATION_COUNT_TEMPLATE.cloneNode(true) as SVGGElement;
    this.parent = parent;
    this.connector = CONNECTOR_TEMPLATE.cloneNode(true) as SVGPathElement;
    this.isTip = src.children.length === 0;

    const labelBackground = this.nameLabel.querySelector(".name") as SVGRectElement;
    labelBackground.addEventListener("pointerenter", ()=>{
      const node = this.treeNode.node;
      nodeHighlightCallback(node.index, UNSET, null);
      CAR_CONTROLS.setAttribute("transform", `translate(${this.xPos}, ${this.yPos})`);
      const isLower: boolean = !!this.parent && this.parent.yPos < this.yPos;
      const isIntro = this.introduction !== null;
      CAR_CONTROLS.classList.toggle("is-tip", node.isTip());
      CAR_CONTROLS.classList.toggle("is-root", node.isRoot && node.isInferred);
      CAR_CONTROLS.classList.toggle("is-set-root", node.isRoot && !node.isInferred);
      CAR_CONTROLS.classList.toggle("is-lower", isLower);
      CAR_CONTROLS.classList.toggle("is-intro", isIntro);
      if (node.isTip()) {
        const tipIdSpan = CAR_CONTROLS.querySelector("#subway--detail-tip-name span") as HTMLSpanElement;
        if (node.metadata !== null) {
          if (node.metadata.id !== undefined) {
            tipIdSpan.innerText = `${node.metadata.id.value}`;
            tipIdSpan.title = node.metadata.id.value;
          } else if (node.metadata.accession !== undefined) {
            tipIdSpan.innerText = `${node.metadata.accession.value}`;
            tipIdSpan.title = node.metadata.accession.value;
          }
        } else {
          tipIdSpan.textContent = '';
        }

      } else {
        (CAR_CONTROLS.querySelector("#subway--detail-tip-count span") as HTMLSpanElement).textContent = nfc(node.childCount);
        // (CAR_CONTROLS.querySelector("#subway--detail-tree-mono span") as HTMLSpanElement).textContent = getPercentLabel(node.confidence);
      }

      if (isIntro) {
        const introData = this.introduction as IntroductionData;
        const transitionEle = CAR_CONTROLS.querySelector("#subway--detail-metadata") as HTMLParagraphElement;
        (transitionEle.querySelector(".md-from") as HTMLSpanElement).textContent = introData.upstreamValue;
        (transitionEle.querySelector(".md-to") as HTMLSpanElement).textContent = introData.value;

      }

      const lowerFactor = isLower ? -1 : 1;
      const y1 = CONTROL_Y1 * lowerFactor;
      const y2 = CONTROL_Y2 * lowerFactor;
      const y3 = CONTROL_Y3 * lowerFactor;
      const w = this.textLabelWidth + 9;
      const x1 = w/2;
      const x2 = - x1;
      const x3 = x1 - CONTROL_W;
      const x4 = x3 + 5;
      const pathD = `M${x1} ${y1} L${x2} ${y1} ${x2} ${y2} ${x3} ${y2} ${x3} ${y3} ${x1} ${y3} z`;

      (CAR_CONTROLS.querySelector("#border") as SVGPathElement).setAttribute("d", pathD);
      (CAR_CONTROLS.querySelector("#subway--node-detail-fo") as SVGElement).style.setProperty('x',`${x4}`);



      CONTAINER.appendChild(CAR_CONTROLS);
      CONTAINER.appendChild(this.nameLabel);
      // console.log(`highlighting ${this.node.index} ${CAR_CONTROLS_EXPAND_INPUT.checked}`);
    });
  }


  setStateFromNode(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null
  ) {
    this.treeNode = src;
    this.stepsFromRoot = UNSET;
    this.mutationCount = mutCount;
    this.relation = relation;
    this.parent = parent;
    this.isTip = src.children.length === 0;
    this.tipPlacement = UNSET;
    /*
    the children of the source node might not be displayed here
    */
    this.children.length = 0;
  }

  setIntroductionStatus(introData: IntroductionData | undefined) {
    this.introduction = introData || null;
  }

  getIndex(): number { return this.treeNode.node.index; }

  addDescendant(desc: TreeNodeDisplay) {
    this.children.push(desc);
  }

  position(_width: number, height: number, xSpacing: number, ySpacing: number) {
    this.xPos = MARGIN.left + this.stepsFromRoot * xSpacing;
    this.yPos = MARGIN.top + this.tipPlacement * ySpacing + height / 2;
    const elements = [this.nameLabel];
    if (!this.treeNode.node.isRoot) {
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
      this.connector.classList.add(this.treeNode.node.className);
    }
  }

  renderLabel(color='') {
    const node = this.treeNode.node;
    const { nameLabel } = this;
    const mrca = node.isInferred && !node.isRoot;
    const textNode = nameLabel.querySelector("text") as SVGTextElement;
    const rect = nameLabel.querySelector(".name") as SVGRectElement;
    const introOutline = nameLabel.querySelector(".outline") as SVGRectElement;
    nameLabel.classList.toggle("mrca", mrca);
    nameLabel.classList.toggle("is-intro", this.introduction !== null);
    const label = mrca ? "" : node.label;
    // const label = `${node.index}`;
    textNode.textContent = label;
    if (color === '') {
      rect.setAttribute("fill", '');
      nameLabel.classList.add(node.className);
    } else {
      rect.setAttribute("fill", color);
      nameLabel.classList.remove(node.className);
    }
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
    introOutline.setAttribute("width", `${ this.textLabelWidth + 8}`);
    introOutline.setAttribute("x", `${ -(this.textLabelWidth + 8) / 2}`);
  }

  reattachLabel() {
    CONTAINER.appendChild(this.nameLabel);
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
  introductionLookup: IntroductionData[] = [];
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
  colorByMetadata = false;
  nodeMetadataColors: string[] = [];


  constructor(nodeHighlightCallback: HoverCallback,
    prevThresholdCallback: SET_PREVALENCE_CALLBACK_TYPE,
    metadataTransitionCallback: MetadataToggleCallback,
    dismissNodeCallback: DismissNodeCallback,
    rootSelectCallback: NodeCallback
  ) {
    this.hasMRCA = false;
    this.nodeHighlightCallback = nodeHighlightCallback;
    // PREVALENCE_THRESHOLD_SLIDER.addEventListener("input", ()=>{
    //   prevThresholdCallback(true, parseFloat(PREVALENCE_THRESHOLD_SLIDER.value));
    // });
    // // PREVALENCE_THRESHOLD_TOGGLE.addEventListener("input", ()=>{
    //   prevThresholdCallback(PREVALENCE_THRESHOLD_TOGGLE.checked, parseFloat(PREVALENCE_THRESHOLD_SLIDER.value));
    // });
    PREVALENCE_THRESHOLD_LESS.addEventListener("click", ()=>{
      prevThresholdCallback(false);
    });
    PREVALENCE_THRESHOLD_MORE.addEventListener("click", ()=>{
      prevThresholdCallback(true);
    });

    this.metadataTransitionCallback = metadataTransitionCallback;
    CAR_CONTROLS.addEventListener("pointerleave", ()=>{
      nodeHighlightCallback(UNSET, UNSET, null);
      CAR_CONTROLS.remove();
    });
    CAR_CONTROLS_DISMISS.addEventListener("click", ()=>{
      const tnd: TreeNodeDisplay | undefined = this.nodes.filter(n=>n.getIndex() === this.highlightIndex)[0];
      if (tnd) {
        dismissNodeCallback(this.highlightIndex);
      }
      this.highlightIndex = UNSET;
      this.setHighlightNode();
    });
    CAR_CONTROLS_ROOT_SELECT.addEventListener("click", ()=>{
      const tnd: TreeNodeDisplay | undefined = this.nodes.filter(n=>n.getIndex() === this.highlightIndex)[0];
      if (tnd) {
        rootSelectCallback(tnd.getIndex());
      }
    });
    CAR_CONTROLS_ROOT_RESET.addEventListener('click', () => rootSelectCallback(UNSET));
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
    const { xSpacing, ySpacing, colorByMetadata, nodeMetadataColors } = this;
    this.nodes.forEach(display=>display.position(width, height, xSpacing, ySpacing));
    /*
    we need to attach and measure the label before rendering the connectors
    */
    if (colorByMetadata) {
      this.nodes.forEach(display=>{
        const color: string = nodeMetadataColors[display.getIndex()];
        display.renderLabel(color);
      });
    } else {
      this.nodes.forEach(display=>display.renderLabel());
    }
    this.nodes.forEach(display=>display.renderConnector());
    /* we want the labels to be above the connectors in the svg */
    this.nodes.forEach(display=>display.reattachLabel());
  }

  setSpacing() {
    const { width, height, maxGenerations, tipRange } = this;
    if (width === UNSET || height === UNSET) return;
    let xSpacing = (width - CONTROL_W) / maxGenerations;
    let ySpacing = (height - CONTROL_H * 2) / tipRange * 0.6;
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
      this.nodes.forEach(display=>display.pushBack(display.getIndex() !== this.highlightIndex));
    }
  }


  setPrevalenceSelectors(prevalenceActive: boolean, peakPrevalence: number) : void {
    const pct = Math.round(peakPrevalence * 100);
    PREVALENCE_THRESHOLD_READOUT.textContent = `${pct}%`;
  }

  setMetadataSelectors(metadataFields : string[]) : void {
    if (metadataFields.length !== this.metadataFieldCount) {
      const fieldsChecked: {[_: string]: boolean} = {};
      METADATA_PARENT.querySelectorAll(METADATA_FIELD_SELECTOR).forEach((ele:Element)=>{
        const input = ele.querySelector("input") as HTMLInputElement;
        const fieldSpan = ele.querySelector(".lineages--metadata-field") as HTMLSpanElement;
        const fieldName = (fieldSpan.textContent || '').toLowerCase();
        const checked = input.checked;
        fieldsChecked[fieldName] = checked;
        ele.remove();
      });
      const addMetadaOption = (mdField:string, label: string)=>{
        if (mdField.toLowerCase() === "id" || mdField.toLowerCase() === "accession" ) return;
        const mdDiv = METADATA_TRANSITION_TEMPLATE.cloneNode(true) as HTMLDivElement;
        const input = mdDiv.querySelector("input") as HTMLInputElement;
        const fieldSpan = mdDiv.querySelector(".lineages--metadata-field") as HTMLSpanElement;
        fieldSpan.textContent = label;
        const wasChecked = fieldsChecked[mdField.toLowerCase()];
        input.checked = !!wasChecked;
        input.addEventListener("input", ()=>{
          this.metadataTransitionCallback(mdField);
        });
        METADATA_PARENT.appendChild(mdDiv);
      };
      metadataFields.forEach(field=>addMetadaOption(field, field));
      addMetadaOption(METADATA_NONE_OPTION, 'None');
      this.metadataFieldCount = metadataFields.length;
    }
  }

  setColorMethod(colorByMetadata: boolean, nodeMetadataColors: string[]) {
    this.colorByMetadata = colorByMetadata;
    this.nodeMetadataColors = nodeMetadataColors;
  }

  /*
  @param pairs: contains mutation data for each track that we will display.
  @param rootNode: the root node of the tree we will display.
    We can traverse the entire tree by traversing the children of each node.
  */
  setData(pairs: NodePair[], rootNode: TreeNode | null, nodeCount: number, fieldIntroductions: IntroductionData[]) {
    const {ancestor, descendant} = pairs[0];
    console.debug(ancestor.index, ancestor.label, ancestor.className,
      descendant.index, descendant.label, descendant.className);
    this.rootNode = rootNode;
    this.pairsByDescendant = [];
    /* expand the fieldIntroductions into a lookup */
    this.introductionLookup = [];
    fieldIntroductions.forEach(item=>this.introductionLookup[item.nodeIndex] = item);
    pairs.forEach(pair=>{
      // index the mutations by the descendent
      this.pairsByDescendant[pair.descendant.index] = pair;
    });
    COUNT_SPAN.textContent = `${nfc(nodeCount)} node${ nodeCount === 1 ? '' : 's'}` ;
  }

  setLayout() {
    const lookup: TreeNodeDisplay[] = [];
    const previous: TreeNodeDisplay[] = [];
    this.nodes.forEach(tnd=>previous[tnd.getIndex()] = tnd);
    this.stepCount = 0;
    this.nodes.length = 0;
    const tips: TreeNodeDisplay[] = [];
    this.maxGenerations = 0;
    // console.log(`\n          setLayout`);
    if (this.rootNode) {
      const q = [this.rootNode];
      const displayQ: TreeNodeDisplay[] = [];
      while (q.length > 0) {
        const treeNode = q.shift() as TreeNode;
        const node = treeNode.node;
        const pair = this.pairsByDescendant[node.index];
        // console.log(`handling ${node.index} ${node.label}`);
        let mutationCount = 0;
        let relationType: NodeRelationType | typeof UNSET = UNSET;
        if (pair) { // no pair for root
          mutationCount = pair.mutations.length;
          relationType = pair.relation;
        }
        let parent = null;
        if (treeNode.parent) {
          parent = lookup[treeNode.parent.node.index];
        }
        let tnd: TreeNodeDisplay = previous[node.index];
        if (!tnd) {
          tnd = new TreeNodeDisplay(treeNode, mutationCount, relationType, parent, this.nodeHighlightCallback);
        } else {
          tnd.setStateFromNode(treeNode, mutationCount, relationType, parent );
        }
        if (!treeNode.node.isInferred) {
          tnd.setIntroductionStatus(this.introductionLookup[node.index]);
        }
        if (treeNode === this.rootNode) {
          tnd.stepsFromRoot = 0;
          this.rootNodeDisplay = tnd;
        } else if (parent) {
          tnd.stepsFromRoot = parent.stepsFromRoot + 1;
          parent.addDescendant(tnd);
        } else {
          console.warn(`we had a node with no parent that is not root!`)
        }
        this.maxGenerations = Math.max(this.maxGenerations, tnd.stepsFromRoot);
        this.nodes.push(tnd);
        if (treeNode.children.length === 0) {
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
      tips.sort((a,b)=>a.treeNode.tipPlacement - b.treeNode.tipPlacement);
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