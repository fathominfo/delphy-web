import { getStdDev, log10, UNSET } from '../common';
import { TraceData } from './tracedata';
import { calcEffectiveSampleSize } from "./effectivesamplesize";
import { KernelDensityEstimate } from '../../pythia/kde';
import { HistDataFunction, SummaryStatsType } from './runcommon';
import { Distribution } from '../distribution';



const MIN_PROB = 0.001;
const MAX_PROB = 0.999;

const MIN_COUNT_FOR_HISTO = 10;
export const MAX_COUNT_FOR_DISCRETE = 20;

type BinConfig = {
  bins: number[],
  edges: number[], // the min value for each bin
  counts: number[],
  positions: number[],
  maxBucketValue: number,
  step: number
};



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
  binConfig: BinConfig;
  isDiscrete: boolean;
  summaryStats: SummaryStatsType;


  constructor(label:string, unit='', getDataFnc: HistDataFunction, isDiscrete: boolean) {
    super(label, unit, getDataFnc);
    this.isDiscrete = isDiscrete;
    this.binConfig = { bins: [], edges : [], counts: [], positions: [], maxBucketValue: 0, step: 0 };
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
    // if (this.label === 'Mutation Rate μ') {
    //   console.log('setting', this.label);
    // }
    const { postBurnIn } = this;
    if (postBurnIn.length > 1) {
      this.distribution = new Distribution(postBurnIn);
      if (postBurnIn.length >= MIN_COUNT_FOR_HISTO) {
        const histoMinVal = Math.min(...postBurnIn);
        const histoMaxVal = Math.max(...postBurnIn);
        const histoRange = histoMaxVal - histoMinVal;
        if (this.distribution.kde === null || this.isDiscrete && histoRange < 20) {
          this.binConfig = this.getDiscreteHistoData(postBurnIn, histoRange, histoMinVal);
        } else {
          this.binConfig = this.getKDEHistoData(this.distribution.kde);
        }
      }
    } else {
      this.distribution = new Distribution(this.data);
    }
    this.setSummaryStats();
  }


  getDiscreteHistoData(estimateData: number[], valRange: number, displayMin: number) : BinConfig {
    const bins: number[] = Array(valRange + 1).fill(0);
    estimateData.forEach(n=>bins[n-displayMin]++);
    const counts = bins.slice(0);
    const edges = bins.map((_n, i)=>i+displayMin);
    const maxBucketValue = Math.max(...bins);
    return {bins, counts, edges, maxBucketValue, positions: [], step: 1 };
  }

  getKDEHistoData(kde:KernelDensityEstimate) : BinConfig {
    const bins: number[] = [],
      edges: number[] = [],
      counts: number[] = [],
      bandwidth = kde.bandwidth,
      halfBandwidth = 0.5 * bandwidth;
    let maxBucketValue = 0;
    if (bandwidth > 0) {
      let min = kde.min_sample - halfBandwidth;
      let max = kde.max_sample + halfBandwidth;
      /*
      since the bandwidth is not necessarily an even divisor of the data range,
      calculate buckets based on evenly sized buckets,
      and adjust min and max to accommodate them.
      */
      let range = max - min;
      let bucketCount = Math.ceil(range / bandwidth);
      const bucketMax = min + bucketCount * bandwidth;
      const delta = bucketMax - max;
      // console.debug(`delta of the actual distribution max ${max} from bucket max ${bucketMax} for ${bucketCount} buckets = ${delta}`);
      min -= delta / 2;
      max += delta / 2;
      let cdf_n = kde.cdf(max);
      while (cdf_n < MAX_PROB) {
        max += bandwidth;
        cdf_n = kde.cdf(max);
      }
      cdf_n = kde.cdf(min);
      while (cdf_n > MIN_PROB) {
        min -= bandwidth;
        cdf_n = kde.cdf(min);
      }
      /*
      recalc the range and count.
      We do this, because calculating the bin with
      `min + i * bandwidth` is less likely to accumulate
      rounding errors than iteratively adding `bandwidth` to `min`
      */
      range = max - min;
      bucketCount = Math.ceil(range / bandwidth);
      const cumulatives: number[] = [];
      let previous = 0;
      let i = 0;
      while (i <= bucketCount) {
        const n = min + i * bandwidth;
        cdf_n = kde.cdf(n);
        if (cdf_n > 0) {
          const gaust = cdf_n - previous;
          edges.push(n);
          bins.push(gaust);
          cumulatives.push(cdf_n);
          maxBucketValue = Math.max(maxBucketValue, gaust);
        }
        previous = cdf_n;
        i++;
      }
      // console.debug(`            probs:   min ${cumulatives[0]},     max ${cumulatives[cumulatives.length - 1]}`);
      /* with the buckets decided, tally the samples into the buckets */
      counts.length = bins.length;
      counts.fill(0);
      kde.samples.forEach((n:number)=>{
        const bindex = Math.floor((n - min) / bandwidth);
        /* verify this is the right bin */
        if (edges[bindex] <= n && n < edges[bindex + 1]) {
          counts[bindex]++;
        } else {
          console.debug(this.label, n, bindex, edges[bindex], edges[bindex + 1], bins.length);
        }
      });

    }
    return {bins, edges, counts, maxBucketValue, positions: [], step: bandwidth };
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

