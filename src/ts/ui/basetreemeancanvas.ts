import { BaseTreeSeriesType } from '../constants';
import { UNSET, resizeCanvas } from './common';

const FILL_ALPHA = 0.8;
const STROKE_ALPHA = 1.0;
const LINE_WIDTH = 2;

const TARGET = 200;
const TOO_MANY = TARGET * 2;


export class BaseTreeMeanCanvas {
  dist: BaseTreeSeriesType; // number[][][]
  treeCount: number;
  seriesCount: number;
  binCount: number;

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  minDate: number;
  maxDate: number;

  colors: string[];
  labels: string[];
  classNames: string[];

  // distYPositions: number[][][]; // tree, series, date
  averages: number[][]; // series, date
  averageYPositions: number[][]; // pct of height

  /* if we zoom the timescale, we will start drawing at different times */
  startIndex: number;
  endIndex: number;



  constructor(dist: BaseTreeSeriesType,
    colors: string[],
    labels: string[],
    classNames: string[],
    canvas: HTMLCanvasElement,
    minDate: number, maxDate: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    this.width = UNSET;
    this.height = UNSET;
    this.resize();

    // these will get assigned by this.set…
    this.dist = [];
    this.treeCount = UNSET;
    this.seriesCount = UNSET;
    this.binCount = UNSET;
    this.colors = [];
    this.labels = [];
    this.classNames = [];
    this.minDate = UNSET;
    this.maxDate = UNSET;
    this.startIndex = UNSET;
    this.endIndex = UNSET;

    // … which will call `calculate`, which sets these
    this.averages = [];
    this.averageYPositions = [];

    this.set(dist, colors, labels, classNames, minDate, maxDate);
  }

  resize():void {
    const {width, height} = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
  }

  set(dist: BaseTreeSeriesType,
    colors: string[],
    labels: string[],
    classNames: string[],
    minDate: number, maxDate: number) {

    this.dist = dist; // tree, series, day
    this.treeCount = dist.length;
    this.seriesCount = dist[0].length;
    this.binCount = dist[0][0].length;

    this.colors = colors;
    this.labels = labels;
    this.classNames = classNames;

    this.minDate = minDate;
    this.maxDate = maxDate;
    this.startIndex = 0;
    this.endIndex = Math.floor(maxDate - minDate + 1);

    // console.log('base tree set', this.minDate, this.maxDate, this.startIndex, this.endIndex);

    this.calculate();

  }


  setDateRange(zoomMinDate: number, zoomMaxDate: number) : void {
    if (Number.isFinite(zoomMinDate) && Number.isFinite(zoomMaxDate)) {
      this.startIndex = Math.max(0, Math.floor(zoomMinDate - this.minDate));
      this.endIndex = Math.min(this.binCount-1, Math.floor(zoomMaxDate - this.minDate));
    }
  }

  calculate() : void {

    /**
    we want to collapse our incoming data from [tree][series][day]
    to [series][day] = average for all trees
    */
    const {startIndex, endIndex} = this;
    const rawDrawnCount = endIndex - startIndex;
    const rebinning = rawDrawnCount >= TOO_MANY;
    const drawnCount = rebinning ? TARGET : rawDrawnCount;

    const averages: number[][] = new Array(this.seriesCount);
    for (let s = 0; s < this.seriesCount; s++) {
      // for each tree, daily values for this series
      averages[s] = Array(drawnCount);
      for (let d = 0; d < drawnCount; d++) {
        let tot = 0;
        let dd = rebinning ? Math.round(d / (drawnCount-1) * (rawDrawnCount-1)) : d;
        dd += startIndex;
        for (let t = 0; t < this.treeCount; t++) {
          tot += this.dist[t][s][dd];
        }
        averages[s][d] = tot / this.treeCount;
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

  requestDraw(): void {
    requestAnimationFrame(()=>this.draw());
  }

  protected draw() : void {
    const { ctx, width, height, averageYPositions, seriesCount } = this;


    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = LINE_WIDTH;

    for (let i = 0; i < seriesCount; i++) {
      const prevIndex = (i > 0) ? i - 1 : null;

      // set color
      this.setSeriesColor(i);

      /* trace the top */
      ctx.beginPath();
      let startY = 0,
        ys: number[];
      const L: number = averageYPositions[i].length;
      if (prevIndex === null) {
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
      } else {
        ys = averageYPositions[prevIndex];
        startY = ys[0] * height;
        ctx.moveTo(0, startY);
        for (let d = 1; d < L; d++) {
          const x = d / (L-1) * width,
            y = ys[d] * height;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      /* trace the bottom */
      ys = averageYPositions[i];
      for (let d = L - 1; d >= 0; d--) {
        const x = d / (L-1) * width,
          y = ys[d] * height;
        ctx.lineTo(x, y);
      }
      // console.log(ctx.fillStyle, ys);
      ctx.lineTo(0, startY);
      ctx.fill();
    }


  }


  setSeriesColor(i: number) {
    const { ctx, colors } = this;

    ctx.fillStyle = `${colors[i]} ${FILL_ALPHA})`;
    ctx.strokeStyle = `${colors[i]} ${STROKE_ALPHA}`;
  }



  xForInverse(x: number): number {
    const rescaled = x / this.width;
    return rescaled * (this.maxDate - this.minDate) + this.minDate;
  }


}

