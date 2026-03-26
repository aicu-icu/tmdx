package routes

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"cloud/internal/db"
)

// Rate limiter for analytics tracking
var (
	trackMu       sync.Mutex
	lastTrackByIP = make(map[string]time.Time)
)

const trackRateLimit = time.Second

func init() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			cutoff := time.Now().Add(-time.Minute)
			trackMu.Lock()
			for ip, t := range lastTrackByIP {
				if t.Before(cutoff) {
					delete(lastTrackByIP, ip)
				}
			}
			if len(lastTrackByIP) > 50000 {
				lastTrackByIP = make(map[string]time.Time)
			}
			trackMu.Unlock()
		}
	}()
}

func SetupAnalyticsRoutes(r *gin.Engine) {
	// POST /api/analytics/track (public, no auth)
	r.POST("/api/analytics/track", func(c *gin.Context) {
		ip := c.ClientIP()

		trackMu.Lock()
		now := time.Now()
		if last, ok := lastTrackByIP[ip]; ok && now.Sub(last) < trackRateLimit {
			trackMu.Unlock()
			c.JSON(429, gin.H{"error": "Too many requests"})
			return
		}
		lastTrackByIP[ip] = now
		trackMu.Unlock()

		var body struct {
			Path         string  `json:"path"`
			Referrer     *string `json:"referrer"`
			ScreenWidth  *int    `json:"screenWidth"`
			ScreenHeight *int    `json:"screenHeight"`
			SessionID    *string `json:"sessionId"`
			Hostname     *string `json:"hostname"`
			UTMSource    *string `json:"utmSource"`
			UTMMedium    *string `json:"utmMedium"`
			UTMCampaign  *string `json:"utmCampaign"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Path == "" {
			c.JSON(400, gin.H{"error": "path is required"})
			return
		}

		path := body.Path
		if len(path) > 500 {
			path = path[:500]
		}

		db.RecordPageView(db.PageViewInput{
			Path:         path,
			Referrer:     strVal(body.Referrer),
			UserAgent:    c.GetHeader("User-Agent"),
			ScreenWidth:  intVal(body.ScreenWidth),
			ScreenHeight: intVal(body.ScreenHeight),
			IP:           ip,
			Hostname:     strVal(body.Hostname),
			SessionID:    strVal(body.SessionID),
			UTMSource:    strVal(body.UTMSource),
			UTMMedium:    strVal(body.UTMMedium),
			UTMCampaign:  strVal(body.UTMCampaign),
		})

		c.JSON(200, gin.H{"ok": true})
	})
}

func strVal(s *string) string {
	if s == nil {
		return ""
	}
	if len(*s) > 2000 {
		return (*s)[:2000]
	}
	return *s
}

func intVal(i *int) int {
	if i == nil {
		return 0
	}
	return *i
}
