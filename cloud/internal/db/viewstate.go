package db

import "database/sql"

type ViewState struct {
	UserID    string  `json:"user_id"`
	Zoom      float64 `json:"zoom"`
	PanX      float64 `json:"pan_x"`
	PanY      float64 `json:"pan_y"`
	UpdatedAt string  `json:"updated_at"`
}

func GetViewState(userID string) (*ViewState, error) {
	row := db.QueryRow("SELECT user_id, zoom, pan_x, pan_y, updated_at FROM view_state WHERE user_id=?", userID)
	var vs ViewState
	err := row.Scan(&vs.UserID, &vs.Zoom, &vs.PanX, &vs.PanY, &vs.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &vs, nil
}

func SaveViewState(userID string, zoom, panX, panY float64) error {
	_, err := db.Exec(`INSERT INTO view_state (user_id, zoom, pan_x, pan_y, updated_at)
		VALUES (?, ?, ?, ?, datetime('now'))
		ON CONFLICT(user_id) DO UPDATE SET
			zoom=excluded.zoom, pan_x=excluded.pan_x, pan_y=excluded.pan_y,
			updated_at=datetime('now')`,
		userID, zoom, panX, panY)
	return err
}
