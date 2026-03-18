import { getStdDev, log10, UNSET } from '../common';
import { TraceData } from './tracedata';
import { calcEffectiveSampleSize } from "./effectivesamplesize";
import { KernelDensityEstimate } from '../../pythia/kde';
import { HistDataFunction, SummaryStatsType } from './runcommon';
import { Distribution } from '../distribution';



type BucketConfig = {
  buckets: number[],
  values: number[],
  positions: number[],
  maxBucketValue: number,
  step: number
};

const MIN_COUNT_FOR_HISTO = 10;
export const MAX_COUNT_FOR_DISCRETE = 20;

export class HistData extends TraceData {

  hideBurnIn = false;
  data:number[] = [];
  postBurnIn: number[] = [];
  mccIndex: number = UNSET;
  highlightIndex: number = UNSET;
  mean = 0;
  ess: number = UNSET;
  act: number = UNSET;
  displayCount = 0;
  distribution: Distribution;
  bucketConfig: BucketConfig;
  isDiscrete: boolean;
  summaryStats: SummaryStatsType;


  constructor(label:string, unit='', getDataFnc: HistDataFunction, isDiscrete: boolean) {
    super(label, unit, getDataFnc);
    this.isDiscrete = isDiscrete;
    this.bucketConfig = { buckets: [], values : [], positions: [], maxBucketValue: 0, step: 0 };
    this.distribution = new Distribution([]);
    this.summaryStats = { mean: UNSET, median: UNSET, hpdMin: UNSET, hpdMax: UNSET, ess: UNSET, stdDev: UNSET, stdErrOnMean: UNSET, act: UNSET };
  }

  setData(data:number[], kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number, stepsPerSample: number) {

    this.data = data;
    this.setMetadata(data.length, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    const postBurnIn = kneeIndex > 0 ? data.slice(kneeIndex) : data;
    this.postBurnIn = postBurnIn.filter(n=>Number.isFinite(n));
    this.ess = calcEffectiveSampleSize(this.postBurnIn);
    const N = this.postBurnIn.length;
    this.act = N / this.ess * stepsPerSample;
    const dataSum = this.postBurnIn.reduce((tot, n)=>tot+n, 0);
    this.mean = dataSum / N;

    const shown = hideBurnIn && this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    const safe = shown.filter(n=>!isNaN(n) && isFinite(n));

    this.dataMin = Math.min(...safe);
    this.dataMax = Math.max(...safe);
    /* what scale is the range in? */
    const range = this.dataMax - this.dataMin;

    if (range === 0 || this.isDiscrete && range < MAX_COUNT_FOR_DISCRETE) {
      this.displayMin = this.dataMin;
      this.displayMax = this.dataMax;
    } else {
      const expRange = Math.floor(Math.log(range) / log10),
        mag = Math.pow(10, expRange),
        magPad = mag * 0.1;
      this.displayMin = Math.floor((this.dataMin - magPad) / mag) * mag;
      this.displayMax = Math.ceil((this.dataMax + magPad) / mag) * mag;
    }

    this.setBucketData();

  }

  setBucketData() {
    const { postBurnIn } = this;
    if (postBurnIn.length > 1) {
      this.distribution = new Distribution(postBurnIn);
      if (postBurnIn.length >= MIN_COUNT_FOR_HISTO) {
        const histoMinVal = Math.min(...postBurnIn);
        const histoMaxVal = Math.max(...postBurnIn);
        const histoRange = histoMaxVal - histoMinVal;
        if (this.distribution.kde === null || this.isDiscrete && histoRange < 20) {
          this.bucketConfig = this.getDiscreteHistoData(postBurnIn, histoRange, histoMinVal);
        } else {
          this.bucketConfig = this.getKDEHistoData(this.distribution.kde);
        }
      }
    } else {
      this.distribution = new Distribution(this.data);
    }
    this.setSummaryStats();
  }


  getDiscreteHistoData(estimateData: number[], valRange: number, displayMin: number) : BucketConfig {
    const buckets: number[] = Array(valRange + 1).fill(0);
    estimateData.forEach(n=>buckets[n-displayMin]++);
    const values = buckets.map((_n, i)=>i+displayMin);
    const maxBucketValue = Math.max(...buckets);
    return {buckets, values, maxBucketValue, positions: [], step: 1 };
  }

  getKDEHistoData(kde:KernelDensityEstimate) : BucketConfig {
    const buckets: number[] = [],
      values: number[] = [],
      bandwidth = kde.bandwidth,
      halfBandwidth = 0.5 * bandwidth;
    let min = kde.min_sample - halfBandwidth,
      max = kde.max_sample + halfBandwidth;
    /*
    since the bandwidth is not necessarily an even divisor of the data range,
    calculate buckets based on evenly sized buckets,
    and adjust min and max to accommodate them.
    */
    const range = max - min,
      bucketCount = Math.ceil(range / bandwidth),
      bucketMax = min + bucketCount * bandwidth;
    const delta = bucketMax - max;
    // console.debug(`delta of the actual distribution max ${max} from bucket max ${bucketMax} for ${bucketCount} buckets = ${delta}`);
    min -= delta / 2;
    max += delta / 2;
    let maxBucketValue = 0;
    if (bandwidth > 0) {
      let previous = 0;
      let i = 0;
      while (i <= bucketCount) {
        const n = min + i * bandwidth;
        const cumulative = kde.cumulative(n);
        const gaust = cumulative - previous;
        values.push(n);
        buckets.push(gaust);
        maxBucketValue = Math.max(maxBucketValue, gaust);
        previous = cumulative;
        i++;
      }
      const cmin = kde.cumulative(min);
      const cmax = kde.cumulative(max);
      // console.debug(`            probs:   min ${cmin},     max ${cmax}`);
    }
    return {buckets, values, maxBucketValue, positions: [], step: bandwidth };
  }

  setSummaryStats() : void {
    const {ess, act, mean } = this;
    const { median, hpdMin, hpdMax, data } = this.distribution;
    const stdDev = getStdDev(data);
    const stdErrOnMean = stdDev / Math.sqrt(ess);
    this.summaryStats = { mean, median, hpdMin, hpdMax, ess, stdDev, stdErrOnMean, act };
  }

  getStats() : SummaryStatsType {
    return this.summaryStats;
  }




  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    this.mccIndex = mccIndex;
    this.hideBurnIn = hideBurnIn;
    this.highlightIndex = sampleIndex;
    this.displayCount = this.hideBurnIn && this.savedKneeIndex > 0 ? this.count - this.savedKneeIndex : this.count;
  }


}

