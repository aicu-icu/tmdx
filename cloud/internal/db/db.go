package db

import (
	"database/sql"
	"embed"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaFS embed.FS

var db *sql.DB

func Init(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create db dir: %w", err)
	}

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}

	// Enable WAL mode and foreign keys
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return fmt.Errorf("enable WAL: %w", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return fmt.Errorf("enable foreign keys: %w", err)
	}

	// Check if old schema exists (has github_id column)
	needsMigration := hasOldUserSchema()

	if needsMigration {
		fmt.Println("[db] Old schema detected, recreating tables...")
		dropAllTables()
	}

	// Read and execute schema
	schema, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		return fmt.Errorf("read schema: %w", err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		return fmt.Errorf("exec schema: %w", err)
	}

	// Run incremental migrations
	runMigrations()

	fmt.Printf("[db] SQLite database initialized at %s\n", dbPath)
	return nil
}

func GetDB() *sql.DB {
	return db
}

func Close() {
	if db != nil {
		db.Close()
	}
}

func hasOldUserSchema() bool {
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('users') WHERE name='github_id'`).Scan(&count)
	return err == nil && count > 0
}

func dropAllTables() {
	tables := []string{
		"todo_items",
		"todo_groups",
		"messages",
		"events",
		"page_views",
		"user_preferences",
		"view_state",
		"notes",
		"pane_layouts",
		"agents",
		"users",
	}
	for _, t := range tables {
		db.Exec("DROP TABLE IF EXISTS " + t)
	}
}

func runMigrations() {
	migrations := []string{
		"ALTER TABLE agents ADD COLUMN display_name TEXT",
		"ALTER TABLE user_preferences ADD COLUMN hud_state TEXT NOT NULL DEFAULT '{}'",
		"ALTER TABLE user_preferences ADD COLUMN auto_remove_done INTEGER NOT NULL DEFAULT 0",
		"ALTER TABLE user_preferences ADD COLUMN tutorials_completed TEXT NOT NULL DEFAULT '{}'",
		"ALTER TABLE notes ADD COLUMN images TEXT NOT NULL DEFAULT '[]'",
		"ALTER TABLE page_views ADD COLUMN utm_source TEXT",
		"ALTER TABLE page_views ADD COLUMN utm_medium TEXT",
		"ALTER TABLE page_views ADD COLUMN utm_campaign TEXT",
	}

	for _, m := range migrations {
		_, _ = db.Exec(m)
	}

	// Seed tier_configs with defaults if empty
	seedTierDefaults()
}

func seedTierDefaults() {
	var count int
	db.QueryRow("SELECT COUNT(*) FROM tier_configs").Scan(&count)
	if count > 0 {
		return
	}
	defaults := []struct {
		tier          string
		agents        int
		terminalPanes int
	}{
		{"free", 2, 7},
		{"pro", 6, 40},
		{"poweruser", 24, 160},
	}
	for _, d := range defaults {
		db.Exec("INSERT OR IGNORE INTO tier_configs (tier, agents, terminal_panes) VALUES (?,?,?)",
			d.tier, d.agents, d.terminalPanes)
	}
	fmt.Println("[db] tier_configs seeded with defaults")
}
