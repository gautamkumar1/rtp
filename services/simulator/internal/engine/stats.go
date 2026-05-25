package engine

import "math"

// statsAccumulator builds the per-spin RTP distribution online using a
// numerically stable Welford-style update. The per-spin variable is the
// payout ratio (return / bet) so RTP is its mean.
type statsAccumulator struct {
	count int64
	mean  float64
	m2    float64
	wins  int64
}

func (s *statsAccumulator) add(payoutRatio float64) {
	s.count++
	delta := payoutRatio - s.mean
	s.mean += delta / float64(s.count)
	delta2 := payoutRatio - s.mean
	s.m2 += delta * delta2
	if payoutRatio > 0 {
		s.wins++
	}
}

// summary computes RTP, hit rate, variance, SD, and 90/95% CIs for the mean.
func (s *statsAccumulator) summary() statsSummary {
	out := statsSummary{
		Count: s.count,
		Wins:  s.wins,
		RTP:   s.mean,
	}
	if s.count > 1 {
		out.Variance = s.m2 / float64(s.count-1)
		out.StandardDeviation = math.Sqrt(out.Variance)
	}
	if s.count > 0 {
		out.HitRate = float64(s.wins) / float64(s.count)
		se := out.StandardDeviation / math.Sqrt(float64(s.count))
		out.Confidence90Low = out.RTP - 1.645*se
		out.Confidence90High = out.RTP + 1.645*se
		out.Confidence95Low = out.RTP - 1.96*se
		out.Confidence95High = out.RTP + 1.96*se
	}
	return out
}

type statsSummary struct {
	Count             int64
	Wins              int64
	RTP               float64
	HitRate           float64
	Variance          float64
	StandardDeviation float64
	Confidence90Low   float64
	Confidence90High  float64
	Confidence95Low   float64
	Confidence95High  float64
}

// convergenceWarning returns a non-empty warning string when the 95% CI
// half-width is wider than warnThreshold (default 0.5% of RTP).
func convergenceWarning(s statsSummary, warnThreshold float64) string {
	if s.RTP <= 0 || s.Count < 2 {
		return ""
	}
	halfWidth := (s.Confidence95High - s.Confidence95Low) / 2
	if halfWidth > warnThreshold*s.RTP {
		return "95% CI half-width exceeds 0.5% of RTP — increase spin count for tighter convergence"
	}
	return ""
}
