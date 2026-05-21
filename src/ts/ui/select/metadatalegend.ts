import { ColorDict, ColorOption, MetadataColorOption, UNSET } from "../common";
import { MccConfig } from "../mccconfig";
import { NodeMetadata } from "../nodemetadata";
import { MultiNodeCallback } from "./selectcommon";


const ITEM_SELECTOR = ".legend-item";
const LEGEND = document.getElementById("select--metadata-legend") as HTMLDivElement;
const CONTAINER = LEGEND.querySelector("#select--metadata-legend--list") as HTMLDivElement;
const TEMPLATE = CONTAINER.querySelector(ITEM_SELECTOR) as HTMLDivElement;
TEMPLATE.remove();


type NodesByValue = {[_:string]: number[]};

export class MetadataLegend  {

  field: string | null = null;
  colors: ColorDict = {};
  sortedValues: [string, number][] = [];
  showingMetadata = false;
  displayNeedsUpdate = false;
  valueNodes: NodesByValue = {};
  nodeValues: string[] = [];

  constructor(highlightCallback: MultiNodeCallback) {
    const itemClass = ITEM_SELECTOR.substring(1);
    let previousValue: string | null = null;
    CONTAINER.addEventListener("pointermove", event=>{
      const target = event.target as HTMLDivElement;
      let value: string | null = null;
      if (target && target.classList.contains(itemClass)) {
        value = target.getAttribute("data-value") as string;
      }
      if (previousValue !== value) {
        previousValue = value;
        if (value) {
          highlightCallback(this.valueNodes[value]);
        } else {
          highlightCallback(null);
        }
      }
    });
    CONTAINER.addEventListener("pointerleaven", ()=>{
      previousValue = null;
      highlightCallback(null);
    });
  }

  setLegendData(mccConfig: MccConfig) {
    // console.log(mccConfig)
    this.field = mccConfig.metadataField;
    const nodeMetadata = mccConfig.nodeMetadata as NodeMetadata;
    this.showingMetadata = mccConfig.colorOption === ColorOption.metadata
      && this.field !== null
      && nodeMetadata !== null;
    if (this.field) {
      this.colors = mccConfig.metadataColors[this.field as string];
      if (this.colors) {
        /* get tip counts for metadata */
        const header = (nodeMetadata as NodeMetadata).metadata.header;
        const colIndex = header.indexOf(this.field);
        this.sortedValues = nodeMetadata.columnSummaries[colIndex].sorted;
        const values: NodesByValue = {};
        this.nodeValues = [];
        nodeMetadata.nodeValues.forEach((nodeRow, i)=>{
          const value = nodeRow[colIndex]?.value;
          if (value) {
            if (values[value] === undefined) {
              values[value] = [];
            }
            values[value].push(i);
          }
          this.nodeValues[i] = value;
        });
        this.valueNodes = values;

      } else {
        this.showingMetadata = false;
      }
    } else {
      this.showingMetadata = false;
    }
    this.displayNeedsUpdate = true;
  }

  requestDraw() {
    if (this.displayNeedsUpdate) {
      this.displayNeedsUpdate = false;
      requestAnimationFrame(()=>this.render());
    }
  }


  render() {
    const {showingMetadata, colors, sortedValues} = this;
    CONTAINER.innerHTML = '';
    if (showingMetadata) {
      /* get tip counts for metadata */
      sortedValues.forEach(([value])=>{
        const mdColor: MetadataColorOption = colors[value];
        if (mdColor.active) {
          const item = TEMPLATE.cloneNode(true) as HTMLDivElement;
          (item.querySelector(".swatch") as HTMLDivElement).style.backgroundColor = mdColor.color;
          (item.querySelector(".name") as HTMLSpanElement).textContent = value;
          item.setAttribute("data-value", value);
          CONTAINER.append(item);
        }
      });
    }
    LEGEND.classList.toggle("hidden", !showingMetadata);
  }

  highlight(nodeIndex: number) {
    if (nodeIndex === UNSET) {
      CONTAINER.querySelectorAll(ITEM_SELECTOR).forEach(ele=>{
        ele.classList.remove("back")
      });
    } else {
      const value = this.nodeValues[nodeIndex];
      CONTAINER.querySelectorAll(ITEM_SELECTOR).forEach(ele=>{
        ele.classList.toggle("back", ele.getAttribute("data-value") !== value);
      })


    }
  }

}