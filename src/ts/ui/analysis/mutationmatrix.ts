import { MccTree, Mutation, RealSeqLetter_A, RealSeqLetter_C, RealSeqLetter_G, RealSeqLetter_T, SummaryTree } from "../../pythia/delphy_api";
import { UNSET } from "../common";





export class MutationMatrix {
  table: HTMLTableElement;
  mutationTallies: number[][];
  mutationCells: HTMLTableCellElement[][];
  maxTally: number;


  constructor(table: HTMLTableElement) {
    this.table = table;
    this.mutationTallies = [];
    this.mutationCells = [];
    this.maxTally = UNSET;
    'a,c,g,t'.split(',').forEach((fromAllele, fromIndex)=>{
      this.mutationCells[fromIndex] = [];
      'a,c,g,t'.split(',').forEach((toAllele, toIndex) => {
        const cell = table.querySelector(`td[data-from="${fromAllele}"][data-to="${toAllele}"] span`) as HTMLTableCellElement;
        this.mutationCells[fromIndex][toIndex] = cell;
        if (fromIndex === toIndex) cell.classList.add("hidden");
      });
    });
  }


  setData(summaryTree: MccTree) {
    const baseIndex = summaryTree.getMasterBaseTreeIndex();
    const baseTree = summaryTree.getBaseTree(baseIndex);
    const rootIndex = baseTree.getRootIndex();
    const q = [rootIndex];
    const mutationTallies: number[][] = [];
    {
      const row: number[] = [0,0,0,0];
      mutationTallies[RealSeqLetter_A] = row.slice(0);
      mutationTallies[RealSeqLetter_C] = row.slice(0);
      mutationTallies[RealSeqLetter_G] = row.slice(0);
      mutationTallies[RealSeqLetter_T] = row.slice(0);
    }

    while (q.length > 0) {
      const index = q.shift() as number;
      const left = baseTree.getLeftChildIndexOf(index);
      if (left !== UNSET) {
        q.push(left);
        q.push(baseTree.getRightChildIndexOf(index));
      }
      baseTree.forEachMutationOf(index, (m:Mutation)=>{
        const {from, to} = m;
        mutationTallies[from][to]++;
      });
    }
    this.maxTally = Math.max.apply(null, mutationTallies.flat());
    this.mutationTallies = mutationTallies;
    this.requestDraw();
  }

  requestDraw() {
    requestAnimationFrame(()=>this.render());
  }


  render() {
    const { mutationTallies, maxTally, mutationCells } = this;
    if (mutationTallies.length === 0) return;
    mutationTallies.forEach((row, fromIndex)=>{
      row.forEach((count, toIndex)=>{
        const pct = count / maxTally;
        const cell = mutationCells[fromIndex][toIndex];
        cell.textContent = `${count}`;
        const gray = 180 + (1 - pct) * 75;
        cell.style.backgroundColor = `rgb(${gray},${gray},${gray})`;
      });
    });

  }

}