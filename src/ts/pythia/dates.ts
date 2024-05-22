// import {Tree, TreeNode} from "./tree";
// import {avg} from "../util/util";

// Assign dates to leaf and inner nodes of the tree in a very dumb way:
// * For leaf nodes, keep times read in from import
// * For inner nodes, pick later of 1 day before the minimum time of all children and average of t_child - 13*num_muts
// export function pseudo_date(t: Tree): void {

//   function visit_node(node: TreeNode): void {
//     if (!('children' in node)) {
//       node.t = node.orig_t;
//     } else {
//       if (node.children.length === 0) {
//         throw new RangeError(`Childless inner node: ${node.name}`);
//       }
//       for (const child of node.children) {
//         visit_node(child);
//       }

//       const earliest_child = node.children.reduce((a, b) => a.t < b.t ? a : b);

//       // ~1 mutation / 13 days for COVID
//       let est_t = avg(node.children.map(child => child.t - child.mutations.length * 13.0));

//       node.t = Math.min(earliest_child.t - 1, Math.floor(est_t));
//     }
//   }

//   if (t.root) {
//     visit_node(t.root);
//   }
// }

const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
const EPOCH_MILLIS = Date.UTC(2019, 11, 30, 0, 0, 0, 0);

export function parse_iso_date(date_str: string): number {
  const [yyyy, off_by_one_mm, dd] = date_str.split(/-/).map(parseFloat);
  const mm = off_by_one_mm - 1;
  const dt = new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0, 0));
  const ms_since_epoch = dt.getTime() - EPOCH_MILLIS;
  // console.log(Math.ceil(ms_since_epoch / (1000 * 60 * 60 * 24)))
  return Math.round(ms_since_epoch / MILLIS_PER_DAY);
}

const pad = (n:number)=>(n<10 ? '0' : '') + n;

export function toDateString(dayCount:number) : string {
  const d = new Date(dayCount * MILLIS_PER_DAY + EPOCH_MILLIS);
  return `${ d.getUTCFullYear() }-${pad(d.getUTCMonth() + 1)}-${ pad(d.getUTCDate()) }`;
}

export function toFullDateString(dayCount: number): string {
  const d = new Date(dayCount * MILLIS_PER_DAY + EPOCH_MILLIS);
  try {
    const monthStr = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d);
    return `${d.getUTCDate()} ${monthStr} ${d.getUTCFullYear()}`;
  } catch (err) {
    console.debug(`could not make a dateString for ${dayCount} "${d}"`);
  }
  return '';
}

export function toDateTokens(dayCount:number) : [number, number, number] {
  const d = new Date(dayCount * MILLIS_PER_DAY + EPOCH_MILLIS);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

export const MONTHS_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");