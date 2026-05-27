import { getPercentLabel, nfc, SET_PREVALENCE_CALLBACK_TYPE, UNSET } from "./common";
import { IntroductionData } from "./select/coreselectdata";
import { DisplayNode } from "./select/displaynode";
import { DismissNodeCallback, HoverCallback, METADATA_NONE_OPTION, MetadataToggleCallback, NodeCallback, NodePair, NodeRelationType } from "./select/selectcommon";
import { TreeNode } from "./schematicdata";




const CONTROL_W = 80;
const CONTROL_H = 70;


const SUBWAY_TEMPLATE = document.querySelector("#select--node-layout .subway svg") as SVGElement;
const LABEL_TEMPLATE = SUBWAY_TEMPLATE.querySelector(".label") as SVGGElement;
const MUTATION_COUNT_TEMPLATE = SUBWAY_TEMPLATE.querySelector(".mut-count") as SVGGElement;
const CONNECTOR_TEMPLATE = SUBWAY_TEMPLATE.querySelector(".connector") as SVGLineElement;
const SUBWAY_HOVER = document.querySelector("#select--node-layout .subway-hover") as HTMLDivElement;

[SUBWAY_TEMPLATE, SUBWAY_HOVER, LABEL_TEMPLATE, MUTATION_COUNT_TEMPLATE,
  CONNECTOR_TEMPLATE].forEach(el=>el.remove());

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


export class TreeNodeDisplay {
  treeNode: TreeNode;
  xPos: number = UNSET;
  yPos: number = UNSET;
  parent: TreeNodeDisplay | null = null;
  children: TreeNodeDisplay[] = [];
  introduction: IntroductionData | null = null;
  currentMetadataValue = '';
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
  previousNodeClass = '';
  subway: SVGElement;

  constructor(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null,
    subway: SVGElement
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
    this.subway = subway;
    this.connector = CONNECTOR_TEMPLATE.cloneNode(true) as SVGPathElement;
    this.isTip = src.children.length === 0;
  }


