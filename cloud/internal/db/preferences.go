package db

import "database/sql"

type UserPreferences struct {
	UserID             string `json:"user_id"`
	NightMode          int    `json:"night_mode"`
	TerminalTheme      string `json:"terminal_theme"`
	NotificationSound  int    `json:"notification_sound"`
	AutoRemoveDone     int    `json:"auto_remove_done"`
	CanvasBg           string `json:"canvas_bg"`
	SnoozeDuration     int    `json:"snooze_duration"`
	TerminalFont       string `json:"terminal_font"`
	FocusMode          string `json:"focus_mode"`
	HudState           string `json:"hud_state"`
	TutorialsCompleted string `json:"tutorials_completed"`
}

type PreferencesInput struct {
	NightMode          *bool                  `json:"nightMode"`
	TerminalTheme      *string                `json:"terminalTheme"`
	NotificationSound  *bool                  `json:"notificationSound"`
	AutoRemoveDone     *bool                  `json:"autoRemoveDone"`
	CanvasBg           *string                `json:"canvasBg"`
	SnoozeDuration     *int                   `json:"snoozeDuration"`
	TerminalFont       *string                `json:"terminalFont"`
	FocusMode          *string                `json:"focusMode"`
	HudState           map[string]interface{} `json:"hudState"`
	TutorialsCompleted map[string]interface{} `json:"tutorialsCompleted"`
}

func GetPreferences(userID string) (*UserPreferences, error) {
	row := db.QueryRow(`SELECT user_id, night_mode, terminal_theme, notification_sound,
		auto_remove_done, canvas_bg, snooze_duration, terminal_font, focus_mode, hud_state, tutorials_completed
		FROM user_preferences WHERE user_id=?`, userID)
	var p UserPreferences
	err := row.Scan(&p.UserID, &p.NightMode, &p.TerminalTheme, &p.NotificationSound,
		&p.AutoRemoveDone, &p.CanvasBg, &p.SnoozeDuration, &p.TerminalFont,
		&p.FocusMode, &p.HudState, &p.TutorialsCompleted)
	if err != nil {
		if err == sql.ErrNoRows {
			return &UserPreferences{
				UserID: userID, NightMode: 0, TerminalTheme: "default",
				NotificationSound: 1, AutoRemoveDone: 0, CanvasBg: "default",
				SnoozeDuration: 90, TerminalFont: "JetBrains Mono",
				FocusMode: "hover", HudState: "{}", TutorialsCompleted: "{}",
			}, nil
		}
		return nil, err
	}
	return &p, nil
}

func SavePreferences(userID string, p PreferencesInput) error {
	nm := boolToInt(p.NightMode)
	ts := strOr(p.TerminalTheme, "default")
	ns := boolToInt(p.NotificationSound)
	ar := boolToInt(p.AutoRemoveDone)
	cb := strOr(p.CanvasBg, "default")
	sd := intOr(p.SnoozeDuration, 90)
	tf := strOr(p.TerminalFont, "JetBrains Mono")
	fm := strOr(p.FocusMode, "hover")
	hs := "{}"
	if p.HudState != nil {
		hs = toJSON(p.HudState)
	}
	tc := "{}"
	if p.TutorialsCompleted != nil {
		tc = toJSON(p.TutorialsCompleted)
	}

	_, err := db.Exec(`INSERT INTO user_preferences (user_id, night_mode, terminal_theme, notification_sound,
		auto_remove_done, canvas_bg, snooze_duration, terminal_font, focus_mode, hud_state, tutorials_completed, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(user_id) DO UPDATE SET
			night_mode=excluded.night_mode, terminal_theme=excluded.terminal_theme,
			notification_sound=excluded.notification_sound, auto_remove_done=excluded.auto_remove_done,
			canvas_bg=excluded.canvas_bg, snooze_duration=excluded.snooze_duration,
			terminal_font=excluded.terminal_font, focus_mode=excluded.focus_mode,
			hud_state=excluded.hud_state, tutorials_completed=excluded.tutorials_completed,
			updated_at=datetime('now')`,
		userID, nm, ts, ns, ar, cb, sd, tf, fm, hs, tc)
	return err
}

func boolToInt(b *bool) int {
	if b != nil && *b {
		return 1
	}
	return 0
}

func strOr(s *string, fallback string) string {
	if s != nil {
		return *s
	}
	return fallback
}

func intOr(i *int, fallback int) int {
	if i != nil {
		return *i
	}
	return fallback
}
