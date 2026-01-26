import { BaseTreeSeriesType } from '../../constants';
import { DateTokenIndex, MONTHS_SHORT, toDateTokens } from '../../pythia/dates';
import { DateScale, DisplayNode, UNSET, getNiceDateInterval, getNodeClassName } from '../common';
import { calcHPD, HPD_MAX_INDEX, HPD_MIN_INDEX, MEDIAN_INDEX } from '../distribution';
import { NodeCallback, NodeDisplay } from './lineagescommon';

const TARGET = 200;
const TOO_MANY = TARGET * 2;

const STROKE_WIDTH = 2;
const DATE_LABEL_WIDTH_PX = 35;

export class SVGPrevalenceMeanGroup {
  node: DisplayNode;
  g: SVGGElement;
  shape: SVGPathElement;
  trend: SVGLineElement;

  constructor(node:DisplayNode, container:SVGElement) {
    this.node = node;
    const nodeName = getNodeClassName(node);
    this.g = container.querySelector(`.group.${nodeName}`) as SVGGElement;
    this.shape = this.g.querySelector(".shape") as SVGPathElement;
    this.trend = this.g.querySelector(".trend") as SVGLineElement;
  }

  toggleClass(className: string, on=true) {
    this.g.classList.toggle(className, on);
  }
}


type AxisLabel = {
  div: HTMLDivElement,
  left: number
};



export class NodePrevalenceChart {
  hoverDateIndex: number = UNSET;
  highlightDisplayNode: DisplayNode = UNSET;
  nodeHighlightCallback: NodeCallback;
  nodes: NodeDisplay[];
  svg: SVGElement;
  dateHoverContainer: HTMLDivElement;
  dateHoverDiv: HTMLDivElement;
  svgMeanGroups: SVGPrevalenceMeanGroup[];
  dateAxis: HTMLDivElement;
  referenceDateTemplate: HTMLDivElement;
  dateTemplate: HTMLDivElement;
  dateAxisEntries: AxisLabel[] = [];
  showingMean = true;

  dist: BaseTreeSeriesType = []; // number[][][], tree, series, date
  treeCount: number = UNSET;
  seriesCount: number = UNSET;
  binCount: number = UNSET;


  width: number = UNSET;
  height: number = UNSET;
  minDate: number = UNSET;
  maxDate: number = UNSET;

  averages: number[][] = []; // series, date
  averageYPositions: number[][] = []; // pct of height for stacked chart
  medianAndHPD: number[][][] = [];



  constructor(nodeHighlightCallback: NodeCallback) {
    const container = document.querySelector("#lineages--prevalence") as HTMLDivElement;
    this.svg = container.querySelector("#lineages--prevalence--chart") as SVGElement;
    this.dateHoverContainer = container.querySelector(".tracker-dates") as HTMLDivElement;
    this.dateHoverDiv = this.dateHoverContainer.querySelector(".tracker-date") as HTMLDivElement;
    this.svgMeanGroups = [];
    [DisplayNode.root, DisplayNode.mrca, DisplayNode.nodeA, DisplayNode.nodeB].forEach(nodeType=>{
      this.svgMeanGroups[nodeType] = new SVGPrevalenceMeanGroup(nodeType, this.svg);
    });
    this.dateAxis = container.querySelector(".axis-dates") as HTMLDivElement;
    this.referenceDateTemplate = this.dateAxis.querySelector(".axis-date.reference") as HTMLDivElement;
    this.referenceDateTemplate.remove();
    this.dateTemplate = container.querySelector(".axis-date.marker") as HTMLDivElement;
    this.dateTemplate.remove();

    const meanVsDistForm = container.querySelector("#prevalence-display-opt") as HTMLFormElement;
    meanVsDistForm.addEventListener("change", ()=>{
      const formData = new FormData(meanVsDistForm);
      const option = formData.get("prevalence-display");
      this.showingMean = option === "mean";
      this.svg.classList.toggle("median", !this.showingMean);
      this.requestDraw();
    });


    this.nodes = [];
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.svg.addEventListener('pointermove', e=>this.handleMousemove(e));
    this.svg.addEventListener('pointerout', ()=>this.handleMouseout());
  }



