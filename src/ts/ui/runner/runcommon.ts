import { SkygridPopModel } from "../../pythia/delphy_api";

export const TRACE_MARGIN = 10;
export const DIST_WIDTH = 50;
export const TICK_LENGTH = 10;
export const MAX_STEP_SIZE = 3;

export const TRACE_COLOR = 'rgb(45, 126, 207)';
export const TRACE_COLOR_PRE_KNEE = 'rgb(150, 181, 212)';
export const CURRENT_POP_CURVE_COLOR = 'rgb(150, 181, 212)';


export type kneeHoverListenerType = (pct:number)=>void;
export type hoverListenerType = (treeIndex:number)=>void;
export type requestDrawFnc = ()=>void;


export type HistDataFunction = ()=>number[];
export type GammaDataFunction = ()=>SkygridPopModel[];



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
