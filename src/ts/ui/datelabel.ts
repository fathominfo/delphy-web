import {toDateTokens} from "../pythia/dates";

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

export class DateLabel {
  index: number;
  day:number;
  month:number;
  year:number;
  label1: string;
  label2: string;

  constructor(index:number) {
    this.index = index;
    const [yr, mon, dy] = toDateTokens(index);
    this.day = dy;
    this.month = mon;
    this.year = yr;
    if (dy === 1) {
      this.label1 = MONTHS[mon];
      // this.label2 = mon === 0 ? `${yr}` : '';
    } else {
      this.label1 = `${dy} ${MONTHS[mon]}`;
    }
    this.label2 = `${yr}`;
  }

}
