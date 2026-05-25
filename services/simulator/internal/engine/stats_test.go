package engine

import (
	"math"
	"testing"
)

func TestStatsAccumulator_KnownValues(t *testing.T) {
	// Sequence 1,2,3,4,5 → mean=3, sample variance=2.5, SD≈1.5811
	var s statsAccumulator
	for _, v := range []float64{1, 2, 3, 4, 5} {
		s.add(v)
	}
	sum := s.summary()
	if sum.Count != 5 {
		t.Fatalf("count=%d want 5", sum.Count)
	}
	if math.Abs(sum.RTP-3.0) > 1e-9 {
		t.Fatalf("mean=%v want 3", sum.RTP)
	}
	if math.Abs(sum.Variance-2.5) > 1e-9 {
		t.Fatalf("variance=%v want 2.5", sum.Variance)
	}
	if math.Abs(sum.StandardDeviation-math.Sqrt(2.5)) > 1e-9 {
		t.Fatalf("SD=%v want sqrt(2.5)", sum.StandardDeviation)
	}
	if sum.Wins != 5 {
		t.Fatalf("wins=%d want 5", sum.Wins)
	}
}

func TestStatsAccumulator_HitRate(t *testing.T) {
	var s statsAccumulator
	for i := 0; i < 100; i++ {
		if i%4 == 0 {
			s.add(0) // no win
		} else {
			s.add(1.5)
		}
	}
	sum := s.summary()
	if math.Abs(sum.HitRate-0.75) > 1e-12 {
		t.Fatalf("hit rate %.6f want 0.75", sum.HitRate)
	}
}

func TestStatsAccumulator_CIScaling(t *testing.T) {
	// Larger N → tighter CI (half-width scales as 1/sqrt(N))
	var s1, s2 statsAccumulator
	// Add identical signal at different sample sizes.
	for i := 0; i < 100; i++ {
		s1.add(float64(i % 2)) // mean 0.5, sd ~0.5
	}
	for i := 0; i < 10000; i++ {
		s2.add(float64(i % 2))
	}
	sum1 := s1.summary()
	sum2 := s2.summary()
	hw1 := (sum1.Confidence95High - sum1.Confidence95Low) / 2
	hw2 := (sum2.Confidence95High - sum2.Confidence95Low) / 2
	if hw2 >= hw1 {
		t.Fatalf("CI didn't tighten with N: hw1=%v hw2=%v", hw1, hw2)
	}
	// Roughly ~10× tighter for 100× samples
	ratio := hw1 / hw2
	if ratio < 7 || ratio > 13 {
		t.Fatalf("CI scaling ratio %.2f not near 10", ratio)
	}
}

func TestConvergenceWarning(t *testing.T) {
	// Tight CI → no warning
	s := statsSummary{
		RTP:              0.96,
		Count:            100_000_000,
		Confidence95Low:  0.9598,
		Confidence95High: 0.9602,
	}
	if w := convergenceWarning(s, 0.005); w != "" {
		t.Fatalf("expected no warning for tight CI, got %q", w)
	}
	// Wide CI → warning
	s2 := statsSummary{
		RTP:              0.96,
		Count:            1000,
		Confidence95Low:  0.90,
		Confidence95High: 1.02,
	}
	if w := convergenceWarning(s2, 0.005); w == "" {
		t.Fatal("expected warning for wide CI")
	}
}
