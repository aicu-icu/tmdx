package db

import "database/sql"

type Message struct {
	ID        int     `json:"id"`
	UserID    string  `json:"user_id"`
	Sender    string  `json:"sender"`
	Body      string  `json:"body"`
	ReadAt    *string `json:"read_at"`
	CreatedAt string  `json:"created_at"`
}

func InsertMessage(userID, sender, body string) (*Message, error) {
	res, err := db.Exec("INSERT INTO messages (user_id, sender, body) VALUES (?, ?, ?)", userID, sender, body)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	row := db.QueryRow("SELECT id, user_id, sender, body, read_at, created_at FROM messages WHERE id=?", id)
	return scanMessage(row)
}

func GetMessages(userID string, before *int, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows *sql.Rows
	var err error
	if before != nil {
		rows, err = db.Query("SELECT id, user_id, sender, body, read_at, created_at FROM messages WHERE user_id=? AND id<? ORDER BY id DESC LIMIT ?", userID, *before, limit)
	} else {
		rows, err = db.Query("SELECT id, user_id, sender, body, read_at, created_at FROM messages WHERE user_id=? ORDER BY id DESC LIMIT ?", userID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []Message
	for rows.Next() {
		m, err := scanMessageRow(rows)
		if err != nil {
			return nil, err
		}
		msgs = append(msgs, *m)
	}
	// Reverse since we queried DESC
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func GetUnreadCount(userID string) int {
	var c int
	db.QueryRow("SELECT COUNT(*) FROM messages WHERE user_id=? AND sender='admin' AND read_at IS NULL", userID).Scan(&c)
	return c
}

func MarkRead(userID string) {
	db.Exec("UPDATE messages SET read_at=datetime('now') WHERE user_id=? AND sender='admin' AND read_at IS NULL", userID)
}

func MarkReadByAdmin(userID string) {
	db.Exec("UPDATE messages SET read_at=datetime('now') WHERE user_id=? AND sender='user' AND read_at IS NULL", userID)
}

type Conversation struct {
	UserID         string  `json:"user_id"`
	DisplayName    *string `json:"display_name"`
	GithubLogin    *string `json:"github_login"`
	Email          *string `json:"email"`
	AvatarURL      *string `json:"avatar_url"`
	LastMessage    string  `json:"last_message"`
	LastSender     string  `json:"last_sender"`
	LastMessageAt  string  `json:"last_message_at"`
	TotalMessages  int     `json:"total_messages"`
	UnreadFromUser int     `json:"unread_from_user"`
}

func GetConversations() ([]Conversation, error) {
	rows, err := db.Query(`SELECT m.user_id, u.display_name, u.github_login, u.email, u.avatar_url,
		(SELECT body FROM messages WHERE user_id=m.user_id ORDER BY id DESC LIMIT 1),
		(SELECT sender FROM messages WHERE user_id=m.user_id ORDER BY id DESC LIMIT 1),
		(SELECT created_at FROM messages WHERE user_id=m.user_id ORDER BY id DESC LIMIT 1),
		COUNT(*), SUM(CASE WHEN m.sender='user' AND m.read_at IS NULL THEN 1 ELSE 0 END)
		FROM messages m JOIN users u ON u.id=m.user_id
		GROUP BY m.user_id ORDER BY last_message_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var convs []Conversation
	for rows.Next() {
		var c Conversation
		var dn, gl, email, av sql.NullString
		rows.Scan(&c.UserID, &dn, &gl, &email, &av, &c.LastMessage, &c.LastSender, &c.LastMessageAt, &c.TotalMessages, &c.UnreadFromUser)
		if dn.Valid {
			c.DisplayName = &dn.String
		}
		if gl.Valid {
			c.GithubLogin = &gl.String
		}
		if email.Valid {
			c.Email = &email.String
		}
		if av.Valid {
			c.AvatarURL = &av.String
		}
		convs = append(convs, c)
	}
	return convs, nil
}

func GetConversation(userID string, before *int, limit int) ([]Message, error) {
	return GetMessages(userID, before, limit)
}

func GetAllUserIDs() []string {
	rows, err := db.Query("SELECT id FROM users")
	if err != nil {
		return nil
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	return ids
}

func BroadcastToAll(body string) int {
	userIDs := GetAllUserIDs()
	tx, _ := db.Begin()
	stmt, _ := tx.Prepare("INSERT INTO messages (user_id, sender, body) VALUES (?, 'admin', ?)")
	for _, uid := range userIDs {
		stmt.Exec(uid, body)
	}
	stmt.Close()
	tx.Commit()
	return len(userIDs)
}

func scanMessage(row *sql.Row) (*Message, error) {
	var m Message
	var readAt sql.NullString
	err := row.Scan(&m.ID, &m.UserID, &m.Sender, &m.Body, &readAt, &m.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if readAt.Valid {
		m.ReadAt = &readAt.String
	}
	return &m, nil
}

func scanMessageRow(rows *sql.Rows) (*Message, error) {
	var m Message
	var readAt sql.NullString
	err := rows.Scan(&m.ID, &m.UserID, &m.Sender, &m.Body, &readAt, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	if readAt.Valid {
		m.ReadAt = &readAt.String
	}
	return &m, nil
}
