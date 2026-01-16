import {Mutation, SummaryTree} from '../../pythia/delphy_api';
import {MccUI} from '../mccui';
import {MccRef} from '../../pythia/mccref';
import {MutationOfInterest, MutationOfInterestSet, FeatureOfInterest} from '../../pythia/mutationsofinterest';
import {MutationRow, NodeFunctionType, clearMutationRows} from './mutationrow';
import {SharedState} from '../../sharedstate';
import { getMutationName, getMutationNameParts, mutationEquals, siteIndexToLabel } from '../../constants';
import { TreeCanvas } from '../treecanvas';
import { MccTree } from '../../pythia/delphy_api';
import { DataResolveType, getPercentLabel, MUTATION_COLOR, Screens, UNSET } from '../common';
import { MutationPrevalenceCanvas } from './mutationprevalencecanvas';
import { MutationData, MUTATION_SERIES_COLORS, DisplayOption, ParameterCallback, RowFunctionType } from './mutationscommon';

import autocomplete from 'autocompleter';
import { ParameterSetter } from './parametersetter';


type SortOptions = "site" | "tips" | "trees";
type SortDirection = "ascending" | "descending";

const maybeTableBody = document.querySelector("#mutation-rows");
if (!maybeTableBody) {
  throw new Error("mutations.html doesn't have the container for the mutation rows!");
}
const MUTATION_TABLE_BODY = <HTMLDivElement> maybeTableBody;

const MOI_LIST = document.querySelector(".moi-list--body") as HTMLElement;

const MOI_TEMPLATE = MOI_LIST.querySelector(".moi") as HTMLElement;
MOI_TEMPLATE.remove();

const NO_MUTATIONS = document.querySelector(".no-mutations") as HTMLElement;
NO_MUTATIONS.remove();


const DEFAULT_MINIMUM_MOI_PRESENCE = 0.25;
const DEFAULT_MINIMUM_TIP_PERCENT = 0.05;
const MAX_AUTOFILL_MUTATIONS = 5;
const AC_SUGGESTION_TEMPLATE = document.querySelector(".autocomplete-suggestion") as HTMLElement;
AC_SUGGESTION_TEMPLATE.remove();

const MANY_TIPS_PCT = 0.75;

const colorsUsed: string[] = [];


type InterestCategory = FeatureOfInterest | 'all'

export class MutationsUI extends MccUI {
  minDate: number;
  earliestDate: number;
  maxDate: number;
  interestCat: InterestCategory;
  sortBy: SortOptions = "site";
  sortDirection: SortDirection = "ascending";
  mutationsOfInterest: {[key in InterestCategory]: MutationOfInterest[]};
  allMutations: MutationOfInterest[];
  rows: MutationRow[] = [];
  mccRef: MccRef | null;
  nodes: number[] = [];
  hoveredNode: number | null = null;
  hoverColor = "#999";
  prevalence: MutationPrevalenceCanvas;
  selectedMutations: MutationData[];
  autofill: boolean;

  displayOption: DisplayOption;

  minTreesPercent: number;
  minTipsPercent: number;
  tipCount: number;

