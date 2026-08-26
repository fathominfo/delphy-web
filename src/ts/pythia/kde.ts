import { numericSort } from "../ui/common";
import { erf } from "mathjs";

function estimate_data_variance(xs: number[]): number {
  const N = xs.length;
  if (N < 2) {
    throw new Error(`Cannot estimate data variance from fewer than 2 samples`);
  }
  let sum = 0.0, sum2 = 0.0;
  xs.forEach(x=>{
    sum += x;
    sum2 += x * x;
  });
  sum /= N;
  sum2 /= N;
  const sumsum = sum*sum;
  const sample_variance = sum2 - sumsum;
  return (N / (N-1)) * sample_variance;
}

// Assumes that `xs` is sorted!
function interquartile_range(xs: number[]): number {
  if (xs.length <= 0) {
    throw new Error("Cannot estimate interquartile from 0 samples");
  }
  const N = xs.length;
  const index_lower_quartile = Math.floor(N / 4);
  const index_upper_quartile = Math.floor(3 * N / 4);
  return xs[index_upper_quartile] - xs[index_lower_quartile];
}

export class KernelDensityEstimate {
  private samples_: number[];
  private min_sample_: number;
  private max_sample_: number;
  /*
  aka probability density function (pdf_1)
  */
  private kernel_: (x: number, xi: number) => number;
  private bandwidth_: number;

  public constructor(samples: number[], ess: number) {
    this.samples_ = samples.filter(n=>Number.isFinite(n));
    this.samples_.sort(numericSort);
    this.min_sample_ = this.samples_[0];
    this.max_sample_ = this.samples_[this.samples_.length - 1];


    // Estimated KDE bandwidth (from https://en.wikipedia.org/wiki/Kernel_density_estimation)
    if (this.samples_.length <= 2) {
      throw new Error(`Cannot build a Kernel Density Estimator from fewer than three samples`);
    }
    const data_variance = estimate_data_variance(this.samples_);
    const sigma_hat = Math.sqrt(data_variance);
    const iqr = interquartile_range(this.samples_);
    /*
    TODO:
    Currently, we can request a distribution for multiple "nodes" at the
    same time. This leads to a problem for the ESS. To quote @pvarilly (in
    slack, 260826):

      for two nodes, the resulting trace looks to the ESS calculator like
      you were trapped in one mode for the first half the run, then trapped
      in another mode for the second half of the run, and it will
      [correctly] report that you have essentially less than 1 independent
      statistical sample from the combined distribution).

    So the ESS ends up being a negative number, which will result in NaN for
    the bandwidth calculation below. In that case, rather than using the
    estimated sample size, we use the number of actual samples in the data.

    This is an edge case, and we need to fix it upstream. It happens when we
    request the distribution of times that a mutation is introduced, and the
    mutation has multiple occurrences. The goal should be to tease apart the
    separate occurrences and calculate distributions for each. [mark 260826]
    */
    const sampleCount = ess < 0 ? this.samples_.length : ess;
    /*
    `iqr` (interquartile range) can be 0 in cases when the source data is
    integers (like for the `number of mutations` trace chart histogram). By
    default, we don't do a histogram for those, but if the range of values
    gets very large, we might. When `iqr` == 0, then `bandwidth` will end
    up being 0, and we end up with NaN in the kernel and an infinite loop
    if we increment by bandwidth. So here we catch it early, and use an
    entirely different calculation for bandwidth. [mark 260826]
    */
    this.bandwidth_ = iqr === 0 ? (this.max_sample_ - this.min_sample_) / 200
      : + (0.9 * Math.min(sigma_hat, iqr / 1.34) * Math.pow(sampleCount, -1/5));
    if (this.bandwidth_ === 0) {
      console.debug(`Kernel Density Estimator bandwidth == 0, and is unusable.
        ${this.samples_.length} samples, min: ${this.min_sample_}, max: ${this.max_sample_}, 
        ess: ${ess}, data_variance : ${data_variance}, iqr: ${iqr}, sigma_hat: ${sigma_hat}
        `);
      throw new Error(`Kernel Density Estimator bandwidth == 0, and is unusable.`);
    }
    const bandwidth_2: number = 2 * this.bandwidth_ * this.bandwidth_;
    // Precalculate factors in Gaussian kernel
    const factor_in_exp = 1 / bandwidth_2;
    const normalization = 1 / Math.sqrt(bandwidth_2 * Math.PI);
    this.kernel_ = (x: number, xi: number) => {
      return Math.exp(-Math.pow(x - xi, 2) * factor_in_exp) * normalization;
    }
  }

  get min_sample(): number {
    return this.min_sample_
  }

  get max_sample(): number {
    return this.max_sample_
  }

  get bandwidth(): number {
    return this.bandwidth_;
  }

  get samples(): number[] {
    return this.samples_.slice(0);
  }


  /*
  probability density function
  */
  pdf(x: number) {
    const N = this.samples_.length;
    const sum = this.samples_.reduce((total, xi)=>total + this.kernel_(x, xi), 0);
    return sum / N;
  }

  /*
  @param a: the lower bound of the range
  @param b: the upper bound of the range
  for example, a and b could be the min and max values in a histogram bucket
  */
  integrated_value(a: number, b: number) : number {
    return this.cdf(b) - this.cdf(a);
  }

  /*
  cumulative density function: the probability that the
  */
  cdf(x: number) : number {
    const { samples_, bandwidth_} = this;
    const N = samples_.length;
    const k = 1.0 / (Math.SQRT2 * bandwidth_);
    const result = samples_.reduce((tot, mu)=> tot + 0.5 + 0.5 * erf((x - mu) * k), 0);
    return result / N;
  }
}