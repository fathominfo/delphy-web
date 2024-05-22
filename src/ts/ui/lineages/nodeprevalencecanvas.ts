import { BaseTreeSeriesType } from '../../constants';
import { BaseTreeMeanCanvas } from '../basetreemeancanvas';
import { toFullDateString } from '../../pythia/dates';
import { DisplayNode, UNSET, getPercentLabel } from '../common';
import { NodeCallback, NodeDisplay } from './lineagescommon';

const FILL_HIGHLIGHT = 0.9;
const FILL_LOWLIGHT = 0.4;
const STROKE_HIGHLIGHT = 1.0;
const STROKE_LOWLIGHT = 0.2;

export class NodePrevalenceCanvas extends BaseTreeMeanCanvas {
  hoverDateIndex: number = UNSET;
  highlightSeriesIndex: number = UNSET;
  nodeHighlightCallback: NodeCallback;
  startDateDiv: HTMLDivElement;
  endDateDiv: HTMLDivElement;

  readout: HTMLElement;
  readoutDate: HTMLElement;
  readoutSeries: HTMLElement[];
  nodes: NodeDisplay[];

  constructor(nodeDist: BaseTreeSeriesType, nodes: NodeDisplay[],
    minDate: number, maxDate: number, nodeHighlightCallback: NodeCallback) {

    const canvas = document.querySelector("#lineages--prevalence--chart") as HTMLCanvasElement;

    const nodeColors = nodes.map(node => node.color);
    const nodeColorsWithOpa = nodeColors.map(rgb=>`rgba(${ rgb.substring(4, rgb.length - 1)},`);
    const nodeLabels = nodes.map(node => node.label);
    const nodeClassNames = nodes.map(node => node.className);
    super(nodeDist, nodeColorsWithOpa, nodeLabels, nodeClassNames, canvas, minDate, maxDate);

    this.nodes = nodes;

    this.nodeHighlightCallback = nodeHighlightCallback;
    this.canvas.addEventListener('pointermove', e=>this.handleMousemove(e));
    this.canvas.addEventListener('pointerout', ()=>this.handleMouseout());
    this.startDateDiv = document.querySelector("#lineages--prevalence--start-date") as HTMLDivElement;
    this.endDateDiv = document.querySelector("#lineages--prevalence--end-date") as HTMLDivElement;

    this.readout = document.querySelector(".lineages--prevalence--readout") as HTMLElement;
    this.readoutDate = this.readout.querySelector(".prevalence--date") as HTMLElement;
    this.readoutSeries = [];
  }

  setData(nodeDist: BaseTreeSeriesType, nodes: NodeDisplay[], minDate: number, maxDate: number,
    zoomMinDate: number, zoomMaxDate: number) {
    const nodeColors = nodes.map(node => node.color);
    const nodeColorsWithOpa = nodeColors.map(rgb=>`rgba(${ rgb.substring(4, rgb.length - 1)},`);
    const nodeLabels = nodes.map(node => node.label);
    const nodeClassNames = nodes.map(node => node.className);
    super.set(nodeDist, nodeColorsWithOpa, nodeLabels, nodeClassNames, minDate, maxDate);
    this.nodes = nodes;
    /*
    TO DO:
    sometimes possible to get  zoomMinDate that is less than the this.minDate. How?
    [mark 231102]
    */
    this.startIndex = Math.max(Math.floor(zoomMinDate - this.minDate), 0);
    this.endIndex = Math.floor(zoomMaxDate - this.minDate);
    this.startDateDiv.innerHTML = toFullDateString(zoomMinDate);
    this.endDateDiv.innerHTML = toFullDateString(zoomMaxDate);

    this.readout.querySelectorAll(".prevalence--series").forEach(series => series.classList.add("hidden"));
    this.readoutSeries = nodeClassNames.filter(className => className !== "").map(className => {
      return this.readout.querySelector(`.prevalence--series.${className}`) as HTMLElement;
    });
  }

  setDateRange(zoomMinDate: number, zoomMaxDate: number) : void {
    /*
    TO DO:
    sometimes possible to get  zoomMinDate that is less than the this.minDate. How?
    [mark 231102]
    */
    this.startIndex = Math.max(Math.floor(zoomMinDate - this.minDate), 0);
    this.endIndex = Math.floor(zoomMaxDate - this.minDate);
    this.startDateDiv.innerHTML = toFullDateString(zoomMinDate);
    this.endDateDiv.innerHTML = toFullDateString(zoomMaxDate);
  }

