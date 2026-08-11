import { NodeData, MutationData, DisplayOption, MUTATION_SERIES_COLORS, RowFunctionType } from './mutationscommon';
import { getMutationNameParts } from '../../constants';
import {DistributionSeries, TimeDistributionCanvas} from '../timedistributioncanvas';
import {MutationOfInterest, FeatureOfInterest} from '../../pythia/mutationsofinterest';
import { UNSET, getPercentLabel } from '../common';



export type NodeFunctionType = (nodeIndex?: number) => void;


const maybeTableBody = document.querySelector("#mutation-rows");
if (!maybeTableBody) {
  throw new Error("mutations.html doesn't have the container for the mutation rows!");
}
const MUTATION_TABLE_BODY = <HTMLDivElement> maybeTableBody;

const nodeDetail = document.querySelector(".node-detail");
if (!nodeDetail) {
  throw new Error("mutations.html doesn't have the node detail template");
}
const NODE_DETAIL_TEMPLATE = <HTMLElement>nodeDetail;
NODE_DETAIL_TEMPLATE.remove();

const maybeRow = MUTATION_TABLE_BODY.querySelector(".mutation-row");
if (!maybeRow) {
  throw new Error("mutations.html doesn't have the mutation row template!");
}
const MUTATION_ROW_TEMPLATE = <HTMLDivElement> maybeRow;
MUTATION_ROW_TEMPLATE.remove();

const MAX_NODES = 3;

const ICON_MIN = 2;
const ICON_MAX = 17;

const ORDER_INDICATOR = document.querySelector(".order-indicator") as HTMLElement;
ORDER_INDICATOR.remove();

export class MutationRow {
  moi: MutationOfInterest;
  color: string;
  rowDiv: HTMLDivElement;
  timeCanvas: TimeDistributionCanvas;
  nodes: NodeData[];
  topNodes: NodeData[] = [];
  removeRow: (row: MutationRow) => void;
  getNodeRelativeSize: (tipCount: number) => number;
  updateHoverRow: RowFunctionType;
  updateHoverNode: NodeFunctionType;
  goToLineages: NodeFunctionType;
  shiftRow: (row: MutationRow, direction: number) => void;
  // setMutationActive: (name: string, active: boolean) => void;
  minDate: number;
  maxDate: number;

  // detailButton: HTMLElement;

  displayOption: DisplayOption;

  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;

  rows: MutationRow[];



