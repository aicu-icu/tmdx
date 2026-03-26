package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"cloud/internal/notifications"
	"cloud/internal/utils"
)

type User struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	DisplayName *string `json:"display_name"`
	Role        string  `json:"role"`
	Tier        string  `json:"tier"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func generateUserID() string {
	return "user_" + strings.ReplaceAll(newUUID(), "-", "")[:12]
}

func newUUID() string {
	return utils.UUID()
}

func CreateLocalUser(username, passwordHash, role string) (*User, error) {
	id := generateUserID()
	_, err := db.Exec(`INSERT INTO users (id, username, password_hash, display_name, role, tier)
		VALUES (?, ?, ?, ?, ?, 'pro')`,
		id, username, passwordHash, username, role)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	RecordEvent("user.signup", &id, map[string]interface{}{
		"username": username,
		"role":     role,
	})

	go notifications.NotifyNewUser(id, username)

	return GetUserByID(id)
}

func GetUserByID(id string) (*User, error) {
	row := db.QueryRow(`SELECT id, username, display_name, role, tier,
		created_at, updated_at FROM users WHERE id=?`, id)
	return scanUser(row)
}

func GetUserByUsername(username string) (*User, error) {
	row := db.QueryRow(`SELECT id, username, display_name, role, tier,
		created_at, updated_at FROM users WHERE username=?`, username)
	return scanUser(row)
}

func GetUserPasswordHash(username string) (string, error) {
	var hash string
	err := db.QueryRow(`SELECT password_hash FROM users WHERE username=?`, username).Scan(&hash)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return hash, nil
}

func CountUsers() (int, error) {
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func UpdateUserDisplayName(userID string, displayName *string) {
	db.Exec(`UPDATE users SET display_name=?, updated_at=datetime('now') WHERE id=?`,
		optStr(displayName), userID)
}

func UpdateUserTier(userID, tier string) {
	db.Exec(`UPDATE users SET tier=?, updated_at=datetime('now') WHERE id=?`, tier, userID)
}

func scanUser(row *sql.Row) (*User, error) {
	var u User
	var displayName sql.NullString
	err := row.Scan(&u.ID, &u.Username, &displayName, &u.Role,
		&u.Tier, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if displayName.Valid {
		u.DisplayName = &displayName.String
	}
	return &u, nil
}

func optStr(s *string) interface{} {
	if s == nil {
		return nil
	}
	return *s
}

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
