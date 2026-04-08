import { toFullDateString } from '../../pythia/dates';
import { log10, NO_VALUE, numericSort, UNSET } from '../common';
import { calcHPD, MEDIAN_INDEX, HPD_MIN_INDEX, HPD_MAX_INDEX } from '../distribution';
import { GammaDataFunction } from './runcommon';
import { TraceData } from './tracedata';

export const MEAN_INDEX = 3;
const MIN_TICK_LENGTH = 4;
const MAX_TICKS_FACTOR = 10 * 10 + MIN_TICK_LENGTH;


export type LogLabelType = {
  value: number,
  mag: number,
  ticks: number[][]
};


export type GammaHighlightDataType = {
  median: number,
  medianY: number, // 0 (top) - 1 (bottom)
  hpdMin: number,
  hpdMinY: number, // 0 (top) - 1 (bottom)
  hpdMax: number,
  hpdMaxY: number, // 0 (top) - 1 (bottom)
  dateIndex: number,
  dateX: number,    // 0 (left) - 1 (right)
  dateLabel: string
};


export class GammaData extends TraceData {

  rangeData: number[][] = [];
  postBurnin: number[][] = [];
  /* stores the median and 95% HPD for each knot */
  knotStats: number[][] = [];
  dates: number[] = [];
  isLogLinear = false;
  yearsMin: number = NO_VALUE;
  yearsMax: number = NO_VALUE;
  minMagnitude: number = NO_VALUE;
  maxMagnitude: number = NO_VALUE;
  logRange: number = UNSET;
  logLabels: LogLabelType[] = [];
  dateIndex: number = NO_VALUE;
  highlightData: GammaHighlightDataType | null = null;

  constructor(label:string, unit='', getDataFnc: GammaDataFunction) {
    super(label, unit, getDataFnc);
  }

  setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number):void {

    this.rangeData = data;
    this.dates = dates;
    this.isLogLinear = isLogLinear;
    this.setKneeIndex(data.length, kneeIndex);
    this.postBurnin = this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    /* pivot the data to make arrays for every knot */
    const byKnots:number[][] = this.postBurnin[0].map(()=>new Array(this.postBurnin.length));
    this.postBurnin.forEach((gamma, i)=>{
      gamma.forEach((g, k)=>byKnots[k][i] = g);
    });
    this.knotStats = byKnots.map(hpdeify);
    const safe = this.knotStats.flat().filter(n=>Number.isFinite(n));

    this.dataMin = Math.min(...safe);
    this.dataMax = Math.max(...safe);
    if (this.dataMax === this.dataMin) {
      this.displayMin = this.dataMin;
      this.displayMax = this.dataMax;
    } else {
      /*
      the data coming back from delphy is the gamma value,
      but we want to convert that to years (where 1 year === 365 days)
      */
      const dataMinYears = gammaToYears(this.dataMin);
      const dataMaxYears = gammaToYears(this.dataMax);
      const minLog = Math.log10(dataMinYears);
      const maxLog = Math.log10(dataMaxYears);
      const minMagnitude = Math.floor(minLog);
      const maxMagnitude = Math.ceil(maxLog);
      const displayMinYears = Math.exp(minMagnitude * log10);
      const displayMaxYears = Math.exp(maxMagnitude * log10);
      this.displayMin = yearsToGamma(displayMinYears);
      this.displayMax = yearsToGamma(displayMaxYears);
    }

    const yearsMin = gammaToYears(this.displayMin);
    const yearsMax = gammaToYears(this.displayMax);
    this.minMagnitude = Math.round(Math.log10(yearsMin));
    this.maxMagnitude = Math.round(Math.log10(yearsMax));
    this.yearsMin = defractionalize(yearsMin, this.minMagnitude);
    this.yearsMax = defractionalize(yearsMax, this.maxMagnitude);
    this.logRange = this.maxMagnitude - this.minMagnitude;
    this.logLabels.length = 0;

    let mag = this.minMagnitude;
    let tens = Math.pow(10, mag);

    while (mag < this.maxMagnitude) {
      const logLabel: LogLabelType = {
        value: NO_VALUE,
        mag: NO_VALUE,
        ticks: []
      };
      this.logLabels.push(logLabel);
      for (let i = 1; i <10; i++) {
        const n = i * tens;
        const nLog = Math.log10(n);
        const pct = (nLog - this.minMagnitude) / this.logRange;
        const tickLength = this.getTickLength(i);
        if (i === 1) {
          // only set these values once
          logLabel.value = n;
          logLabel.mag = mag;
        }
        logLabel.ticks.push([pct, tickLength]);
      }
      mag++;
      tens *= 10;
    }
    console.log(this.logLabels)


  }

  getTickLength(logStep: number): number {
    const len = 10 * (MIN_TICK_LENGTH + Math.pow(logStep, 2)) / MAX_TICKS_FACTOR;
    return len;
  }


  get minDate() : number {
    return this.dates[0];
  }

  get maxDate() : number {
    return this.dates[this.dates.length-1];
  }

  setDateIndex(dateIndex:number) : boolean {
    const isUpdate = this.dateIndex !== dateIndex;
    if (dateIndex === NO_VALUE) {
      this.highlightData = null;
      return isUpdate;
    }
    this.dateIndex = dateIndex;
    const { displayMin, displayMax, minDate, maxDate, dates } = this;
    const dateX = Math.min(Math.max(0, (dateIndex - minDate) / (maxDate - minDate)), 1);
    const range = displayMax - displayMin;
    const datePct = dateX * (dates.length - 1)
    const lowerKnot = Math.max(0, Math.floor(datePct));
    const upperKnot = Math.min(dates.length - 1, Math.ceil(datePct));
    let median: number,
      hpdMin: number,
      hpdMax: number;
    /*
    If we don't need to interpolate, then don't!
    And if this is stepwise as opposed to log linear,
    then we just take the values from the upper knot.
    */
    if (lowerKnot === upperKnot || !this.isLogLinear) {
      const knotData = this.knotStats[upperKnot].slice(0);
      median = knotData[MEDIAN_INDEX];
      hpdMin = knotData[HPD_MIN_INDEX];
      hpdMax = knotData[HPD_MAX_INDEX];
    } else {
      const lowerData = this.knotStats[lowerKnot].slice(0);
      const upperData = this.knotStats[upperKnot].slice(0);
      const interpol = (datePct - lowerKnot) / (upperKnot - lowerKnot);
      median = lowerData[MEDIAN_INDEX] + interpol * (upperData[MEDIAN_INDEX] - lowerData[MEDIAN_INDEX]);
      hpdMin = lowerData[HPD_MIN_INDEX] + interpol * (upperData[HPD_MIN_INDEX] - lowerData[HPD_MIN_INDEX]);
      hpdMax = lowerData[HPD_MAX_INDEX] + interpol * (upperData[HPD_MAX_INDEX] - lowerData[HPD_MAX_INDEX]);
    }
    const medianY = 1-(median-displayMin) / range;
    const hpdMinY = 1-(hpdMin-displayMin) / range;
    const hpdMaxY = 1-(hpdMax-displayMin) / range;

    const dateLabel = toFullDateString(dateIndex);
    this.highlightData = { median, medianY, hpdMin, hpdMinY, hpdMax, hpdMaxY,
      dateIndex, dateX, dateLabel };
    return isUpdate;
  }


}




/*
take an array of numbers, and return a 3 element array
of the 95% hpd and the mean
*/
const hpdeify = (arr:number[]):number[]=>{
  const sorted = arr.filter(n=>Number.isFinite(n)).sort(numericSort);
  const [hpdMin, hpdMax, median] = calcHPD(sorted);
  const sum = sorted.reduce((tot, n)=>tot+n, 0);
  const mean = sum / sorted.length;
  /*
  must correspond to HPD_MIN_INDEX, HPD_MAX_INDEX, MEDIAN_INDEX,
  (as defined in distribution.ts) and MEAN_INDEX (defined above)
  */
  return [hpdMin, hpdMax, median, mean];
}


export const gammaToYears = (n:number):number => {
  return Math.exp(n)/365;
}

const yearsToGamma = (n:number):number => {
  return Math.log(n * 365);
}

const defractionalize = (n:number, mag:number):number => {
  const tensy = Math.pow(10, mag);
  let nn = Math.round(n/tensy) * tensy;
  if (nn > 1) nn = Math.round(nn);
  return nn;
}