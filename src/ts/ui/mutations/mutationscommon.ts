import { MutationOfInterest } from '../../pythia/mutationsofinterest';
import { BaseTreeSeriesType } from '../../constants';
import { MutationRow } from './mutationrow';
import { MUTATION_COLOR, UNSET } from '../common';


export type ParameterCallback = (percent:number)=>void;

export type RowFunctionType = (row: MutationRow | null) => void;

/*
 * For each MutationRow, NodeData stores the mutation node data from each base tree.
 *
 * UniqueNodeData collapses these into unique nodes,
 * which we use to highlight the corresponding nodes on the MccTreeCanvas.
 */
export type NodeData = {
  index: number,
  tips: number,
  confidence: number
};

export type UniqueNodeData = {
  index: number,
  count: number,
  tips: number,
  confidence: number
}

export type MutationData = {
  moi: MutationOfInterest,
  name: string,
  /* the time of the mutation in each base tree of the MCC */
  times: number[],
  /*
  the node index of the mutation in each base tree of the MCC,
  then mapped onto the corresponding node in the MCC
  */
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


const colorsUsed: string[] = [];

export const getMutationColor = () : string =>{
  let color = MUTATION_COLOR;
  const colorsAvailable = MUTATION_SERIES_COLORS.filter(color => !colorsUsed.includes(color));
  if (colorsAvailable.length > 0) {
    color = colorsAvailable[0];
    colorsUsed.push(color);
  }
  return color;
};

export const releaseMutationColor = (color: string) : void =>{
  const colorIndex = colorsUsed.indexOf(color);
  if (colorIndex !== UNSET) {
    colorsUsed.splice(colorIndex, 1);
  }
};

export const resetMutationColors = () : void =>{
  colorsUsed.length = 0;
};