import {KernelDensityEstimate} from "../pythia/kde";
import { numericSort } from "./common";



const cred_mass = .95

export class Distribution {

  times: number[];
  kde: KernelDensityEstimate | null;
  min: number;
  max: number;
  /*
  the bounds of the highest posterior density (HPD) range
  The 95% HPD is the tightest range [x_min, x_max] such that 95% of the values of x lie between x_min and x_max
  */
  hpdMin: number;
  hpdMax: number;
  range: number;
  bandwidth:number;
  bandTimes: number[];
  bands: number[];
  bandMax:number;
  total: number;
  median: number;
  timeOfMax: number;
  distributed: boolean;

  constructor(times: number[]) {
    this.times = times;
    this.bandTimes = [];
    this.bands = [];
    this.distributed = false;
    const sorted = times.slice(0).sort(numericSort);
    if (sorted.length === 0) this.median = 0;
    // else if (sorted.length % 2 === 1) this.median = sorted[Math.floor(sorted.length/2)];
    // else this.median = (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2;

    this.bandMax = 0;
    this.timeOfMax = 0;
    this.total = 0;
    this.bandwidth = 0;
    this.range = 0;
    this.max = 0;
    this.min = 0;
    this.kde = null;

    this.median = 0;

    /* calculate the HPD */
    const [hpdMin, hpdMax] = calcHPD(sorted);
    this.hpdMin = hpdMin;
    this.hpdMax = hpdMax;

    if (sorted.length >= 3) {
      try {
        this.kde = new KernelDensityEstimate(sorted);
        this.min = this.kde.min_sample;
        this.max = this.kde.max_sample;
        this.bandwidth = this.kde.bandwidth;
        this.range = this.max - this.min;
        let n = this.min;
        this.bandMax = 0;
        this.timeOfMax = 0;
        while (n <= this.max && this.bandwidth > 0) {
          const gaust = this.kde.value_at(n);
          this.bands.push(gaust);
          this.bandTimes.push(n);
          this.total += gaust;
          if (gaust > this.bandMax) {
            this.bandMax = gaust;
            this.timeOfMax = n;
          }
          n += this.bandwidth;
        }
        this.distributed = true;
        // console.log('HPD', hpd_min, hpd_max);
        let proxToMedian = 10,
          medianDate = Math.floor(this.min);
        for (let d = medianDate; d < this.max; d++) {
          const sample = this.getCumulativeProbability(d),
            dMedian = Math.abs(0.505 - sample);
          if (dMedian < proxToMedian) {
            medianDate = d;
            proxToMedian = dMedian;
          }
        }
        this.median = medianDate;
      }
      catch(err) {
        // console.trace(err);
        // console.debug(times);
      }
    } else {
      // console.log(`no kde with only ${times.length} sample ${times.length === 1 ? '' : 's'}`);
      this.min = sorted[0];
      this.max = sorted[sorted.length-1];
      this.range = this.max - this.min;
      if (sorted.length % 2 === 1) this.median = sorted[Math.floor(sorted.length/2)];
      else if (sorted.length > 0) this.median = (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2;
      this.bandMax = 0.0;
      this.timeOfMax = this.min;
      this.kde = null;
    }
  }

  getMinBand(): number {
    const firstBand = this.bands[0];
    const lastBand = this.bands[this.bands.length - 1];
    const minBand = Math.min(firstBand, lastBand);
    return minBand;
  }

  getValueAt(hoverDate: number) : number {
    if (!this.kde) return 0;
    const val = this.kde.value_at(hoverDate);
    if (val < this.getMinBand()) return 0;
    return val;
  }


  getProbabilityDensity(hoverDate: number) : number {
    return this.getValueAt(hoverDate) / this.total;
  }

  getCumulativeProbability(hoverDate: number) : number {
    if (!this.kde) return 0;
    const bindex = Math.floor((hoverDate - this.min) / this.kde.bandwidth);
    let sumProb = this.bands.slice(0, bindex).reduce((tot:number, n: number)=>tot+n, 0);
    /* interpolate how much of the last bin we get */
    const daysInBin = (hoverDate - this.min) % this.kde.bandwidth,
      pctOfBinTime = daysInBin / this.kde.bandwidth;
    sumProb += pctOfBinTime * (this.bands[bindex] || 0);
    return sumProb / this.total;
  }



}


export const calcHPD = (arr: number[])=>{
  const sorted = arr.slice(0).sort(numericSort);
  /* calculate the HPD */
  const lenn = sorted.length,
    intervalIdxInc = Math.floor(cred_mass * lenn),
    nIntervals = lenn-intervalIdxInc,
    lowers = sorted.slice(0, nIntervals),
    uppers = sorted.slice(intervalIdxInc),
    intervalWidths = uppers.map((u, index)=>u-lowers[index]),
    minWidth = Math.min(...intervalWidths),
    minIndex = intervalWidths.indexOf(minWidth);
  const hpdMin = sorted[minIndex];
  const hpdMax = sorted[minIndex + intervalIdxInc];
  return [hpdMin, hpdMax];
}