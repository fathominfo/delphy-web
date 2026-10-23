

export enum PoplarChart {
  baseTree,
  poplarTree
}

export type SelectCallback = (_: number) => void;
export type SelectNodeCallback = (nodeIndex: number, src: PoplarChart) => void;

export const UNSET_DATE = Number.NEGATIVE_INFINITY;


