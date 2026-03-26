package db

import (
	"database/sql"
	"fmt"
)

func RecordEvent(eventType string, userID *string, metadata interface{}) {
	var uid interface{}
	if userID != nil {
		uid = *userID
	}
	var meta interface{}
	if metadata != nil {
		meta = toJSON(metadata)
	}
	_, _ = db.Exec("INSERT INTO events (event_type, user_id, metadata) VALUES (?, ?, ?)", eventType, uid, meta)
}

type EventStats struct {
	SignupsPerDay            []DayCount     `json:"signupsPerDay"`
	TotalSignups             int            `json:"totalSignups"`
	LoginsPerDay             []DayCount     `json:"loginsPerDay"`
	DAUPerDay                []DayCount     `json:"dauPerDay"`
	WAU                      int            `json:"wau"`
	MAU                      int            `json:"mau"`
	AgentConnectionsPerDay   []DayCount     `json:"agentConnectionsPerDay"`
	AvgBrowserSession        int            `json:"avgBrowserSession"`
	AvgAgentSession          int            `json:"avgAgentSession"`
	TierLimitHits            []FeatureCount `json:"tierLimitHits"`
	AgentOsDistribution      []FeatureCount `json:"agentOsDistribution"`
	AgentVersionDistribution []FeatureCount `json:"agentVersionDistribution"`
	TotalRelayMessages       int            `json:"totalRelayMessages"`
	TotalGuestStarts         int            `json:"totalGuestStarts"`
	TotalGuestConverted      int            `json:"totalGuestConverted"`
	GuestConversionRate      float64        `json:"guestConversionRate"`
	GuestStartsPerDay        []DayCount     `json:"guestStartsPerDay"`
	GuestConversionsPerDay   []DayCount     `json:"guestConversionsPerDay"`
}

type DayCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type FeatureCount struct {
	Feature string `json:"feature"`
	Count   int    `json:"count"`
}

