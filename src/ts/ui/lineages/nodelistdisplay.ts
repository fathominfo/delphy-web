import { UNSET, getPercentLabel } from '../common';
import { DisplayNode } from './displaynode';
import { DismissCallback, HoverCallback, NodeCallback } from './lineagescommon';

const METADATA_ITEM_TEMPLATE = document.querySelector(".node-metadata-item") as HTMLElement;
METADATA_ITEM_TEMPLATE.remove();
const NODE_DIV_TEMPLATE = document.querySelector(".lineages--node-item") as HTMLDivElement;
const CONTAINER = document.querySelector("#lineages--node-list") as HTMLElement
NODE_DIV_TEMPLATE.remove();


const DEBUG = false;

class NodeDiv {
  div: HTMLDivElement;
  countSpan: HTMLSpanElement;
  confidenceSpan: HTMLSpanElement;
  nodeStats: HTMLElement;
  nodeIsTip: HTMLElement;
  tipIdSpan: HTMLElement;
  mdDiv: HTMLDivElement;
  dismiss: HTMLButtonElement;
  monophyletic: HTMLSpanElement;
  nodeName: HTMLSpanElement;
  nodeSource: HTMLSpanElement;
  node: DisplayNode | null = null;

  constructor() {
    this.div = NODE_DIV_TEMPLATE.cloneNode(true) as HTMLDivElement;
    this.countSpan = this.div.querySelector('.node--tip-count') as HTMLSpanElement;
    this.confidenceSpan = this.div.querySelector('.node--confidence') as HTMLSpanElement;
    this.nodeStats = this.div.querySelector(".node-stats") as HTMLElement;
    this.nodeIsTip = this.div.querySelector(".tip-info") as HTMLElement;
    this.tipIdSpan = this.div.querySelector(".tip-id") as HTMLElement;
    this.mdDiv = this.div.querySelector(".node-metadata") as HTMLDivElement;
    this.dismiss = this.div.querySelector(".node-dismiss") as HTMLButtonElement;
    this.monophyletic = this.div.querySelector(".mono-hover") as HTMLSpanElement;
    this.nodeName = this.div.querySelector(".node-name") as HTMLSpanElement;
    this.nodeSource = this.div.querySelector(".node-source") as HTMLSpanElement;
  }


  setData(node: DisplayNode) : void {
    this.node = node;
  }


  draw() {
    const {
      node,
      div,
      countSpan,
      confidenceSpan,
      nodeStats,
      nodeIsTip,
      tipIdSpan,
      mdDiv} = this;

    if (node === null) {
      this.div.classList.remove('active');
      this.div.classList.remove('locked');
      return;
    }
    if (!div.parentNode) {
      CONTAINER.appendChild(div);
    }

    div.classList.add('active');
    div.classList.toggle('locked', node.isLocked);
    const isTip = node.childCount === 1;
    div.classList.toggle("is-tip", isTip);

    div.setAttribute("data-nodetype", node.className.toLowerCase());
    this.nodeName.textContent = node.label;
    this.nodeSource.classList.toggle("hidden", !node.isInferred && !node.isRoot);
    this.dismiss.classList.toggle("hidden", node.isInferred);
    this.monophyletic.classList.toggle("hidden", node.isRoot);


    if (!isTip) {
      nodeStats.classList.remove("hidden");
      nodeIsTip.classList.add("hidden");
      countSpan.innerText = `${node.childCount} tip${node.childCount === 1 ? '' : 's'}`;
      if (confidenceSpan) {
        confidenceSpan.innerText = `${getPercentLabel(node.confidence)}%`;
      }
    } else {
      nodeStats.classList.add("hidden");
      nodeIsTip.classList.remove("hidden");
      if (DEBUG) {
        tipIdSpan.innerText = `${node.index} `;
      }
      if (node.metadata !== null) {
        if (node.metadata.id !== undefined) {
          tipIdSpan.innerText = `${node.metadata.id.value}`;
          tipIdSpan.title = node.metadata.id.value;
        } else if (node.metadata.accession !== undefined) {
          tipIdSpan.innerText = `${node.metadata.accession.value}`;
          tipIdSpan.title = node.metadata.accession.value;
        }
      }
    }


    if (node.metadata === null || (Object.keys(node.metadata).length === 1 && node.metadata.id !== undefined)) {
      mdDiv.classList.add('hidden');
    } else {
      mdDiv.classList.remove('hidden');

      mdDiv.querySelectorAll(".node-metadata-item").forEach(div=>div.remove());
      Object.entries(node.metadata).forEach(([key, value])=>{
        if (key.toLowerCase() !== 'id' && key.toLowerCase() !== 'accession'){
          const item = METADATA_ITEM_TEMPLATE.cloneNode(true) as HTMLElement;
          mdDiv.appendChild(item);

          const summary = item.querySelector(".pair--key-value") as HTMLElement;
          (summary.querySelector(".key") as HTMLElement).innerText = key;
          (summary.querySelector(".value") as HTMLElement).innerText = replaceUnknown(value.value);

          const valueCountPair = item.querySelector(".pair--value-count") as HTMLElement;
          item.querySelectorAll(".pair--value-count").forEach(el => el.remove());

          if (!isTip) {
            const tipCounts = item.querySelector(".tip-counts") as HTMLElement;
            Object.entries(value.counts).forEach(([val, count])=>{
              const pair = valueCountPair.cloneNode(true) as HTMLElement;
              tipCounts.appendChild(pair);
              if (val === value.value) {
                pair.classList.add("current");
              }
              (pair.querySelector(".value") as HTMLElement).innerText = replaceUnknown(val);
              (pair.querySelector(".count") as HTMLElement).innerText = `${count}`;
            });
          } else {
            const details = item.querySelector("details") as HTMLDetailsElement;
            details.classList.add("disabled");
          }
        }
      });
    }
  }