  resize():void {
    const parent = this.svg.parentElement as HTMLDivElement;
    const {offsetWidth, offsetHeight} = parent;
    this.width = offsetWidth;
    this.height = offsetHeight - STROKE_WIDTH;
    this.svg.setAttribute("width", `${offsetWidth}`);
    this.svg.setAttribute("height", `${offsetHeight}`);
    this.svg.setAttribute("viewBox", `0 0 ${offsetWidth} ${offsetHeight}`);
  }


  setData(nodeDist: BaseTreeSeriesType, nodes: NodeDisplay[], minDate: number, maxDate: number) {
    this.dist = nodeDist; // tree, series, day
    this.treeCount = nodeDist.length;
    this.seriesCount = nodeDist[0].length;
    this.binCount = nodeDist[0][0].length;

    if (this.binCount > TOO_MANY) {
      console.debug(`Surprise! tree node pop model data spans more than ${TOO_MANY}: ${this.binCount}`);
    }
    if (Number.isFinite(minDate) && Number.isFinite(maxDate)) {
      if (minDate !== this.minDate || maxDate !== this.maxDate) {
        this.minDate = minDate;
        this.maxDate = maxDate;
        requestAnimationFrame(()=>this.setAxisDates());

      }
    }
    this.averageYPositions.length = 0;
    this.nodes = nodes;
    this.calculate();
  }



  /*
  For means:
    we want to collapse our incoming data from [tree][series][day]
    to [series][day] = average for all trees
  For distributions:
    we want [series][day][ 2.5 hpd, 97.5 hpd, median ]
  */
  calculate() : void {

    const { dist, seriesCount, treeCount } = this;

    const drawnCount = this.binCount;

    const averages: number[][] = new Array(seriesCount);
    const distributions: number[][][] = new Array(seriesCount);
    let d: number;
    let tot: number;
    let t: number;
    let v: number;
    const acrossTrees: number[] = new Array(treeCount);

    for (let s = 0; s < seriesCount; s++) {
      // for each tree, daily values for this series
      averages[s] = Array(drawnCount);
      distributions[s] = Array(drawnCount);
      for (d = 0; d < drawnCount; d++) {
        tot = 0;
        for (t = 0; t < treeCount; t++) {
          v = dist[t][s][d];
          tot += v;
          acrossTrees[t] = v;
        }
        averages[s][d] = tot / treeCount;
        distributions[s][d] = calcHPD(acrossTrees);
      }
    }
    /*
    calculate the stacked positions of the means
    */
    this.averageYPositions = averages.map(()=>Array(drawnCount));
    for (let d = 0; d < drawnCount; d++) {
      let y = 0;
      for (let s = 0; s < this.seriesCount; s++) {
        y += averages[s][d];
        this.averageYPositions[s][d] = y;
      }
    }
    this.averages = averages;
    this.medianAndHPD = distributions;
  }




  handleMousemove = (e: MouseEvent) => {
    e.preventDefault();
    const actualTarget = e.target as SVGPathElement; // either .shape or .trend
    const group = actualTarget.parentNode as SVGGElement;
    let displayNode: DisplayNode = DisplayNode.UNSET;
    if (group.classList.contains("root")) {
      displayNode = DisplayNode.root;
    } else if (group.classList.contains("mrca")) {
      displayNode = DisplayNode.mrca;
    } else if (group.classList.contains("nodeA")) {
      displayNode = DisplayNode.nodeA;
    } else if (group.classList.contains("nodeB")) {
      displayNode = DisplayNode.nodeB;
    }

    const hoverX = e.offsetX,
      dateCount = Math.floor(this.maxDate - this.minDate + 1),
      dateIndex = Math.floor(hoverX / this.width * dateCount);

    let requesting = false;
    if (dateIndex !== this.hoverDateIndex) {
      this.hoverDateIndex = dateIndex;
      requesting = true;
    }

    if (displayNode !== this.highlightDisplayNode) {
      this.highlightDisplayNode = displayNode;
      requesting = true;
    }

    if (requesting) {
      this.nodeHighlightCallback(displayNode, dateIndex, null);
    }


  }

  handleMouseout = () => {
    if (this.hoverDateIndex !== UNSET) {
      this.hoverDateIndex = UNSET;
      this.highlightDisplayNode = UNSET;
      this.requestDraw();
    }
    this.nodeHighlightCallback(UNSET, UNSET, null);
  }


