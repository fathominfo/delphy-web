import { lerpColor } from "../common";
import { SharedState } from "../../sharedstate";
import { UIScreen } from '../uiscreen';
// import { SVGMapRenderer } from "./rendermap";
const MAP_URL = "/assets/svg/SLE_GIN_LBR.svg";

export class MapUI extends UIScreen {
  currentColoyByLabel: HTMLSpanElement | null;

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);

    this.currentColoyByLabel = this.div.querySelector("#color-by-current");
    this.bindListeners();
  }

  async loadSVGMap(regions: string[]) {
    const container = this.div.querySelector(".map--svg--container") as HTMLDivElement;
    try {
      // const response = await fetch(MAP_URL);
      const response = await fetch("/api/svg", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          countries: regions,
          admLevel: 2
        })
      });
      if (!response.ok) {
        throw new Error(`Failed to load SVG: ${response.status} ${response.statusText}`);
      }
      const svgText = await response.text();
      container.innerHTML = svgText;
    } catch (error) {
      console.error("Error loading SVG:", error);
      container.innerHTML = `<p class="map-error">Unable to load svg map.</p>`;
    }

    this.colorBySequenceCounts();
  }

  addInputRegionListeners() {
    const input = this.div.querySelector<HTMLInputElement>("#region-input")!;
    const addButton = this.div.querySelector<HTMLButtonElement>("#add-region")!;
    const list = this.div.querySelector<HTMLUListElement>("#region-list")!;

    const selectedRegions = new Set<string>();

    const addRegion = (value: string) => {
      const region = value.trim();

      if (!region || selectedRegions.has(region.toLowerCase())) {
        return;
      }

      selectedRegions.add(region.toLowerCase());

      const li = document.createElement("li");
      li.className = "region-tag";

      const text = document.createElement("span");
      text.textContent = region;

      const remove = document.createElement("button");
      remove.textContent = "x";
      remove.type = "button";

      remove.onclick = () => {
        selectedRegions.delete(region.toLowerCase());
        li.remove();
      };

      li.append(text, remove);
      list.appendChild(li);

      input.value = "";
    }

    addButton.addEventListener("click", () => {
      addRegion(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addRegion(input.value);
      }
    })

    const submit = this.div.querySelector<HTMLButtonElement>("#generate-map");
    submit?.addEventListener("click", () => {
      const allRegionsInput: string[] = []
      list.querySelectorAll("li").forEach(node => {
        const countryCode = node.querySelector("span")?.textContent?.trim().toUpperCase();
        if (countryCode) allRegionsInput.push(countryCode)
      })
      this.loadSVGMap(allRegionsInput)
    });
  }

  bindListeners() {
    this.div.querySelectorAll<HTMLInputElement>('input[name="color-mode"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          switch (radio.value) {
          case "sequences":
            this.colorBySequenceCounts();
            if (this.currentColoyByLabel) this.currentColoyByLabel.innerHTML = "Sequence Counts"
            break;
          case "case-counts":
            this.colorByCaseCounts();
            if (this.currentColoyByLabel) this.currentColoyByLabel.innerHTML = "Estimated case Counts"
            break;
          case "mutation":
            this.colorByMutation();
            if (this.currentColoyByLabel) this.currentColoyByLabel.innerHTML = "Mutation"
            break;
          }
        });
      });

    this.addInputRegionListeners();
  }

  colorByMutation() {

  }
  colorByCaseCounts() {
    // need algorithm

  }

  colorBySequenceCounts() {
    const nodeMetadata = this.sharedState.mccConfig.getMetadataValues();   // this gets the metadata for every node, but we want tips
    const metadataTipCounts = nodeMetadata.slice(0, (nodeMetadata.length + 1) / 2);
    // console.log("metadata tip values: ", metadataTipCounts)

    const metadataTipTally = metadataTipCounts.reduce<Record<string, number>>((tally, metadata) => {
      tally[metadata] = (tally[metadata] ?? 0) + 1
      return tally
    }, {})


    this.colorMapBy(metadataTipTally);
  }

  colorMapBy(tally: Record<string, number>) {
    const max = Math.max(1, ...Object.entries(tally).map(([name, val]) => val))
    const svg = this.div.querySelector("svg")!;
    Object.entries(tally).forEach(([name, value]) => {
      const nameCleaned = name.split("-")[0].trim().toLowerCase();
      const region = svg.querySelector<SVGPathElement>(
        `path[data-name="${nameCleaned}"]`
      );

      if (region) {
        region.setAttribute("fill", lerpColor("#aa2020", "#ffffff", value / max));
      } else {
        console.warn(`Could not find a path id that matches ${nameCleaned}. `);
      }
    });
  }

  activate(): void {
    super.activate();
  }


  resize(): void {
    super.resize();
  }
}