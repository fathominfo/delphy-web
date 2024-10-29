

export class EffectiveSampleSize {


  calcESS(series: number[]) {
    const N = series.length;
    if (N === 0) return 0;
    const sum = series.reduce((tot, n)=>tot+n, 0);
    const mean = sum / N;
    const deltas = series.map(n=>n-mean);
    const fluctCorrel = [];

    console.log(`calculating ESS of `, series);

    // fluctCorrel_i = avg of deltaA_j * deltaA_{j+i} over all j
    //               = sum_{j=0}^{j < N-i} [ deltaA_j * deltaA_{j+i} ] / [N-i]    // N-i = number of possible values of j
    console.log("deltas", deltas);
    for (let i = 0; i < N; i++) {
      let fc = 0;
      const limit = N-i;
      console.log( `fluctCorrel  ${i} \t limit: ${limit}:`);
      for (let j = 0; j < limit; j++) {
        const dd = deltas[j] * deltas[j+i];
        fc += dd;
        console.log(`\t\t${j}  ${deltas[j]} \t\t ${j+1}  ${deltas[j+1]} \t\t${dd} \t\t ${fc}`);
      }
      fc /= limit;
      fluctCorrel[i] = fc;
      console.log(`\t\tresult ${fc}`);
    }

    // C_i = fluctCorrel_i / fluctCorrel_0    // A function that's 1 at i = 0 and decays quickly to 0; the decay time is basically the auto-correlation time
    const first = fluctCorrel[0];
    const C = fluctCorrel.map(n=>n/first);

    console.log(`C`, C)
    // Find imax = first i such that C_{i-1} + C_i <= 0  // Roughly, first time C_i drops below 0 and it's not just a fluke
    let imax;
    for(imax = 1; imax < N-1; imax++) {
      if ((C[imax-1] + C[imax]) <= 0) {
        break;
      }
    }
    // assert(1 <= imax);
    // assert(imax < N);

    // autoCorrelationTime = 2 * sum_{i=0}^{i < imax} C_i    // Roughly, number of steps between independent samples
    // When you're super careful, the i == 0 term shouldn't have a factor of 2 to get the right result for completely uncorrelated data
    let autoCorrelationTime = 1 * C[0];
    for (let i = 1; i < imax; i++) {
      autoCorrelationTime += 2 * C[i];
    }

    // effectiveSampleSize = N / autoCorrelationTime
    const effectiveSampleSize = N / autoCorrelationTime;
    return effectiveSampleSize;

  }


  testIt() {
    const A  = [1,2,3,4,5];
    this.calcESS(A);

  }

}
