import { UNSET } from '../common';
import { GammaDataFunction, HistDataFunction } from './runcommon';

export class TraceData {


  sampleCount: number;


  displayMin: number;
  displayMax: number;
  dataMin: number;
  dataMax: number;

  label:string;
  unit:string;
  count: number;

  sampleIndex: number;

  /*
  distinguish between the knee index
  that is used as the leftmost sample when we are
  hiding the burn in period, vs. the knee index that
  we highlight
  */
  savedKneeIndex: number;
  currentKneeIndex: number;
  settingKnee: boolean;

  getDataFnc : HistDataFunction | GammaDataFunction;


  constructor(label:string, unit='', getDataFnc : HistDataFunction | GammaDataFunction) {
    this.label = label;
    this.unit = unit;
    this.getDataFnc = getDataFnc;
    this.sampleCount = UNSET;
    this.displayMin = UNSET;
    this.displayMax = UNSET;
    this.dataMin = UNSET;
    this.dataMax = UNSET;

    this.count = 0;
    this.sampleIndex = UNSET;
    this.savedKneeIndex = UNSET;
    this.currentKneeIndex = UNSET;
    this.settingKnee = false;

  }

  setKneeIndex(count: number, kneeIndex:number) {
    this.currentKneeIndex = kneeIndex;
    this.count = count;
    this.sampleCount = count - kneeIndex;
    if (!this.settingKnee) {
      this.savedKneeIndex = kneeIndex;
    }
  }


  handleTreeHighlight(treeIndex: number): void {
    this.sampleIndex = treeIndex;
  }


}

