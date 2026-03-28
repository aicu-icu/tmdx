package db

type TierConfig struct {
	Tier          string `json:"tier"`
	Agents        int    `json:"agents"`
	TerminalPanes int    `json:"terminalPanes"`
}

func GetTierConfig(tier string) (*TierConfig, error) {
	var cfg TierConfig
	err := db.QueryRow(
		"SELECT tier, agents, terminal_panes FROM tier_configs WHERE tier=?",
		tier,
	).Scan(&cfg.Tier, &cfg.Agents, &cfg.TerminalPanes)
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

func GetAllTierConfigs() (map[string]TierConfig, error) {
	rows, err := db.Query("SELECT tier, agents, terminal_panes FROM tier_configs ORDER BY tier")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]TierConfig)
	for rows.Next() {
		var cfg TierConfig
		if err := rows.Scan(&cfg.Tier, &cfg.Agents, &cfg.TerminalPanes); err != nil {
			return nil, err
		}
		result[cfg.Tier] = cfg
	}
	return result, nil
}

func GetAllTierConfigsSlice() ([]TierConfig, error) {
	rows, err := db.Query("SELECT tier, agents, terminal_panes FROM tier_configs ORDER BY tier")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []TierConfig
	for rows.Next() {
		var cfg TierConfig
		if err := rows.Scan(&cfg.Tier, &cfg.Agents, &cfg.TerminalPanes); err != nil {
			return nil, err
		}
		result = append(result, cfg)
	}
	return result, nil
}

func UpdateTierConfig(tier string, cfg TierConfig) error {
	_, err := db.Exec(
		"UPDATE tier_configs SET agents=?, terminal_panes=? WHERE tier=?",
		cfg.Agents, cfg.TerminalPanes, tier,
	)
	return err
}

func CreateTierConfig(cfg TierConfig) error {
	_, err := db.Exec(
		"INSERT INTO tier_configs (tier, agents, terminal_panes) VALUES (?,?,?)",
		cfg.Tier, cfg.Agents, cfg.TerminalPanes,
	)
	return err
}

func DeleteTierConfig(tier string) error {
	_, err := db.Exec("DELETE FROM tier_configs WHERE tier=?", tier)
	return err
}

func RenameTierConfig(oldName, newName string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert new row
	_, err = tx.Exec(
		"INSERT INTO tier_configs (tier, agents, terminal_panes) SELECT ?, agents, terminal_panes FROM tier_configs WHERE tier=?",
		newName, oldName,
	)
	if err != nil {
		return err
	}

	// Update users referencing old tier
	_, err = tx.Exec("UPDATE users SET tier=? WHERE tier=?", newName, oldName)
	if err != nil {
		return err
	}

	// Delete old row
	_, err = tx.Exec("DELETE FROM tier_configs WHERE tier=?", oldName)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func CountUsersByTier(tier string) (int, error) {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE tier=?", tier).Scan(&count)
	return count, err
}
