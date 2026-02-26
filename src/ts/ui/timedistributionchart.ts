import {toDateString} from '../pythia/dates';
import { nicenum, UNSET } from './common';
import { noop } from '../constants';
import { Distribution } from './distribution';



export type SeriesHoverCallback = (hoveredIndex: number, dateIndex: number)=>void;

const SERIES_GROUP_TEMPLATE = document.querySelector(".series.group") as SVGGElement;
SERIES_GROUP_TEMPLATE.remove();

export class SVGSeriesGroup {
  g: SVGGElement;
  path: SVGPathElement;
  line: SVGLineElement;

  constructor(container:SVGElement) {
    this.g = SERIES_GROUP_TEMPLATE.cloneNode(true) as SVGGElement;
    this.path = this.g.querySelector("path") as SVGPathElement;
    this.line = this.g.querySelector("line") as SVGLineElement;
    container.appendChild(this.g);
  }
}


export class TimeDistributionChart {
  svg: SVGElement;
  svgGroups: SVGSeriesGroup[];
  series: Distribution[];
  width: number = UNSET;
  drawWidth: number = UNSET;
  height: number = UNSET;
  xheight: number = UNSET;
  minDate: number = UNSET;
  maxDate: number = UNSET;
  isHighlighting: boolean;
  hoverSeriesIndex: number;
  hoverX: number | null = null;
  hoverDate: number | null = null;
  allSeriesBandMax: number = UNSET;
  textOnRight = false;
  startIndex: number = UNSET;
  endIndex: number = UNSET;
  hoverCallback: SeriesHoverCallback;
  groupType: typeof SVGSeriesGroup;

  // readout: HTMLElement;

  constructor(series: Distribution[], minDate: number, maxDate: number,
    svg: SVGElement, hoverCallback: SeriesHoverCallback = noop, groupType: typeof SVGSeriesGroup = SVGSeriesGroup) {
    this.series = [];
    this.groupType = groupType;
    this.setDateRange(minDate, maxDate);
    this.svg = svg;
    this.svgGroups = [];
    this.hoverCallback = hoverCallback;
    this.width = 0;
    this.drawWidth = 0;
    this.height = 0;
    this.xheight = 0;
    this.allSeriesBandMax = nicenum(Math.max(...this.series.map(distribution=>distribution.bandMax || 0)));

    this.svg.addEventListener("pointerover", e=>this.handleMouseover(e));
    this.svg.addEventListener("pointermove", e=>this.handleMousemove(e));
    this.svg.addEventListener("pointerout", ()=>this.handleMouseout());
    // this.svg.addEventListener('contextmenu', (event)=>this.handleRightClick(event));


    this.isHighlighting = false;
    this.hoverSeriesIndex = UNSET;
    this.hoverX = null;
    this.hoverDate = null;
    const maxMedian = Math.max(...(series.map(distribution=>distribution?.median || minDate)));
    this.textOnRight = (maxMedian - minDate) / (maxDate - minDate) < 0.4;
    this.resize();
  }

  resize():void {
    const parent = this.svg.parentElement as HTMLDivElement;
    const {offsetWidth, offsetHeight} = parent;
    this.width = offsetWidth;
    this.height = offsetHeight;
    this.drawWidth = this.width
    this.xheight = offsetHeight;
    this.svg.setAttribute("width", `${offsetWidth}`);
    this.svg.setAttribute("height", `${offsetHeight}`);
    this.svg.setAttribute("viewBox", `0 0 ${offsetWidth} ${offsetHeight}`);
  }

  setDateRange(minDate: number, maxDate: number) : void {
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.startIndex = 0;
    this.endIndex = Math.floor(maxDate - minDate + 1);
  }

  setSeries(series: Distribution[]) {
    // console.log(series)
    this.series = series;
    this.svgGroups.length = 0;
    this.allSeriesBandMax = nicenum(Math.max(...this.series.map(distribution=>distribution.bandMax || 0)));
    this.svg.innerHTML = '';
    this.series.forEach(()=>{
      const group = new this.groupType(this.svg); // eslint-disable-line new-cap
      this.svgGroups.push(group);
    });

  }