func GetEventStats(days int) (*EventStats, error) {
	if days <= 0 {
		days = 30
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

	avgQuery := func(query string, args ...interface{}) float64 {
		var v sql.NullFloat64
		db.QueryRow(query, args...).Scan(&v)
		if v.Valid {
			return v.Float64
		}
		return 0
	}

	stats := &EventStats{
		SignupsPerDay:            q("SELECT date(created_at), COUNT(*) FROM events WHERE event_type='user.signup' AND created_at>=datetime('now',?||' days') GROUP BY date(created_at) ORDER BY date ASC", fmt.Sprintf("-%d", days)),
		TotalSignups:             countQuery("SELECT COUNT(*) FROM events WHERE event_type='user.signup' AND created_at>=datetime('now',?||' days')", fmt.Sprintf("-%d", days)),
		LoginsPerDay:             q("SELECT date(created_at), COUNT(*) FROM events WHERE event_type='user.login' AND created_at>=datetime('now',?||' days') GROUP BY date(created_at) ORDER BY date ASC", fmt.Sprintf("-%d", days)),
		DAUPerDay:                q("SELECT date(created_at), COUNT(DISTINCT user_id) FROM events WHERE event_type='user.login' AND created_at>=datetime('now',?||' days') GROUP BY date(created_at) ORDER BY date ASC", fmt.Sprintf("-%d", days)),
		WAU:                      countQuery("SELECT COUNT(DISTINCT user_id) FROM events WHERE event_type='user.login' AND created_at>=datetime('now','-7 days')"),
		MAU:                      countQuery("SELECT COUNT(DISTINCT user_id) FROM events WHERE event_type='user.login' AND created_at>=datetime('now','-30 days')"),
		AgentConnectionsPerDay:   q("SELECT date(created_at), COUNT(*) FROM events WHERE event_type='agent.connect' AND created_at>=datetime('now',?||' days') GROUP BY date(created_at) ORDER BY date ASC", fmt.Sprintf("-%d", days)),
		AvgBrowserSession:        int(avgQuery("SELECT AVG(CAST(json_extract(metadata,'$.duration_ms') AS REAL)) FROM events WHERE event_type='browser.disconnect' AND created_at>=datetime('now',?||' days') AND json_extract(metadata,'$.duration_ms') IS NOT NULL", fmt.Sprintf("-%d", days))),
		AvgAgentSession:          int(avgQuery("SELECT AVG(CAST(json_extract(metadata,'$.duration_ms') AS REAL)) FROM events WHERE event_type='agent.disconnect' AND created_at>=datetime('now',?||' days') AND json_extract(metadata,'$.duration_ms') IS NOT NULL", fmt.Sprintf("-%d", days))),
		TierLimitHits:            qf("SELECT json_extract(metadata,'$.feature'), COUNT(*) FROM events WHERE event_type='tier.limit_hit' AND created_at>=datetime('now',?||' days') GROUP BY feature ORDER BY COUNT(*) DESC", fmt.Sprintf("-%d", days)),
		AgentOsDistribution:      qf("SELECT json_extract(metadata,'$.os'), COUNT(*) FROM events WHERE event_type='agent.connect' AND created_at>=datetime('now',?||' days') AND json_extract(metadata,'$.os') IS NOT NULL GROUP BY os ORDER BY COUNT(*) DESC", fmt.Sprintf("-%d", days)),
		AgentVersionDistribution: qf("SELECT json_extract(metadata,'$.version'), COUNT(*) FROM events WHERE event_type='agent.connect' AND created_at>=datetime('now',?||' days') AND json_extract(metadata,'$.version') IS NOT NULL GROUP BY version ORDER BY COUNT(*) DESC", fmt.Sprintf("-%d", days)),
		TotalRelayMessages:       countQuery("SELECT COUNT(*) FROM events WHERE event_type='ws.relay' AND created_at>=datetime('now',?||' days')", fmt.Sprintf("-%d", days)),
		TotalGuestStarts:         countQuery("SELECT COUNT(*) FROM events WHERE event_type='user.guest_start' AND created_at>=datetime('now',?||' days')", fmt.Sprintf("-%d", days)),
		TotalGuestConverted:      countQuery("SELECT COUNT(*) FROM events WHERE event_type='user.guest_converted' AND created_at>=datetime('now',?||' days')", fmt.Sprintf("-%d", days)),
		GuestStartsPerDay:        q("SELECT date(created_at), COUNT(*) FROM events WHERE event_type='user.guest_start' AND created_at>=datetime('now',?||' days') GROUP BY date(created_at) ORDER BY date ASC", fmt.Sprintf("-%d", days)),
		GuestConversionsPerDay:   q("SELECT date(created_at), COUNT(*) FROM events WHERE event_type='user.guest_converted' AND created_at>=datetime('now',?||' days') GROUP BY date(created_at) ORDER BY date ASC", fmt.Sprintf("-%d", days)),
	}

	if stats.TotalGuestStarts > 0 {
		stats.GuestConversionRate = float64(int(float64(stats.TotalGuestConverted)/float64(stats.TotalGuestStarts)*1000)) / 10
	}

	return stats, nil
}

type ConnectionSnapshot struct {
	Timestamp string `json:"timestamp"`
	Browsers  int    `json:"browsers"`
	Agents    int    `json:"agents"`
	Users     int    `json:"users"`
}

func GetConnectionTimeSeries(days int) ([]ConnectionSnapshot, error) {
	if days <= 0 {
		days = 7
	}
	rows, err := db.Query(`SELECT created_at, json_extract(metadata,'$.totalBrowsers'),
		json_extract(metadata,'$.totalAgents'), json_extract(metadata,'$.uniqueUsers')
		FROM events WHERE event_type='connections.snapshot' AND created_at>=datetime('now',?||' days')
		ORDER BY created_at ASC`, fmt.Sprintf("-%d", days))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []ConnectionSnapshot
	for rows.Next() {
		var cs ConnectionSnapshot
		var browsers, agents, users sql.NullInt64
		rows.Scan(&cs.Timestamp, &browsers, &agents, &users)
		if browsers.Valid {
			cs.Browsers = int(browsers.Int64)
		}
		if agents.Valid {
			cs.Agents = int(agents.Int64)
		}
		if users.Valid {
			cs.Users = int(users.Int64)
		}
		result = append(result, cs)
	}
	return result, nil
}