  protected draw(): void {
    super.draw();

    this.updateReadout();
  }

  setSeriesColor(i: number) {
    const { ctx, colors } = this;

    if (this.highlightSeriesIndex <= 0) {
      super.setSeriesColor(i);
      return;
    }

    const fillAlpha = i === this.highlightSeriesIndex ? FILL_HIGHLIGHT : FILL_LOWLIGHT;
    const strokeAlpha = i === this.highlightSeriesIndex ? STROKE_HIGHLIGHT : STROKE_LOWLIGHT;
    ctx.fillStyle = `${colors[i]} ${fillAlpha})`;
    ctx.strokeStyle = `${colors[i]} ${strokeAlpha})`;
  }

  updateReadout() {
    const { width, height } = this;

    if (!this.readout) return;

    if (this.hoverDateIndex === UNSET) {
      this.readout.classList.add("hidden");
      return;
    }

    this.readout.classList.remove("hidden");

    // date
    const hoverX = (this.hoverDateIndex - this.startIndex) / (this.endIndex - this.startIndex) * width;
    const dateLabel = toFullDateString(this.minDate + this.hoverDateIndex);
    this.readoutDate.innerText = dateLabel;
    this.readout.style.left = `${hoverX}px`;

    // each series
    for (let i = 0; i < this.seriesCount; i++) {
      if (i === 0) continue;

      const mean = this.averages[i][this.hoverDateIndex];
      const valueLabel = (mean !== undefined) ? `${getPercentLabel(mean)}%` : "";

      const seriesReadout = this.readoutSeries[i - 1];
      seriesReadout.classList.remove("hidden");
      (seriesReadout.querySelector(".value-label") as HTMLElement).innerText = valueLabel;

      const dy = this.averageYPositions[i - 1][this.hoverDateIndex] * height;
      const dot = seriesReadout.querySelector(".dot") as HTMLElement;
      dot.style.top = `${dy}px`;
    }


    // console.log(`updateReadout(${this.hoverDateIndex})`);
  }


  handleMousemove = (e: MouseEvent) => {
    e.preventDefault();
    const hoverX = e.offsetX,
      hoverY = e.offsetY / this.height,
      dateCount = this.endIndex - this.startIndex + 1,
      dateIndex = Math.floor(hoverX / this.width * dateCount) + this.startIndex;
    let seriesIndex = UNSET;
    let toRequest = false;

    if (dateIndex >= 0 && dateIndex <= this.binCount) {
      for (let i = 0; i < this.seriesCount; i++) {
        const upperY = i === 0 ? 0 : this.averageYPositions[i - 1][this.hoverDateIndex],
          lowerY = this.averageYPositions[i][this.hoverDateIndex];
        if (hoverY >= upperY && hoverY < lowerY) {
          seriesIndex = i;
        }
      }
    }

    if (dateIndex !== this.hoverDateIndex) {
      this.hoverDateIndex = dateIndex;
      toRequest = true;
    }

    if (seriesIndex !== this.highlightSeriesIndex) {
      this.highlightSeriesIndex = seriesIndex;

      this.readout.querySelector(".prevalence--series.highlighted")?.classList.remove("highlighted");
      if (this.highlightSeriesIndex > 0) {
        this.readoutSeries[this.highlightSeriesIndex - 1]?.classList.add("highlighted");
      }

      const displayNodes = this.nodes.map(nd => nd.type);
      const displayNode = displayNodes[seriesIndex];
      this.nodeHighlightCallback(displayNode);

      toRequest = true;
    }

    if (toRequest) {
      this.requestDraw();
    }

  }

  handleMouseout = () => {
    if (this.hoverDateIndex !== UNSET) {
      this.hoverDateIndex = UNSET;
      this.highlightSeriesIndex = UNSET;
      this.readout.querySelector(".prevalence--series.highlighted")?.classList.remove("highlighted");
      this.requestDraw();
    }
    this.nodeHighlightCallback(UNSET);
  }


  highlightNode(node: DisplayNode | typeof UNSET) : void {
    const displayNodes = this.nodes.map(nd => nd.type);
    const index = displayNodes.indexOf(node);
    if (index !== this.highlightSeriesIndex) {
      this.highlightSeriesIndex = index;
      this.readout.querySelector(".prevalence--series.highlighted")?.classList.remove("highlighted");
      if (this.highlightSeriesIndex > 0) {
        this.readoutSeries[this.highlightSeriesIndex]?.classList.add("highlighted");
      }
      this.requestDraw();
    }
  }



}