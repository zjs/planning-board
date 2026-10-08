package main

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// OriginPolicy says which web pages may open a connection (ADR 0017).
//
// It isn't a security boundary: writing needs the room's write token, and a
// program that isn't a browser can send any Origin it likes. It keeps other
// websites from using a visitor's browser to fill the relay, and it's
// compared by host, so a TLS proxy in front of the relay doesn't break it.
type OriginPolicy struct {
	// Any allows every origin.
	Any bool
	// Null allows pages opened from disk, which send "Origin: null".
	Null bool
	// Hosts are allowed hosts, with or without a port ("zjs.github.io").
	Hosts []string
	// Public is the relay's public host, from -public-url, if it has one.
	Public string
}

// Allowed says whether req's Origin may connect. A request with no Origin,
// from a program rather than a page, is allowed: the token still decides.
func (p OriginPolicy) Allowed(req *http.Request) bool {
	origin := req.Header.Get("Origin")
	if origin == "" || p.Any {
		return true
	}
	if origin == "null" {
		return p.Null
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	host := strings.ToLower(u.Host)
	if host == strings.ToLower(req.Host) || (p.Public != "" && host == strings.ToLower(p.Public)) {
		return true
	}
	for _, allowed := range p.Hosts {
		allowed = strings.ToLower(allowed)
		if host == allowed || strings.ToLower(u.Hostname()) == allowed {
			return true
		}
	}
	return false
}

// Limiter is a token bucket per key: `rate` events per `per`, with bursts up
// to `burst`. A rate of zero turns it off.
type Limiter struct {
	mu      sync.Mutex
	rate    float64
	per     time.Duration
	burst   float64
	buckets map[string]*bucket
	now     func() time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

func NewLimiter(rate float64, per time.Duration, burst float64, now func() time.Time) *Limiter {
	if burst < 1 {
		burst = 1
	}
	return &Limiter{rate: rate, per: per, burst: burst, buckets: map[string]*bucket{}, now: now}
}

// Allow takes one token for key, if there is one.
func (l *Limiter) Allow(key string) bool {
	if l == nil || l.rate <= 0 {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		if len(l.buckets) > 10000 {
			l.sweep(now)
		}
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	b.tokens += now.Sub(b.last).Seconds() / l.per.Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// sweep forgets buckets that have refilled, so the map can't grow without end.
func (l *Limiter) sweep(now time.Time) {
	for key, b := range l.buckets {
		if b.tokens+now.Sub(b.last).Seconds()/l.per.Seconds()*l.rate >= l.burst {
			delete(l.buckets, key)
		}
	}
}

// clientAddress is who a request is from, for rate limits. Behind a proxy
// every request comes from the proxy, so -trust-forwarded reads the address
// the proxy says it came from.
func clientAddress(req *http.Request, trustForwarded bool) string {
	if trustForwarded {
		if fwd := req.Header.Get("X-Forwarded-For"); fwd != "" {
			first, _, _ := strings.Cut(fwd, ",")
			return strings.TrimSpace(first)
		}
	}
	host, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil {
		return req.RemoteAddr
	}
	return host
}
