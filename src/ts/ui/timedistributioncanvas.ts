import {Distribution} from './distribution';
import {MONTHS_SHORT, toDateString, toDateTokens, toFullDateString} from '../pythia/dates';
import {CHART_TEXT_FONT, CHART_TEXT_SMALL_FONT, UNSET, constrain, getPercentLabel, measureText, resizeCanvas} from './common';

const margin = {
  top: 5,
  right: 10,
  bottom: 0,
  left: 0
};

// const HOVER_ALLOWANCE = 5;

// const BG_COLOR = 'rgba(245, 245, 245, ';
// const SERIES_COLOR = 'rgba(116, 116, 116, ';
const SERIES_COLOR = 'rgba(80, 80, 80, ';
const LINE_COLOR = 'rgba(156, 156, 156, ';

let READOUT_SERIES_TEMPLATE: HTMLElement;

export class DistributionSeries {
  distribution: Distribution;
  color: string;
  name: string;
  className: string;

  constructor(name: string, times:number[], className: string, color?: string) {
    this.distribution = new Distribution(name, times);
    this.name = name;
    if (color) {
      this.color = color;
    } else {
      this.color = `${SERIES_COLOR} 1)`;
    }
    this.className = className;
  }


}

const COL_2 = 28;
const PADDING = 5;

export class TimeDistributionCanvas {
  series: DistributionSeries[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  drawWidth: number;
  height: number;
  xheight: number;
  minDate: number;
  maxDate: number;
  isHighlighting: boolean;
  hoverSeriesIndex: number;
  hoverX: number | null;
  hoverDate: number | null;
  allSeriesBandMax: number;
  textOnRight: boolean;
  startIndex: number;
  endIndex: number;

  readout: HTMLElement;

  constructor(series: DistributionSeries[], minDate: number, maxDate: number, canvas: HTMLCanvasElement, readout: HTMLElement) {
    this.series = series;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.startIndex = 0;
    this.endIndex = Math.floor(maxDate - minDate + 1);
    this.canvas = canvas;
    const maybeCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!maybeCtx) {
      throw new Error('cannot create js drawing context');
    }
    this.ctx = maybeCtx;
    this.width = 0;
    this.drawWidth = 0;
    this.height = 0;
    this.xheight = 0;
    this.allSeriesBandMax = Math.max(...this.series.map(s=>s?.distribution.bandMax || 0));

    this.canvas.addEventListener("mouseover", e=>this.handleMouseover(e));
    this.canvas.addEventListener("mousemove", e=>this.handleMousemove(e));
    this.canvas.addEventListener("mouseout", ()=>this.handleMouseout());
    this.canvas.addEventListener('contextmenu', (event)=>this.handleRightClick(event));

    this.readout = readout;
    if (readout) {
      READOUT_SERIES_TEMPLATE = readout.querySelector(".time-chart--series") as HTMLElement;
      if (READOUT_SERIES_TEMPLATE) {
        READOUT_SERIES_TEMPLATE.remove();
      }

      series.forEach(ds => {
        if (!ds) return;

        const seriesDiv = READOUT_SERIES_TEMPLATE.cloneNode(true) as HTMLElement;
        seriesDiv.classList.add(ds.className);
        if (series.length > 1) {
          (seriesDiv.querySelector(".series-label") as HTMLElement).innerText = ds.name;
        }
        readout.appendChild(seriesDiv);
      });
    }

    this.isHighlighting = false;
    this.hoverSeriesIndex = UNSET;
    this.hoverX = null;
    this.hoverDate = null;
    const maxMedian = Math.max(...(series.map(ds=>ds?.distribution?.median || minDate)));
    this.textOnRight = (maxMedian - minDate) / (maxDate - minDate) < 0.4;
    this.resize();
  }

  resize():void {
    const {width, height} = resizeCanvas(this.canvas);
    this.width = width;
    this.drawWidth = width - margin.right;
    this.height = height;
    this.xheight = this.height;
    this.ctx.textBaseline = 'top';
    this.ctx.font = CHART_TEXT_FONT;
  }

  setDateRange(zoomMinDate: number, zoomMaxDate: number) : void {
    this.startIndex = Math.floor(zoomMinDate - this.minDate);
    this.endIndex = Math.floor(zoomMaxDate - this.minDate);
  }