  highlightNode(node: DisplayNode, dateIndex:number) : void {
    requestAnimationFrame(()=>{
      if (node === UNSET) {
        this.svgMeanGroups.forEach((group)=>{
          group.toggleClass("matching", false);
          group.toggleClass("unmatching", false);
        });
      } else {
        this.svgMeanGroups.forEach((group, nodeType)=>{
          group.toggleClass("matching", node === nodeType);
          group.toggleClass("unmatching", node !== nodeType);
        });
      }
      if (dateIndex === UNSET) {
        this.dateHoverContainer.classList.remove("active");
      } else {
        const tokens = toDateTokens(dateIndex);
        const month = tokens[DateTokenIndex.month];
        const pct = 100 * dateIndex / (this.maxDate - this.minDate);
        (this.dateHoverDiv.querySelector(".day") as HTMLSpanElement).textContent = `${tokens[DateTokenIndex.day]}`;
        (this.dateHoverDiv.querySelector(".year") as HTMLSpanElement).textContent = `${MONTHS_SHORT[month]}`;
        (this.dateHoverDiv.querySelector(".year") as HTMLSpanElement).textContent = `${tokens[DateTokenIndex.year]}`;
        this.dateHoverDiv.style.left = `${pct}%`;
        this.dateHoverContainer.classList.add("active");
        // hide overlapping labels
        const widthInPct = DATE_LABEL_WIDTH_PX / this.width * 100;
        let isOverlapping = false;
        this.dateAxisEntries.forEach(({div, left})=>{
          isOverlapping = left + widthInPct > pct && left < pct + widthInPct;
          div.classList.toggle("off", isOverlapping);
        });


      }

    });
  }


  xForInverse(x: number): number {
    const rescaled = x / this.width;
    return rescaled * (this.maxDate - this.minDate) + this.minDate;
  }

  requestDraw(): void {
    requestAnimationFrame(()=>this.drawChart());
  }

  drawChart() : void {
    if (this.showingMean) {
      this.drawMeansChart();
    } else {
      this.drawMedianAndHPD();
    }
  }


  drawMeansChart() : void {
    const { nodes, svgMeanGroups: svgGroups } = this;
    const dataMapping: number[] = [];
    nodes.forEach((nd, i)=>dataMapping[nd.type] = i);
    svgGroups.forEach((group, nodeType)=>{
      if (dataMapping[nodeType] === undefined) {
        group.toggleClass("hidden", true);
      } else {
        const dataIndex = dataMapping[nodeType];
        group.toggleClass("hidden", false);
        const fillCoords = this.getMeanAreaCoords(dataIndex);
        const strokeCoords = this.getMeanTopCoords(dataIndex);
        group.shape.setAttribute("d", fillCoords);
        group.trend.setAttribute("d", strokeCoords);
      }
    });
  }

  getMeanAreaCoords(index: number): string {
    const { width, height, averageYPositions } = this;
    const prevIndex = index - 1;

    // set color
    /* trace the top */
    let startY = 0,
      ys: number[];
    let path = '';
    const L: number = averageYPositions[index].length;
    if (prevIndex < 0) {
      path = `M0 0 L ${width} 0`;
    } else {
      ys = averageYPositions[prevIndex];
      startY = ys[0] * height + STROKE_WIDTH / 2;
      path = `M0 ${startY}`;
      for (let d = 1; d < L; d++) {
        const x = d / (L-1) * width,
          y = ys[d] * height + STROKE_WIDTH / 2;
        path += ` ${x} ${y}`;
      }
    }

    /* trace the bottom */
    ys = averageYPositions[index];
    for (let d = L - 1; d >= 0; d--) {
      const x = d / (L-1) * width,
        y = ys[d] * height + STROKE_WIDTH;
      path += ` ${x} ${y}`;
    }
    // console.log(ctx.fillStyle, ys);
    path += ` 0 ${startY}`;
    return path;
  }


  getMeanTopCoords(index: number): string {
    const { width, height, averageYPositions } = this;
    const prevIndex = index - 1;

    // set color
    /* trace the top */
    let startY = 0,
      ys: number[];
    let path = '';
    const L: number = averageYPositions[index].length;
    if (prevIndex < 0) {
      path = `M0 0 L ${width} 0`;
    } else {
      ys = averageYPositions[prevIndex];
      startY = ys[0] * height + STROKE_WIDTH / 2;
      path = `M0 ${startY}`;
      for (let d = 1; d < L; d++) {
        const x = d / (L-1) * width,
          y = ys[d] * height + STROKE_WIDTH / 2;
        path += ` ${x} ${y}`;
      }
    }
    return path;
  }