  treePercentSetter: ParameterSetter;
  tipPercentSetter: ParameterSetter;



  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector, "#mutations--mcc-canvas")
    this.minDate = 0;
    this.earliestDate = 0;
    this.maxDate = 0;
    this.selectedMutations = [];
    this.prevalence = new MutationPrevalenceCanvas();
    this.interestCat = FeatureOfInterest.ManyTips;
    this.autofill = true;
    this.mutationsOfInterest = {
      [FeatureOfInterest.Reversals]: [],
      [FeatureOfInterest.SameSite]: [],
      [FeatureOfInterest.MultipleIntroductions]: [],
      [FeatureOfInterest.ManyTips]: [],
      ['all'] : []
    };
    this.minTreesPercent = DEFAULT_MINIMUM_MOI_PRESENCE;
    this.minTipsPercent = DEFAULT_MINIMUM_TIP_PERCENT;
    this.tipCount = UNSET;
    this.allMutations = [];

    this.mccRef = null;

    const trendsCanvas = document.querySelector("#mutations--trends--canvas") as HTMLCanvasElement;
    const trendsCtx = trendsCanvas.getContext("2d") as CanvasRenderingContext2D;
    trendsCtx.fillStyle = "#eee";
    trendsCtx.fillRect(0, 0, trendsCanvas.width, trendsCanvas.height);

    const mutationsFilter = document.querySelector(".mutations-filter--form") as HTMLFormElement;
    mutationsFilter.addEventListener("input", () => {
      const value = mutationsFilter.interest.value as FeatureOfInterest;
      this.interestCat = value;

      const descriptions = this.div.querySelectorAll(".filter-description") as NodeListOf<HTMLElement>;
      descriptions.forEach(el => {
        const val = el.getAttribute("data-feature") as FeatureOfInterest;
        el.classList.toggle("hidden", val !== value);
      });

      this.setInterest();
    });

    this.displayOption = "list";
    const displayOptionsForm = document.querySelector(".display-options-form") as HTMLFormElement;
    displayOptionsForm.addEventListener("input", this.setDisplayOption);

    const clearAllBtn = document.querySelector(".clear-all") as HTMLButtonElement;
    clearAllBtn.addEventListener("click", () => {
      this.clearRows();
    });

    const sortButtons = this.div.querySelectorAll(".header-button") as NodeListOf<HTMLButtonElement>;
    sortButtons.forEach(button => {
      button.addEventListener("click", () => {
        sortButtons.forEach(otherButton => {
          if (otherButton !== button) {
            otherButton.classList.remove("selected");
          }
        });
        if (button.classList.contains("selected")) {
          button.classList.toggle("ascending");
          button.classList.toggle("descending");
        } else {
          button.classList.add("selected");
          button.classList.remove("descending");
          button.classList.add("ascending");
        }
        const value = button.value;
        this.sortBy = value as SortOptions;
        const direction = button.classList.contains("ascending") ? "ascending" : "descending";
        this.sortDirection = direction;
        this.setSort();
      });
    });

    const search = document.querySelector(".mutation-lookup--form") as HTMLFormElement;
    search.addEventListener("submit", this.handleSubmit);

    const searchInput = document.querySelector(".mutation-lookup--input") as HTMLInputElement;
    autocomplete({
      input: searchInput,
      emptyMsg: "No mutations found",
      minLength: 1,
      fetch: (text, update) => {
        text = text.toUpperCase();
        const selectedMutationNames = this.selectedMutations.map(mut => mut.name);
        const suggestions = this.allMutations.filter(mut => {
          return mut.name.startsWith(text) || siteIndexToLabel(mut.mutation.site).toString().startsWith(text)
        })
          .filter(mut => !selectedMutationNames.includes(mut.name))
          .map(mut => {
            return {
              label: mut.name,
              value: mut
            };
          });
        update(suggestions);
      },
      render: (item) => {
        const el = AC_SUGGESTION_TEMPLATE.cloneNode(true) as HTMLDivElement;
        if (item.label) {
          const parts = getMutationNameParts(item.label);
          (el.querySelector(".allele-from") as HTMLElement).innerText = parts[0];
          (el.querySelector(".site") as HTMLElement).innerText = parts[1];
          (el.querySelector(".allele-to") as HTMLElement).innerText = parts[2];
        }
        return el;
      },
      onSelect: (item) => {
        if (item.label) {
          searchInput.value = item.label;
          this.lookupMutation(item.label);
          searchInput.value = "";
        }
      },
      preventSubmit: true
    });

    const tipCallback: ParameterCallback = (tipPercent: number)=>{
      this.minTipsPercent = tipPercent;
      (this.div.querySelector("#moi-list-tips") as HTMLSpanElement).innerHTML = `${Math.round(100 * this.minTipsPercent)}`;
      this.setInterest();
    };

    const treePctCallback: ParameterCallback = (tipPercent: number)=>{
      this.minTreesPercent = tipPercent;
      (this.div.querySelector("#moi-list-trees") as HTMLSpanElement).innerHTML = `${Math.round(100 * this.minTreesPercent)}`;
      this.setInterest();
    };

    const tipContainer = document.querySelector(".parameter-container--tips") as HTMLElement;
    this.tipPercentSetter = new ParameterSetter(tipContainer, tipCallback, DEFAULT_MINIMUM_TIP_PERCENT);
    const treeContainer = document.querySelector(".parameter-container--trees") as HTMLElement;
    this.treePercentSetter = new ParameterSetter(treeContainer, treePctCallback, DEFAULT_MINIMUM_MOI_PRESENCE);

    (this.div.querySelector("#moi-list-tips--button") as HTMLButtonElement).addEventListener('click', ()=>this.tipPercentSetter.toggle());
    (this.div.querySelector("#moi-list-trees--button") as HTMLButtonElement).addEventListener('click', ()=>this.treePercentSetter.toggle());

  }




  activate() {
    super.activate();
    this.div.classList.toggle('apobec-disabled', !this.isApobecEnabled);
    if (this.sharedState.mutationsNeedReloading) {
      console.debug('need to reset mutations');
      this.clearRows();
      this.sharedState.markMutationsUpdated();

    }
  }

  resize() : void {

    super.resize()
    this.prevalence.resize();
    this.prevalence.launchDraw();
    this.rows.forEach(row => {
      row.timeCanvas.resize();
      row.timeCanvas.requestDraw();
    });
    this.tipPercentSetter.resize();
    this.treePercentSetter.resize();
    this.tipPercentSetter.draw();
    this.treePercentSetter.draw();

  }

  deactivate() : void {
    super.deactivate();
    this.sharedState.setMutationSelection(this.selectedMutations.map(md=>md.moi.mutation));
  }


  protected updateData(): Promise<SummaryTree> {
    // console.debug('mutations.updateData()');
    const prom = new Promise((resolve: DataResolveType)=>{
      super.updateData()
        .then((summary:SummaryTree)=>{

          if (this.pythia) {
            const oldRef = this.mccRef,
              mccRef = this.pythia.getMcc();
            if (mccRef) {
              const mccTree = mccRef.getMcc();
              this.tipCount = (mccTree.getSize() + 1) / 2;
              this.minDate = mccTree.getTimeOf(mccTree.getRootIndex());
              this.earliestDate = this.pythia.getBaseTreeMinDate();
              this.mccRef = mccRef;
              if (oldRef) {
                oldRef.release();
              }
            }
            this.populateMutationsOfInterestLists();
            this.maxDate = this.pythia.maxDate;
          }

          if (this.autofill) {
            this.clearRows();
            if (this.sharedState.mutationList.length > 0) {
              this.autofill = false;
              const mutation = this.sharedState.mutationList[0];
              this.lookupMutation(mutation);
            }
          }

          const mutationsFilter = this.div.querySelector(".mutations-filter--form") as HTMLFormElement;
          mutationsFilter.querySelectorAll("input").forEach(radio => {
            const value = radio.value as FeatureOfInterest;
            radio.checked = value === this.interestCat;
          });
          this.setInterest(this.autofill);
          this.autofill = false;

          this.sharedState.mutationList.forEach(mutation=>this.lookupMutation(mutation));

          (this.div.querySelector("#moi-list-tips") as HTMLSpanElement).innerHTML = `${Math.round(100 * this.minTipsPercent)}`;
          (this.div.querySelector("#moi-list-trees") as HTMLSpanElement).innerHTML = `${Math.round(100 * this.minTreesPercent)}`;
          resolve(summary);
        })
    });
    return prom;
  }



  populateMutationsOfInterestLists():void {
    if (this.pythia) {
      const moi : MutationOfInterestSet | null = this.pythia.getMutationsOfInterest(),
        fill = (index: InterestCategory, muts: MutationOfInterest[])=>{
          const arr = this.mutationsOfInterest[index];
          arr.length = 0;
          muts.forEach((interesting)=>arr.push(interesting));
        };
      if (moi) {
        fill(FeatureOfInterest.Reversals, moi[FeatureOfInterest.Reversals]);
        fill(FeatureOfInterest.MultipleIntroductions, moi[FeatureOfInterest.MultipleIntroductions]);
        fill(FeatureOfInterest.SameSite, moi[FeatureOfInterest.SameSite]);

        /*
        to fill the many tips list, we filter the list of all mutations
        by tipcount
        */
        const treeTipCount = this.mccTreeCanvas.tipCount,
          threshold = MANY_TIPS_PCT * treeTipCount,
          manyTips = moi.all.filter((m: MutationOfInterest)=>m.medianTipCount >= threshold);
        // const bins = Array(11).fill(0);
        // moi.all.forEach((m: MutationOfInterest)=>{
        //   const pct = Math.floor(m.tipCount / allTips * 10);
        //   bins[pct]++;
        // });
        // console.debug(bins)

        fill(FeatureOfInterest.ManyTips, manyTips);
        fill('all', moi.all);

        this.allMutations = moi.all;
        // console.log("all mutations", this.allMutations);
      }
    }
  }


  setInterest(autofill=false):void {
    this.clearMoiList();
    const muts = this.mutationsOfInterest[this.interestCat],
      minTipCount = Math.round(this.tipCount * this.minTipsPercent),
      tipDistribution: number[] = [],
      treePctDistribution: number[] = [];
    let sort: (moi1: MutationOfInterest, moi2: MutationOfInterest)=>number = () => 0;
    if (this.sortBy === "site") {
      if (this.sortDirection === "ascending") {
        sort = (moi1, moi2)=>moi1.mutation.site - moi2.mutation.site;
      } else {
        sort = (moi1, moi2)=>moi2.mutation.site - moi1.mutation.site;
      }
    } else if (this.sortBy === "tips") {
      if (this.sortDirection === "ascending") {
        sort = (moi1, moi2)=>moi1.medianTipCount - moi2.medianTipCount;
      } else {
        sort = (moi1, moi2)=>moi2.medianTipCount - moi1.medianTipCount;
      }
    } else if (this.sortBy === "trees") {
      if (this.sortDirection === "ascending") {
        sort = (moi1, moi2)=>moi1.treeCount - moi2.treeCount;
      } else {
        sort = (moi1, moi2)=>moi2.treeCount - moi1.treeCount;
      }
    }
    muts.sort(sort);
    let mutCount = 0;
    muts.forEach(mut => {
      tipDistribution.push(mut.medianTipCount);
      treePctDistribution.push(100 * mut.confidence);
      if (mut.confidence >= this.minTreesPercent && mut.medianTipCount >= minTipCount) {
        this.addMoi(mut);
        mutCount++;
        if (autofill && this.rows.length < MAX_AUTOFILL_MUTATIONS) {
          this.selectMutation(mut);
        }
      }
    });
    if (mutCount === 0) {
      MOI_LIST.appendChild(NO_MUTATIONS);
    }
    this.treePercentSetter.set(treePctDistribution, this.minTreesPercent * 100, 100);
    this.tipPercentSetter.set(tipDistribution, minTipCount, this.tipCount);
    this.updateMoiList();
    this.updateMutationHistory();

    (this.div.querySelector("#moi-list-mut-count") as HTMLElement).innerText = `${mutCount}`;
    (this.div.querySelector(".parameter-info .plural") as HTMLElement).classList.toggle("hidden", mutCount === 1);
  }

  clearMoiList() {
    MOI_LIST.innerHTML = "";
  }

  addMoi = (moi: MutationOfInterest) => {
    const moiHtml = MOI_TEMPLATE.cloneNode(true) as HTMLElement;
    moiHtml.setAttribute("data-mutation", getMutationName(moi.mutation));
    moiHtml.addEventListener("click", () => {
      if (!this.selectedMutations.map(m => m.name).includes(moi.name)) {
        this.selectMutation(moi);
      } else {
        const row = this.rows.find(r => r.moi.name === moi.name);
        if (row) {
          this.removeRow(row);
        }
      }
    });

    const nameParts = getMutationNameParts(moi.mutation);
    const nameHtml = (moiHtml.querySelector(".mutation-name") as HTMLElement);
    (nameHtml.querySelector(".allele-from") as HTMLElement).innerText = nameParts[0];
    (nameHtml.querySelector(".site") as HTMLElement).innerText = nameParts[1];
    (nameHtml.querySelector(".allele-to") as HTMLElement).innerText = nameParts[2];
    // <div class="moi-tips"><div class="moi-tips--inner"></div><span class="moi-tip-label">0</span></div>
    (moiHtml.querySelector(".moi-tips--label") as HTMLSpanElement).innerText = `${moi.medianTipCount}`;
    (moiHtml.querySelector(".moi-tips--inner") as HTMLDivElement).style.width = `${Math.round(moi.medianTipCount / this.tipCount * 100)}%`;
    // (moiHtml.querySelector(".moi-trees") as HTMLElement).innerText = getPercentLabel(moi.confidence);
    (moiHtml.querySelector(".moi-trees") as HTMLElement).innerText = `${getPercentLabel(moi.confidence)}%`;
    (moiHtml.querySelector(".moi-apobec") as HTMLElement).innerText = moi.isApobec >= moi.treeCount * .5 ? '+' : '';
    if (moi.features) {
      const features = (moiHtml.querySelector(".moi-feature") as HTMLElement);
      features.innerHTML = '';
      Object.entries(moi.features).forEach(([name])=>{
        let moiName = name;
        switch (name) {
        // case 'reversals' : moiName = ''; break;
        case 'same_site' : moiName = 'same-site'; break;
        case 'multiple_introductions' : moiName = 'multi-intro'; break;
        }
        features.innerHTML += `<div class="stats--${moiName} stats-badge"><div class="box" aria-hidden="true" aria-label="${moiName}"><div class="glyph"></div></div></div>`;
      });
    }
    MOI_LIST.appendChild(moiHtml);
  }


  selectMutation = (moi: MutationOfInterest) => {
    if (!this.selectedMutations.map(md => md.name).includes(moi.name) && this.pythia) {
      const tree = this.mccTreeCanvas.tree as SummaryTree,
        mutation = moi.mutation,
        {times, nodeIndices} = this.pythia.getMutationDistributionInfo(mutation, tree),
        alleleDist = this.pythia.getPopulationAlleleDistribution(mutation.site, this.earliestDate, this.maxDate, tree);
      const nodes = nodeIndices.map(index => {
        let nodeObj = { index: UNSET, tips: 0, confidence: 0 };
        if (this.pythia) {
          nodeObj = {
            index: index,
            tips: this.pythia.getMccNodeTipCount(index),
            confidence: this.mccTreeCanvas.creds[index]
          };
        }
        return nodeObj;
      });
      const {minDate, maxDate} = this,
        name = moi.name;
      let color = MUTATION_COLOR;
      const colorsAvailable = MUTATION_SERIES_COLORS.filter(color => !colorsUsed.includes(color));
      if (colorsAvailable.length > 0) {
        color = colorsAvailable[0];
        colorsUsed.push(color);
      }
      const mutationData = {moi, name, times, nodes, minDate, maxDate, alleleDist, color, active: true};
      this.selectedMutations.push(mutationData);
      const row = new MutationRow(mutationData, this.removeRow, this.getNodeRelativeSize,
        this.updateHoverRow, this.updateHoverNode, this.goToLineages, this.shiftRow, this.setMutationActive,
        minDate, maxDate, this.displayOption, this.isApobecEnabled);
      this.rows.push(row);
      this.rows.forEach(row => row.updateRows(this.rows));

      this.updateMoiList();
      this.updateMutationHistory();
    }
  }




  updateMutationHistory(): void {
    this.prevalence.setData(this.selectedMutations, this.minDate, this.maxDate);
    this.prevalence.launchDraw();
  }



  removeRow = (row: MutationRow) => {
    row.rowDiv.remove();
    const rowIndex = this.rows.findIndex(r => r === row);
    if (rowIndex !== UNSET) {
      this.rows.splice(rowIndex, 1);
      this.selectedMutations.splice(rowIndex, 1);
    }

    const colorIndex = colorsUsed.indexOf(row.color);
    if (colorIndex !== UNSET) {
      colorsUsed.splice(colorIndex, 1);
    }

    this.updateMoiList();
    this.updateMutationHistory();
  }

  getNodeRelativeSize = (tipCount: number): number => {
    if (this.pythia) {
      const mccRef = this.pythia.getMcc(),
        mcc = mccRef.getMcc();
      const maxTips = this.pythia.getMccNodeTipCount(mcc.getRootIndex());
      const relative = tipCount / maxTips;
      mccRef.release();
      return relative;
    }
    return UNSET;
  }


  /*
  this is declared as an anonymous function
  since it is passed to the mutation rows
  and used there in event handlers. We want to
  preserve the `this` reference to this class.
  */
  updateHoverRow: RowFunctionType = (row: MutationRow | null, lock: boolean) => {
    let moi : MutationOfInterest | null = null;
    if (row) {
      this.nodes = row.topNodes.map(node => node.index);
      const rowIndex = this.rows.indexOf(row);
      if (rowIndex !== UNSET) {
        this.hoverColor = this.rows[rowIndex].color;
        if (lock) {
          /* collapse the other row */
          const otherRows = this.rows.filter(r=>r.isExpanded && r !== row);
          otherRows.forEach(r=>{
            r.collapse();
            r.toggleDetail();
          });
        }
      }
      moi = row.moi;
    } else {
      this.nodes = [];
    }
    this.prevalence.setHighlight(moi, lock);
    this.requestDrawHighlights();
  }

  updateHoverNode: NodeFunctionType = (nodeIndex?: number) => {
    if (nodeIndex) {
      this.hoveredNode = nodeIndex;
    } else {
      this.hoveredNode = null;
    }
    this.requestDrawHighlights();
  }

  goToLineages: NodeFunctionType = (nodeIndex?: number) => {
    if (nodeIndex) {
      this.sharedState.setNodeSelection([nodeIndex]);
      this.sharedState.goTo(Screens.lineages);
    }
  }


  requestDrawHighlights() {
    requestAnimationFrame(() => this.drawHighlights());
  }

  drawHighlights() {
    if (this.pythia) {
      const mccRef = this.pythia.getMcc(),
        mcc = mccRef.getMcc(),
        ctx = this.highlightCtx,
        treeCanvas = this.mccTreeCanvas;
      ctx.lineWidth = 3;
      ctx.clearRect(0, 0, treeCanvas.width, treeCanvas.height);
      this.nodes.forEach((node) => {
        this.drawHighlightNode(node, this.hoverColor, ctx, treeCanvas, mcc);
      });
      mccRef.release();
    }
  }

  private drawHighlightNode(index: number, color: string, ctx: CanvasRenderingContext2D, treeCanvas: TreeCanvas, mcc: MccTree): void {
    if (index >= 0) {
      const x = treeCanvas.getZoomX(mcc.getTimeOf(index)),
        y = treeCanvas.getZoomY(index),
        radius = 6;
      if (this.hoveredNode) {
        if (this.hoveredNode === index) {
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 0.5;
        }
      } else {
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.moveTo(x + radius, y);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  updateMoiList() {
    const mois = document.querySelectorAll(".moi") as NodeListOf<HTMLElement>;
    mois.forEach(moi => {
      const name = moi.getAttribute("data-mutation");
      const isSelected = (name !== null && this.rows.map(row => row.moi.name).includes(name));
      moi.classList.toggle("selected", isSelected);
    });

    // const addAllBtn = document.querySelector(".add-all") as HTMLButtonElement;
    // if (this.isAllSelected()) {
    //   addAllBtn.disabled = true;
    // } else {
    //   addAllBtn.disabled = false;
    // }
  }

  isAllSelected(): boolean {
    const mois = this.mutationsOfInterest[this.interestCat].map(mut => mut.name);
    const selected = this.rows.map(row => row.moi.name);
    const notSelected = mois.filter(mut => !selected.includes(mut));
    if (notSelected.length > 0) {
      return false;
    }
    return true;
  }

  setSort() {
    this.setInterest();
  }

  handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const input = (e.target as HTMLElement).querySelector(".mutation-lookup--input") as HTMLInputElement;
    const searchValue = input.value;
    const num = parseInt(searchValue);
    const lookup = Number.isNaN(num) ? searchValue : num;
    // console.log("looking up", lookup);
    this.lookupMutation(lookup);
  }

  lookupMutation(lookup: string | number | Mutation) {
    if (this.allMutations) {
      const moi = this.allMutations.find(moi => {
        if (typeof lookup === "string") {
          return moi.name === lookup.toUpperCase();
        } else if (typeof lookup === "number") {
          const moiSite = parseInt(getMutationNameParts(moi.name)[1]);
          return (moiSite && !Number.isNaN(moiSite) && moiSite === lookup);
        } else {
          return mutationEquals(moi.mutation, lookup);
        }
      });
      // console.log("mutation found?", moi);
      if (moi) {
        // if not selected
        if (!this.rows.map(row => row.moi.name).includes(moi.name)) {
          // fill in any features of interest
          for (const key in this.mutationsOfInterest) {
            const sameMutation = this.mutationsOfInterest[key as FeatureOfInterest].find(otherMoi => otherMoi.name === moi.name);
            if (sameMutation) {
              // console.log("mutation exists in mutations of interest lists");
              moi.features = sameMutation.features;
              break;
            }
          }
          this.selectMutation(moi);
        }
      }
    }
  }

  clearRows():void {
    // console.debug('clearing rows');
    clearMutationRows();
    this.rows.length = 0;
    this.selectedMutations.length = 0;
    colorsUsed.length = 0;
    this.updateMoiList();
    this.updateMutationHistory();
  }

  shiftRow = (row: MutationRow, direction: number) => {
    // order
    const index = this.rows.indexOf(row);
    let newIndex = index + direction;
    newIndex = Math.min(Math.max(newIndex, 0), this.rows.length - 1); // constrain
    if (newIndex === index) return; // no change

    // order rows
    this.rows.splice(index, 1);
    this.rows.splice(newIndex, 0, row);
    this.rows.forEach(row => row.updateRows(this.rows));

    // order divs
    const otherDivs = this.rows.filter(r => r !== row).map(r => r.rowDiv);
    const insertBeforeNode = (newIndex <= otherDivs.length - 1) ? otherDivs[newIndex] : null;
    MUTATION_TABLE_BODY.insertBefore(row.rowDiv, insertBeforeNode);

    // order selected mutations
    const selected = this.selectedMutations[index];
    this.selectedMutations.splice(index, 1);
    this.selectedMutations.splice(newIndex, 0, selected);
    this.updateMutationHistory();
  }

  setMutationActive = (name: string, active: boolean) => {
    const found = this.selectedMutations.find(md => md.name === name);
    if (found) {
      found.active = active;
    }
    this.updateMutationHistory();
  }

  setDisplayOption = () => {
    const displayOptionsForm = document.querySelector(".display-options-form") as HTMLFormElement;
    const container = document.querySelector("#mutation-rows") as HTMLElement;
    const value = displayOptionsForm.display.value as DisplayOption;
    this.displayOption = value;
    container.classList.toggle("list", this.displayOption === "list");
    container.classList.toggle("grid", this.displayOption === "grid");

    this.rows.forEach(row => row.setDisplayOption(this.displayOption));

    if (this.displayOption === "list") {
      this.rows.forEach(row => {
        row.timeCanvas.resize();
        row.timeCanvas.requestDraw();
      });
    } else {
      this.rows.forEach(row => {
        if (row.isExpanded) {
          row.collapse();
        }
      });
    }
  }

}
