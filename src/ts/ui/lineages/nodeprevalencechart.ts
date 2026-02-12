import { BaseTreeSeriesType } from '../../constants';
import { DateScale, UNSET, getNiceDateInterval,
  setDateLabel, DATE_LABEL_WIDTH_PX, AxisLabel } from '../common';
import { DisplayNode } from '../displaynode';
import { calcHPD, HPD_MAX_INDEX, HPD_MIN_INDEX, MEDIAN_INDEX } from '../distribution';
import { HoverCallback } from './lineagescommon';

const TARGET = 200;
const TOO_MANY = TARGET * 2;

const STROKE_WIDTH = 2;

const CONTAINER = document.querySelector("#lineages--prevalence--chart") as SVGElement;
const TREND_TEMPLATE = CONTAINER.querySelector("g.group") as SVGGElement;


export class SVGPrevalenceMeanGroup {
  node: DisplayNode;
  g: SVGGElement;
  shape: SVGPathElement;
  trend: SVGLineElement;

  constructor(node:DisplayNode) {
    this.node = node;
    this.g = TREND_TEMPLATE.cloneNode(true) as SVGGElement;
    this.g.classList.add(node.className);
    this.shape = this.g.querySelector(".shape") as SVGPathElement;
    this.trend = this.g.querySelector(".trend") as SVGLineElement;
    CONTAINER.appendChild(this.g);
  }

  toggleClass(className: string, on=true) {
    this.g.classList.toggle(className, on);
  }
}



export class NodePrevalenceChart {
  hoverDate: number = UNSET;
  highlightDisplayNode: DisplayNode | null = null;
  nodeHighlightCallback: HoverCallback;
  nodes: DisplayNode[] = [];
  svg: SVGElement;
  dateHoverContainer: HTMLDivElement;
  dateHoverDiv: HTMLDivElement;
  svgGroups: {[_:string] : SVGPrevalenceMeanGroup} = {};
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



  constructor(nodeHighlightCallback: HoverCallback) {
    const container = document.querySelector("#lineages--prevalence") as HTMLDivElement;
    this.svg = container.querySelector("#lineages--prevalence--chart") as SVGElement;
    this.dateHoverContainer = container.querySelector(".tracker-dates") as HTMLDivElement;
    this.dateHoverDiv = this.dateHoverContainer.querySelector(".tracker-date") as HTMLDivElement;
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


  setData(nodeDist: BaseTreeSeriesType, nodes: DisplayNode[], minDate: number, maxDate: number) {
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
    // let displayNode: DisplayNode = DisplayNode.UNSET;
    // if (group.classList.contains("root")) {
    //   displayNode = DisplayNode.root;
    // } else if (group.classList.contains("mrca")) {
    //   displayNode = DisplayNode.mrca;
    // } else if (group.classList.contains("nodeA")) {
    //   displayNode = DisplayNode.nodeA;
    // } else if (group.classList.contains("nodeB")) {
    //   displayNode = DisplayNode.nodeB;
    // }

    const hoverX = e.offsetX,
      xPct = hoverX / this.width,
      date = this.minDate + xPct * (this.maxDate - this.minDate);

    let requesting = false;
    if (date !== this.hoverDate) {
      this.hoverDate = date;
      requesting = true;
    }

    // if (displayNode !== this.highlightDisplayNode) {
    //   this.highlightDisplayNode = displayNode;
    //   requesting = true;
    // }

    // if (requesting) {
    //   this.nodeHighlightCallback(displayNode, date, null);
    // }


  }

  handleMouseout = () => {
    if (this.hoverDate !== UNSET) {
      this.hoverDate = UNSET;
      this.highlightDisplayNode = null;
      this.requestDraw();
    }
    this.nodeHighlightCallback(null, UNSET, null);
  }


  highlightNode(node: DisplayNode | null, date:number) : void {
    requestAnimationFrame(()=>{
      if (node === null) {
        Object.values(this.svgGroups).forEach((group)=>{
          group.toggleClass("matching", false);
          group.toggleClass("unmatching", false);
        });
      } else {
        Object.values(this.svgGroups).forEach((group)=>{
          group.toggleClass("matching", node === group.node);
          group.toggleClass("unmatching", node !== group.node);
        });
      }
      if (date === UNSET) {
        this.dateHoverContainer.classList.remove("active");
      } else {
        setDateLabel(date, this.dateHoverDiv);
        const pct = 100 * (date - this.minDate) / (this.maxDate - this.minDate);
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
    const { nodes, svgGroups } = this;
    const dataMapping: {[_:string]: boolean} = {};
    Object.values(nodes).forEach((nd, i)=>{
      const className = nd.className;
      const fillCoords: string = this.getMeanAreaCoords(i);
      const strokeCoords: string = this.getMeanTopCoords(i);
      dataMapping[className] = true;
      let svgGroup = svgGroups[className];
      if (svgGroup === undefined) {
        svgGroup = new SVGPrevalenceMeanGroup(nd);
        svgGroups[className] = svgGroup;
      }
      svgGroup.toggleClass("hidden", false);
      svgGroup.shape.setAttribute("d", fillCoords);
      svgGroup.trend.setAttribute("d", strokeCoords);
    });
    /* hide any svgs for nodes that are not in the current list */
    Object.entries(svgGroups).forEach(([nodeType, group])=>{
      if (dataMapping[nodeType] === undefined) {
        group.toggleClass("hidden", true);
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
    const { nodes, svgGroups } = this;
    const dataMapping: {[_:string]: boolean} = {};
    Object.values(nodes).forEach((nd, i)=>{
      const className = nd.className;
      const fillCoords: string = this.getHPDAreaCoords(i);
      const strokeCoords: string = this.getMedianCoords(i);
      dataMapping[className] = true;
      let svgGroup = svgGroups[className];
      if (svgGroup === undefined) {
        svgGroup = new SVGPrevalenceMeanGroup(nd);
        svgGroups[className] = svgGroup;
      }
      svgGroup.toggleClass("hidden", false);
      svgGroup.shape.setAttribute("d", fillCoords);
      svgGroup.trend.setAttribute("d", strokeCoords);
    });
    /* hide any svgs for nodes that are not in the current list */
    Object.entries(svgGroups).forEach(([nodeType, group])=>{
      if (dataMapping[nodeType] === undefined) {
        group.toggleClass("hidden", true);
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