package db

import "database/sql"

type PaneLayout struct {
	ID        string  `json:"id"`
	UserID    string  `json:"user_id"`
	AgentID   *string `json:"agent_id"`
	PaneType  string  `json:"pane_type"`
	PositionX float64 `json:"position_x"`
	PositionY float64 `json:"position_y"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	ZIndex    int     `json:"z_index"`
	Metadata  *string `json:"metadata"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
	// joined
	AgentHostname *string `json:"agent_hostname,omitempty"`
}

func GetLayoutsByUser(userID string) ([]PaneLayout, error) {
	rows, err := db.Query(`SELECT pl.id, pl.user_id, pl.agent_id, pl.pane_type, pl.position_x, pl.position_y,
		pl.width, pl.height, pl.z_index, pl.metadata, pl.created_at, pl.updated_at, a.hostname
		FROM pane_layouts pl LEFT JOIN agents a ON pl.agent_id=a.id
		WHERE pl.user_id=? ORDER BY pl.z_index ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var layouts []PaneLayout
	for rows.Next() {
		var l PaneLayout
		var agentID, meta, agentHost sql.NullString
		err := rows.Scan(&l.ID, &l.UserID, &agentID, &l.PaneType, &l.PositionX, &l.PositionY,
			&l.Width, &l.Height, &l.ZIndex, &meta, &l.CreatedAt, &l.UpdatedAt, &agentHost)
		if err != nil {
			return nil, err
		}
		if agentID.Valid {
			l.AgentID = &agentID.String
		}
		if meta.Valid {
			l.Metadata = &meta.String
		}
		if agentHost.Valid {
			l.AgentHostname = &agentHost.String
		}
		layouts = append(layouts, l)
	}
	return layouts, nil
}

type SavePane struct {
	ID        string  `json:"id"`
	AgentID   *string `json:"agentId"`
	PaneType  string  `json:"paneType"`
	PositionX float64 `json:"positionX"`
	PositionY float64 `json:"positionY"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	ZIndex    int     `json:"zIndex"`
	Metadata  *string `json:"metadata"`
}

func SaveFullLayout(userID string, panes []SavePane) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM pane_layouts WHERE user_id=?", userID); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO pane_layouts (id, user_id, agent_id, pane_type, position_x, position_y, width, height, z_index, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range panes {
		agentID := p.AgentID
		if agentID != nil && *agentID != "" {
			// Validate agent exists
			var exists int
			tx.QueryRow("SELECT 1 FROM agents WHERE id=?", *agentID).Scan(&exists)
			if exists == 0 {
				agentID = nil
			}
		}
		var meta interface{}
		if p.Metadata != nil {
			meta = *p.Metadata
		}
		if _, err := stmt.Exec(p.ID, userID, agentID, p.PaneType, p.PositionX, p.PositionY, p.Width, p.Height, p.ZIndex, meta); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func UpdatePaneLayout(userID, paneID string, updates map[string]interface{}) error {
	var sets []string
	var args []interface{}

	if v, ok := updates["positionX"]; ok {
		sets = append(sets, "position_x=?")
		args = append(args, v)
	}
	if v, ok := updates["positionY"]; ok {
		sets = append(sets, "position_y=?")
		args = append(args, v)
	}
	if v, ok := updates["width"]; ok {
		sets = append(sets, "width=?")
		args = append(args, v)
	}
	if v, ok := updates["height"]; ok {
		sets = append(sets, "height=?")
		args = append(args, v)
	}
	if v, ok := updates["zIndex"]; ok {
		sets = append(sets, "z_index=?")
		args = append(args, v)
	}
	if v, ok := updates["metadata"]; ok {
		sets = append(sets, "metadata=?")
		args = append(args, v)
	}

	if len(sets) == 0 {
		return nil
	}

	sets = append(sets, "updated_at=datetime('now')")
	args = append(args, userID, paneID)

	query := "UPDATE pane_layouts SET " + joinStr(sets, ",") + " WHERE user_id=? AND id=?"
	_, err := db.Exec(query, args...)
	return err
}

func DeletePaneLayout(userID, paneID string) error {
	_, err := db.Exec("DELETE FROM pane_layouts WHERE user_id=? AND id=?", userID, paneID)
	return err
}

func DeleteLayoutsByAgent(userID, agentID string) error {
	_, err := db.Exec("DELETE FROM pane_layouts WHERE user_id=? AND agent_id=?", userID, agentID)
	return err
}

func UpsertPaneLayout(userID string, pane SavePane) error {
	agentID := pane.AgentID
	if agentID != nil && *agentID != "" {
		var exists int
		db.QueryRow("SELECT 1 FROM agents WHERE id=?", *agentID).Scan(&exists)
		if exists == 0 {
			agentID = nil
		}
	}
	var meta interface{}
	if pane.Metadata != nil {
		meta = *pane.Metadata
	}
	_, err := db.Exec(`INSERT INTO pane_layouts (id, user_id, agent_id, pane_type, position_x, position_y, width, height, z_index, metadata, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(id) DO UPDATE SET
			position_x=excluded.position_x, position_y=excluded.position_y,
			width=excluded.width, height=excluded.height,
			z_index=excluded.z_index, metadata=excluded.metadata,
			updated_at=datetime('now')
		WHERE user_id=excluded.user_id`,
		pane.ID, userID, agentID, pane.PaneType, pane.PositionX, pane.PositionY,
		pane.Width, pane.Height, pane.ZIndex, meta)
	return err
}

func joinStr(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for i := 1; i < len(ss); i++ {
		result += sep + ss[i]
	}
	return result
}
