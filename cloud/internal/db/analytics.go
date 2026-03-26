package db

import (
	"fmt"
	"regexp"
)

var (
	reBrowserEdge     = regexp.MustCompile(`(?i)Edg/`)
	reBrowserOpera    = regexp.MustCompile(`(?i)(OPR/|Opera)`)
	reBrowserSamsung  = regexp.MustCompile(`(?i)SamsungBrowser`)
	reBrowserChrome   = regexp.MustCompile(`(?i)Chrome/`)
	reBrowserChromium = regexp.MustCompile(`(?i)Chromium`)
	reBrowserSafari   = regexp.MustCompile(`(?i)Safari/`)
	reBrowserFirefox  = regexp.MustCompile(`(?i)Firefox/`)
	reOSWindows       = regexp.MustCompile(`(?i)Windows`)
	reOSMac           = regexp.MustCompile(`(?i)(Macintosh|Mac OS)`)
	reOSAndroid       = regexp.MustCompile(`(?i)Android`)
	reOSIOS           = regexp.MustCompile(`(?i)(iPhone|iPad|iPod)`)
	reOSLinux         = regexp.MustCompile(`(?i)Linux`)
)

type PageViewInput struct {
	Path         string
	Referrer     string
	UserAgent    string
	ScreenWidth  int
	ScreenHeight int
	IP           string
	Hostname     string
	SessionID    string
	UserID       *string
	UTMSource    string
	UTMMedium    string
	UTMCampaign  string
}

func RecordPageView(p PageViewInput) {
	browser, os := parseUserAgent(p.UserAgent)
	_, _ = db.Exec(`INSERT INTO page_views (path, referrer, user_agent, browser, os, screen_width, screen_height, ip, hostname, session_id, user_id, utm_source, utm_medium, utm_campaign)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.Path, nullStr(p.Referrer), nullStr(p.UserAgent), browser, os,
		p.ScreenWidth, p.ScreenHeight, nullStr(p.IP), nullStr(p.Hostname),
		nullStr(p.SessionID), p.UserID, nullStr(p.UTMSource), nullStr(p.UTMMedium), nullStr(p.UTMCampaign))
}

func parseUserAgent(ua string) (string, string) {
	if ua == "" {
		return "Unknown", "Unknown"
	}

	browser := "Other"
	switch {
	case reBrowserEdge.MatchString(ua):
		browser = "Edge"
	case reBrowserOpera.MatchString(ua):
		browser = "Opera"
	case reBrowserSamsung.MatchString(ua):
		browser = "Samsung Internet"
	case reBrowserChrome.MatchString(ua) && !reBrowserChromium.MatchString(ua):
		browser = "Chrome"
	case reBrowserSafari.MatchString(ua) && !reBrowserChrome.MatchString(ua):
		browser = "Safari"
	case reBrowserFirefox.MatchString(ua):
		browser = "Firefox"
	}

	os := "Other"
	switch {
	case reOSWindows.MatchString(ua):
		os = "Windows"
	case reOSMac.MatchString(ua):
		os = "macOS"
	case reOSAndroid.MatchString(ua):
		os = "Android"
	case reOSIOS.MatchString(ua):
		os = "iOS"
	case reOSLinux.MatchString(ua):
		os = "Linux"
	}

	return browser, os
}

type AnalyticsData struct {
	ViewsPerDay          []DayCount     `json:"viewsPerDay"`
	UniqueVisitorsPerDay []DayCount     `json:"uniqueVisitorsPerDay"`
	TopPages             []FeatureCount `json:"topPages"`
	TopReferrers         []FeatureCount `json:"topReferrers"`
	Browsers             []FeatureCount `json:"browsers"`
	OperatingSystems     []FeatureCount `json:"operatingSystems"`
	TotalViews           int            `json:"totalViews"`
	TotalUnique          int            `json:"totalUnique"`
	UTMSources           []FeatureCount `json:"utmSources"`
	UTMConversions       []FeatureCount `json:"utmConversions"`
}

func GetAnalyticsData(days int, hostnameFilter *string) (*AnalyticsData, error) {
	if days <= 0 {
		days = 30
	}

	where := "WHERE created_at>=datetime('now',?||' days')"
	args := []interface{}{fmt.Sprintf("-%d", days)}
	if hostnameFilter != nil && *hostnameFilter != "" {
		where += " AND hostname=?"
		args = append(args, *hostnameFilter)
	}

	q := func(query string, args ...interface{}) []DayCount {
		rows, err := db.Query(query, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var result []DayCount
		for rows.Next() {
			var dc DayCount
			rows.Scan(&dc.Date, &dc.Count)
			result = append(result, dc)
		}
		return result
	}

	qf := func(query string, args ...interface{}) []FeatureCount {
		rows, err := db.Query(query, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var result []FeatureCount
		for rows.Next() {
			var fc FeatureCount
			rows.Scan(&fc.Feature, &fc.Count)
			result = append(result, fc)
		}
		return result
	}

	countQuery := func(query string, args ...interface{}) int {
		var c int
		db.QueryRow(query, args...).Scan(&c)
		return c
	}

	refWhere := where + " AND referrer IS NOT NULL AND referrer != ''"

	data := &AnalyticsData{
		ViewsPerDay:          q("SELECT date(created_at), COUNT(*) FROM page_views "+where+" GROUP BY date(created_at) ORDER BY date ASC", args...),
		UniqueVisitorsPerDay: q("SELECT date(created_at), COUNT(DISTINCT session_id) FROM page_views "+where+" GROUP BY date(created_at) ORDER BY date ASC", args...),
		TopPages:             qf("SELECT path, COUNT(*) FROM page_views "+where+" GROUP BY path ORDER BY COUNT(*) DESC LIMIT 10", args...),
		TopReferrers:         qf("SELECT referrer, COUNT(*) FROM page_views "+refWhere+" GROUP BY referrer ORDER BY COUNT(*) DESC LIMIT 10", args...),
		Browsers:             qf("SELECT browser, COUNT(*) FROM page_views "+where+" GROUP BY browser ORDER BY COUNT(*) DESC", args...),
		OperatingSystems:     qf("SELECT os, COUNT(*) FROM page_views "+where+" GROUP BY os ORDER BY COUNT(*) DESC", args...),
		TotalViews:           countQuery("SELECT COUNT(*) FROM page_views "+where, args...),
		TotalUnique:          countQuery("SELECT COUNT(DISTINCT session_id) FROM page_views "+where, args...),
		UTMSources:           qf("SELECT utm_source, COUNT(*) FROM page_views "+where+" AND utm_source IS NOT NULL GROUP BY utm_source ORDER BY COUNT(*) DESC LIMIT 20", args...),
	}

	// UTM conversion data uses different hostname args
	cloudHost := "localhost:1071" // fallback
	// Use appHost if set, otherwise cloudHost
	appHost := cloudHost
	_ = appHost // will be configured in routes
	data.UTMConversions = qf(`SELECT utm_source, COUNT(DISTINCT session_id)
		FROM page_views WHERE created_at>=datetime('now',?||' days') AND hostname=? AND utm_source IS NOT NULL
		GROUP BY utm_source ORDER BY COUNT(DISTINCT session_id) DESC LIMIT 20`,
		fmt.Sprintf("-%d", days), cloudHost)

	return data, nil
}
