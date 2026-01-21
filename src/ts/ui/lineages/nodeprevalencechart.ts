import { BaseTreeSeriesType } from '../../constants';
import { DisplayNode, UNSET, getNiceDateInterval, getNodeClassName, getNodeTypeName, getPercentLabel } from '../common';
import { NodeCallback, NodeDisplay } from './lineagescommon';

const TARGET = 200;
const TOO_MANY = TARGET * 2;

const STROKE_WIDTH = 2;

export class SVGPrevalenceGroup {
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






export class NodePrevalenceChart {
  hoverDateIndex: number = UNSET;
  highlightSeriesIndex: number = UNSET;
  nodeHighlightCallback: NodeCallback;
  nodes: NodeDisplay[];
  svg: SVGElement;
  svgGroups: SVGPrevalenceGroup[];
  dateAxis: HTMLDivElement;
  referenceDateTemplate: HTMLDivElement;
  dateTemplate: HTMLDivElement;

  dist: BaseTreeSeriesType = []; // number[][][], tree, series, date
  treeCount: number = UNSET;
  seriesCount: number = UNSET;
  binCount: number = UNSET;


  width: number = UNSET;
  height: number = UNSET;
  minDate: number = UNSET;
  maxDate: number = UNSET;

  averages: number[][] = []; // series, date
  averageYPositions: number[][] = []; // pct of height


  constructor(nodeHighlightCallback: NodeCallback) {
    const container = document.querySelector("#lineages--prevalence") as HTMLDivElement;
    this.svg = container.querySelector("#lineages--prevalence--chart") as SVGElement;
    this.svgGroups = [];
    [DisplayNode.root, DisplayNode.mrca, DisplayNode.nodeA, DisplayNode.nodeB].forEach(nodeType=>{
      this.svgGroups[nodeType] = new SVGPrevalenceGroup(nodeType, this.svg);
    });
    this.dateAxis = container.querySelector(".axis-dates") as HTMLDivElement;
    this.referenceDateTemplate = this.dateAxis.querySelector(".axis-date.reference") as HTMLDivElement;
    this.referenceDateTemplate.remove();
    this.dateTemplate = container.querySelector(".axis-date.marker") as HTMLDivElement;
    this.dateTemplate.remove();

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



  /**
  we want to collapse our incoming data from [tree][series][day]
  to [series][day] = average for all trees
  */
  calculate() : void {

    const { dist, seriesCount, treeCount } = this;

    const drawnCount = this.binCount;

    const averages: number[][] = new Array(seriesCount);
    let d, tot, dd, t, v;

    for (let s = 0; s < seriesCount; s++) {
      // for each tree, daily values for this series
      averages[s] = Array(drawnCount);
      for (d = 0; d < drawnCount; d++) {
        tot = 0;
        for (t = 0; t < treeCount; t++) {
          v = dist[t][s][d];
          if (isNaN(v)) {
            console.log(s, d, dd, t, v);
          }
          tot += v;
        }
        if (isNaN(tot)) {
          console.log(s, d, tot, drawnCount, treeCount)
        }
        averages[s][d] = tot / treeCount;
      }
    }
    this.averageYPositions = averages.map(()=>Array(drawnCount));
    for (let d = 0; d < drawnCount; d++) {
      let y = 0;
      for (let s = 0; s < this.seriesCount; s++) {
        y += averages[s][d];
        this.averageYPositions[s][d] = y;
      }
    }
    this.averages = averages;
  }




  handleMousemove = (e: MouseEvent) => {
    e.preventDefault();
    const hoverX = e.offsetX,
      hoverY = e.offsetY / this.height,
      dateCount = Math.floor(this.maxDate - this.minDate + 1),
      dateIndex = Math.floor(hoverX / this.width * dateCount);
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
      this.requestDraw();
    }
    this.nodeHighlightCallback(UNSET);
  }


  highlightNode(node: DisplayNode) : void {
    requestAnimationFrame(()=>{
      if (node === UNSET) {
        this.svgGroups.forEach((group)=>{
          group.toggleClass("matching", false);
          group.toggleClass("unmatching", false);
        });
      } else {
        this.svgGroups.forEach((group, nodeType)=>{
          group.toggleClass("matching", node === nodeType);
          group.toggleClass("unmatching", node !== nodeType);
        });
      }
    });
  }

  getFillCoords(index: number): string {
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
        if (isNaN(x) || isNaN(y)) {
          console.log(x, y, ys[d], d);
          const x1 = d / (L-1) * width,
            y1 = ys[d] * height + STROKE_WIDTH / 2;

        }
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


  getStrokeCoords(index: number): string {
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


  xForInverse(x: number): number {
    const rescaled = x / this.width;
    return rescaled * (this.maxDate - this.minDate) + this.minDate;
  }

  requestDraw(): void {
    requestAnimationFrame(()=>this.drawChart());
  }

  protected drawChart() : void {
    const { nodes, averageYPositions, svgGroups } = this;
    const dataMapping: number[] = [];
    nodes.forEach((nd, i)=>dataMapping[nd.type] = i);
    svgGroups.forEach((group, nodeType)=>{
      if (dataMapping[nodeType] === undefined) {
        group.toggleClass("hidden", true);
      } else {
        const dataIndex = dataMapping[nodeType];
        group.toggleClass("hidden", false);
        const fillCoords = this.getFillCoords(dataIndex);
        const strokeCoords = this.getStrokeCoords(dataIndex);
        group.shape.setAttribute("d", fillCoords);
        group.trend.setAttribute("d", strokeCoords);
      }
    });
  }


  setAxisDates() {
    const labels = getNiceDateInterval(this.minDate, this.maxDate);
    this.dateAxis.innerHTML = '';
    labels.forEach(labelData=>{
      let div: HTMLDivElement;
      if (labelData.subLabel !== '') {
        div = this.referenceDateTemplate.cloneNode(true) as HTMLDivElement;
        (div.querySelector(".year") as HTMLSpanElement).textContent = labelData.subLabel;
      } else {
        div = this.dateTemplate.cloneNode(true) as HTMLDivElement;
      }
      (div.querySelector(".cal .month") as HTMLSpanElement).textContent = labelData.label;
      div.style.left = `${100 * labelData.percent}%`;
      this.dateAxis.appendChild(div);
    })
  }

}