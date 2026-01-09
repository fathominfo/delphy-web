import { log10, UNSET } from '../common';
import { TraceData } from './tracedata';
import { calcEffectiveSampleSize } from "./effectivesamplesize";

export class HistData extends TraceData {

  hideBurnIn: boolean;


  data:number[];
  mccIndex: number;
  sampleIndex: number;
  sampleCount: number;
  ess: number;
  displayCount: number;

  constructor(label:string, unit='') {
    super(label, unit);
    this.data = [];
    this.ess = UNSET;
    this.sampleCount = UNSET;
    this.mccIndex = UNSET;
    this.sampleIndex = UNSET;
    this.displayCount = 0;
    this.hideBurnIn = false;

  }

  setData(data:number[], kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {

    this.data = data;
    this.setMetadata(data.length, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.ess = calcEffectiveSampleSize(data.slice(kneeIndex));
    const shown = hideBurnIn && this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    const safe = shown.filter(n=>!isNaN(n) && isFinite(n));

    this.dataMin = Math.min(...safe);
    this.dataMax = Math.max(...safe);
    /* what scale is the range in? */
    const range = this.dataMax - this.dataMin;

    if (range === 0 || this.isDiscrete && range < 20) {
      this.displayMin = this.dataMin;
      this.displayMax = this.dataMax;
    } else {
      const expRange = Math.floor(Math.log(range) / log10),
        mag = Math.pow(10, expRange),
        magPad = mag * 0.1;
      this.displayMin = Math.floor((this.dataMin - magPad) / mag) * mag;
      this.displayMax = Math.ceil((this.dataMax + magPad) / mag) * mag;
    }

  }

  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    this.mccIndex = mccIndex;
    this.hideBurnIn = hideBurnIn;
    this.sampleIndex = sampleIndex;
    this.displayCount = this.hideBurnIn && this.savedKneeIndex > 0 ? this.count - this.savedKneeIndex : this.count;
  }


}

