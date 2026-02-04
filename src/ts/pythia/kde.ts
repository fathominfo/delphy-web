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
  private kernel_: (x: number, xi: number) => number;
  private bandwidth_: number;

  public constructor(samples: number[]) {
    samples.sort((a,b)=>a-b);
    this.samples_ = samples.filter(n=>isFinite(n) && !isNaN(n));
    this.min_sample_ = Math.min(...this.samples_);
    this.max_sample_ = Math.max(...this.samples_);

    // Estimated KDE bandwidth (from https://en.wikipedia.org/wiki/Kernel_density_estimation)
    const N = this.samples_.length;
    if (N <= 2) {
      throw new Error(`Cannot build a Kernel Density Estimator from fewer than three samples`);
    }
    const data_variance = estimate_data_variance(this.samples_);
    const sigma_hat = Math.sqrt(data_variance);
    const iqr = interquartile_range(this.samples_);
    this.bandwidth_ =
+      Math.max(0.9 * Math.min(sigma_hat, iqr / 1.34) * Math.pow(N, -1/5),
  +        (this.max_sample_ - this.min_sample_) / 200);  // Avoid too few bins
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

  value_at(x: number) {
    // let sum = 0.0;
    // for (let xi of this.samples_) {
    //     sum += this.kernel_(x, xi);
    // }
    const sum = this.samples_.reduce((total, xi)=>total + this.kernel_(x, xi), 0);
    return sum;
  }
}