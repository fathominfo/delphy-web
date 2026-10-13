

export enum PoplarChart {
  baseTree,
  poplarTree
}

export type SelectTreeCallback = (_: number) => void;
export type SelectNodeCallback = (nodeIndex: number, src: PoplarChart) => void;
