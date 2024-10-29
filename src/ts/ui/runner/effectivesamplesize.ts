/*
from pvarilly:

you're trying to see if a fluctuation at some time (deltaA[j]) goes,
on average, in the same direction as a fluctuation a little later (deltaA[j+i]).
If too little time separates these two measurements, then deltaA[j] and
deltaA[j+i] have the same sign, and the correlation, on average, is positive.

As you look at samples that are further separated, it becomes just as likely
that deltaA[j+i] is positive or negative, and the product of deltaA[j] and
deltaA[j+i] becomes 0, on average

you're trying to measure how long it takes the product deltaA[j]*deltaA[j+i]
to go to zero.  If you scale everything by the average of deltaA[j]*deltaA[j],
then you're measuring how long it's taking a function to go from 1 to 0.
When you do things carefully, the correct thing to do isn't just to find the
value of i at which the average of deltaA[j]*deltaA[j+i] hits 0, on average,
but to add all the intervening scaled values of deltaA[j]*deltaA[j+i] (what
autoCorrelationTime is calculating)
*/

export const calcEffectiveSampleSize = (series: number[]):number=>{
  const N = series.length;
  if (N === 0) return 0;
  const sum = series.reduce((tot, n)=>tot+n, 0);
  const mean = sum / N;
  const deltas = series.map(n=>n-mean);
  const fluctCorrel = [];
  for (let i = 0; i < N; i++) {
    let fc = 0;
    const limit = N-i;
    for (let j = 0; j < limit; j++) {
      const dd = deltas[j] * deltas[j+i];
      fc += dd;
    }
    fc /= limit;
    fluctCorrel[i] = fc;
  }
  /*
  A function that's 1 at i = 0 and decays quickly to 0;
  the decay time is basically the auto-correlation time
  */
  const first = fluctCorrel[0];
  const C = fluctCorrel.map(n=>n/first);
  /*
  Find imax = first i such that C_{i-1} + C_i <= 0
  Roughly, first time C_i drops below 0 and it's not just a fluke
  */
  let imax;
  for(imax = 1; imax < N-1; imax++) {
    if ((C[imax-1] + C[imax]) <= 0) {
      break;
    }
  }
  imax = Math.min(Math.max(imax, 1), N-1);
  /*
  autoCorrelationTime = 2 * sum_{i=0}^{i < imax} C_i
  Roughly, number of steps between independent samples.
  When you're super careful, the i == 0 term shouldn't have a factor of 2
  to get the right result for completely uncorrelated data
  */
  let autoCorrelationTime = 1 * C[0];
  for (let i = 1; i < imax; i++) {
    autoCorrelationTime += 2 * C[i];
  }
  const effectiveSampleSize = N / autoCorrelationTime;
  return effectiveSampleSize;
}