  constructor(mutationData: MutationData,
    removeRow: (row: MutationRow) => void,
    getNodeRelativeSize: (tipCount: number) => number,
    updateHoverRow: RowFunctionType,
    updateHoverNode: NodeFunctionType,
    goToLineages: NodeFunctionType,
    shiftRow: (row: MutationRow, direction: number) => void,
    // setMutationActive: (name: string, active: boolean) => void,
    minDate: number, maxDate: number,
    displayOption: DisplayOption,
    isApobecEnabled: boolean) {

    const moi = mutationData.moi;
    this.moi = moi;
    this.color = mutationData.color;
    // const {name, confidence} = moi;
    // const nodeList = nodes.map(n=>`${n}`).join(',');
    // console.log(`Mutation of Interest "${name}" confidence: ${confidence} mcc nodes: ${nodeList}`)
    // console.log(`Mutation of Interest "${name}" confidence: ${confidence} mcc nodes: ${mutationData.nodes.length}}`)
    this.rowDiv = <HTMLDivElement> MUTATION_ROW_TEMPLATE.cloneNode(true);
    this.rowDiv.setAttribute("data-mutation", moi.name);
    MUTATION_TABLE_BODY.appendChild(this.rowDiv);

    this.minDate = minDate;
    this.maxDate = maxDate;

    this.rowDiv.addEventListener("pointerenter", () => this.handleMouseenter());
    // this.rowDiv.addEventListener("pointermove", e => this.handleMousemove(e));
    this.rowDiv.addEventListener("pointerleave", e => this.handleMouseleave(e), true);
    this.rowDiv.addEventListener("click", e => this.handleClick(e));
    this.rowDiv.addEventListener("keydown", e => this.handleKeydown(e));

    this.removeRow = removeRow;
    // const dismissButton = this.rowDiv.querySelector(".mutation-dismiss") as HTMLButtonElement;
    // dismissButton.addEventListener("click", e => {
    //   this.removeRow(this);
    //   e.stopImmediatePropagation();
    // });

    // this.setMutationActive = setMutationActive;
    // const toggleButton = this.rowDiv.querySelector(".mutation-toggle") as HTMLButtonElement;
    // toggleButton.addEventListener("click", this.toggleActive);
    // this.detailButton = this.rowDiv.querySelector(".mutation-detail") as HTMLButtonElement;

    this.shiftRow = shiftRow;
    this.displayOption = displayOption;
    this.prevButton = this.rowDiv.querySelector(".mutation-prev") as HTMLButtonElement;
    this.nextButton = this.rowDiv.querySelector(".mutation-next") as HTMLButtonElement;
    this.prevButton.addEventListener("click", () => {
      const direction = -1;
      this.shiftRow(this, direction);
      this.updateShiftButtons();
    });
    this.nextButton.addEventListener("click", () => {
      const direction = 1;
      this.shiftRow(this, direction);
      this.updateShiftButtons();
    });
    this.rows = [];
    this.updateShiftButtons();

    this.getNodeRelativeSize = getNodeRelativeSize;

    this.updateHoverRow = updateHoverRow;
    this.updateHoverNode = updateHoverNode;
    this.goToLineages = goToLineages;

    const nameDiv:HTMLDivElement|null = this.rowDiv.querySelector(".mutation-name");
    if (!nameDiv) {
      throw new Error("mutation row has nowhere for the name to go");
    }
    const nameParts = getMutationNameParts(moi.mutation);
    (nameDiv.querySelector(".allele-from") as HTMLElement).innerText = `${nameParts[0]}`;
    (nameDiv.querySelector(".site") as HTMLElement).innerText = `${nameParts[1]}`;
    (nameDiv.querySelector(".allele-to") as HTMLElement).innerText = `${nameParts[2]}`;

    this.rowDiv.classList.toggle('is-apobec', isApobecEnabled && moi.isApobec >= moi.treeCount * .5);

    (this.rowDiv.querySelector(".stats--tip-count strong") as HTMLElement).innerText = `${moi.medianTipCount}`;
    (this.rowDiv.querySelector(".stats--confidence strong") as HTMLElement).innerText = `${getPercentLabel(moi.confidence)}%`;

    this.nodes = mutationData.nodes.slice(0);
    this.createNodes();

    this.rowDiv.style.height = `${(this.rowDiv.querySelector(".mutation-right")?.getBoundingClientRect().height ?? 0) + 30}px`

    const canvas = this.rowDiv.querySelector(".mutation-time-dist canvas") as HTMLCanvasElement;
    if (!canvas) {
      throw new Error("mutation row has nowhere for the time distribution to go");
    }
    const series: DistributionSeries = new DistributionSeries(moi.name, mutationData.times, "mutation");
    const readout = this.rowDiv.querySelector(".time-chart--readout") as HTMLElement;
    this.timeCanvas = new TimeDistributionCanvas([series], mutationData.minDate, mutationData.maxDate, canvas, readout);

    if (moi.features) {
      this.listFeatures();
    }
    this.color = mutationData.color;
    const colorIndex = MUTATION_SERIES_COLORS.indexOf(this.color);
    if (colorIndex !== UNSET) {
      const colorClass = `color${colorIndex + 1}`;
      this.rowDiv.classList.add(colorClass);
    }

    this.timeCanvas.draw();
  }

  listFeatures() {
    this.listFOI(FeatureOfInterest.Reversals, ".stats--reversals");
    this.listFOI(FeatureOfInterest.SameSite, ".stats--same-site");
    this.listFOI(FeatureOfInterest.MultipleIntroductions, ".stats--multi-intro");
  }

  listFOI(foi: FeatureOfInterest, selector: string) : void {
    const features = this.moi?.features;
    if (features && features[foi]) {
      const foiHtml = this.rowDiv.querySelector(selector) as HTMLElement;
      foiHtml.classList.remove("hidden");
      const conf = getPercentLabel(features[foi].confidence);
      (foiHtml.querySelector(".stats-conf") as HTMLElement).innerText = `${conf}%`;
    }
  }

