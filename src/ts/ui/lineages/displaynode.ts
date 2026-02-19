import { getCSSValue, UNSET } from "../common";
import { Distribution } from "../distribution";
import { NodeMetadataValues } from "../nodemetadata";

const MAX_NODE_COUNT = 26;
const NUMS_IN_USE: boolean[] = new Array(MAX_NODE_COUNT);
NUMS_IN_USE.fill(false);

/* hack alert: we need special handling for the null node */
export const NULL_NODE_CODE = 999;

export class DisplayNode {
  index: number = UNSET;
  /*
  the letter assigned to a selected node,
  or 'M' for an MRCA
  */
  label = '';
  className = '';
  /*
  only set when a node is an MRCA,
  comma delimited list of the selected nodes underneath it.
  */
  mrcaName = '';
  /* the node name for assigned nodes */
  name = '';

  private nameIndex: number;
  generationsFromRoot: number = UNSET;
  /*
  `isInferred` applies to inner nodes that are found
  automatically, like the root of the tree or
  most recent common ancestors (MRCAs).
  `isRoot` is applied to the root of the tree, which
  by default is identified by the delphy engine.

  However! The user has the option to choose a
  different root for the tree. In that case,
  `isRoot` will be true, but `isInferred` will be false.

  If a node is neither inferred or root, it has
  been chosen by the user. If that's just by
  hover, then `isLocked` will be false. If it
  is clicked, then `isLocked` will be true (until
  it is dismissed).

  Here's a truth table for isRoot and isInferred:

                      not root         is root
                   ---------------+--------------
    is inferred   |   MRCA             actual root
                  +
    not inferred  |   node chosen      root chosen
                  |   by user          by user

  */


  isInferred = false;
  isRoot = false;
  isLocked = false;
  confidence: number = UNSET;
  childCount = 0;
  metadata: NodeMetadataValues | null = null;
  series: Distribution | null = null;
  times: number[] = [];



  constructor(index: number, generationsFromRoot: number, isInferred: boolean,
    isRoot: boolean, confidence: number, childCount: number,
    series: Distribution, metadata: NodeMetadataValues | null) {
    if (isRoot || isInferred || index === NULL_NODE_CODE) {
      this.nameIndex = UNSET;
    } else {
      this.nameIndex = getNextSelectionClass();
      NUMS_IN_USE[this.nameIndex] = true;
    }
    this.setData(index, generationsFromRoot, isInferred,
      isRoot, confidence, childCount,
      series, metadata);
  }

  setData(index: number, generationsFromRoot: number, isInferred: boolean,
    isRoot: boolean, confidence: number, childCount: number,
    series: Distribution, metadata: NodeMetadataValues | null) {
    if (isRoot) {
      this.name = "Root";
      this.label = "Root";
      this.mrcaName = "";
    } else if (isInferred) {
      // console.log("set data isInferred");
      // if (this.name === "") {
      this.name = "MRCA";
      this.label = "M";
      // }
    } else if (index === UNSET || index === NULL_NODE_CODE) {
      this.name = "";
      this.label = this.name;
      this.mrcaName = "";
    } else {
      this.name = String.fromCharCode(ASCII_BASE + this.nameIndex);
      this.label = this.name;
      this.mrcaName = "";
    }
    this.index = index;
    this.className = this.name.toLowerCase() || '';
    this.generationsFromRoot = generationsFromRoot;
    this.isInferred = isInferred;
    this.isRoot = isRoot;
    this.isLocked = false; // <--- maybe this is a bad idea? [mark 261212]
    this.confidence = confidence;
    this.childCount = childCount;
    this.series = series;
    this.times = series.times;
    this.metadata = metadata;
  }


  setMRCAName(name = "") : void {
    this.mrcaName = name;
  }


  copyFrom(other: DisplayNode) {
    this.index = other.index;
    this.name = other.name;
    this.label = other.label;
    this.className = other.className;
    this.generationsFromRoot = other.generationsFromRoot;
    this.isInferred = other.isInferred;
    this.isRoot = other.isRoot;
    this.isLocked = other.isLocked;
    this.confidence = other.confidence;
    this.childCount = other.childCount;
    this.series = other.series;
    this.times = other.times;
    this.metadata = other.metadata;
  }

  getStroke(): string {
    const strokeProp = `--${ this.className.toLowerCase() }-stroke`;
    return getCSSValue(strokeProp);
  }
  getFill(): string {
    const strokeProp = `--${ this.className.toLowerCase() }-fill`;
    return getCSSValue(strokeProp);
  }
  getTint(): string {
    const strokeProp = `--${ this.className.toLowerCase() }-tint`;
    return getCSSValue(strokeProp);
  }
  setIndex(index: number):void {
    this.index = index;
  }

  lock() { this.isLocked = true; }
  unlock() { this.isLocked = false; }

  deactivate(): void {
    NUMS_IN_USE[this.nameIndex] = false;
    this.unlock();
    this.index = UNSET;
  }

  isTip(): boolean {
    return this.childCount <= 1;
  }
}


const ASCII_BASE = 65;

const getNextSelectionClass = ():number=>{
  const available: number[] = [];
  NUMS_IN_USE.forEach((inUse, i)=>{if (!inUse) available.push(i)});
  if (available.length === 0) {
    alert(`Sorry, we only support up to ${ MAX_NODE_COUNT } selections`);
    throw new Error(`Sorry, we only support up to ${ MAX_NODE_COUNT } selections`);
  }
  console.log(`getNextNameNum(${ available[0] })`);
  return available[0];
}

