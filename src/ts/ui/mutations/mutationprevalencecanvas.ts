import { MutationData } from './mutationscommon';
import { BaseTreeSeriesType, getMutationNameParts } from '../../constants';
import { CHART_MONO_BOLD_FONT, CHART_MONO_FONT, CHART_TEXT_FONT, UNSET,
  getTimelineIndices, measureText, numericSortReverse, resizeCanvas, getNtile, getPercentLabel, CHART_TEXT_SIZE } from '../common';
import { toFullDateString } from '../../pythia/dates';
import { DateLabel } from '../datelabel';

import { MutationOfInterest } from '../../pythia/mutationsofinterest';
import { hexToRGB } from '../colorchooser';

/*
for each day, for each tree, calculate the balance of two alleles
store those numbers for each day, sorted ascending.
*/
type MedianSeriesType = number[][];

const REPORTING_NTILES = [0.025, 0.5, 0.975];


enum colorState  {
  HIDDEN = 0,
  MEDIAN = 1,
  RANGE = 2
}
class ColorSet {

  /*
  to ensure a continuity of state
  */
  private actualState : number;
  private targetState : colorState;
  private baseColor: string;
  removing: boolean;

  constructor(color: string) {
    console.log(color);
    const [r,g,b] = hexToRGB(color);
    this.baseColor = `rgba(${r},${g},${b},`;
    this.actualState = 0;
    this.targetState = colorState.MEDIAN;
    this.removing = false;
  }

  update(): boolean {
    const updating = this.isUpdating();
    if (updating) {
      const delta = this.targetState - this.actualState;
      if (Math.abs(delta) < 0.001) {
        this.actualState = this.targetState;
      } else {
        this.actualState += delta * 0.2;
      }
    }
    return updating;
  }

  isUpdating() : boolean {
    return this.actualState !== this.targetState;
  }

  getMedianColor(): string {
    return `${this.baseColor} ${Math.min(1,this.actualState)})`;
  }
  getRangeColor(): string {
    return `${this.baseColor} ${this.getRangeAlpha()}`;
  }
  getRangeAlpha(): number {
    return Math.max(0,this.actualState-1);
  }

  showNothing() : void { this.targetState = colorState.HIDDEN;}
  showMedian() : void { this.targetState = colorState.MEDIAN;}
  showRange() : void { this.targetState = colorState.RANGE;}

  remove() : void {
    this.targetState = colorState.HIDDEN;
    this.removing = true;
  }

  isRemovable(): boolean {
    return this.removing && this.actualState === 0;
  }

}


type MutationPrevalenceData = {
  src: MutationData,
  balances: MedianSeriesType,
  ntiles: MedianSeriesType,
  color: ColorSet
}



const margin = {
  top: 2,
  right: 35,
  bottom: 20,
  left: 0
};
const TEXT_PADDING = 3;
const TICK_LENGTH = 5;
const LINE_HEIGHT = 12;
const DOT_RAD = 3;
const SWATCH_SIDE = 8;
const LEGEND_X = margin.left + 20;
const LEGEND_Y = margin.top + 20;
let LEGEND_X2 = LEGEND_X;
const LEGEND_X2_PAD = 5;

const TAU = Math.PI * 2;

