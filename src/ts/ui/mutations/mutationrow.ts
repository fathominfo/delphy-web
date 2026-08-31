import { NodeData, UniqueNodeData, MutationData, DisplayOption, MUTATION_SERIES_COLORS, RowFunctionType, MutationComplementFunctionType } from './mutationscommon';
import { getMutationNameParts } from '../../constants';
import { DistributionSeries, TimeDistributionCanvas } from '../timedistributioncanvas';
import { MutationOfInterest, FeatureOfInterest } from '../../pythia/mutationsofinterest';
import { UNSET, getPercentLabel } from '../common';


const REVERSAL_SELECTOR = ".stats--reversals";
const SAME_SITE_SELECTOR = ".stats--same-site";
const RECURRENCE_SELECTOR = ".stats--multi-intro";



export type NodeFunctionType = (nodeIndex?: number) => void;


const maybeTableBody = document.querySelector("#mutation-rows");
if (!maybeTableBody) {
  throw new Error("mutations.html doesn't have the container for the mutation rows!");
}
const MUTATION_TABLE_BODY = <HTMLDivElement>maybeTableBody;
const maybeRow = MUTATION_TABLE_BODY.querySelector(".mutation-row");
if (!maybeRow) {
  throw new Error("mutations.html doesn't have the mutation row template!");
}
const MUTATION_ROW_TEMPLATE = <HTMLDivElement>maybeRow;
MUTATION_ROW_TEMPLATE.remove();

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
  uniqueNodes: UniqueNodeData[];
  removeRow: (row: MutationRow) => void;
  getNodeRelativeSize: (tipCount: number) => number;
  updateHoverRow: RowFunctionType;
  updateHoverNode: NodeFunctionType;
  goToLineages: NodeFunctionType;
  shiftRow: (row: MutationRow, direction: number) => void;
  setMutationActive: (name: string, active: boolean) => void;
  minDate: number;
  maxDate: number;
  isActive: boolean;


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
    setMutationActive: (name: string, active: boolean) => void,
    addRelatedMutations: MutationComplementFunctionType,
    // minDate: number, maxDate: number,
    displayOption: DisplayOption,
    isApobecEnabled: boolean) {

    const moi = mutationData.moi;
    const mutation = moi.mutation;
    this.moi = moi;
    this.color = mutationData.color;
    this.nodes = mutationData.nodes;
    this.uniqueNodes = [];
    this.setUniqueNodes();
    // const {name, confidence} = moi;
    // const nodeList = nodes.map(n=>`${n}`).join(',');
    // console.log(`Mutation of Interest "${name}" confidence: ${confidence} mcc nodes: ${nodeList}`)
    // console.log(`Mutation of Interest "${name}" confidence: ${confidence} mcc nodes: ${mutationData.nodes.length}}`)
    this.rowDiv = <HTMLDivElement>MUTATION_ROW_TEMPLATE.cloneNode(true);
    this.rowDiv.setAttribute("data-mutation", moi.name);
    MUTATION_TABLE_BODY.appendChild(this.rowDiv);

    this.minDate = mutationData.minDate;
    this.maxDate = mutationData.maxDate;
    this.rowDiv.addEventListener("pointerenter", () => this.handleMouseenter());
    // this.rowDiv.addEventListener("pointermove", e => this.handleMousemove(e));
    this.rowDiv.addEventListener("pointerleave", e => this.handleMouseleave(e), true);
    this.rowDiv.addEventListener("click", e => this.handleClick(e));
    this.rowDiv.addEventListener("keydown", e => this.handleKeydown(e));

    this.removeRow = removeRow;
    const dismissButton = this.rowDiv.querySelector(".mutation-dismiss") as HTMLButtonElement;
    dismissButton.addEventListener("click", e => {
      this.removeRow(this);
      e.stopImmediatePropagation();
    });

    this.isActive = false;
    this.setMutationActive = setMutationActive;
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

    const nameDiv: HTMLDivElement | null = this.rowDiv.querySelector(".mutation-name");
    if (!nameDiv) {
      throw new Error("mutation row has nowhere for the name to go");
    }
    const nameParts = getMutationNameParts(mutation);
    (nameDiv.querySelector(".allele-from") as HTMLElement).innerText = `${nameParts[0]}`;
    (nameDiv.querySelector(".site") as HTMLElement).innerText = `${nameParts[1]}`;
    (nameDiv.querySelector(".allele-to") as HTMLElement).innerText = `${nameParts[2]}`;

    this.rowDiv.classList.toggle('is-apobec', isApobecEnabled && moi.isApobec >= moi.treeCount * .5);
    (this.rowDiv.querySelector(".stats--confidence .mutation-confidence.list strong") as HTMLElement).innerHTML = `${getPercentLabel(moi.confidence)}%`;
    (this.rowDiv.querySelector(".stats--confidence .mutation-confidence.grid strong") as HTMLElement).innerHTML = `${getPercentLabel(moi.confidence)}%`;

    const reversalHandler = (event: MouseEvent) => {
      event.stopImmediatePropagation();
      addRelatedMutations(mutation, FeatureOfInterest.Reversals);
    };

    const sameSiteHandler = (event: MouseEvent) => {
      event.stopImmediatePropagation();
      addRelatedMutations(mutation, FeatureOfInterest.SameSite);
    };

    (this.rowDiv.querySelector(REVERSAL_SELECTOR) as HTMLSpanElement).addEventListener("click", reversalHandler);
    (this.rowDiv.querySelector(SAME_SITE_SELECTOR) as HTMLSpanElement).addEventListener("click", sameSiteHandler);

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
    this.listFOI(FeatureOfInterest.Reversals, REVERSAL_SELECTOR);
    this.listFOI(FeatureOfInterest.SameSite, SAME_SITE_SELECTOR);
    this.listFOI(FeatureOfInterest.MultipleIntroductions, RECURRENCE_SELECTOR);
  }

  listFOI(foi: FeatureOfInterest, selector: string): void {
    const features = this.moi?.features;
    if (features && features[foi]) {
      const foiHtml = this.rowDiv.querySelector(selector) as HTMLElement;
      foiHtml.classList.add("active");
      const conf = getPercentLabel(features[foi].confidence);
      (foiHtml.querySelector(".stats-conf") as HTMLElement).innerText = `${conf}%`;
    }
  }


  flash() : void {
    const style = this.rowDiv.style;
    const wasColor = style.backgroundColor;
    style.backgroundColor = `${this.color}55`;
    setTimeout(() => {
      style.backgroundColor = wasColor;
      this.rowDiv.classList.add("slow-fade");
      setTimeout(() => this.rowDiv.classList.remove("slow-fade"), 1000);
    }, 300);


  }


  getIconSize(pct: number): number {
    const MAX_PCT = 100;
    return ((ICON_MAX - ICON_MIN) * Math.log(pct + 1)) / (Math.log(MAX_PCT)) + ICON_MIN;
  }

  handleMouseenter = () => {
    const hasActiveMutation = this.rows.some(row => row.isActive === true);
    if (hasActiveMutation) return;
    this.updateHoverRow(this);
  }

  handleMouseleave = (event: PointerEvent) => {
    const hasActiveMutation = this.rows.some(row => row.isActive === true);
    if (hasActiveMutation) return;
    if (event.target === this.rowDiv) {
      this.updateHoverRow(this.isActive ? this : null);
    }
  }

  handleClick = (e?: MouseEvent) => {
    if (this.displayOption === "grid") return;

    if (e) {
      const target = e.target as HTMLElement;
      if (target.closest(".grip") || target.closest("button")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    this.toggleActive();
  }

  handleKeydown = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      this.handleClick();
    }
  }

  toggleActive(active?: boolean) {
    const wasActive = active === undefined ? this.isActive : !active;
    // turn all the other rows off
    this.rows.forEach(row => {
      row.isActive = false;
      row.rowDiv.classList.remove("mutation-row-selected");
      row.rowDiv.style.backgroundColor = "#FAFAFA";
    })
    this.isActive = !wasActive;
    this.updateHoverRow(this.isActive ? this : null);
    this.rowDiv.classList.toggle("mutation-row-selected", this.isActive);
    this.rowDiv.style.backgroundColor = this.isActive ? `${this.color}22` : "#FAFAFA";
  }

  setUniqueNodes() {
    this.nodes.forEach(node => {
      let existing = this.uniqueNodes.find(uniqueNode => uniqueNode.index === node.index);
      if (!existing) {
        existing = Object.assign({}, node, { count: 0 });
        this.uniqueNodes.push(existing);
      }
      existing.count += 1;
    });
  }

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


export const clearMutationRows = () => MUTATION_TABLE_BODY.innerHTML = '';

