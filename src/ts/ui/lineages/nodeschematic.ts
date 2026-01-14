import { MutationDistribution } from "../../pythia/mutationdistribution";

import { DisplayNode, UNSET } from "../common";
import { NodeCallback, NodeComparisonData } from "./lineagescommon";
import { mutationPrevalenceThreshold } from "./nodecomparisonchartdata";


const UNSET_CHAR = "-";

/*
this draws a simple schematic to show the relations
between nodes in the tree. The current intent is that
there is only one of these.
*/
export class NodeSchematic {
  hasMRCA: boolean;
  highlightedNode: DisplayNode | typeof UNSET;
  nodeHighlightCallback: NodeCallback;
  src: NodeComparisonData[] = [];
  indexes: [number, number, number, number] = [UNSET, UNSET, UNSET, UNSET];
  mutationLists: MutationDistribution[][];
  dataConfig: string;
  div: HTMLDivElement;
  centralLine: HTMLDivElement;
  endLine: HTMLDivElement;
  upperLine: HTMLDivElement;
  lowerLine: HTMLDivElement;
  centerLabel:string = UNSET_CHAR;
  endLabel:string = UNSET_CHAR;
  upperLabel:string = UNSET_CHAR;
  lowerLabel:string = UNSET_CHAR;
  nodeAisUpper = true;

  constructor(nodeHighlightCallback: NodeCallback) {
    this.hasMRCA = false;
    this.highlightedNode = UNSET;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.mutationLists = Array(4);
    this.dataConfig = "root";
    this.div = document.querySelector("#subway") as HTMLDivElement;
    this.centralLine = this.div.querySelector(".line.central") as HTMLDivElement;
    this.endLine = this.div.querySelector(".line.end") as HTMLDivElement;
    this.upperLine = this.div.querySelector(".line.upper") as HTMLDivElement;
    this.lowerLine = this.div.querySelector(".line.lower") as HTMLDivElement;
  }


  setLabelValue(div: HTMLDivElement, code: string): void {
    const label = code === UNSET_CHAR ? '' : code.toUpperCase();
    (div.querySelector(".terminus.exit") as HTMLDivElement).textContent = label;
  }

  draw() {
    console.log(`data-config: ${ this.dataConfig},  center: ${this.centerLabel},  end: ${this.endLabel},  upper: ${this.upperLabel},  lower: ${this.lowerLabel}`, this.indexes);
    this.div.setAttribute("data-config", this.dataConfig);
    this.centralLine.setAttribute("data-to", this.centerLabel);
    this.endLine.setAttribute("data-from", this.centerLabel);
    this.upperLine.setAttribute("data-from", this.centerLabel);
    this.lowerLine.setAttribute("data-from", this.centerLabel);
    this.endLine.setAttribute("data-to", this.endLabel);
    this.upperLine.setAttribute("data-to", this.upperLabel);
    this.lowerLine.setAttribute("data-to", this.lowerLabel);
    this.setLabelValue(this.centralLine, this.centerLabel);
    this.setLabelValue(this.endLine, this.endLabel);
    this.setLabelValue(this.upperLine, this.upperLabel);
    this.setLabelValue(this.lowerLine, this.lowerLabel);
  }

  setData(src: NodeComparisonData[], indexes: [number, number, number, number], node1IsUpper: boolean) {
    // console.debug(src.map(ncd=>ncd.nodePair.pairType));
    this.src = src;
    this.indexes = indexes;
    this.nodeAisUpper = node1IsUpper;



    const getMutationsFor = (nodeIndex: number)=>{
      const data = src.filter(ncd=>ncd.nodePair.index2 === nodeIndex)[0],
        muts = !data? []: data.nodePair.mutations.filter(md => md.getConfidence() >= mutationPrevalenceThreshold);
      return muts;
    }


    this.dataConfig = "root";
    this.centerLabel = UNSET_CHAR;
    this.endLabel = UNSET_CHAR;
    this.upperLabel = UNSET_CHAR;
    this.lowerLabel = UNSET_CHAR;

    this.mutationLists[DisplayNode.root] = [];
    this.mutationLists[DisplayNode.mrca] = getMutationsFor(indexes[DisplayNode.mrca]);
    this.mutationLists[DisplayNode.node1] = getMutationsFor(indexes[DisplayNode.node1]);
    this.mutationLists[DisplayNode.node2] = getMutationsFor(indexes[DisplayNode.node2]);
    if (indexes[DisplayNode.mrca] !== UNSET) {
      this.dataConfig = "mrca";
      this.centerLabel = "mrca";
      if (node1IsUpper) {
        this.upperLabel = "a";
        this.lowerLabel = "b";
      } else {
        this.upperLabel = "b";
        this.lowerLabel = "a";
      }
    } else if (indexes[DisplayNode.node1] !== UNSET) {
      if (indexes[DisplayNode.node2] === UNSET) {
        this.dataConfig = "a";
        this.centerLabel = "a";
      } else {
        /*
        are nodes 1 and 2 both descended from root,
        or is one the parent of the other?
        */
        const root = indexes[DisplayNode.root],
          node1 = indexes[DisplayNode.node1],
          node2 = indexes[DisplayNode.node2];
        let node1Parent: number = UNSET,
          node2Parent: number = UNSET;
        src.forEach((ncd: NodeComparisonData)=>{
          const pair = ncd.nodePair;
          if (pair.index2 === node1) node1Parent = pair.index1;
          else if (pair.index2 === node2) node2Parent = pair.index1;
        });
        if (node1Parent === root) {
          if (node2Parent === root) {
            if (node1IsUpper)  {
              this.dataConfig = "ab";
              this.upperLabel = "a";
              this.lowerLabel = "b";
            } else {
              this.dataConfig = "ba";
              this.upperLabel = "b";
              this.lowerLabel = "a";
            }
          } else if (node2Parent === node1) {
            this.dataConfig = "a2b";
            this.centerLabel = "a";
            this.endLabel = "b";
          } else {
            console.warn('the developer has unwarranted assumptions about node relations', node2Parent, indexes);
          }
        } else if (node1Parent === node2 && node2Parent === root) {
          this.dataConfig = "b2a";
          this.centerLabel = "b";
          this.endLabel = "a";
        } else {
          console.warn('the developer has unwarranted assumptions about node relations', node1Parent, node2Parent, indexes);
        }
      }
    } else if (indexes[DisplayNode.node2] !== UNSET) {
      this.dataConfig = "b";
      this.centerLabel = "B";
    }
    requestAnimationFrame(()=>{
      this.draw();
    });

  }


  highlightNode(node: DisplayNode | typeof UNSET) : void {
    if (node !== this.highlightedNode) {
      this.highlightedNode = node;
      this.draw();
    }
  }


}