  drawDistribution(distribution: Distribution, svg: SVGSeriesGroup) {
    const {drawWidth, xheight, allSeriesBandMax} = this;
    const {bands, bandwidth, bandTimes, kde} = distribution;
    let t = bandTimes[0],
      x = this.xFor(t, drawWidth),
      y = xheight,
      val = distribution.getMinBand(),
      p = '';
    const THRESHOLD = val;
    p = `M${x} ${y} L`;
    for (let i = 0; i < bandTimes.length; i++) {
      t = bandTimes[i];
      x = this.xFor(t, drawWidth);
      val = bands[i];
      y = (1 - val / allSeriesBandMax) * xheight;
      p+= ` ${x} ${y}`;
    }
    if (kde){
      while (val > THRESHOLD) {
        t += bandwidth;
        x = this.xFor(t, drawWidth);
        val = kde.value_at(t);
        y = (1 - val / allSeriesBandMax) * xheight;
        p+= ` ${x} ${y}`;
      }
    }
    p += ` ${x} ${xheight}`;
    svg.path.setAttribute("d", p);
    /* set the median */
    const median = distribution.median;
    const medianValue = distribution.getValueAt(median);
    x = this.xFor(median, drawWidth);
    y = (1 - medianValue / allSeriesBandMax) * xheight;
    svg.line.setAttribute("x1", `${x}`);
    svg.line.setAttribute("y1", `${xheight}`);
    svg.line.setAttribute("x2", `${x}`);
    svg.line.setAttribute("y2", `${y}`);
  }


  drawCertainty(distribution: Distribution, svg: SVGSeriesGroup) {
    const {drawWidth, xheight} = this;
    const {median} = distribution;
    const x = this.xFor(median, drawWidth);
    svg.line.setAttribute("x1", `${x}`);
    svg.line.setAttribute("y1", `${0}`);
    svg.line.setAttribute("x2", `${x}`);
    svg.line.setAttribute("y2", `${xheight}`);
    svg.path.setAttribute("d", "");
  }


  requestDraw(): void {
    requestAnimationFrame(()=>this.draw());
  }

  private draw():void {

    this.series.forEach((distribution, i)=>{
      if (!distribution) return;
      const svg = this.svgGroups[i];
      if (distribution.range > 0) {
        this.drawDistribution(distribution, svg);
      } else {
        this.drawCertainty(distribution, svg);
      }

    });
  }


  /* probably can get a better centralized x function? */
  xFor(t: number, width:number): number {
    const index = t - this.minDate,
      // rescaled = (t - this.minDate) / (this.maxDate - this.minDate);
      rescaled = (index - this.startIndex) / (this.endIndex - this.startIndex);
    return 0.5 + rescaled * width;
  }

  xForInverse(x: number): number {
    const firstDate = this.minDate + this.startIndex,
      dateIndex = this.dateIndexAt(x);
    return dateIndex + firstDate;
  }

  dateIndexAt(x: number): number {
    const rescaled = x / this.drawWidth,
      range = this.maxDate - this.minDate;
    return rescaled * range;
  }

  handleMouseover(e: MouseEvent) {
    this.handleMousemove(e);
  }

  handleMousemove(e: MouseEvent) {
    const hoverX = e.offsetX;
    const hoverDate = this.xForInverse(hoverX);
    const dateIndex = Math.floor(this.dateIndexAt(hoverX));
    let hoveredIndex: number = UNSET;
    let maxValAtX = 0;
    this.series.forEach((ds:Distribution, i) => {
      if (!ds) return;
      const val = ds.getValueAt(hoverDate);
      if (val > maxValAtX) {
        maxValAtX = Math.max(val, maxValAtX);
        hoveredIndex = i;
      }
    });
    this.hoverCallback(hoveredIndex, dateIndex);
  }

  handleMouseout() {
    // this.isHighlighting = false;
    // this.hoverSeriesIndex = UNSET;
    // this.hoverX = null;
    // this.hoverDate = null;
    this.hoverCallback(UNSET, UNSET);
  }


  handleRightClick = (event:Event) => {
    event.preventDefault();
    const distribution: Distribution | undefined = this.series.length === 2 ? this.series[1] : this.series[0];
    if (distribution) {
      const times = distribution.times;
      const dates = times.map(t=>toDateString(t));
      dates.sort();
      const txt = dates.join('\n'),
        file = new Blob([txt], {type: "text;charset=utf-8"}),
        a = document.createElement("a"),
        url = URL.createObjectURL(file),
        // title = `delphy-${name.toLowerCase().replace(/ /g, '_')}-times.txt`;
        title = `delphy--times.txt`;
      a.href = url;
      a.download = title;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>a.remove(), 10000);
    }
    return false;
  };


}






// export function getMultiTimeDistributionCanvas(names: string[], times:number[][], template: HTMLCanvasElement):TimeDistributionCanvas {
//   if (names.length !== times.length) {
//     throw new Error('to create a time distribution canvas, we need a name for every time series and vice versa');
//   }
//   let canvas:HTMLCanvasElement = <HTMLCanvasElement> template.cloneNode(true);
//   let distributions = [];
// }