  setStateFromNode(src: TreeNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: TreeNodeDisplay | null
  ) {
    this.previousNodeClass = this.treeNode.node.className;
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

  setCurrentMetadata(md:string) {
    this.currentMetadataValue = md;
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
    this.yPos = this.tipPlacement * ySpacing + height / 2;
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
      this.subway.appendChild(this.connector);
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
    rect.setAttribute("data-index", `${node.index}`);
    nameLabel.setAttribute("class", "label");
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
    this.subway.appendChild(this.nameLabel);
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
    this.subway.appendChild(this.nameLabel);
  }

  pushBack(pushIt: boolean) : void {
    this.nameLabel.classList.toggle("back", pushIt);
    this.connector.classList.toggle("back", pushIt);
  }

  pushBackLabel(pushIt: boolean) : void {
    this.nameLabel.classList.toggle("back", pushIt);
  }

  pushBackConnector(pushIt: boolean) : void {
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
  pairsByDescendant: NodePair[] = [];
  introductionLookup: IntroductionData[] = [];
  metadataField: string | null = null;
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
  wrapper: HTMLDivElement;
  container: SVGElement;
  hoverDiv: HTMLDivElement;




  constructor( wrapper: HTMLDivElement, nodeHighlightCallback: HoverCallback) {
    this.wrapper = wrapper;
    this.container = SUBWAY_TEMPLATE.cloneNode(true) as SVGElement;
    this.hoverDiv = SUBWAY_HOVER.cloneNode(true) as HTMLDivElement;
    this.wrapper.appendChild(this.container);
    this.wrapper.appendChild(this.hoverDiv);
    this.hasMRCA = false;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.hoverDiv.addEventListener("pointerleave", ()=>{
      nodeHighlightCallback(UNSET, UNSET, null);
      this.hideHover();
    });

    this.container.addEventListener("pointermove", event=>{
      const target = event.target as SVGElement;
      const nodeIndex = target.getAttribute("data-index");
      // if (target instanceof SVGRectElement) {
      //   console.log(nodeIndex, event.offsetX, event.offsetY);
      // }
      let found = false;
      if (nodeIndex !== null) {
        const index = parseInt(nodeIndex);
        const tnd = this.nodes.filter(n=>n.getIndex() === index)[0];
        if (tnd) {
          nodeHighlightCallback(index, UNSET, null);
          this.setHover(tnd);
          found = true;
        }
      }
      if (!found) {
        nodeHighlightCallback(UNSET, UNSET, null);
        this.hideHover();
      }
    });
  }


  resize() {
    const { offsetWidth, offsetHeight } = this.wrapper;
    this.width = offsetWidth;
    /*
    The wrapper div is 3 px taller than the svg.
    Not sure why. [mark 260409]
    */
    this.height = offsetHeight - 3;
    // console.log('resize calling this.nodeSchematic.setLayout()')
    this.setLayout();
    requestAnimationFrame(()=>{
      this.container.setAttribute("viewBox", `0 0 ${ this.width} ${ this.height}`);
      this.container.setAttribute("width", `${ this.width}`);
      this.container.setAttribute("height", `${ this.height}`);
      this.render();
    });
  }


  requestRender() {
    requestAnimationFrame(()=>this.render());
  }


  render() {
    const { width, height } = this;
    // console.log('render minimap', width, height, this.stepCount, this.tipCount);
    this.container.innerHTML = '';
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
    this.setHighlightNode();
  }

  setSpacing() {
    const { width, height, maxGenerations, tipRange } = this;
    if (width === UNSET || height === UNSET) return;
    let xSpacing = (width - MARGIN.left - MARGIN.right) / (maxGenerations + 1) + 1;
    let ySpacing = (height - MARGIN.top - MARGIN.bottom) / tipRange * 0.5 + 6;
    // console.log(MIN_NODE_X_SPACING, MAX_NODE_X_SPACING, this.xSpacing, xSpacing );
    // xSpacing = Math.max(Math.min(xSpacing, MAX_NODE_X_SPACING, this.xSpacing), MIN_NODE_X_SPACING);
    // ySpacing = Math.max(Math.min(ySpacing, MAX_NODE_Y_SPACING, this.ySpacing), MIN_NODE_Y_SPACING);
    xSpacing = Math.max(Math.min(xSpacing, MAX_NODE_X_SPACING), MIN_NODE_X_SPACING);
    ySpacing = Math.max(Math.min(ySpacing, MAX_NODE_Y_SPACING), MIN_NODE_Y_SPACING);
    this.xSpacing = xSpacing;
    this.ySpacing = ySpacing;
  }


  setHighlightNode() {
    if (this.highlightIndex === UNSET) {
      this.nodes.forEach(display=>display.pushBack(false));
    } else {
      this.nodes.forEach(display=>{
        display.pushBackConnector(true);
        display.pushBackLabel(display.getIndex() !== this.highlightIndex);
      });
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
  setData(pairs: NodePair[], rootNode: TreeNode | null,
    fieldIntroductions: IntroductionData[], metadataField: string | null
  ) {
    // const {ancestor, descendant} = pairs[0];
    // console.debug(ancestor.index, ancestor.label, ancestor.className,
    //   descendant.index, descendant.label, descendant.className);
    this.rootNode = rootNode;
    this.pairsByDescendant = [];
    /* expand the fieldIntroductions into a lookup */
    this.introductionLookup = [];
    this.metadataField = metadataField;
    fieldIntroductions.forEach(item=>this.introductionLookup[item.nodeIndex] = item);
    pairs.forEach(pair=>{
      // index the mutations by the descendent
      this.pairsByDescendant[pair.descendant.index] = pair;
    });
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
          tnd = new TreeNodeDisplay(treeNode, mutationCount, relationType, parent, this.container);
        } else {
          tnd.setStateFromNode(treeNode, mutationCount, relationType, parent );
        }
        if (!treeNode.node.isInferred) {
          tnd.setIntroductionStatus(this.introductionLookup[node.index]);
        }
        let mdValue = '';
        if (this.metadataField && node.metadata) {
          mdValue = node.metadata[this.metadataField]?.value || '';
        }
        tnd.setCurrentMetadata(mdValue);
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
      // console.log("tips b4 sort", tips.map(n=>`${n.treeNode.node.name} ${n.treeNode.tipPlacement}`));
      tips.sort((a,b)=>a.treeNode.tipPlacement - b.treeNode.tipPlacement);
      // console.log("tips sorted ", tips.map(n=>`${n.treeNode.node.name} ${n.treeNode.tipPlacement}`));
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
      requestAnimationFrame(()=>this.setHighlightNode());
    }
    this.highlightIndex = node.index;
  }

  highlightNodes(nodeIndices: number[] | null) : void {
    if (nodeIndices === null) {
      this.nodes.forEach(display=>display.pushBack(false));
    } else {
      this.nodes.forEach(display=>display.pushBack(!nodeIndices.includes(display.getIndex())));
    }

  }



  setHover(tnd: TreeNodeDisplay) {
    const node = tnd.treeNode.node;
    const isUpper = false; //!tnd.parent || tnd.yPos < tnd.parent.yPos;
    const isIntro = tnd.introduction !== null;
    const x = tnd.xPos + tnd.textLabelWidth/2;
    const y = tnd.yPos;
    this.hoverDiv.style.right = `${this.width - x}px`;
    if (isUpper) {
      this.hoverDiv.style.top = `unset`;
      this.hoverDiv.style.bottom = `${this.height - y + tnd.textLabelHeight/2}px`;
    } else {
      this.hoverDiv.style.top = `${y + tnd.textLabelHeight/2}px`;
      this.hoverDiv.style.bottom = `unset`;
    }
    this.hoverDiv.classList.toggle("is-tip", node.isTip());
    this.hoverDiv.classList.toggle("is-root", node.isRoot && node.isInferred);
    this.hoverDiv.classList.toggle("is-set-root", node.isRoot && !node.isInferred);
    this.hoverDiv.classList.toggle("is-upper", isUpper);
    this.hoverDiv.classList.toggle("is-intro", !!this.metadataField && tnd.currentMetadataValue !== '');
    if (node.isTip()) {
      const tipIdSpan = this.hoverDiv.querySelector(".subway--detail-tip-name span") as HTMLSpanElement;
      let name = '';
      if (node.metadata !== null) {
        if (node.metadata.id !== undefined) {
          name = node.metadata.id.value;
        } else if (node.metadata.accession !== undefined) {
          name = node.metadata.accession.value;
        }
      }
      tipIdSpan.textContent = name;
      tipIdSpan.title = name;
    }

    const transitionEle = this.hoverDiv.querySelector(".subway--detail-metadata") as HTMLParagraphElement;
    if (isIntro) {
      const introData = tnd.introduction as IntroductionData;
      (transitionEle.querySelector(".md-from") as HTMLSpanElement).textContent = introData.upstreamValue;
      (transitionEle.querySelector(".md-to") as HTMLSpanElement).textContent = introData.value;
      transitionEle.classList.remove("no-transition");
    } else {
      (transitionEle.querySelector(".md-to") as HTMLSpanElement).textContent = tnd.currentMetadataValue;
      transitionEle.classList.add("no-transition");
    }

    this.container.appendChild(tnd.nameLabel);
    this.hoverDiv.classList.add("active");
  }


  hideHover() {
    this.hoverDiv.classList.remove("active");
  }


}


