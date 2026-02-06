import { log10, numericSort, UNSET } from '../common';
import { calcHPD } from '../distribution';
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
  converted: number[][] = [];
  dates: number[] = [];
  isLogLinear = false;
  highlightIndex: number = UNSET;
  yearsMin: number = UNSET;
  yearsMax: number = UNSET;
  minMagnitude: number = UNSET;
  maxMagnitude: number = UNSET;
  logRange: number = UNSET;
  logLabels: LogLabelType[] = [];

  constructor(label:string, unit='') {
    super(label, unit);
  }

  setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number, sampleIndex: number):void {

    this.rangeData = data;
    this.dates = dates;
    this.isLogLinear = isLogLinear;
    this.setKneeIndex(data.length, kneeIndex);
    this.highlightIndex = sampleIndex;
    const shown = this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    /* pivot the data to make arrays for every knot */
    const byKnots:number[][] = shown[0].map(()=>new Array(shown.length));
    shown.forEach((gamma, i)=>{
      gamma.forEach((g, k)=>byKnots[k][i] = g);
    });
    this.converted = byKnots.map(hpdeify);
    const safe = this.converted.flat().filter(n=>Number.isFinite(n));

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
        value: UNSET,
        mag: UNSET,
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


  }

  getTickLength(logStep: number): number {
    const len = 10 * (MIN_TICK_LENGTH + Math.pow(logStep, 2)) / MAX_TICKS_FACTOR;
    return len;
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