export class MutationPrevalenceCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mutations: MutationPrevalenceData[];
  mutationLookup: {[name: string]: MutationPrevalenceData}
  width: number;
  height: number;

  minDate: number;
  maxDate: number;
  dayCount: number;

  hoverX: number;
  hoverDateIndex: number;
  hoverSeriesIndex: number;

  locked: boolean;
  drawHandle: number;

  hintText: HTMLElement;

  constructor() {
    this.canvas = document.querySelector('#mutations--trends--canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.width = 0;
    this.height = 0;

    this.mutations = [];
    this.mutationLookup = {}
    this.drawHandle = 0;
    this.dayCount = 0;

    // load font, then draw
    const success = (font:FontFace)=>document.fonts.add(font),
      failure = ()=>{
        throw new Error('could not load a font');
      };
    const promises = Promise.all([
      (new FontFace("MDSystem", "url('./assets/fonts/MDSystemStandard/MDSystem-Medium.woff2')", {weight: '500', style: 'normal'})).load().then(success, failure),
      (new FontFace("MD IO", "url('./assets/fonts/MDIO/MDIO0.7-Regular.woff2')", {weight: '400', style: 'normal'})).load().then(success, failure),
      (new FontFace("MD IO", "url('./assets/fonts/MDIO/MDIO0.7-Semibold.woff2')", {weight: '600', style: 'normal'})).load().then(success, failure),
    ]).catch(()=>{}); // eslint-disable-line @typescript-eslint/no-empty-function
    promises.then(fonts => {
      if (fonts) {
        this.launchDraw();
      } else {
        console.debug("Could not load MD fonts, using Roboto fallbacks");
        const backupPromises = Promise.all([
          (new FontFace("Roboto", "url('./assets/fonts/roboto/roboto-medium.ttf')", {weight: '500', style: 'normal'})).load(),
          (new FontFace("RobotoMono", "url('./assets/fonts/roboto_mono/roboto-mono-regular.woff2')", {weight: '400', style: 'normal'})).load(),
          (new FontFace("RobotoMono", "url('./assets/fonts/roboto_mono/roboto-mono-semibold.woff2')", {weight: '600', style: 'normal'})).load(),
        ]);
        backupPromises.then(fonts => {
          fonts.forEach(font => document.fonts.add(font));
          this.launchDraw();
        });
      }
    });

    this.minDate = 0;
    this.maxDate = 0;

    this.hoverX = UNSET;
    this.hoverDateIndex = UNSET;
    this.hoverSeriesIndex = UNSET;
    this.canvas.addEventListener("mousemove", this.handleMousemove);
    this.canvas.addEventListener("mouseout", this.handleMouseout);
    this.canvas.addEventListener("click", this.handleClick);
    this.locked = false;

    this.hintText = (this.canvas.closest("#mutations--trends") as HTMLElement)
      .querySelector(".hint--confidence-range") as HTMLElement;

    this.resize();
  }

  resize():void {
    const { width, height } = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
  }

  setData(mutations: MutationData[], minDate: number, maxDate: number): void {
    mutations = mutations.filter(md => md.active === true);
    mutations.forEach((src: MutationData)=>{
      if (this.mutationLookup[src.name] === undefined) {
        const alt: number = src.moi.mutation.to,
          balances = this.medianizeSeries(src.alleleDist, alt),
          ntiles = this.getNtiles(balances),
          color = new ColorSet(src.color),
          prevalenceData = {src, balances, ntiles, color};
        this.mutations.push(prevalenceData);
        this.mutationLookup[src.name] = prevalenceData;
      }
    })
    this.minDate = minDate;
    this.maxDate = maxDate;

    if (mutations[0]) {
      this.dayCount = this.mutations[0].ntiles.length;
    }

    this.launchDraw();
  }


  launchDraw(): void {
    if (this.drawHandle === 0) {
      this.drawHandle = window.setInterval(()=>this.update(), 30);
    }
  }


  update(): void {
    // console.debug(`updating ${Date.now()}`)
    let updating = false;
    this.mutations.forEach(m=>updating = m.color.update() || updating);
    requestAnimationFrame(()=>this._draw())
    if (!updating) {
      clearInterval(this.drawHandle);
      this.drawHandle = 0;
    }
  }

  _draw(): void {
    const {ctx, width, height} = this;

    ctx.clearRect(0, 0, width, height);

    this.drawBackground();

    this.drawAxes();

    this.mutations.forEach(({color}, i)=> {
      if (color.getRangeAlpha() > 0) this.drawSeriesNtiles(i);
    });
    this.drawMedianSeries();

    if (this.hoverSeriesIndex === UNSET) {
      this.hintText.classList.add("hidden");
    } else {
      this.hintText.classList.remove("hidden");
    }



    this.drawLegend();

    if (this.hoverX !== UNSET) {
      if (this.hoverSeriesIndex === UNSET) {
        this.drawHover();
        this.hintText.classList.add("hidden");
      } else {
        this.drawHoverNtiles(this.hoverSeriesIndex);
        this.hintText.classList.remove("hidden");
      }
    }
  }

  drawSeriesNtiles(index: number) {
    // console.log('drawSeriesNtiles',index)
    const {ctx, width, height} = this;
    /* draw the confidence range bars for the highlighted mutation */
    ctx.lineWidth = 0.25;
    const widthRange = width - margin.left - margin.right,
      bottom = height - margin.bottom,
      heightRange = bottom - margin.top,
      data = this.mutations[index],
      color = data.color.getRangeColor(),
      dailyCounts = data.ntiles,
      n = dailyCounts.length;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    let x = 0,
      y = bottom - dailyCounts[0][0] * heightRange,
      i;
    ctx.moveTo(x, y);
    for (i = 0; i < n; i++) {
      const dayPct = i / n;
      x = margin.left + dayPct * widthRange;
      y = bottom - dailyCounts[i][0] * heightRange;
      ctx.lineTo(x, y);
    }
    for (i = n - 1; i >= 0; i--) {
      const dayPct = i / n;
      x = margin.left + dayPct * widthRange;
      y = bottom - dailyCounts[i][2] * heightRange;
      ctx.lineTo(x, y);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    this.strokeMedian(data);
  }

  strokeMedian(data: MutationPrevalenceData) {
    const {ctx, width, height} = this;
    const color = data.color.getMedianColor(),
      ntiles = data.ntiles;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ntiles.forEach((daily: number[], dayIndex: number)=>{
      const dayPct = dayIndex / this.dayCount;
      const x = margin.left + dayPct * (width - margin.left - margin.right),
        y = margin.top + (1 - daily[1]) * (height - margin.top - margin.bottom);
      if (dayIndex === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }


  drawMedianSeries() {
    const {ctx} = this;
    ctx.globalAlpha = 1;

    /* draw the medians in color */
    // ctx.globalCompositeOperation = "source-over"; // default
    ctx.lineWidth = 2;
    this.mutations.forEach((data: MutationPrevalenceData)=>this.strokeMedian(data));
  }

  drawLegend() {
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.font = CHART_MONO_FONT;
    this.mutations.forEach((data: MutationPrevalenceData, index)=>{
      const {name, color} = data.src;
      this.ctx.globalAlpha = this.hoverSeriesIndex === UNSET || index === this.hoverSeriesIndex ? 1 : 0.3;
      this.drawLegendItem(name, color, index);
    });
  }


  drawBackground() {
    const {ctx, width, height} = this;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FBFBFB";
    ctx.beginPath();
    ctx.rect(margin.left, margin.top,
      width - margin.left - margin.right,
      height - margin.top - margin.bottom);
    ctx.fill();
  }

  drawLegendItem(name: string, color: string, i: number) {
    const {ctx} = this;

    const y = LEGEND_Y + i * LINE_HEIGHT;

    // color swatch
    const swatchX = LEGEND_X;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(swatchX, y, SWATCH_SIDE, SWATCH_SIDE);
    ctx.fill();

    // series name
    const nameParts = getMutationNameParts(name);
    let labelX = LEGEND_X + SWATCH_SIDE * 1.5;
    const partsPadding = 0.5;
    ctx.fillStyle = "#444";
    nameParts.forEach((part, i) => {
      ctx.font = (i === 1) ? CHART_MONO_FONT : CHART_MONO_BOLD_FONT;
      const textMetrics = measureText(ctx, part);
      ctx.fillText(part, labelX, y);
      labelX += textMetrics.width + partsPadding;
    });

    LEGEND_X2 = Math.max(LEGEND_X2, labelX);
  }

  drawAxes() {
    const {ctx} = this;

    ctx.font = CHART_TEXT_FONT;
    ctx.fillStyle = "#999";
    ctx.strokeStyle = "#ddd";
    ctx.globalAlpha = 1;

    this.drawYAxis();
    this.drawXAxis();
  }

  drawYAxis() {
    const {ctx, width, height} = this;

    const NUM_Y_TICKS = 5;
    const x = width - margin.right;

    // line
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, height - margin.bottom);
    ctx.stroke();

    // ticks
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const labelX = x + TICK_LENGTH + TEXT_PADDING;
    for (let i = 0; i <= NUM_Y_TICKS; i++) {
      const label = `${Math.round((i / NUM_Y_TICKS) * 100)}%`;
      const tickY = margin.top + (1 - i / NUM_Y_TICKS) * (height - margin.top - margin.bottom);
      ctx.beginPath();
      ctx.moveTo(x, tickY);
      ctx.lineTo(x + TICK_LENGTH, tickY);
      ctx.stroke();
      const metrics = measureText(ctx, label);
      let labelY = tickY;
      // if (labelY - metrics.height / 2 < 0) {
      if (labelY - metrics.height < 0) {
        // labelY = metrics.height / 2;
        labelY = metrics.height;
      // } else if (labelY + metrics.height / 2 > height) {
      } else if (labelY + metrics.height > height) {
        // labelY = height - metrics.height / 2;
        labelY = height - metrics.height;
      }
      ctx.fillText(label, labelX, labelY);
    }
  }

  drawXAxis() {
    const {ctx, width, height, minDate, maxDate} = this;

    // line
    ctx.beginPath();
    const y = height - margin.bottom;
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();

    // ticks and dates
    ctx.globalAlpha = (this.hoverX === UNSET) ? 1 : 0.3;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    let timelineIndices = getTimelineIndices(minDate, maxDate);
    timelineIndices = timelineIndices.slice(1); // we don't need the today date for this
    timelineIndices = timelineIndices.filter(dl => dl.index > minDate);
    timelineIndices.forEach((dl:DateLabel, i)=>{
      const datePct = (dl.index - minDate) / (maxDate - minDate);
      const x = margin.left + datePct * (width - margin.left - margin.right);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + TICK_LENGTH);
      ctx.stroke();
      const labelY = y + TICK_LENGTH + TEXT_PADDING;
      let label;
      if (i === timelineIndices.length - 1 ||
        dl.year !== timelineIndices[timelineIndices.length - 1].year) {
        label = `${dl.label1} ${dl.label2}`;
      } else {
        label = dl.label1;
      }
      ctx.fillText(label, x, labelY);
    });
  }



  drawHoverDate() {
    const {ctx, width, height} = this;
    const dayPct = this.hoverDateIndex / this.dayCount,
      x = margin.left + dayPct * (width - margin.left - margin.right);

    ctx.font = CHART_TEXT_FONT;
    const date = this.xForInverse(x);
    const dateLabel = toFullDateString(date);
    ctx.fillStyle = "#999";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelY = height - margin.bottom + TICK_LENGTH + TEXT_PADDING;
    let labelX = x;
    const metrics = measureText(ctx, dateLabel);
    if (labelX - metrics.width / 2 < 0) {
      labelX = metrics.width / 2;
    } else if (labelX + metrics.width / 2 > width) {
      labelX = width - metrics.width / 2;
    }
    ctx.fillText(dateLabel, labelX, labelY);

  }

  drawHover() {
    const {ctx, width, height} = this;

    ctx.globalAlpha = 1;

    const dayPct = this.hoverDateIndex / this.dayCount,
      x = margin.left + dayPct * (width - margin.left - margin.right);

    // date line
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#999";
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, height - margin.bottom);
    ctx.stroke();

    // date;
    this.drawHoverDate();

    // values
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = CHART_TEXT_FONT;
    this.mutations.forEach((data, i) => {

      ctx.fillStyle = "#999";

      const {ntiles} = data;
      const median = ntiles[this.hoverDateIndex][1];
      const medianLabel = `${getPercentLabel(median)}%`;
      const labelX = LEGEND_X2 + LEGEND_X2_PAD;
      const labelY = LEGEND_Y + i * LINE_HEIGHT;
      ctx.fillText(medianLabel, labelX, labelY);

      const y = margin.top + (1 - median) * (height - margin.top - margin.bottom);
      const color = data.src.color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, DOT_RAD, 0, Math.PI * 2);
      ctx.fill();


    });
  }



  drawHoverNtiles(index: number) {
    const {ctx, width, height} = this,
      data = this.mutations[index],
      dayData = data.ntiles[this.hoverDateIndex],
      dayPct = this.hoverDateIndex / this.dayCount,
      x = margin.left + dayPct * (width - margin.left - margin.right),
      ys = dayData.map(n=>margin.top + (1 - n) * (height - margin.top - margin.bottom)),
      labels = dayData.map(n=>getPercentLabel(n)),
      color = data.src.color;

    ctx.globalAlpha = 1;
    this.drawHoverDate();
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, ys[0]);
    ctx.lineTo(x, ys[2]);
    ctx.stroke();
    ctx.beginPath();
    ys.forEach(y=>{
      ctx.moveTo(x+DOT_RAD, y);
      ctx.arc(x, y, DOT_RAD, 0, TAU);
    })
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.textBaseline = 'alphabetic';
    /*
    space the label text. make sure the top and bottom are in the canvas,
    and that the center one doesn't overlap them.
    after that, if either the top or the bottom overlaps the center, move them out.
    */
    const labelX = x > width - 60 ? x - 25 : x + 5,
      LINE_SPACING = CHART_TEXT_SIZE * 1.25,
      BOTTOM = height - margin.bottom - 3;
    ys[0] = Math.max(ys[0], CHART_TEXT_SIZE);
    ys[1] = Math.min(BOTTOM - LINE_SPACING, Math.max(CHART_TEXT_SIZE + LINE_SPACING, ys[1]));
    ys[2] = Math.min(ys[2], BOTTOM);
    if (ys[0] > ys[1]-LINE_SPACING) {
      ys[0] = ys[1] - LINE_SPACING;
    }
    if (ys[2] < ys[1]+LINE_SPACING) {
      ys[2] = ys[1] + LINE_SPACING;
    }
    labels.forEach((label:string, i: number)=>{
      ctx.fillText(label, labelX, ys[i]);
    });
  }



  /*
  for each day, for each tree, calculate the balance of two alleles
  store those numbers for each day, sorted ascending.
  */
  medianizeSeries(alleles: BaseTreeSeriesType, alt: number) : MedianSeriesType {
    const treeCount = alleles.length,
      alleleCount = alleles[0].length,
      dayCount = alleles[0][0].length,
      medianed: MedianSeriesType = [];
    for (let d = 0; d < dayCount; d++) {
      const daysAltPrevalence: number[] = Array(treeCount).fill(0);
      for (let t = 0; t < treeCount; t++) {
        let treeDayTotal = 0;
        for (let a = 0; a < alleleCount; a++) {
          treeDayTotal += alleles[t][a][d];
        }
        const altPct = alleles[t][alt][d] / (treeDayTotal || 1);
        daysAltPrevalence[t] = altPct;
      }
      daysAltPrevalence.sort(numericSortReverse);
      medianed[d] = daysAltPrevalence;
    }
    return medianed;
  }


  getNtiles(dailies: MedianSeriesType) : MedianSeriesType {
    const ntiles: MedianSeriesType = dailies.map((daily: number[])=>{
      const daysNtiles: number[] = REPORTING_NTILES.map(ntile=>getNtile(daily, ntile));
      return daysNtiles;
    });
    return ntiles;
  }

  handleMousemove = (e: MouseEvent) => {
    const {width} = this;

    const x = e.offsetX;
    if (x < margin.left || x >= width - margin.right) {
      this.handleMouseout();
      return;
    }

    this.hoverX = x;

    const xPct = (x - margin.left) / (width - margin.left - margin.right);
    const dateIndex = Math.floor(xPct * this.dayCount);
    this.hoverDateIndex = dateIndex;
    /* are we hovering a legend item?  */
    if (!this.locked) {
      if (x < LEGEND_X + DOT_RAD * 3 + 60) {
        const legendIndex = Math.floor((e.offsetY - LEGEND_Y) / LINE_HEIGHT);
        if (legendIndex >= 0 && legendIndex < this.mutations.length) {
          this.hoverSeriesIndex = legendIndex;
          this.mutations.forEach((m, i)=> i === legendIndex? m.color.showRange() : m.color.showNothing());
        } else {
          this.mutations.forEach(m=>m.color.showMedian());
          this.hoverSeriesIndex = UNSET;
        }
      } else {
        this.hoverSeriesIndex = UNSET;
      }
    }

    this.launchDraw();
  }

  handleMouseout = () => {
    this.hoverX = UNSET;
    this.hoverDateIndex = UNSET;
    if (!this.locked) {
      this.hoverSeriesIndex = UNSET;
      this.mutations.forEach(m=>m.color.showMedian());
    }
    this.launchDraw();
  }


  handleClick = (e: MouseEvent) => {
    this.locked = false;
    this.hoverSeriesIndex = UNSET;
    if (e.offsetX < LEGEND_X + DOT_RAD * 3 + 60) {
      const legendIndex = Math.floor((e.offsetY - LEGEND_Y) / LINE_HEIGHT);
      if (legendIndex >= 0 && legendIndex < this.mutations.length) {
        this.hoverSeriesIndex = legendIndex;
        this.mutations.forEach((m, i)=> i === legendIndex? m.color.showRange() : m.color.showNothing());
        this.locked = true;
      }
    }
    this.launchDraw();
  }


  xForInverse(x: number): number {
    const {width, minDate, maxDate} = this;
    const rescaled = (x - margin.left) / (width - margin.left - margin.right);
    return rescaled * (maxDate - minDate) + minDate;
  }


  setHighlight(moi: MutationOfInterest | null, lock: boolean) : void {
    const index = this.mutations.map((md: MutationPrevalenceData)=>md.src.moi).indexOf(moi as MutationOfInterest);
    // console.log('setHighlight', this.locked, this.hoverSeriesIndex, moi?getMutationName(moi.mutation):'–', lock, index);
    if (!this.locked || lock) {
      if (index >= 0) {
        this.mutations.forEach((m, i)=> i === index? m.color.showRange() : m.color.showNothing());
      } else {
        this.mutations.forEach(m=> m.color.showMedian());
      }
      this.hoverSeriesIndex = index;
      this.locked = lock;
      this.launchDraw();
    } else if (index === this.hoverSeriesIndex) {
      /* are we turning off the lock?  */
      this.locked = false;
      this.launchDraw();
    }
  }

}