  setSeries(series: DistributionSeries[]) {
    this.series = series;
    this.allSeriesBandMax = Math.max(...this.series.map(s=>s?.distribution.bandMax || 0));
  }

  drawDistribution(ds: DistributionSeries) {
    const {ctx, drawWidth, xheight, allSeriesBandMax} = this;
    // const {ctx, width, xheight} = this;
    const {distribution, color} = ds;
    const {bands, bandwidth, bandTimes, kde} = distribution;
    // const {bands, bandTimes, bandMax, bandwidth, kde} = distribution;
    ctx.fillStyle = color;
    ctx.strokeStyle = "none";
    this.setAlpha(ds);
    ctx.beginPath();
    let t = bandTimes[0],
      x = this.xFor(t, drawWidth),
      val = ds.distribution.getMinBand();
    const THRESHOLD = val;
    ctx.moveTo(x, xheight);
    for (let i = 0; i < bandTimes.length; i++) {
      t = bandTimes[i];
      x = this.xFor(t, drawWidth);
      val = bands[i];
      const y = (1 - val / allSeriesBandMax) * (xheight - margin.top) + margin.top;
      // const y = (1 - val / bandMax) * (xheight - margin.top) + margin.top;
      ctx.lineTo(x, y);
    }
    if (kde){
      while (val > THRESHOLD) {
        t += bandwidth;
        x = this.xFor(t, drawWidth);
        val = kde.value_at(t);
        const y = (1 - val / allSeriesBandMax) * (xheight - margin.top) + margin.top;
        // const y = (1 - val / bandMax) * (xheight - margin.top) + margin.top;
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(x, xheight);
    ctx.fill();
  }


  drawCertainty(ds: DistributionSeries) {
    const {ctx, drawWidth, xheight} = this;
    const {distribution, color} = ds;
    const {median} = distribution;
    const ogWidth = ctx.lineWidth;
    const dateLabel = toFullDateString(distribution.median);
    const textMetrics = measureText(ctx, dateLabel);
    ctx.lineWidth *= 1.5;
    ctx.strokeStyle = color;
    ctx.fillStyle = "none";
    const index = this.series.indexOf(ds);
    const alpha = index === this.hoverSeriesIndex ? 0.6 : 0.3;
    this.ctx.globalAlpha = alpha;
    ctx.beginPath();
    const x = this.xFor(median, drawWidth);
    const top = margin.top + textMetrics.height + PADDING;
    const bottom = xheight;
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top);
    ctx.lineTo(x - 4, top + 4);
    ctx.moveTo(x, top);
    ctx.lineTo(x + 4, top + 4);
    ctx.stroke();
    ctx.lineWidth = ogWidth;
  }


  setAlpha(ds: DistributionSeries) : void  {
    let alpha = 0.2;
    if (this.isHighlighting) {
      alpha = 0.1;
      const index = this.series.indexOf(ds);
      if (this.hoverSeriesIndex === index) {
        alpha = 0.4;
      }
    }
    this.ctx.globalAlpha = alpha;
  }

  labelMedian(ds: DistributionSeries) {
    const {ctx, width, drawWidth, xheight} = this;
    const {distribution, color} = ds;

    const index = this.series.indexOf(ds);
    const isCertain = ds.distribution.total === 0;
    const x = this.xFor(distribution.median, drawWidth);
    let textX = x;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = "top";
    ctx.font = CHART_TEXT_FONT;

    const [year, month, date] = toDateTokens(distribution.median);
    const monthStr = MONTHS_SHORT[month];
    let dateLabel = toFullDateString(distribution.median);
    const textMetrics = measureText(ctx, dateLabel);

    let middleY = margin.top + (xheight - margin.top - margin.bottom) / 2;
    let topY = margin.top;

    const minDate = distribution.hpdMin,
      maxDate = distribution.hpdMax;
    const minDateStr = toFullDateString(minDate),
      maxDateStr = toFullDateString(maxDate);
    const minDateMetrics = measureText(ctx, minDateStr),
      maxDateMetrics = measureText(ctx, maxDateStr);
    let minX = this.xFor(minDate, drawWidth),
      maxX = this.xFor(maxDate, drawWidth);
    if (minX - minDateMetrics.width < margin.left) {
      minX = margin.left + minDateMetrics.width;
    }
    if (maxX + maxDateMetrics.width > width - margin.right) {
      maxX = width - margin.right - maxDateMetrics.width;
    }

    if (this.hoverSeriesIndex === UNSET || this.hoverSeriesIndex === index) {
      if (this.hoverSeriesIndex !== index) {
        const other = this.series.find(d => d !== ds);
        if (other) {
          const [otherYear, , ] = toDateTokens(other.distribution.median);
          if (year === otherYear) {
            dateLabel = `${date} ${monthStr}`;
          } else {
            dateLabel = `${monthStr} ${year}`;
          }
        }
      }
      const textWidth = ctx.measureText(dateLabel).width;
      textX = constrain(textX, textWidth / 2, width - textWidth / 2);

      ctx.globalAlpha = 0.7;
      if (this.hoverSeriesIndex === index || isCertain) {
        ctx.fillText(dateLabel, textX, topY);
      } else {
        ctx.fillText(dateLabel, textX, middleY);
      }
      /* values that are certain do not need min and max drawn */
      if (isCertain) return;
      if (this.hoverSeriesIndex === index) {
        ctx.textBaseline = "middle";

        ctx.textAlign = "right";
        ctx.fillText(minDateStr, minX, middleY);

        ctx.textAlign = "left";
        ctx.fillText(maxDateStr, maxX, middleY);
      }

      middleY += textMetrics.height;
      topY += textMetrics.height;
    }
    if (isCertain) return;
    if (this.hoverSeriesIndex === index) {
      ctx.globalAlpha = 0.9;
    } else {
      ctx.globalAlpha = 0.3;
    }
    middleY += PADDING;
    topY += PADDING;

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, xheight);
    if (this.hoverSeriesIndex === index) {
      ctx.lineTo(x, topY);
    } else {
      ctx.lineTo(x, middleY);
    }
    ctx.stroke();

    if (this.hoverSeriesIndex === index) {

      ctx.beginPath();
      ctx.moveTo(minX, xheight);
      ctx.lineTo(minX, middleY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(maxX, xheight);
      ctx.lineTo(maxX, middleY);
      ctx.stroke();

    }
  }

  drawBaseline() {
    const {ctx, drawWidth, xheight} = this;

    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 2;
    ctx.strokeStyle = `${LINE_COLOR} 1)`;
    ctx.beginPath();
    ctx.moveTo(0, xheight);
    ctx.lineTo(drawWidth, xheight);
    ctx.stroke();
  }

  labelExtents(ds: DistributionSeries) {
    const {ctx} = this;
    const {distribution, color} = ds;

    ctx.fillStyle = color;

    // date text
    ctx.globalAlpha = 0.7;
    ctx.textBaseline = "bottom";
    const minDate = distribution.hpdMin,
      maxDate = distribution.hpdMax;
    const minDateStr = toFullDateString(minDate);
    const maxDateStr = toFullDateString(maxDate);

    ctx.font = CHART_TEXT_SMALL_FONT;
    const LINE_HEIGHT = 14;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const label = "95% HPD";
    const textX = this.textOnRight ? this.drawWidth / 2 : 0;
    ctx.fillText(label, textX, LINE_HEIGHT);

    ctx.font = CHART_TEXT_FONT;
    ctx.fillText(`${minDateStr} – ${maxDateStr}`, textX+COL_2, LINE_HEIGHT);
  }

  labelHover() {
    if (!this.hoverDate || !this.hoverX) {
      this.readout?.classList.add("hidden");
      return;
    }
    this.readout?.classList.remove("hidden");

    const {ctx, xheight, allSeriesBandMax} = this;

    ctx.globalAlpha = 0.9;
    ctx.font = CHART_TEXT_FONT;
    ctx.strokeStyle = `${LINE_COLOR} 1)`;
    ctx.fillStyle = `${LINE_COLOR} 1)`

    // notch
    const NOTCH_HEIGHT = 3;
    ctx.beginPath();
    ctx.moveTo(this.hoverX, xheight);
    ctx.lineTo(this.hoverX, xheight - NOTCH_HEIGHT);
    ctx.stroke();

    // date
    const dateLabel = toFullDateString(this.hoverDate);
    if (this.readout) {
      (this.readout.querySelector(".time-chart--date") as HTMLElement).innerText = dateLabel;
      this.readout.style.left = `${this.hoverX}px`;
    }

    this.series.forEach((ds, i) => {
      if (!ds) return;
      if (ds.distribution.name === undefined) return;
      if (!this.hoverDate || !this.hoverX) return;
      if (!this.readout) return;

      const {distribution} = ds;
      const series = this.readout.querySelectorAll(".time-chart--series")[i] as HTMLElement;
      if (distribution.total === 0) {
        (series.querySelector(".value-label") as HTMLElement).innerText = "";
        // (series.querySelector(".dot") as HTMLElement).classList.add("hidden");
        return;
      }

      // get true y value
      const pct = distribution.getCumulativeProbability(Math.floor(this.hoverDate));
      if (pct === 0 || pct >= 1) {
        (series.querySelector(".value-label") as HTMLElement).innerText = "";
        // (series.querySelector(".dot") as HTMLElement).classList.add("hidden");
        return;
      }

      const y = (1 - distribution.getValueAt(this.hoverDate) / allSeriesBandMax) * (xheight - margin.top) + margin.top;

      // position dot
      // const dot = series.querySelector(".dot") as HTMLElement;
      // dot.classList.remove("hidden");
      // dot.style.top = `${y}px`;
      const DOT_RADIUS = 3;
      ctx.fillStyle = ds.color;
      ctx.beginPath();
      ctx.arc(this.hoverX, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // value label
      const pctLabel = `${getPercentLabel(pct)}%`;
      (series.querySelector(".value-label") as HTMLElement).innerText = pctLabel;
    });
  }


  draw():void {
    const {ctx, width, height, series} = this;

    ctx.clearRect(0, 0, width, height);

    // ctx.fillStyle = `${BG_COLOR} 1)`;
    // ctx.fillRect(0, 0, width, height);

    this.drawBaseline();

    this.labelHover();
    // this.updateReadout();

    series.forEach(ds=>{
      if (!ds) return;

      const distribution = ds.distribution;

      if (distribution.range > 0) {
        this.drawDistribution(ds);
      } else {
        this.drawCertainty(ds);
      }

      this.labelMedian(ds);

      // if (this.hovering && this.hoverSeries === ds) {
      //   if (distribution.range > 0) {
      //     this.labelExtents(ds);
      //   }
      // }
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
    const rescaled = x / this.drawWidth,
      firstDate = this.minDate + this.startIndex,
      lastDate = this.minDate + this.endIndex;
    return rescaled * (lastDate - firstDate) + firstDate;
    // return rescaled * (this.maxDate - this.minDate) + this.minDate;
  }

  handleMouseover(e: MouseEvent) {
    this.handleMousemove(e);
  }

  handleMousemove(e: MouseEvent) {
    this.isHighlighting = true;

    this.hoverX = e.offsetX;
    this.hoverDate = this.xForInverse(this.hoverX) as number;

    this.hoverSeriesIndex = UNSET;
    if (this.series[1]) {
      let maxValAtX = 0;
      this.series.forEach((ds, i) => {
        if (!ds) return;
        if (!this.hoverDate) return;
        // let x1 = this.xFor(ds.distribution.min, this.drawWidth),
        //   x2 = this.xFor(ds.distribution.max, this.drawWidth);
        // if (ds.distribution.range === 0) {
        //   x1 -= HOVER_ALLOWANCE;
        //   x2 += HOVER_ALLOWANCE;
        // }
        // if (e.offsetX >= x1 && e.offsetX <= x2) {
        //   this.hoverSeries = ds;
        // }

        const val = ds.distribution.getValueAt(this.hoverDate);
        if (val > maxValAtX) {
          maxValAtX = Math.max(val, maxValAtX);
          this.hoverSeriesIndex = i;
        }
      });
    } else {
      this.hoverSeriesIndex = 0;
    }

    this.draw();
  }

  handleMouseout() {
    this.isHighlighting = false;
    this.hoverSeriesIndex = UNSET;
    this.hoverX = null;
    this.hoverDate = null;
    this.draw();
  }


  handleRightClick = (event:Event) => {
    event.preventDefault();
    const dist: DistributionSeries | undefined = this.series.length === 2 ? this.series[1] : this.series[0];
    if (dist) {
      const { name, distribution } = dist;
      const times = distribution.times;
      const dates = times.map(t=>toDateString(t));
      dates.sort();
      const txt = dates.join('\n'),
        file = new Blob([txt], {type: "text;charset=utf-8"}),
        a = document.createElement("a"),
        url = URL.createObjectURL(file),
        title = `delphy-${name.toLowerCase().replace(/ /g, '_')}-times.txt`;
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