  createNodes() {
    const uniqueNodes: {index: number, count: number, tips: number, confidence: number}[] = [];
    this.nodes.forEach(node => {
      let existing = uniqueNodes.find(uniqueNode => uniqueNode.index === node.index);
      if (!existing) {
        existing = Object.assign({}, node, {count: 0});
        uniqueNodes.push(existing);
      }
      existing.count += 1;
    });
    const sortedNodes = uniqueNodes.sort((a, b) => b.count - a.count);

    const totalCount = this.nodes.length;
    const nodeList = this.rowDiv.querySelector(".nodes-list") as HTMLElement;
    for (let i = 0; i < MAX_NODES; i++) {
      const node = sortedNodes[i];
      if (node) {
        const nodeHtml = NODE_DETAIL_TEMPLATE.cloneNode(true) as HTMLElement;
        nodeHtml.addEventListener("mouseover", () => this.updateHoverNode(node.index));
        nodeHtml.addEventListener("mouseout", () => this.updateHoverNode());
        nodeHtml.addEventListener("click", () => this.goToLineages(node.index));
        nodeList.appendChild(nodeHtml);
        nodeHtml.setAttribute("data-node-index", `${node.index}`);
        const prevalence = node.count / totalCount;
        (nodeHtml.querySelector(".node--prevalence") as HTMLElement).innerText = `${getPercentLabel(prevalence)}%`;
        const tips = node.tips;
        (nodeHtml.querySelector(".node--tip-count") as HTMLElement).innerText = `${tips} tip${tips === 1 ? '' : 's'}`;
        const relSize = this.getNodeRelativeSize(tips);
        const iconSize = this.getIconSize(relSize * 100);
        const icon = nodeHtml.querySelector(".node-icon") as HTMLElement;
        icon.style.width = `${iconSize}px`;
        icon.style.height = `${iconSize}px`;
      }
    }

    if (sortedNodes.length > MAX_NODES) {
      const hiddenNodesHtml = this.rowDiv.querySelector(".hidden-nodes-count") as HTMLElement;
      hiddenNodesHtml.classList.remove("hidden");
      const hiddenNodes = sortedNodes.length - MAX_NODES;
      (hiddenNodesHtml.querySelector(".count") as HTMLElement).innerText = `${hiddenNodes}`;
      (hiddenNodesHtml.querySelector(".plural") as HTMLElement).classList.toggle("hidden", hiddenNodes === 1);
    }

    this.topNodes = sortedNodes.slice(0, MAX_NODES);
  }

  getIconSize(pct: number): number {
    const MAX_PCT = 100;
    return ((ICON_MAX - ICON_MIN) * Math.log(pct + 1)) / (Math.log(MAX_PCT)) + ICON_MIN;
  }

  handleMouseenter = () => {
    this.rowDiv.querySelectorAll(".hidden-label").forEach(label => label.classList.remove("hide-details"));
    this.updateHoverRow(this, false);
  }

  handleMouseleave = (event: PointerEvent) => {
    if (event.target === this.rowDiv) {
      this.updateHoverRow(null, false);
      this.rowDiv.querySelectorAll(".hidden-label").forEach(label => label.classList.add("hide-details"));
    }
  }

  handleClick = (e?: Event) => {
    if (this.displayOption === "grid") return;

    if (e) {
      const target = e.target as HTMLElement;
      if (target.closest(".grip") || target.closest("button")) return;
    }

    this.rowDiv.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    this.timeCanvas.resize();
    this.timeCanvas.draw();

    this.updateHoverRow(this, true);

    this.rowDiv.style.backgroundColor = `${this.color}22`;
    this.rowDiv.classList.add("mutation-row-selected")
  }

  collapse() {
    this.rowDiv.classList.remove("expanded");
    this.timeCanvas.resize();
    this.timeCanvas.draw();
  }

  handleKeydown = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      this.handleClick();
    }
  }

  // toggleActive = (e: MouseEvent) => {
  //   e.preventDefault();
  //   this.rowDiv.classList.toggle("inactive");
  //   this.setMutationActive(this.moi.name, this.isActive);
  //   this.updateHoverRow(this, false);
  //   e.stopImmediatePropagation();
  // }

  setDisplayOption(displayOption: DisplayOption) {
    this.displayOption = displayOption;
  }

  updateShiftButtons() {
    if (this.rows.length === 0) return;
    this.prevButton.disabled = this.rows[0] === this;
    this.nextButton.disabled = this.rows[this.rows.length - 1] === this;
  }

  updateRows(rows: MutationRow[]) {
    this.rows = rows;
    this.updateShiftButtons();
  }

}


export const clearMutationRows = ()=>MUTATION_TABLE_BODY.innerHTML = '';

