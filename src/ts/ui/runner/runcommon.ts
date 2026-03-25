import { SkygridPopModel } from "../../pythia/delphy_api";

export const TRACE_MARGIN = 10;
export const DIST_WIDTH = 50;
export const TICK_LENGTH = 10;
export const MAX_STEP_SIZE = 3;

export const TRACE_COLOR = 'rgb(45, 126, 207)';
export const TRACE_COLOR_PRE_KNEE = 'rgb(150, 181, 212)';
export const CURRENT_POP_CURVE_COLOR = 'rgb(150, 181, 212)';


export type SummaryStatsType = {
  mean : number,
  median : number,
  hpdMin : number,
  hpdMax : number,
  ess : number,
  stdDev : number,
  stdErrOnMean : number,
  act : number
};

export enum SummaryStat {
  mean,
  median,
  hpdMin,
  hpdMax,
  ess,
  stdDev,
  stdErrOnMean,
  act
}




export const SummaryStatLookup: {[_:string]: SummaryStat} = {
  "mean" : SummaryStat.mean,
  "median" : SummaryStat.median,
  "hpdMin" : SummaryStat.hpdMin,
  "hpdMax" : SummaryStat.hpdMax,
  "ess" : SummaryStat.ess,
  "stddev" : SummaryStat.stdDev,
  "stderr" : SummaryStat.stdErrOnMean,
  "act" : SummaryStat.act
}

export const PlottableSummaryStats = [
  SummaryStat.mean, SummaryStat.median,
  SummaryStat.hpdMin, SummaryStat.hpdMax
];

export const SummaryStatLongLabels: {[_:string]: string} = {
  "mean" : "Mean",
  "median" : "Median",
  "hpdMin" : "95% HPD min",
  "hpdMax" : "95% HPD max",
  "ess" : "Effective sample size",
  "stdDev" : "Standard deviation",
  "stdErrOnMean" : "Standard error on the mean",
  "act" : "Autocorrelation time"
};

export const SummaryStatShortLabels: {[_:string]: string} = {
  "mean" : "Mean",
  "median" : "Median",
  "hpdMin" : "95% HPD min",
  "hpdMax" : "95% HPD max",
  "ess" : "ESS",
  "stdDev" : "Std dev",
  "stdErrOnMean" : "Std err",
  "act" : "ACT"
};



export type kneeHoverListenerType = (pct:number)=>void;
export type hoverListenerType = (treeIndex:number)=>void;
export type statHoverListenerType = (statName:SummaryStat | null)=>void;
export type requestDrawFnc = ()=>void;


export type HistDataFunction = ()=>number[];
export type GammaDataFunction = ()=>SkygridPopModel[];



