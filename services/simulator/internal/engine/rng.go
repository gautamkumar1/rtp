// Package engine implements the deterministic spin loop and statistics
// pipeline that turns a unified GameSchema into RTP / variance results.
package engine

import (
	cryptorand "crypto/rand"
	"encoding/binary"
	"math/rand/v2"
)

// newRNG returns a deterministic xoshiro256++ source.
// When seed is non-zero the run is reproducible. When seed is 0 we draw a
// fresh 64-bit seed from crypto/rand so unseeded runs are still strong.
func newRNG(seed uint64) *rand.Rand {
	s1, s2 := seed, splitmix64(seed^0x9E3779B97F4A7C15)
	if seed == 0 {
		s1 = secureSeed()
		s2 = secureSeed()
	}
	src := rand.NewPCG(s1, s2)
	return rand.New(src)
}

func secureSeed() uint64 {
	var b [8]byte
	if _, err := cryptorand.Read(b[:]); err != nil {
		// crypto/rand on linux only fails if /dev/urandom is unavailable —
		// fall back to a fixed mixed value rather than panic.
		return 0xA5A5A5A5A5A5A5A5
	}
	return binary.LittleEndian.Uint64(b[:])
}

// splitmix64 — used only to derive a second PCG word from a single seed.
func splitmix64(x uint64) uint64 {
	x += 0x9E3779B97F4A7C15
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	x ^= x >> 31
	return x
}
