package db

import (
	"database/sql"
	"fmt"
	"strings"
)

type Agent struct {
	ID          string  `json:"id"`
	UserID      string  `json:"user_id"`
	Hostname    string  `json:"hostname"`
	DisplayName *string `json:"display_name"`
	OS          *string `json:"os"`
	Version     *string `json:"version"`
	TokenHash   string  `json:"token_hash"`
	LastSeenAt  *string `json:"last_seen_at"`
	CreatedAt   string  `json:"created_at"`
}

func generateAgentID() string {
	return "agent_" + strings.ReplaceAll(newUUID(), "-", "")[:12]
}

func RegisterAgent(userID, hostname, os, tokenHash string) (*Agent, error) {
	id := generateAgentID()
	_, err := db.Exec(`INSERT INTO agents (id, user_id, hostname, os, token_hash)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(user_id, hostname) DO UPDATE SET os=excluded.os, token_hash=excluded.token_hash`,
		id, userID, hostname, nullStr(os), tokenHash)
	if err != nil {
		return nil, fmt.Errorf("register agent: %w", err)
	}
	// SELECT by (user_id, hostname) because ON CONFLICT keeps the original row id
	return GetAgentByUserHost(userID, hostname)
}

func GetAgentByUserHost(userID, hostname string) (*Agent, error) {
	row := db.QueryRow(`SELECT id, user_id, hostname, display_name, os, version, token_hash, last_seen_at, created_at
		FROM agents WHERE user_id=? AND hostname=?`, userID, hostname)
	return scanAgent(row)
}

func GetAgentsByUser(userID string) ([]Agent, error) {
	rows, err := db.Query(`SELECT id, user_id, hostname, display_name, os, version, token_hash, last_seen_at, created_at
		FROM agents WHERE user_id=? ORDER BY created_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var agents []Agent
	for rows.Next() {
		a, err := scanAgentRow(rows)
		if err != nil {
			return nil, err
		}
		agents = append(agents, *a)
	}
	return agents, nil
}

func GetAgentByID(id string) (*Agent, error) {
	row := db.QueryRow(`SELECT id, user_id, hostname, display_name, os, version, token_hash, last_seen_at, created_at
		FROM agents WHERE id=?`, id)
	return scanAgent(row)
}

func UpdateLastSeen(agentID string) {
	db.Exec(`UPDATE agents SET last_seen_at=datetime('now') WHERE id=?`, agentID)
}

func UpdateAgentDisplayName(agentID string, displayName *string) {
	db.Exec(`UPDATE agents SET display_name=? WHERE id=?`, nullStrPtr(displayName), agentID)
}

func DeleteAgent(agentID string) {
	db.Exec(`DELETE FROM agents WHERE id=?`, agentID)
}

func scanAgent(row *sql.Row) (*Agent, error) {
	var a Agent
	var displayName, os, version, lastSeenAt sql.NullString
	err := row.Scan(&a.ID, &a.UserID, &a.Hostname, &displayName, &os, &version, &a.TokenHash, &lastSeenAt, &a.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if displayName.Valid {
		a.DisplayName = &displayName.String
	}
	if os.Valid {
		a.OS = &os.String
	}
	if version.Valid {
		a.Version = &version.String
	}
	if lastSeenAt.Valid {
		a.LastSeenAt = &lastSeenAt.String
	}
	return &a, nil
}

func scanAgentRow(rows *sql.Rows) (*Agent, error) {
	var a Agent
	var displayName, os, version, lastSeenAt sql.NullString
	err := rows.Scan(&a.ID, &a.UserID, &a.Hostname, &displayName, &os, &version, &a.TokenHash, &lastSeenAt, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	if displayName.Valid {
		a.DisplayName = &displayName.String
	}
	if os.Valid {
		a.OS = &os.String
	}
	if version.Valid {
		a.Version = &version.String
	}
	if lastSeenAt.Valid {
		a.LastSeenAt = &lastSeenAt.String
	}
	return &a, nil
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func nullStrPtr(s *string) interface{} {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}