  clear() {
    this.node = null;
    this.div.remove();
  }

  pushback() {
    this.div.classList.add('lowlight');
  }

  restore() {
    this.div.classList.remove('lowlight');
  }

}



type DivClaim = {
  div: NodeDiv,
  inUse: boolean
};

class DivPool {
  divs: Set<DivClaim>;

  constructor() {
    this.divs = new Set();
  }

  getDiv(dismissCallback: DismissCallback, nodeHighlightCallback: HoverCallback,
    nodeZoomCallback: NodeCallback): NodeDiv {
    let div: NodeDiv | null = null;
    for (const claim of this.divs) {
      if (!claim.inUse && div === null) {
        div = claim.div;
        claim.inUse = true;
      }
    }
    if (div === null) {
      div = new NodeDiv();
      const actualDiv = div.div;
      CONTAINER.appendChild(actualDiv);
      div.dismiss.addEventListener('click', (event)=>{
        event.stopImmediatePropagation();
        const index = (div?.node as DisplayNode).index;
        dismissCallback(index);
      });
      actualDiv.addEventListener('pointerenter', () => nodeHighlightCallback((div?.node as DisplayNode).index, UNSET, null));
      actualDiv.addEventListener('pointerleave', () => nodeHighlightCallback(UNSET, UNSET, null));
      actualDiv.addEventListener('click', () => nodeZoomCallback((div?.node as DisplayNode).index));
      this.divs.add({div, inUse: true});
    }
    return div;
  }

  releaseDiv(div: NodeDiv) : void {
    for (const claim of this.divs) {
      if (claim.div === div) {
        claim.inUse = false;
      }
    }
    // console.log(`pool size: ${this.divs.size}`)
  }

}





export class NodeListDisplay {
  // the index of these arrays will be the DisplayNode index
  private nodeDivs: (NodeDiv | null)[] = [];
  private pool: DivPool;
  private nodes: (DisplayNode | null)[] = [];
  private dismissCallback: DismissCallback;
  private nodeHighlightCallback: HoverCallback;
  private nodeZoomCallback: NodeCallback;

  constructor(dismissCallback: DismissCallback, nodeHighlightCallback: HoverCallback,
    nodeZoomCallback: NodeCallback) {
    this.pool = new DivPool();
    this.dismissCallback = dismissCallback;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.nodeZoomCallback = nodeZoomCallback;
    (document.querySelector("#lineages--node-list") as HTMLDivElement).addEventListener('pointerleave', ()=>nodeHighlightCallback(UNSET, UNSET, null));
  }

  addNode(node: DisplayNode) : void {
    const index = node.index;
    let nodeDiv = this.nodeDivs[index];
    if (!nodeDiv) {
      nodeDiv = this.pool.getDiv(this.dismissCallback, this.nodeHighlightCallback, this.nodeZoomCallback);
      this.nodeDivs[index] = nodeDiv;
    }
    this.nodes[index] = node;
    nodeDiv.setData(node);
  }

  clearNode(index: number): void {
    const div = this.nodeDivs[index];
    if (div) {
      div.clear();
      this.pool.releaseDiv(div);
    }
    this.nodeDivs[index] = null;
    this.nodes[index] = null;
  }


  /*
  @param nodes: a sparse array where the array index corresponds
    to a node in the tree
  */
  setNodes(nodes: DisplayNode[]) {
    const lookup: boolean[] = [];
    nodes.forEach(n=>lookup[n.index] = true);
    this.nodes.forEach((_, index)=>{ // eslist-disable-line
      if (!lookup[index]) {
        this.clearNode(index);
      }
    });
    nodes.forEach(node=>{
      this.addNode(node);
    });
  }

  requestDraw() {
    requestAnimationFrame(()=>this.nodeDivs.forEach(div=>div?.draw()));
  }

  highlightNode(node: DisplayNode) : void {
    if (node.index === UNSET) {
      this.nodeDivs.forEach(div=>div?.restore());
    } else {
      this.nodeDivs.forEach(div=>div?.pushback());
      this.nodeDivs[node.index]?.restore();
    }
  }

}

const replaceUnknown = (val: string)=>val === '-' ? 'Unknown' : val;


