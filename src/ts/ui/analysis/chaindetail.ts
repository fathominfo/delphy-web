import { TransmissionChain } from "../../pythia/introductions";
import { Pythia } from "../../pythia/pythia";
import { UNSET } from "../common";


const container = document.querySelector("#analysis--introductions-container") as HTMLDivElement;
const detailTemplate = container.querySelector(".introduction-detail") as SVGElement;
detailTemplate.remove();
const detailMarkerTemplate = detailTemplate.querySelector(".node") as SVGCircleElement;
detailMarkerTemplate.remove();




type Node = {
  index: number,
  time: number,
  left: Node | null,
  right: Node | null,
  /*
  position based on the assumption that each tip has a
  height of 1
  */
  y: number,
  isTip: boolean
};

type IntroLayout = {
  root: Node | null,
  rowCount: number
};



export class ChainDetail {
  chain: TransmissionChain;
  minDate: number;
  maxDate: number;
  layout: IntroLayout;
  width: number = UNSET;

  constructor(chain: TransmissionChain, minDate: number, maxDate: number,
    pythia: Pythia, tipCounts: number[], summaryEle: SVGElement
  ) {
    this.chain = chain;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.layout = this.generateLayout(pythia, tipCounts);
    requestAnimationFrame(() => this.render(summaryEle));
  }

  generateLayout(pythia: Pythia, tipCounts: number[]) : IntroLayout {
    const mccRef = pythia.getMcc();
    const mcc = mccRef.getMcc();
    const { nodes, tips } = this.chain;
    const rootIndex = nodes[0];
    const NODE = 1;
    const TIP = 2;
    /* sparse array of the nodes in this chain */
    const valids: number[] = [];
    nodes.forEach(n => valids[n] = NODE);
    tips.forEach(n => valids[n] = TIP);
    const root: Node = {
      index: rootIndex,
      time: UNSET,
      left: null,
      right: null,
      y: UNSET,
      isTip: tips.includes(rootIndex)
    };
    const q: Node[] = [root];
    const terminations: Node[] = [];
    /*
    traverse the tree _depth_ first, repeating the logic of
    `mccTreeCanvas.positionTreeNodes()`
    */
    while (q.length > 0) {
      const node = q.shift() as Node;
      const index = node.index;
      node.time = mcc.getTimeOf(index);
      const leftIndex = mcc.getLeftChildIndexOf(index);
      if (leftIndex === UNSET) {
        node.y = terminations.length;
        terminations.push(node);
      } else {
        const rightIndex = mcc.getRightChildIndexOf(index);
        const lCount = tipCounts[leftIndex];
        const rCount = tipCounts[rightIndex];
        let greaterIndex = leftIndex;
        let lesserIndex = rightIndex;
        /*
        put the node with the lower count before the one with the higher count.
        if the same count, put the earlier one first.
        if same time, put the lower index first for predictability.
        */
        if (rCount > lCount) {
          greaterIndex = rightIndex;
          lesserIndex = leftIndex
        } else if (rCount === lCount) {
          const lTime = mcc.getTimeOf(leftIndex);
          const rTime = mcc.getTimeOf(rightIndex);
          if (rTime < lTime) {
            greaterIndex = rightIndex;
            lesserIndex = leftIndex
          } else if (rTime === lTime) {
            if (rightIndex < leftIndex) {
              greaterIndex = rightIndex;
              lesserIndex = leftIndex
            }
          }
        }
        if (!valids[leftIndex] && !valids[rightIndex]) {
          node.y = terminations.length;
          terminations.push(node);
        } else {
          if (valids[greaterIndex]) {
            const left: Node = {
              index: greaterIndex,
              time: UNSET,
              left: null,
              right: null,
              y: UNSET,
              isTip: tips.includes(greaterIndex)
            };
            node.left = left;
            q.unshift(left);
          }
          if (valids[lesserIndex]) {
            const right: Node = {
              index: lesserIndex,
              time: UNSET,
              left: null,
              right: null,
              y: UNSET,
              isTip: tips.includes(lesserIndex)
            };
            node.right = right;
            q.unshift(right);
          }
        }
      }
    }
    mccRef.release();
    q.length = 0;
    let i = 0;
    q.push(root);
    while (i < q.length) {
      const node = q[i];
      if (node.left) q.push(node.left);
      if (node.right) q.push(node.right);
      i++;
    }
    /* now work backwards */
    while (q.length > 0) {
      const node = q.pop() as Node;
      if (node.y === UNSET) {
        let y: number = UNSET;
        if (node.left) {
          y = node.left.y
          if (node.right) {
            y += node.right.y
            y /= 2;
          }
        } else if (node.right) {
          y = node.right.y
        } else {
          console.warn(`node has no .y and no kids`, node);
        }
        node.y = y;
      }
    }
    return {
      root: root,
      rowCount: terminations.length
    };
  }

  render(summaryEle: SVGElement) : void {
    const { layout, minDate, maxDate, chain } = this;
    const { root, rowCount } = layout;
    if (!root) return;
    const svg = detailTemplate.cloneNode(true) as SVGElement;
    const path = svg.querySelector("path") as SVGPathElement;
    const text = svg.querySelector("text") as SVGTextElement;
    const width = parseFloat(svg.getAttribute("width") as string);
    const rowHeight = parseFloat(svg.getAttribute("height") as string);
    const leftSide = parseFloat(path.getAttribute("data-left") as string);
    const height = (rowCount + 2) * rowHeight;
    const top = rowHeight;
    const range = width - leftSide;
    svg.setAttribute("height", `${height}`);
    text.innerHTML = `<tspan dx="-10" dy="0">from</tspan>  ${chain.from}`;
    let d = '';
    const xFor = (time: number) => leftSide + (time - minDate) / (maxDate - minDate) * range;

    const drawBranch = (node:Node)=>{
      const { time, left, right, y } = node;
      const nx = xFor(time);
      const ny = top + rowHeight * y;
      if (left && right) {
        const lx = xFor(left.time);
        const ly = top + rowHeight * left.y;
        const rx = xFor(right.time);
        const ry = top + rowHeight * right.y;
        d += `M ${lx} ${ly} L ${nx} ${ly} ${nx} ${ry} ${rx} ${ry} `;
        q.push(left);
        q.push(right);
      } else if (left) {
        const lx = xFor(left.time);
        const ly = top + rowHeight * left.y;
        d += `M ${lx} ${ly} L ${nx} ${ny} `;
        q.push(left);
      } else if (right) {
        const rx = xFor(right.time);
        const ry = top + rowHeight * right.y;
        d += `M ${nx} ${ny} L ${rx} ${ry} `;
        q.push(right);
      }
    };
    const drawNode = (node: Node) => {
      const { time, left, right, y, isTip } = node;
      const nx = xFor(time);
      const ny = top + rowHeight * y;
      const circle = detailMarkerTemplate.cloneNode(true) as SVGCircleElement;
      circle.setAttribute("cx", `${nx}`);
      circle.setAttribute("cy", `${ny}`);
      if (isTip) circle.classList.add("tip");
      svg.appendChild(circle);
      if (left) {
        q.push(left);
      }
      if (right) {
        q.push(right);
      }
    };

    const q = [root];
    let index = 0;
    while (index < q.length) {
      const node = q[index] as Node;
      drawBranch(node);
      index++;
    }
    index = 0;
    while (index < q.length) {
      const node = q[index] as Node;
      drawNode(node);
      index++;
    }

    path.setAttribute("d", d);
    (summaryEle.parentNode as HTMLDivElement).insertBefore(svg, summaryEle);
    summaryEle.classList.add("hidden");
  }

}