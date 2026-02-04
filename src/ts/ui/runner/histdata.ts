import { log10, UNSET } from '../common';
import { TraceData } from './tracedata';
import { calcEffectiveSampleSize } from "./effectivesamplesize";
import { KernelDensityEstimate } from '../../pythia/kde';



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
  mccIndex: number = UNSET;
  highlightIndex: number = UNSET;
  sampleCount = 0;
  ess: number = UNSET;
  displayCount= 0;
  dataMean: number = UNSET;
  bucketConfig: BucketConfig;

  constructor(label:string, unit='') {
    super(label, unit);
    this.bucketConfig = { buckets: [], values : [], positions: [], maxBucketValue: 0, step: 0 };
  }

  setData(data:number[], kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {

    this.data = data;
    this.setMetadata(data.length, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.ess = calcEffectiveSampleSize(data.slice(kneeIndex));
    const shown = hideBurnIn && this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    const safe = shown.filter(n=>!isNaN(n) && isFinite(n));

    this.dataMin = Math.min(...safe);
    this.dataMax = Math.max(...safe);
    const dataSum = safe.reduce((tot, n)=>tot+n, 0);
    this.dataMean = dataSum / safe.length;
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
    const {data } = this,
      kneeIndex = this.currentKneeIndex;
    if (data.length > 1) {
      let estimateData = kneeIndex > 0 ? data.slice(kneeIndex) : data.slice(0);
      estimateData = estimateData.filter(n=>isFinite(n) && !isNaN(n));
      if (estimateData.length >= MIN_COUNT_FOR_HISTO) {
        const histoMinVal = Math.min(...estimateData);
        const histoMaxVal = Math.max(...estimateData);
        const histoRange = histoMaxVal - histoMinVal;
        if (this.isDiscrete && histoRange < 20) {
          this.bucketConfig = this.getDiscreteHistoData(estimateData, histoRange, histoMinVal);
        } else {
          this.bucketConfig = this.getKDEHistoData(estimateData);
        }
      }
    }
  }


  getDiscreteHistoData(estimateData: number[], valRange: number, displayMin: number) : BucketConfig {
    const buckets: number[] = Array(valRange + 1).fill(0);
    estimateData.forEach(n=>buckets[n-displayMin]++);
    const values = buckets.map((_n, i)=>i+displayMin);
    const maxBucketValue = Math.max(...buckets);
    return {buckets, values, maxBucketValue, positions: [], step: 1 };
  }

  getKDEHistoData(estimateData: number[]) : BucketConfig {
    const kde:KernelDensityEstimate = new KernelDensityEstimate(estimateData),
      buckets: number[] = [],
      values: number[] = [],
      min = kde.min_sample,
      max = kde.max_sample,
      range = max - min,
      bandwidth = kde.bandwidth,
      halfBandwidth = bandwidth / 2,
      bucketCount = Math.floor(range / bandwidth + 1);
    let maxBucketValue = 0;
    if (bandwidth > 0) {
      let n = min;
      for (let i = 0; i < bucketCount; i++) {
        n = min + i / bucketCount * range;
        const gaust = kde.value_at(n + halfBandwidth);
        values.push(n);
        buckets.push(gaust);
        maxBucketValue = Math.max(maxBucketValue, gaust);
      }
      if (this.label === "Total Evolutionary Time") {
        const minE = Math.min(...estimateData);
        const maxE = Math.max(...estimateData);
        console.log("KDE", this.label, min, max, min===minE, max===maxE, values.length, values.length - bucketCount,
          "display", this.displayMin, this.displayMax, bandwidth, halfBandwidth,
          "n vs. max", n, n-max);
      }
    }
    return {buckets, values, maxBucketValue, positions: [], step: bandwidth };
  }







  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    this.mccIndex = mccIndex;
    this.hideBurnIn = hideBurnIn;
    this.highlightIndex = sampleIndex;
    this.displayCount = this.hideBurnIn && this.savedKneeIndex > 0 ? this.count - this.savedKneeIndex : this.count;
  }


}

