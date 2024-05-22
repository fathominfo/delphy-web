import { MutationOfInterest } from '../../pythia/mutationsofinterest';
import { BaseTreeSeriesType } from '../../constants';
import { MutationRow } from './mutationrow';


export type ParameterCallback = (percent:number)=>void;

export type RowFunctionType = (row: MutationRow | null, lock: boolean) => void;

export type NodeData = {
  index: number,
  tips: number,
  confidence: number
};


export type MutationData = {
  moi: MutationOfInterest,
  name: string,
  times: number[],
  nodes: NodeData[],
  minDate: number,
  maxDate: number,
  alleleDist: BaseTreeSeriesType,
  color: string,
  active: boolean
};


export const MUTATION_SERIES_COLORS = [
  // "#4D4D4E",
  // "#459B76",
  // "#C45D9A",
  // "#EBE55D",
  // "#3670AF",
  // "#F29C00",
  // "#2CB7EA"
  "#049C5C", // @color1
  "#9100E7", // @color2
  "#FF7A00", // @color3
  "#00C1CD", // @color4
  "#FF44B6", // @color5
  "#2F44FF", // @color6
  "#65CA00", // @color7
  "#F2001D", // @color8
  "#FFB800", // @color9
  "#A98AFF", // @color10
  "#A76E00", // @color11
  "#009FDA", // @color12
  "#B4AC00" // @color13
];

export type DisplayOption = "list" | "grid";