import { UNSET } from "./common";
import { IntroductionData } from "./select/coreselectdata";
import { darkenColor, truncateLabel } from "./common";
import { HoverCallback, NodePair, NodeRelationType } from "./select/selectcommon";
import { SchematicNode } from "./schematicdata";




const CONTROL_W = 20;
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

const TEXT_LABEL_HEIGHT = 6;
const TEXT_LABEL_MIN_WIDTH = 6;
const LABEL_FONTSIZE = 10;
const TEXT_PADDING = 7;
let MAX_LABEL_CHAR = 10;


type Bounds = { x: number; y: number; w: number; h: number; }
export class SchematicNodeDisplay {
  treeNode: SchematicNode;
  xPos: number = UNSET;
  yPos: number = UNSET;
  parent: SchematicNodeDisplay | null = null;
  children: SchematicNodeDisplay[] = [];
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

  constructor(src: SchematicNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: SchematicNodeDisplay | null,
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


  setStateFromNode(src: SchematicNode, mutCount: number,
    relation: NodeRelationType | typeof UNSET,
    parent: SchematicNodeDisplay | null
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

  addDescendant(desc: SchematicNodeDisplay) {
    this.children.push(desc);
  }

  position(width: number, height: number, xSpacing: number, ySpacing: number, labelWidth = 0) {
    const pct = 0.1 + this.treeNode.xFactor * 0.5;
    this.xPos = MARGIN.left + pct * width;

    // positioning nodes based on label width
    // this.xPos = MARGIN.left + 1 + (this.parent?.xPos ?? 0) + labelWidth / 3;
    this.yPos = this.tipPlacement * ySpacing + height / 2;

    const elements = [this.nameLabel];

    if (!this.treeNode.node.isRoot) {
      elements.push(this.mutLabel);
      elements.push(this.connector);
    }

    elements.forEach(el => {
      el.setAttribute(
        "transform",
        `translate(${this.xPos}, ${this.yPos})`
      );
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

  renderIntroductionLabel(color = '', position = "right") {
    const { nameLabel } = this;
    const textNode = nameLabel.querySelector("text") as SVGTextElement;
    const labelText = truncateLabel(this.introduction?.value ?? "", MAX_LABEL_CHAR);
    textNode.textContent = labelText;
    textNode.style.setProperty("fill", color, "important");
    let labelX = 0, labelY = 0;
    if (position === "top" || position === "bottom") {
      labelX = -this.textLabelWidth / 2;
      labelY = this.textLabelHeight * 2 + LABEL_FONTSIZE / 2 + TEXT_PADDING;
      if (position === "top") labelY *= -1;
    } else { //"right"
      labelX = this.textLabelWidth / 2 + textNode.getComputedTextLength() / 2 + TEXT_PADDING;
      labelY = 0;
    }
    textNode.setAttribute("x", `${labelX}`);
    textNode.setAttribute("y", `${labelY}`);
  }

  renderLabel(maxChildNodes: number, color = '', introLabelPos = "right") {
    const node = this.treeNode.node;
    const { nameLabel } = this;
    const mrca = node.isInferred && !node.isRoot;
    const textNode = nameLabel.querySelector("text") as SVGTextElement;
    const circle = nameLabel.querySelector(".name") as SVGEllipseElement;
    const introOutline = nameLabel.querySelector(".outline") as SVGEllipseElement;
    circle.setAttribute("data-index", `${node.index}`);
    nameLabel.setAttribute("class", "label");
    nameLabel.classList.toggle("mrca", mrca);
    nameLabel.classList.toggle("is-intro", this.introduction !== null);
    textNode.textContent = ""
    if (color === '') {
      circle.setAttribute("fill", '');
      nameLabel.classList.add(node.className);
    } else {
      circle.setAttribute("fill", color);
      nameLabel.classList.remove(node.className);
    }
    circle.setAttribute("stroke", darkenColor(color, 30));
    circle.setAttribute("stroke-width", "1.5");
    this.subway.appendChild(this.nameLabel);
    if (mrca) {
      this.textLabelWidth = 0;
      this.textLabelHeight = 0;
    } else {
      // calculate node size based on
      // # of tips that belong to this lineage but not any sub-lineage
      const directChildTips = node.childCount - this.treeNode.children.reduce((total, child) => total += child.node.childCount, 0)
      const calculatedWidth = 25 * directChildTips / maxChildNodes;
      this.textLabelWidth = Math.max(3, Math.min(15, calculatedWidth))
      this.textLabelHeight = this.textLabelWidth;
      circle.setAttribute("ry", `${this.textLabelHeight}`);
      circle.setAttribute("cy", `0`);
    }
    circle.setAttribute("rx", `${this.textLabelWidth}`);
    circle.setAttribute("cx", `0`);

    const outlineMargin = 3;
    introOutline.setAttribute("stroke", darkenColor(color, 30));
    introOutline.setAttribute("rx", `${this.textLabelWidth + outlineMargin}`);
    introOutline.setAttribute("ry", `${this.textLabelWidth + outlineMargin}`);
    introOutline.setAttribute("cx", `0`);
    introOutline.setAttribute("cy", `0`);

    const bgRect = nameLabel.querySelector(".label-bg") as SVGRectElement;
    bgRect.style.display = "none";

    if (this.introduction) {
      this.renderIntroductionLabel(color, introLabelPos)
    }
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



export type NodeSchematicData = {
  pairs: NodePair[],
  rootNode: SchematicNode | null,
  fieldIntroductions: IntroductionData[],
  metadataField: string | null
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
  rootNode: SchematicNode | null = null;
  rootNodeDisplay: SchematicNodeDisplay | null = null;
  nodes: SchematicNodeDisplay[] = [];
  stepCount = 0;
  width: number = UNSET;
  height: number = UNSET;
  xSpacing = MAX_NODE_X_SPACING;
  ySpacing = MAX_NODE_Y_SPACING;
  maxGenerations = UNSET;
  maxChildNodes = UNSET;
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

  getIntroMetadatFields(): string[] {
    const fields = new Set(
      this.nodes
        .map(node => node.introduction?.value)
        .filter((value): value is string => !!value)
    );
    const deduped = new Set(fields)
    return [...deduped]
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


  //TODO: MOVE THIS KARLIE
  getTextWidth(text: string, fontSize: number, fontFamily = 'sans-serif'): number {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.visibility = 'hidden';
    svg.style.pointerEvents = 'none';

    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('font-size', String(fontSize));
    el.setAttribute('font-family', fontFamily);
    el.textContent = text;

    svg.appendChild(el);
    document.body.appendChild(svg);

    const width = el.getBBox().width;

    document.body.removeChild(svg);
    return width;
  }

  getLabelBounds(node: SchematicNodeDisplay, side: "right" | "top" | "bottom"): Bounds {
    const w = this.getTextWidth(node.introduction?.value ?? "", LABEL_FONTSIZE);
    const h = LABEL_FONTSIZE;
    const pad = 4;

    switch (side) {
    case "right":
      return {
        x: node.xPos + pad, y: node.yPos - h / 2, w, h,
      };

    case "top":
      return {
        x: node.xPos - w / 2, y: node.yPos - h - pad, w, h,
      };

    case "bottom":
      return {
        x: node.xPos - w / 2, y: node.yPos + pad, w, h,
      };
    }
  }

  intersects(a: Bounds, b: Bounds) {
    return !(
      a.x + a.w < b.x ||
        b.x + b.w < a.x ||
        a.y + a.h < b.y ||
        b.y + b.h < a.y
    );
  }

  render() {
    const { width, height } = this;
    // console.log('render minimap', width, height, this.stepCount, this.tipCount);
    this.container.innerHTML = '';
    const { xSpacing, ySpacing, colorByMetadata, nodeMetadataColors } = this;
    this.nodes.forEach(node => {
      const parentLabel = node.parent?.introduction?.value ?? "";
      const currentLabel = node.introduction?.value ?? ""
      const w = this.getTextWidth(parentLabel + currentLabel, LABEL_FONTSIZE);
      node.position(width, height, xSpacing, ySpacing, w)
    });

    const introLabelPos = new Map<number, "right" | "top" | "bottom">();
    const placedLabels: Bounds[] = [];

    this.nodes.forEach((node, index) => {
      if (!node.introduction) return;
      let positions: Array<"right" | "top" | "bottom">;
      let chosenPos: "top" | "right" | "bottom";
      if (node.children.length !== 1) {
        // if there are two or 0 children, try right -> top -> bottom
        positions = ["right", "top", "bottom"];
        chosenPos = "right";
      } else {
        // if a node has only one child, try top -> bottom
        positions = ["top", "bottom"];
        chosenPos = "top";
      }

      for (const side of positions) {
        chosenPos = side;
        const bounds = this.getLabelBounds(node, side);
        const overlapsLabel = placedLabels.some(existing => this.intersects(bounds, existing));
        if (!overlapsLabel) {
          placedLabels.push(bounds);
          break;
        }
      } introLabelPos.set(index, chosenPos);
    });

    /*
     we need to attach and measure the label before rendering the connectors
    */
    if (colorByMetadata) {
      this.nodes.forEach((display, i) => {
        const color: string = nodeMetadataColors[display.getIndex()];
        // display.renderLabel(this.maxChildNodes, color, "top");//introLabelPos.get(i)
        display.renderLabel(
          this.maxChildNodes,
          color,
          introLabelPos.get(i) ?? "right"
        );
      });
    } else {
      // this.nodes.forEach(display => display.renderLabel(this.maxChildNodes));
      this.nodes.forEach(display => display.renderLabel(
        this.maxChildNodes,
        undefined,
        introLabelPos.get(display.getIndex()) ?? "right")
      );
    }
    this.nodes.forEach(display => display.renderConnector());
    /* we want the labels to be above the connectors in the svg */
    this.nodes.forEach(display => display.reattachLabel());
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
    MAX_LABEL_CHAR = Math.ceil(2 * xSpacing / LABEL_FONTSIZE);
    xSpacing = Math.max(Math.min(xSpacing, MAX_NODE_X_SPACING), MIN_NODE_X_SPACING);
    ySpacing = Math.max(Math.min(ySpacing, MAX_NODE_Y_SPACING), MIN_NODE_Y_SPACING);
    // this.xSpacing = xSpacing;
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
  setData(schematicData: NodeSchematicData) {
    // const { pairs, rootNode, fieldIntroductions, metadataField } = schematicData;
    const { pairs, rootNode, fieldIntroductions, metadataField } = schematicData;
    // this.nodeTimes = nodeTimes;
    // this.minDate = minDate;
    // this.maxDate = maxDate;

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
    const lookup: SchematicNodeDisplay[] = [];
    const previous: SchematicNodeDisplay[] = [];
    this.nodes.forEach(tnd=>previous[tnd.getIndex()] = tnd);
    this.stepCount = 0;
    this.nodes.length = 0;
    const tips: SchematicNodeDisplay[] = [];
    this.maxGenerations = 0;
    this.maxChildNodes = 0;
    // console.log(`\n          setLayout`);
    if (this.rootNode) {
      const q = [this.rootNode];
      const displayQ: SchematicNodeDisplay[] = [];
      while (q.length > 0) {
        const treeNode = q.shift() as SchematicNode;
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
        let tnd: SchematicNodeDisplay = previous[node.index];
        if (!tnd) {
          tnd = new SchematicNodeDisplay(treeNode, mutationCount, relationType, parent, this.container);
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
        this.maxChildNodes = Math.max(this.maxChildNodes, tnd.treeNode.node.childCount)
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
        const tnd: SchematicNodeDisplay = displayQ.shift() as SchematicNodeDisplay;
        if (tnd) {
          const count = tnd.children.length;
          if (count > 0) {
            tnd.tipPlacement = tnd.children.reduce((tot: number, child: SchematicNodeDisplay)=>tot+child.tipPlacement, 0) / count;
          }
        }
      }
      if (this.rootNodeDisplay) this.rootPositon = this.rootNodeDisplay.tipPlacement;
      this.setSpacing();
    }
  }


  highlightNode(nodeIndex: number) : void {
    if (nodeIndex !== this.highlightIndex) {
      requestAnimationFrame(()=>this.setHighlightNode());
    }
    this.highlightIndex = nodeIndex;
  }

  highlightNodes(nodeIndices: number[] | null) : void {
    if (nodeIndices === null) {
      this.nodes.forEach(display=>display.pushBack(false));
    } else {
      this.nodes.forEach(display=>display.pushBack(!nodeIndices.includes(display.getIndex())));
    }

  }



  setHover(tnd: SchematicNodeDisplay) {
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