  drawMedianAndHPD() : void {
    const { nodes, svgMeanGroups: svgGroups } = this;
    const dataMapping: number[] = [];
    nodes.forEach((nd, i)=>dataMapping[nd.type] = i);
    svgGroups.forEach((group, nodeType)=>{
      if (dataMapping[nodeType] === undefined) {
        group.toggleClass("hidden", true);
      } else {
        const dataIndex = dataMapping[nodeType];
        group.toggleClass("hidden", false);
        const fillCoords = this.getHPDAreaCoords(dataIndex);
        const strokeCoords = this.getMedianCoords(dataIndex);
        group.shape.setAttribute("d", fillCoords);
        group.trend.setAttribute("d", strokeCoords);
      }
    });
  }


  getHPDAreaCoords(index: number): string {
    const { width, height, medianAndHPD } = this;
    const hpdData = medianAndHPD[index];
    const L: number = hpdData.length;
    let path = '';
    let i: number;
    let hpd: number;
    let x: number;
    let y: number;
    let first = true;
    let firstY = UNSET;
    /* trace the min hpd */
    for (i = 0; i < L; i++) {
      hpd = hpdData[i][HPD_MIN_INDEX];
      x = i / (L-1) * width;
      y = (1 - hpd) * height + STROKE_WIDTH / 2;
      if (first) {
        path = `M${x} ${y} L`;
        firstY = y;
      } else {
        path += ` ${x} ${y}`;
      }
      first = false;
    }
    while (i > 0) {
      i--;
      hpd = hpdData[i][HPD_MAX_INDEX];
      x = i / (L-1) * width;
      y = (1 - hpd) * height + STROKE_WIDTH / 2;
      path += ` ${x} ${y}`;
    }
    /* trace the max hpd back */
    path += ` 0 ${firstY}`;
    return path;
  }


  getMedianCoords(index: number): string {
    const { width, height, medianAndHPD } = this;
    const hpdData = medianAndHPD[index];
    const L: number = hpdData.length;
    let path = '';
    let i: number;
    let median: number;
    let nextMedian: number;
    let x: number;
    let y: number;
    let first = true;
    /* trace the min hpd */
    for (i = 0; i < L; i++) {
      median = hpdData[i][MEDIAN_INDEX];
      nextMedian = hpdData[i+1]?.[MEDIAN_INDEX];
      if (median !== 0 || nextMedian !== 0) {
        x = i / (L-1) * width;
        y = (1 - median) * height + STROKE_WIDTH / 2;
        if (first) {
          path = `M${x} ${y} L`;
          first = false;
        } else {
          path += ` ${x} ${y}`;
        }
      }
    }
    return path;
  }




  setAxisDates() {
    const { scale, entries } = getNiceDateInterval(this.minDate, this.maxDate);
    this.dateAxis.innerHTML = '';
    entries.pop(); // don't show the last date here
    this.dateAxisEntries.length = 0;
    entries.forEach(labelData=>{
      let div: HTMLDivElement;
      let label = '';
      if (scale === DateScale.year) {
        label = labelData.yearLabel;
        div = this.dateTemplate.cloneNode(true) as HTMLDivElement;
      }  else {
        if (labelData.isNewYear) {
          div = this.referenceDateTemplate.cloneNode(true) as HTMLDivElement;
          (div.querySelector(".year") as HTMLSpanElement).textContent = labelData.yearLabel;
        } else {
          div = this.dateTemplate.cloneNode(true) as HTMLDivElement;
        }
        if (scale === DateScale.month) {
          label = labelData.monthLabel;
        } else if (labelData.isNewMonth) {
          label = `${labelData.monthLabel} ${labelData.dateLabel}`;
        } else {
          label = labelData.dateLabel;
        }
      }
      (div.querySelector(".cal .month") as HTMLSpanElement).textContent = label;
      const left = 100 * labelData.percent;
      div.style.left = `${left}%`;
      this.dateAxis.appendChild(div);
      this.dateAxisEntries.push({div, left});
    })
  }

}