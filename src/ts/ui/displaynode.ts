import { getCSSValue, UNSET } from "./common";



const enum FixedNodes_deprecated {
  root = 0,
  mrca = 1,
  nodeA = 2,
  nodeB = 3,
  UNSET = -1
}
const nodeTypeNames = ["Root", "MRCA", "A", "B"];
const nodeClassNames: string[] = ["root", "mrca", "nodeA", "nodeB"];



export class DisplayNode {
  name: string;
  index: number;
  private dnIndex: number;
  className: string;
  generationsFromRoot: number;
  isInferred: boolean;
  /* we need series in order to fully replace the NodeDisplay type */
  // series: NodeDistribution | null = null;

  constructor(dn: number, generationsFromRoot: number, isInferred: boolean) {
    this.dnIndex = dn;
    this.index = FixedNodes_deprecated.UNSET;
    this.name = nodeTypeNames[dn];
    this.className = nodeClassNames[dn];
    this.generationsFromRoot = generationsFromRoot;
    this.isInferred = isInferred;
    DisplayNodes[this.dnIndex] = this;
  }

  // setSeries(series: NodeDistribution | null): void {
  //   this.series = series;
  // }

  getStroke(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-stroke`;
    return getCSSValue(strokeProp);
  }
  getFill(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-fill`;
    return getCSSValue(strokeProp);
  }
  getTint(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-tint`;
    return getCSSValue(strokeProp);
  }
  setIndex(index: number):void {
    this.index = index;
  }
  deactivate(): void {
    this.index = UNSET;
  }
}


export const DisplayNodes: DisplayNode[] = [];
new DisplayNode(0, 0, true);
new DisplayNode(1, 0, true);
new DisplayNode(2, 0, false);
new DisplayNode(3, 0, false);


const MAX_NODE_COUNT = 26;
const NUMS_IN_USE: boolean[] = new Array(MAX_NODE_COUNT);
NUMS_IN_USE.fill(false);




export class DisplayNodeClass {
  name: string;
  nodeIndex: number;
  className: string;
  inferred: boolean;
  private nameIndex: number;
  generationsFromRoot: number;


  constructor(nameIndex: number, nodeIndex: number, inferred = false) {
    this.nameIndex = nameIndex;
    this.name = String.fromCharCode(ASCII_BASE + nameIndex)
    this.nodeIndex = nodeIndex;
    this.className = `node-${this.name}`;
    this.inferred = inferred;
    this.generationsFromRoot = UNSET;
    NUMS_IN_USE[this.nameIndex] = true;
  }

  getStroke(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-stroke`;
    return getCSSValue(strokeProp);
  }
  getFill(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-fill`;
    return getCSSValue(strokeProp);
  }
  getTint(): string {
    const strokeProp = `--${ this.name.toLowerCase() }-tint`;
    return getCSSValue(strokeProp);
  }

  deactivate() {
    NUMS_IN_USE[this.nameIndex] = false;
  }

}



const currentSelections: DisplayNode[] = []

const ASCII_BASE = 65;
let letterNum = 0;

const getNextNameNum = ():number=>{
  if (currentSelections.length >= MAX_NODE_COUNT) {
    alert(`Sorry, we only support up to ${ MAX_NODE_COUNT } selections`);
    throw new Error(`Sorry, we only support up to ${ MAX_NODE_COUNT } selections`);
  }
  while (NUMS_IN_USE[letterNum]) {
    letterNum++;
    letterNum %= 26;
  }
  return letterNum;
}


export const addSelectedNode = (nodeIndex: number)=>{
  const nameNum = getNextNameNum();
  const node = new DisplayNode(nameNum, nodeIndex, false);
  return node;
}