import { UNSET } from '../common';
import { ScatterDataFunction } from './runcommon';
import { TraceData } from './tracedata';



export class ScatterData extends TraceData {

  tipMutationCounts: number[] = [];
  tipDates: number[] = [];
  countMin: number = UNSET;
  countMax: number = UNSET
  dateMin: number = UNSET;
  dateMax: number = UNSET;
  validTips: number[][] = []; /* raw values of date, count */
  tipCoords: number[][] = []; /* scaled 0-1 */
  /* for the linear regression */
  slope: number = UNSET;
  intercept: number = UNSET;



  constructor(label:string, unit='', getDataFnc: ScatterDataFunction) {
    super(label, unit, getDataFnc);
  }

  setTipData(data:number[][], minDate: number, maxDate: number):void {
    this.tipMutationCounts.length = 0;
    this.tipDates.length = 0;
    data.forEach(([mutCount, date], i)=>{
      this.tipMutationCounts[i] = mutCount;
      this.tipDates[i] = date;
    });
    const safeCounts = this.tipMutationCounts.filter(n=>Number.isFinite(n));
    // const safeDates = this.tipDates.filter(n=>Number.isFinite(n));

    this.countMin = 0; /* use a 0 baseline */
    this.countMax = Math.max(...safeCounts);
    this.dateMin = minDate;
    this.dateMax = maxDate;
    // this.dateMin = Math.min(...safeDates);
    // this.dateMax = Math.max(...safeDates);

    this.validTips.length = 0;
    this.tipCoords.length = 0;
    const dateRange = this.dateMax - this.dateMin;
    this.tipMutationCounts.forEach((count, i)=>{
      const date = this.tipDates[i];
      if (Number.isFinite(count) && Number.isFinite(date)) {
        const x = (date - this.dateMin) / dateRange;
        const y = count / this.countMax;
        this.validTips[i] = [date, count]
        this.tipCoords[i] = [x, y];
      }
    });
    this.setLinearRegression();
  }



  get minDate() : number {
    return this.tipDates[0];
  }

  get maxDate() : number {
    return this.tipDates[this.tipDates.length-1];
  }


  /* based on https://mathworld.wolfram.com/LeastSquaresFitting.html, lines 12 and 14 */
  setLinearRegression(){
    const L = this.tipCoords.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    // let sumY2 = 0;
    this.tipCoords.forEach( ([date, count])=>{
      sumX += date;
      sumY += count;
      sumXY += (date*count);
      sumX2 += (date*date);
      // sumY2 += (count*count);
    });
    this.slope = (L * sumXY - sumX * sumY) / (L * sumX2 - sumX * sumX);
    this.intercept = (sumY * sumX2 - sumX * sumXY) / (L * sumX2 - sumX * sumX);
  }


}

