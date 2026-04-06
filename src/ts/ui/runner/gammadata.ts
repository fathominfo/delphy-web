import { toDateString } from '../../pythia/dates';
import { log10, NO_VALUE, numericSort, UNSET } from '../common';
import { calcHPD } from '../distribution';
import { GammaDataFunction } from './runcommon';
import { TraceData } from './tracedata';


const MIN_TICK_LENGTH = 4;
const MAX_TICKS_FACTOR = 10 * 10 + MIN_TICK_LENGTH;

export type LogLabelType = {
  value: number,
  mag: number,
  ticks: number[][]
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
  _dateIndex: number = NO_VALUE;
  _knotIndex: number = NO_VALUE;

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

  set dateIndex(n:number) {
    if (n === NO_VALUE) {
      this._knotIndex = NO_VALUE;
      return;
    }
    this._dateIndex = n;
    const pct = (n - this.minDate) / (this.maxDate - this.minDate);
    this._knotIndex = Math.round(pct * (this.dates.length - 1));
    const date = this.dates[this._knotIndex];
    // console.log(n, toDateString(n), toDateString(this.minDate), toDateString(this.maxDate), toDateString(date), this.dates, this.knotStats[this._knotIndex]);
  }

  // get dateIndex() {
  //   return this._dateIndex;
  // }

  get knotIndex() {
    return this._knotIndex;
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
  // console.log(hpdMin, hpdMax, mean)
  return [hpdMin, hpdMax, mean, median];
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