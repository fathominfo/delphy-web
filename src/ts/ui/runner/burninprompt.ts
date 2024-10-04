
const ACCEPTABLE_RANGE_IN_STDDEV = 2;

const MIN_LENGTH = 10;

export class BurninPrompt {

  evalSeriesStdDev(series:number[]) : number {
    let index = -1;
    if (series.length >= MIN_LENGTH) {
      const midpoint = Math.ceil(series.length / 2);
      const secondHalf = series.slice(midpoint);
      /* get the stddev of the second half */
      const sum = secondHalf.reduce((tot, c)=>tot+(c||0), 0);
      const avg = sum / secondHalf.length;
      const sumDeltaSq = secondHalf.reduce((tot, c)=>{
        const d = c - avg;
        return tot + d * d;
      }, 0);
      const stdDev = Math.sqrt(sumDeltaSq/secondHalf.length);
      for (let i = midpoint - 1; i >= 0; i--) {
        const delta = Math.abs(series[i] - avg);
        if (delta > stdDev * ACCEPTABLE_RANGE_IN_STDDEV) {
          break;
        }
        index = i;
      }
    }
    return index;
  }

  evalAllSeries(serieses:number[][]) : number {
    let index = -1;
    let anyFailed = false;
    const results: number[] = [];
    serieses.forEach((series: number[])=>{
      const res = this.evalSeriesStdDev(series);
      if (res < 0) {
        anyFailed = true;
        index = -1;
      } else if (!anyFailed) {
        index = Math.max(index, res);
      }
      results.push(res);
    });
    console.log(index, results.join(' '))
    return index;

  }
}