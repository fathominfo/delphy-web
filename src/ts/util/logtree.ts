import { Tree, PhyloTree } from '../pythia/delphy_api';
import { UNSET } from '../ui/common';


class PN {
  l : PN | null = null;
  r : PN | null = null;
  g = 0;
  y = -1;
  index: number;

  constructor(i: number, g: number) {
    this.index = i;
    this.g = g;
  }
}

let logTreeCount = 0;


export const logTree=(tree:Tree)=>{
  let maxG = 0;
  const root = new PN(tree.getRootIndex(), 0),
    tipsVert: PN[] = [],
    q: PN[] = [],
    traverse = (n: PN)=>{
      q.push(n);
      const l = tree.getLeftChildIndexOf(n.index),
        r = tree.getRightChildIndexOf(n.index);
      maxG = Math.max(maxG, n.g);
      if (l!== UNSET) {
        n.l = new PN(l, n.g+1);
        n.r = new PN(r, n.g+1);
        traverse(n.l);
        traverse(n.r);
      } else {
        n.y = tipsVert.length;
        tipsVert.push(n);
      }
    };

  traverse(root);
  let i = q.length;
  while (i > 0) {
    i--;
    const n = q[i];
    if (n.l !== null && n.r !== null) {
      n.y = Math.round((n.l.y + n.r.y)/2);
    }
  }
  /* make a matrix big enough to print the tree */
  const width = maxG * 3 + 1,
    height = tipsVert.length,
    mat: string[][] = Array(height);
  for (let c = 0; c < height; c++) {
    mat[c] = Array(width).fill(' ');
  }
  const printTraverse = (n: PN)=>{
    const x = n.g * 3;
    if (n.l === null) {
      if (tree instanceof PhyloTree) {
        const id = (tree as PhyloTree).getNameOf(n.index).split('|')[0];
        mat[n.y][x] = `${n.index}     ${id}`;
      }else
        mat[n.y][x] = `${n.index}`;
    } else if (n.r) {
      const y1 = n.l.y,
        y2 = n.r.y;
      mat[y1][x] = `┌`;
      mat[y1][x+1] = `─`;
      mat[y1][x+2] = `─`;
      mat[y2][x+1] = `─`;
      mat[y2][x+2] = `─`;
      mat[y2][x] = `└`;
      for (let y = y1 + 1; y < y2; y++){
        mat[y][x] = '│';
      }
      printTraverse(n.l);
      printTraverse(n.r);

    }
  };
  printTraverse(root);
  console.debug(`\n\nTree ${logTreeCount++}`);
  mat.forEach(row=>console.debug(row.join('')));
};


export const resetLogTreeCount = ()=>{
  logTreeCount = 0;
};
