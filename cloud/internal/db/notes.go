package db

import (
	"database/sql"
	"encoding/json"
)

type Note struct {
	ID        string   `json:"id"`
	UserID    string   `json:"user_id"`
	Content   string   `json:"content"`
	FontSize  int      `json:"font_size"`
	Images    []string `json:"images"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

func GetNotesByUser(userID string) ([]Note, error) {
	rows, err := db.Query(`SELECT id, user_id, content, font_size, images, created_at, updated_at
		FROM notes WHERE user_id=? ORDER BY created_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var notes []Note
	for rows.Next() {
		n, err := scanNote(rows)
		if err != nil {
			return nil, err
		}
		notes = append(notes, *n)
	}
	return notes, nil
}

func GetNoteByID(userID, noteID string) (*Note, error) {
	row := db.QueryRow(`SELECT id, user_id, content, font_size, images, created_at, updated_at
		FROM notes WHERE id=? AND user_id=?`, noteID, userID)
	return scanNoteRow(row)
}

func UpsertNote(userID, noteID, content string, fontSize int, images []string) error {
	imagesJSON := "[]"
	if images != nil {
		imagesJSON = toJSON(images)
	}
	_, err := db.Exec(`INSERT INTO notes (id, user_id, content, font_size, images, updated_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(id) DO UPDATE SET
			content=excluded.content, font_size=excluded.font_size,
			images=excluded.images, updated_at=datetime('now')
		WHERE user_id=excluded.user_id`,
		noteID, userID, content, fontSize, imagesJSON)
	return err
}

func DeleteNote(userID, noteID string) error {
	_, err := db.Exec("DELETE FROM notes WHERE id=? AND user_id=?", noteID, userID)
	return err
}

func scanNote(rows *sql.Rows) (*Note, error) {
	var n Note
	var imagesJSON string
	err := rows.Scan(&n.ID, &n.UserID, &n.Content, &n.FontSize, &imagesJSON, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	n.Images = parseImages(imagesJSON)
	return &n, nil
}

func scanNoteRow(row *sql.Row) (*Note, error) {
	var n Note
	var imagesJSON string
	err := row.Scan(&n.ID, &n.UserID, &n.Content, &n.FontSize, &imagesJSON, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	n.Images = parseImages(imagesJSON)
	return &n, nil
}

func parseImages(s string) []string {
	var imgs []string
	if s == "" || s == "[]" {
		return imgs
	}
	// Simple JSON array parse
	_ = json.Unmarshal([]byte(s), &imgs)
	return imgs
}
