import { UNSET } from '../common';

export class TraceData {

  isDiscrete: boolean;

  sampleIndex: number;
  sampleCount: number;


  displayMin: number;
  displayMax: number;
  dataMin: number;
  dataMax: number;

  label:string;
  unit:string;
  count: number;

  highlightIndex: number;

  /*
  distinguish between the knee index
  that is used as the leftmost sample when we are
  hiding the burn in period, vs. the knee index that
  we highlight
  */
  savedKneeIndex: number;
  currentKneeIndex: number;
  settingKnee: boolean;


  constructor(label:string, unit='') {
    this.label = label;
    this.unit = unit;
    this.sampleCount = UNSET;
    this.displayMin = UNSET;
    this.displayMax = UNSET;
    this.dataMin = UNSET;
    this.dataMax = UNSET;

    this.isDiscrete = false;

    this.sampleIndex = UNSET;
    this.count = 0;
    this.highlightIndex = UNSET;
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
    this.highlightIndex = treeIndex;
  }


}

